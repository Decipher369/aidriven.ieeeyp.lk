export const templateNames = [
  "receipt_received",
  "receipt_rejected",
  "order_confirmed",
  "merch_confirmed",
  "event_reminder",
  "order_cancelled",
] as const;
export type TemplateName = (typeof templateNames)[number];
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export function emailTemplate(input: {
  template: TemplateName;
  event: string;
  name: string;
  orderId: string | null;
  reason: string;
  items: string;
  total: string;
  site: string;
  eventDate: string;
  venue: string;
}) {
  const titles: Record<TemplateName, string> = {
    receipt_received: "We received your receipt",
    receipt_rejected: "Your receipt needs attention",
    order_confirmed: "Your summit ticket is confirmed",
    merch_confirmed: "Your merchandise order is confirmed",
    event_reminder: "Your summit is coming up",
    order_cancelled: "Your order has been cancelled",
  };
  const sentences: Record<TemplateName, string> = {
    receipt_received:
      "Your receipt package is under review. We will review membership and payment together where applicable.",
    receipt_rejected: `Please correct your submission and upload new receipts. Reason: ${input.reason}`,
    order_confirmed:
      "Your payment and any required IEEE membership verification are approved. Your QR ticket is attached as a PNG.",
    merch_confirmed: "Your merchandise payment is approved.",
    event_reminder: `We look forward to welcoming you. Date: ${input.eventDate}. Venue: ${input.venue}.`,
    order_cancelled: `Your reservation has been released. Reason: ${input.reason}`,
  };
  const url =
    input.template === "order_confirmed" || input.template === "event_reminder"
      ? `${input.site}/portal/ticket`
      : input.template === "receipt_rejected"
        ? `${input.site}/portal/checkout/${input.orderId}`
        : `${input.site}/portal/orders${input.orderId ? "/" + input.orderId : ""}`;
  const text = [
    `Hi ${input.name},`,
    sentences[input.template],
    input.items,
    input.total ? `Total: ${input.total}` : "",
    input.orderId ? `Order: ${input.orderId}` : "",
    `Open your portal: ${url}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f0eb;font-family:Arial,sans-serif;color:#202020"><div style="max-width:560px;margin:0 auto;padding:28px"><p style="letter-spacing:2px;font-size:12px;color:#b64015">${escapeHtml(input.event)}</p><h1 style="font-size:25px;line-height:1.3">${escapeHtml(titles[input.template])}</h1><p>Hi ${escapeHtml(input.name)},</p><p style="line-height:1.7">${escapeHtml(sentences[input.template])}</p>${input.items ? `<p style="line-height:1.7;white-space:pre-line">${escapeHtml(input.items)}</p>` : ""}${input.total ? `<p><strong>Total: ${escapeHtml(input.total)}</strong></p>` : ""}<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#f65c29;color:#111;padding:14px 20px;text-decoration:none;border-radius:6px">Open delegate portal</a></p><p style="font-size:12px;color:#656565;overflow-wrap:anywhere">${input.orderId ? `Order: ${escapeHtml(input.orderId)}` : ""}</p></div></body></html>`;
  return { subject: `${input.event}: ${titles[input.template]}`, text, html };
}
