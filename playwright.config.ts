import { defineConfig, devices } from "@playwright/test";

const PORT = 3999;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  // Test the production build, not the dev server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${PORT}`,
        port: PORT,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        // Local runs always use the in-memory PGlite database, never production.
        env: { DATABASE_URL: "" },
      },
  projects: [
    { name: "mobile", testIgnore: /live\.spec/ },
    { name: "live", testMatch: /live\.spec/ },
  ],
});
