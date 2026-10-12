import { test as base, expect, type Page } from "@playwright/test";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

/** Every test fails if the page logs an error or throws. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        // Error responses the test asked the stubbed API for are expected.
        if (m.type() === "error" && !/status of (401|422|502)/.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      // Thumbnails come from YouTube; keep tests offline and deterministic.
      await page.route(/i\.ytimg\.com/, (r) => r.fulfill({ contentType: "image/png", body: PNG }));
      await use(errors);
      expect(errors, "no console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function setStorage(page: Page, values: Record<string, unknown>) {
  await page.addInitScript((v) => {
    for (const [k, val] of Object.entries(v)) window.localStorage.setItem(k, JSON.stringify(val));
  }, values);
}

/** Click Next until the cook-mode finish screen. */
export async function cookThrough(page: Page, max = 200) {
  for (let i = 0; i < max; i++) {
    if (await page.getByRole("button", { name: "Finish" }).isVisible()) return i;
    const next = page.locator("main button").filter({ hasText: /^(Next|Let's begin|Turn on the stove|Start the timer first|Wait)/ }).last();
    await next.click();
    // Timed steps ask for confirmation before moving on.
    const confirm = page.getByRole("dialog");
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.getByRole("button", { name: /Skip timer, I'm done|Yes, it's done|All whistles done|It's already done — next|It's done early — next/ }).click();
    }
  }
  throw new Error("never reached the finish screen");
}
