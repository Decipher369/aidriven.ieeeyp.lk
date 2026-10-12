import { supabase, errorMessage } from "./client";
import type {
  OrderItem,
  TicketType,
  MerchItem,
  MerchVariant,
} from "./database";
export async function catalog() {
  const [tickets, merch, variants] = await Promise.all([
    supabase().from("ticket_types").select("*").order("name"),
    supabase().from("merch_items").select("*").order("name"),
    supabase().from("merch_variants").select("*").order("size"),
  ]);
  if (tickets.error) throw tickets.error;
  if (merch.error) throw merch.error;
  if (variants.error) throw variants.error;
  return { tickets: tickets.data, merch: merch.data, variants: variants.data };
}
export function itemName(
  item: OrderItem,
  c: { tickets: TicketType[]; merch: MerchItem[]; variants: MerchVariant[] },
) {
  if (item.display_name) return item.display_name;
  if (item.ticket_type_id)
    return (
      c.tickets.find((t) => t.id === item.ticket_type_id)?.name ?? "Ticket pass"
    );
  const variant = c.variants.find((v) => v.id === item.merch_variant_id);
  const merch = c.merch.find((m) => m.id === variant?.merch_item_id);
  return `${merch?.name ?? "Merchandise"}${variant?.size ? ` · ${variant.size}` : ""}`;
}
export async function orderDetail(id: string) {
  const [order, items, reviews, receipts, info, c] = await Promise.all([
    supabase().from("order_queue").select("*").eq("id", id).maybeSingle(),
    supabase().from("order_items").select("*").eq("order_id", id),
    supabase()
      .from("payment_review_attempts")
      .select("*")
      .eq("order_id", id)
      .order("attempt_number", { ascending: false }),
    supabase()
      .from("payment_submissions")
      .select("*")
      .eq("order_id", id)
      .order("submitted_at", { ascending: false }),
    supabase()
      .from("event_info")
      .select("*")
      .eq("slug", "payment-instructions")
      .maybeSingle(),
    catalog(),
  ]);
  for (const result of [order, items, reviews, receipts, info])
    if (result.error) throw result.error;
  if (!order.data)
    throw new Error("Order not found or you do not have access.");
  return {
    order: order.data,
    items: items.data!,
    reviews: reviews.data!,
    receipts: receipts.data!,
    instructions: info.data,
    catalog: c,
  };
}
export async function uploadReceipt(
  path: string,
  file: Blob,
  onProgress: (value: number) => void,
) {
  const auth = await supabase().auth.getSession();
  if (!auth.data.session) throw new Error("Please sign in again.");
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/receipts/${path.split("/").map(encodeURIComponent).join("/")}`,
    );
    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${auth.data.session!.access_token}`,
    );
    xhr.setRequestHeader(
      "apikey",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(new Error("Network error. Your receipt is kept ready for retry."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please retry."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = "Receipt upload failed. Please retry.";
        try {
          const body: unknown = JSON.parse(xhr.responseText);
          if (typeof body === "object" && body && "message" in body)
            message = String(body.message);
        } catch {
          /* Preserve the friendly fallback for non-JSON storage errors. */
        }
        reject(
          new Error(
            xhr.status === 413
              ? "The receipt is too large. Choose a smaller image."
              : errorMessage(new Error(message)),
          ),
        );
      }
    };
    xhr.send(file);
  });
}
export async function exportRows(
  table: "profiles" | "orders" | "tickets" | "audit_entries" | "merch_totals",
  confirmed = false,
) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const ticketQuery = confirmed
      ? supabase().from("tickets").select("*").in("status", ["issued", "used"])
      : supabase().from("tickets").select("*");
    const base =
      table === "merch_totals"
        ? supabase().from("merch_totals").select("*")
        : table === "audit_entries"
          ? supabase().from("audit_entries").select("*")
          : table === "profiles"
            ? supabase().from("profiles").select("*")
            : table === "orders"
              ? supabase().from("orders").select("*")
              : ticketQuery;
    const result = await base
      .range(offset, offset + 999)
      .order(table === "merch_totals" ? "name" : "id");
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < 1000) break;
  }
  return rows;
}
