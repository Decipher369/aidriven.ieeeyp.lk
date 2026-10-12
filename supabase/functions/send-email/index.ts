import { z } from "zod";
// @deno-types="npm:@types/qrcode@1.5.5"
import QRCode from "qrcode";
import { response, secret, service, validWorker } from "../_shared/runtime.ts";
import { emailTemplate, templateNames } from "../_shared/templates.ts";
const claimedSchema = z.object({
  id: z.uuid(),
  delegate_id: z.uuid(),
  order_id: z.uuid().nullable(),
  template: z.enum(templateNames),
  payload: z.record(z.string(), z.unknown()),
  delivery_claim: z.uuid(),
});
async function sendOne(id: string) {
  const client = service();
  const claimed = await client.rpc("claim_email", { p_id: id });
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return;
  const row = claimedSchema.parse(claimed.data);
  try {
    const delegate = await client
      .from("profiles")
      .select("full_name,email")
      .eq("id", row.delegate_id)
      .single();
    if (delegate.error) throw delegate.error;
    const items = row.order_id
      ? await client
          .from("order_items")
          .select("display_name,quantity,unit_price")
          .eq("order_id", row.order_id)
      : { data: [], error: null };
    if (items.error) throw items.error;
    const currency = secret("CURRENCY");
    const amount = (items.data ?? []).reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
      0,
    );
    const template = emailTemplate({
      template: row.template,
      event: secret("EVENT_NAME"),
      name: delegate.data.full_name,
      orderId: row.order_id,
      reason: typeof row.payload.reason === "string" ? row.payload.reason : "",
      items: (items.data ?? [])
        .map((item) => `${item.display_name} × ${item.quantity}`)
        .join("\n"),
      total: row.order_id ? `${currency} ${amount.toFixed(2)}` : "",
      site: secret("SITE_URL").replace(/\/$/, ""),
      eventDate: Deno.env.get("EVENT_DATE") || "To be announced",
      venue: Deno.env.get("VENUE") || "To be announced",
    });
    const attachment: { name: string; content: string }[] = [];
    if (row.template === "order_confirmed" && row.order_id) {
      const ids = await client
        .from("order_items")
        .select("id")
        .eq("order_id", row.order_id);
      if (ids.error) throw ids.error;
      const ticket = await client
        .from("tickets")
        .select("qr_token")
        .in(
          "order_item_id",
          ids.data.map((item) => item.id),
        )
        .in("status", ["issued", "used"])
        .maybeSingle();
      if (ticket.error) throw ticket.error;
      if (!ticket.data?.qr_token)
        throw new Error("Confirmed ticket QR missing");
      const png = await QRCode.toDataURL(ticket.data.qr_token, {
        type: "image/png",
        width: 400,
        margin: 2,
      });
      attachment.push({ name: "aidsl-ticket.png", content: png.split(",")[1] });
    }
    const request = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": secret("BREVO_API_KEY"),
      },
      body: JSON.stringify({
        sender: { name: secret("EVENT_NAME"), email: secret("SENDER_EMAIL") },
        to: [{ email: delegate.data.email, name: delegate.data.full_name }],
        subject: template.subject,
        htmlContent: template.html,
        textContent: template.text,
        headers: { idempotencyKey: row.id },
        ...(attachment.length ? { attachment } : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
    let sent = request.ok;
    let failure: string | null = null;
    if (!sent) {
      const body: unknown = await request.json().catch(() => null);
      if (
        typeof body === "object" &&
        body &&
        "code" in body &&
        body.code === "duplicate_parameter"
      )
        sent = true;
      else
        failure = `${request.status >= 400 && request.status < 500 && request.status !== 429 ? "PERMANENT:" : ""} Brevo HTTP ${request.status}`;
    }
    const completion = await client.rpc("complete_email", {
      p_id: row.id,
      p_claim: row.delivery_claim,
      p_sent: sent,
      p_error: failure,
    });
    if (completion.error) throw completion.error;
  } catch (error) {
    console.error("Email delivery failed", { email_id: row.id });
    const result = await client.rpc("complete_email", {
      p_id: row.id,
      p_claim: row.delivery_claim,
      p_sent: false,
      p_error:
        error instanceof Error
          ? error.message.slice(0, 400)
          : "Delivery failed",
    });
    if (result.error) throw result.error;
  }
}
Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      return response({ error: "Method not allowed" }, 405);
    if (!(await validWorker(request)))
      return response({ error: "Unauthorized" }, 401);
    const body = z
      .object({ email_id: z.uuid().optional() })
      .parse(await request.json());
    let ids: string[];
    if (body.email_id) ids = [body.email_id];
    else {
      const queue = await service()
        .from("email_log")
        .select("id")
        .in("status", ["queued", "failed"])
        .lt("attempts", 3)
        .or("error.is.null,error.not.like.PERMANENT:%")
        .or(
          `delivery_lock_until.is.null,delivery_lock_until.lt.${new Date().toISOString()}`,
        )
        .order("created_at")
        .limit(10);
      if (queue.error) throw queue.error;
      ids = queue.data.map((row) => row.id);
    }
    for (const id of ids) await sendOne(id);
    return response({ processed: ids.length });
  } catch {
    console.error("Email worker failed");
    return response({ error: "Worker failed" }, 500);
  }
});
