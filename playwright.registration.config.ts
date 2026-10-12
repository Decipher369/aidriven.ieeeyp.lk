import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/registration",
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.REGISTRATION_TEST_URL ?? "http://localhost:3100",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  reporter: "list",
  outputDir: "/tmp/aidriven-browser-results",
});
