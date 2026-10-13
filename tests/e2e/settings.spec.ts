import { test, expect } from "./fixtures";

test("choose a free provider, save a key, test it, remove it", async ({ page }) => {
  let pinged: Record<string, string> = {};
  await page.route("**/api/ping", (r) => {
    pinged = r.request().headers();
    return r.fulfill({ json: { ok: true, model: "openai/gpt-oss-120b", provider: "Groq" } });
  });
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Groq/ }).click();
  await expect(page.getByText(/Add a key for Groq/)).toBeVisible();
  await page.getByRole("textbox", { name: "Groq API key" }).fill("gsk_abc");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText(/Add a key for Groq/)).toHaveCount(0);
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status")).toContainText("Working · openai/gpt-oss-120b");
  expect(pinged["x-ai-provider"]).toBe("groq");
  expect(pinged["x-ai-key"]).toBe("gsk_abc");

  await page.getByRole("button", { name: "openai/gpt-oss-20b" }).click();
  await expect(page.getByRole("textbox", { name: "Groq model name" })).toHaveValue("openai/gpt-oss-20b");

  await page.reload();
  await expect(page.getByRole("radio", { name: /Groq/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("textbox", { name: "Groq API key" })).toHaveValue("gsk_abc");

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(/Add a key for Groq/)).toBeVisible();
  await page.getByRole("radio", { name: /Built-in/ }).click();
  await expect(page.getByRole("radio", { name: /Built-in/ })).toHaveAttribute("aria-checked", "true");
});

test("an old OpenAI-only setting is migrated", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("adukala.settings.v1", JSON.stringify({ openaiKey: "sk-old", model: "gpt-5.4", voice: true, listen: false })));
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: /OpenAI/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("textbox", { name: "OpenAI API key" })).toHaveValue("sk-old");
  await expect(page.getByRole("textbox", { name: "OpenAI model name" })).toHaveValue("gpt-5.4");
});

test("failed connection test shows the error", async ({ page }) => {
  await page.route("**/api/ping", (r) => r.fulfill({ status: 401, json: { error: "The AI provider rejected the key. Check it in Settings." } }));
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Google Gemini/ }).click();
  await page.getByRole("textbox", { name: "Google Gemini API key" }).fill("bad");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "rejected the key" })).toBeVisible();
});

test("load the models a key can use; a retired saved model is replaced", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("adukala.settings.v1", JSON.stringify({ provider: "groq", keys: { groq: "gsk_x" }, models: { groq: "some-old-model" } })));
  await page.route("**/api/models", (r) => r.fulfill({ json: { models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"], current: "some-old-model", available: false } }));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Load models for my key" }).click();
  await expect(page.getByText("3 models available")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Groq model name" })).toHaveValue("openai/gpt-oss-120b");
  await expect(page.getByRole("button", { name: "qwen/qwen3.8-27b" })).toBeVisible();
});

test("a failed test shows the provider's exact message", async ({ page }) => {
  await page.route("**/api/ping", (r) => r.fulfill({ status: 400, json: { error: "The AI provider returned an error.", detail: "400 The model `x` has been decommissioned" } }));
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Groq/ }).click();
  await page.getByRole("textbox", { name: "Groq API key" }).fill("gsk_x");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "decommissioned" })).toBeVisible();
});
