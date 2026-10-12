import { test, expect } from "@playwright/test";
import { login, mockSupabase, orderId, delegateId } from "./mock";
for (const width of [1440, 390]) {
  test(`admin screens and joint approval at ${width}px (mocked backend)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await mockSupabase(page, "admin");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page, true);
    await expect(
      page.getByRole("heading", { name: "Registration overview" }),
    ).toBeVisible();
    const routes: [[string, string], ...[string, string][]] = [
      ["/admin/orders", "Review orders"],
      [`/admin/orders/${orderId}`, "Registration review"],
      ["/admin/delegates", "Delegates"],
      [`/admin/delegates/${delegateId}`, "Delegate history"],
      ["/admin/merch", "Merchandise totals"],
      ["/admin/check-in", "Delegate check-in"],
      ["/admin/audit", "Audit log"],
      ["/admin/event-info", "Event information"],
      ["/admin/export", "Registration exports"],
    ];
    for (const [route, title] of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByText("IEEE-TEST-123").first()).toBeVisible();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm decision" }),
    ).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm decision" }).click();
    await expect(
      page.getByText("Order confirmed.", { exact: true }),
    ).toBeVisible();
    const confirmation = calls.find((call) => call.name === "confirm_order");
    expect(confirmation?.body).toMatchObject({
      p_membership_verified: true,
      p_expected_receipt_ids: expect.arrayContaining([
        "50000000-0000-4000-8000-000000000001",
        "50000000-0000-4000-8000-000000000002",
      ]),
    });
    expect(errors).toEqual([]);
    await page.goto("/admin/dashboard");
    await expect(
      page.getByRole("heading", { name: "Registration overview" }),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/aidriven-admin-dashboard-${width}.png`,
      fullPage: true,
    });
  });
}
test("delegate portal, QR and admin denial (mocked backend)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupabase(page, "delegate", true);
  await login(page, false);
  await expect(
    page.getByRole("heading", { name: "Welcome, Test." }),
  ).toBeVisible();
  for (const [route, title] of [
    ["/portal/register-ticket", "Choose your pass"],
    ["/portal/merch", "Summit merchandise"],
    ["/portal/orders", "My orders"],
    [`/portal/orders/${orderId}`, "Order details"],
    [`/portal/checkout/${orderId}`, "Complete your registration"],
    ["/portal/ticket", "My summit ticket"],
    ["/portal/event", "Event information"],
    ["/portal/profile", "My profile"],
  ]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/portal/ticket");
  await expect(page.locator(".reg-ticket svg")).toBeVisible();
  await page.screenshot({
    path: "/tmp/aidriven-ticket-390.png",
    fullPage: true,
  });
  await page.goto("/admin/dashboard");
  await expect(
    page.getByText("This account does not have admin access.", {
      exact: false,
    }),
  ).toBeVisible();
});
