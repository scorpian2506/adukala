import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// "e2e_" prefix so test accounts on a real deployment are easy to find and remove.
const uniq = () => `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;

async function signUp(page: Page, username: string, code?: string) {
  await page.goto("/account");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Your name" }).fill(username.toUpperCase());
  await page.getByLabel("Password", { exact: true }).fill("a good password");
  if (code) await page.getByRole("textbox", { name: /Household code/ }).fill(code);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("heading", { name: `Hi, ${username.toUpperCase()}` })).toBeVisible();
}

test("sign up, log out, log back in", async ({ page }) => {
  const u = uniq();
  await signUp(page, u);
  await expect(page.getByTestId("invite-code")).toHaveText(/^[A-Z0-9]{6}$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: `Hi, ${u.toUpperCase()}` })).toBeVisible();
  await page.getByRole("button", { name: /Log out/ }).click();
  await expect(page.getByRole("heading", { name: "Your kitchen" })).toBeVisible();
  await page.getByRole("tab", { name: "Log in" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(u);
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Log in" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "Wrong username or password" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("a good password");
  await page.getByRole("button", { name: "Log in" }).last().click();
  await expect(page.getByRole("heading", { name: `Hi, ${u.toUpperCase()}` })).toBeVisible();
});

test("a household shares stars between two people", async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage({ storageState: undefined });
  const ua = uniq();
  await signUp(a, ua);
  const code = (await a.getByTestId("invite-code").textContent())!.trim();

  await a.goto("/recipe/sambar");
  await a.getByRole("button", { name: "Star", exact: true }).click();
  // give the debounced sync a moment
  await a.waitForResponse((r) => r.url().endsWith("/api/sync") && r.request().method() === "POST");

  const ctx = await browser.newContext();
  const wife = await ctx.newPage();
  await signUp(wife, uniq(), code);
  await expect(wife.locator("li", { hasText: `@${ua}` })).toBeVisible();
  await wife.getByRole("navigation", { name: "Main" }).filter({ visible: true }).getByRole("link", { name: "Saved", exact: true }).click();
  await expect(wife.getByRole("link", { name: /Sambar/ }).filter({ visible: true }).first()).toBeVisible();
  await ctx.close();
  await a.close();
  await b.close();
});
