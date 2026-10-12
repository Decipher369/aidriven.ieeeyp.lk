// UI-only fictional fixtures. Every Supabase request is intercepted; these
// sessions never authenticate against, write to, or invite users on Supabase.
import type { Page } from "@playwright/test";
export const delegateId = "10000000-0000-4000-8000-000000000001";
export const adminId = "10000000-0000-4000-8000-000000000003";
export const orderId = "20000000-0000-4000-8000-000000000001";
const typeId = "20000000-0000-4000-8000-000000000002";
const reviewId = "30000000-0000-4000-8000-000000000001";
const lineId = "40000000-0000-4000-8000-000000000001";
const when = "2026-10-06T06:00:00Z";
export async function mockSupabase(
  page: Page,
  role: "admin" | "delegate",
  issued = false,
) {
  const user = {
    id: role === "admin" ? adminId : delegateId,
    email:
      role === "admin"
        ? "ui-admin@example.invalid"
        : "ui-delegate@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    created_at: when,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
  };
  const profile = {
    id: delegateId,
    delegate_id: "DEL-0001",
    full_name: "Test Delegate",
    email: "ui-delegate@example.invalid",
    phone: "0700000000",
    institution: "Test University",
    is_active: true,
    created_at: when,
  };
  const type = {
    id: typeId,
    name: "IEEE Member Pass",
    price: 1000,
    capacity: 200,
    active: true,
    requires_membership: true,
  };
  const order = {
    id: orderId,
    delegate_id: delegateId,
    status: issued ? "confirmed" : "pending",
    membership_number: "IEEE-TEST-123",
    created_at: when,
    updated_at: when,
    confirmed_at: issued ? when : null,
    confirmed_by: issued ? adminId : null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    institution: profile.institution,
    delegate_display_id: profile.delegate_id,
    total: 1000,
    has_ticket: true,
    has_merch: false,
    pending_receipts: issued ? 0 : 2,
    latest_reason: null,
  };
  const review = {
    id: reviewId,
    order_id: orderId,
    attempt_number: 1,
    membership_number: order.membership_number,
    membership_verified: issued ? true : null,
    decision: issued ? "approved" : "pending",
    rejection_reason: null,
    reviewed_by: issued ? adminId : null,
    reviewed_at: issued ? when : null,
    created_at: when,
  };
  const receipts = [1, 2].map((n) => ({
    id: `50000000-0000-4000-8000-00000000000${n}`,
    order_id: orderId,
    review_attempt_id: reviewId,
    receipt_path: `${delegateId}/${orderId}/50000000-0000-4000-8000-00000000000${n}.jpg`,
    submitted_at: when,
    decision: review.decision,
    rejection_reason: null,
    reviewed_by: review.reviewed_by,
    reviewed_at: review.reviewed_at,
  }));
  const item = {
    id: lineId,
    order_id: orderId,
    ticket_type_id: typeId,
    merch_variant_id: null,
    quantity: 1,
    unit_price: 1000,
    display_name: "IEEE Member Pass",
  };
  const ticket = {
    id: "60000000-0000-4000-8000-000000000001",
    order_item_id: lineId,
    delegate_id: delegateId,
    ticket_type_id: typeId,
    status: issued ? "issued" : "reserved",
    qr_token: issued ? "a".repeat(48) : null,
    issued_at: issued ? when : null,
    checked_in_at: null,
    checked_in_by: null,
    voided_at: null,
    void_reason: null,
    created_at: when,
  };
  const event = [
    {
      id: "70000000-0000-4000-8000-000000000001",
      slug: "about",
      title: "About the summit",
      body: "AIDSL 2026 Summit",
      published: true,
      updated_by: adminId,
      updated_at: when,
    },
    {
      id: "70000000-0000-4000-8000-000000000002",
      slug: "payment-instructions",
      title: "Bank details",
      body: "Test instructions only. Do not transfer real money.",
      published: true,
      updated_by: adminId,
      updated_at: when,
    },
  ];
  const calls: { name: string; body: unknown }[] = [];
  await page.route(
    (url) => url.hostname.endsWith(".supabase.co"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let body: unknown;
      if (url.pathname === "/auth/v1/token") {
        const encode = (value: unknown) =>
          Buffer.from(JSON.stringify(value)).toString("base64url");
        const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.ui-test-signature`;
        body = {
          access_token: token,
          refresh_token: "ui-test-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        };
      } else if (url.pathname === "/auth/v1/user") body = user;
      else if (url.pathname.startsWith("/auth/v1/")) body = {};
      else if (url.pathname.includes("/object/sign/")) {
        if (request.method() === "POST")
          body = {
            signedURL: "/object/sign/receipts/ui-test.jpg?token=fictional",
          };
        else {
          await route.fulfill({
            status: 200,
            contentType: "image/png",
            body: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l0sAAAAASUVORK5CYII=",
              "base64",
            ),
          });
          return;
        }
      } else if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1)!;
        calls.push({ name, body: request.postDataJSON() });
        if (name === "is_admin") body = role === "admin";
        else if (name === "confirm_order") {
          body = { result: "confirmed" };
          order.status = "confirmed";
          order.pending_receipts = 0;
          review.decision = "approved";
          receipts.forEach((receipt) => (receipt.decision = "approved"));
        } else if (name === "check_in_ticket")
          body = {
            result: "valid",
            full_name: profile.full_name,
            delegate_id: profile.delegate_id,
            ticket_type: type.name,
          };
        else if (name === "upsert_event_info") body = event[0].id;
        else body = { result: "already_handled" };
      } else if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.split("/").at(-1);
        const tables: Record<string, unknown[]> = {
          admins:
            role === "admin"
              ? [
                  {
                    user_id: adminId,
                    full_name: "Test Organizer",
                    created_at: when,
                  },
                ]
              : [],
          profiles:
            !url.searchParams.has("id") ||
            url.searchParams.get("id") === "eq." + delegateId
              ? [profile]
              : [],
          ticket_types: [type],
          merch_items: [],
          merch_variants: [],
          orders: [order],
          order_queue: [order],
          order_items: [item],
          payment_review_attempts: [review],
          payment_submissions: receipts,
          tickets: [ticket],
          event_info: event.filter(
            (info) =>
              !url.searchParams.has("slug") ||
              url.searchParams.get("slug") === "eq." + info.slug,
          ),
          audit_entries: [],
          merch_totals: [],
        };
        const data = tables[table ?? ""] ?? [];
        body = request
          .headers()
          .accept?.includes("application/vnd.pgrst.object")
          ? (data[0] ?? null)
          : data;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "Content-Range": `0-${Math.max(data.length - 1, 0)}/${data.length}`,
          },
          body: JSON.stringify(body),
        });
        return;
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Unmocked request; no real network allowed",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  return calls;
}
export async function login(page: Page, admin: boolean) {
  await page.goto(admin ? "/admin/login" : "/login", {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByLabel(admin ? "Admin login or email" : "Email address")
    .fill(admin ? "admin@aidriven" : "ui-delegate@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("ui-test-password-not-real");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(admin ? "**/admin/dashboard" : "**/portal");
}
