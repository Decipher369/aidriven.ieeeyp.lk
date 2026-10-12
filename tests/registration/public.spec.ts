import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`public forms and route shells at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const runtime: string[] = [];
    page.on("pageerror", (error) => runtime.push(error.message));
    for (const [route, title] of [
      ["/register", "Join the summit"],
      ["/login", "Welcome back"],
      ["/admin/login", "Admin sign in"],
      ["/forgot-password", "Reset your password"],
      ["/set-password", "Set your password"],
      ["/reset-password", "Choose a new password"],
    ]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/admin/dashboard");
    await expect(
      page.getByRole("navigation", { name: "Admin navigation" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("heading", { name: "Admin sign in", exact: true })
        .or(
          page.getByText("Registration is being configured.", { exact: false }),
        ),
    ).toBeVisible();
    await page.goto("/portal");
    await expect(
      page
        .getByRole("heading", { name: "Welcome back", exact: true })
        .or(page.getByRole("navigation", { name: "Delegate navigation" })),
    ).toBeVisible();
    expect(runtime).toEqual([]);
    await page.goto("/admin/login");
    await page.screenshot({
      path: `/tmp/aidriven-admin-login-${viewport.width}.png`,
      fullPage: true,
    });
    await page.goto("/register");
    await page.screenshot({
      path: `/tmp/aidriven-register-${viewport.width}.png`,
      fullPage: true,
    });
  });
}
