import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, setStorage } from "./fixtures";
import { recipeFromWprm } from "../../src/lib/scrape";
import { SEED_RECIPES } from "../../src/data/recipes";

const wprm = recipeFromWprm(readFileSync("tests/fixtures/wprm.html", "utf8"))!;
const video = (over: object = {}) => ({
  id: "aaaaaaaaaaa",
  url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  title: "Jeera Aloo Recipe | quick potato fry",
  channel: "Test Kitchen",
  thumbnail: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
  description: "full recipe: https://example.com/jeera-aloo",
  recipe: { ...wprm, url: "https://example.com/jeera-aloo" },
  ...over,
});
const results = [
  { id: "bbbbbbbbbbb", title: "Palak Paneer Recipe", channel: "Hebbars Kitchen", thumbnail: "https://i.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg" },
  { id: "ccccccccccc", title: "Palak paneer at home", channel: "Someone", thumbnail: "https://i.ytimg.com/vi/ccccccccccc/hqdefault.jpg" },
];

async function stub(page: Page, opts: { video?: object; results?: object[] } = {}) {
  await page.route("**/api/youtube", (r) => r.fulfill({ json: { video: opts.video ?? video() } }));
  await page.route("**/api/search", (r) => r.fulfill({ json: { results: opts.results ?? results } }));
}

async function sendText(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test("free converter: YouTube link → questions → measured recipe → cook", async ({ page }) => {
  await stub(page);
  await page.goto("/create");
  await expect(page.getByText("Free converter", { exact: true })).toBeVisible();
  await sendText(page, "https://youtu.be/aaaaaaaaaaa");
  await expect(page.getByText(/Found Test Kitchen’s written recipe: 10 ingredients, 6 steps/)).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: "Less spicy" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Converted free · saved")).toBeVisible();
  await expect(page.getByText(/serves 2/)).toBeVisible();
  await page.getByRole("button", { name: "See recipe" }).click();
  await expect(page.getByText("Converted without AI")).toBeVisible();
  await expect(page.getByText("For tempering")).toBeVisible();
  await expect(page.getByText(/Your version · Less spicy/)).toBeVisible();
  // chilli powder: 1 tsp for 3 → for 2 → half for less spicy
  await expect(page.locator("li:visible", { hasText: "Chilli powder" })).toContainText("⅓ tsp");
  await page.getByRole("button", { name: /Start cooking/ }).click();
  await expect(page.getByRole("heading", { name: /Get ready/ })).toBeVisible();
});

test("free converter: typed tweaks after the recipe", async ({ page }) => {
  await stub(page);
  await page.goto("/create");
  await sendText(page, "https://youtu.be/aaaaaaaaaaa");
  await page.getByRole("button", { name: "As written (3)" }).click();
  await page.getByRole("button", { name: /Done — as written/ }).click();
  await expect(page.getByText(/serves 3/)).toBeVisible();
  await sendText(page, "for 6 people");
  await expect(page.getByText(/serves 6/)).toBeVisible();
  await sendText(page, "add more garlic");
  await expect(page.getByText(/Without AI I can change/)).toBeVisible();
});

test("dish name: library match plus YouTube results", async ({ page }) => {
  await stub(page);
  await page.goto("/create");
  await sendText(page, "sambar");
  await expect(page.getByText("Already in your kitchen")).toBeVisible();
  await expect(page.getByText("Pick a video")).toBeVisible();
  await expect(page.getByText("Measured recipe")).toBeVisible();
  await page.getByRole("button", { name: /Palak Paneer Recipe/ }).click();
  await expect(page.getByText(/Found Test Kitchen’s written recipe/)).toBeVisible();
});

test("video without a written recipe says so and offers alternatives", async ({ page }) => {
  await stub(page, { video: video({ recipe: undefined, description: "Watch till the end!" }) });
  await page.goto("/create");
  await sendText(page, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
  await expect(page.getByText(/doesn’t link a written recipe/)).toBeVisible();
  await expect(page.getByText("Pick a video")).toBeVisible();
});

test("YouTube errors show a clear message", async ({ page }) => {
  await page.route("**/api/youtube", (r) => r.fulfill({ status: 422, json: { error: "Couldn't open that video. Is it public?" } }));
  await page.goto("/create");
  await sendText(page, "https://youtu.be/zzzzzzzzzzz");
  await expect(page.getByRole("alert").filter({ hasText: "Is it public?" })).toBeVisible();
});

test("home link hand-off starts the studio", async ({ page }) => {
  await stub(page);
  await page.goto("/");
  await page.getByRole("textbox", { name: "YouTube link" }).fill("https://youtu.be/aaaaaaaaaaa");
  await page.getByRole("button", { name: "Convert" }).click();
  await expect(page).toHaveURL(/\/create/);
  await expect(page.getByText(/Found Test Kitchen’s written recipe/)).toBeVisible();
});

test("AI mode: interview then compose (stubbed provider)", async ({ page }) => {
  await setStorage(page, { "adukala.settings.v1": { provider: "groq", keys: { groq: "gsk_test" }, models: {}, voice: false, listen: false } });
  await stub(page);
  const sent: Record<string, string>[] = [];
  await page.route("**/api/chat", (r) => {
    sent.push(r.request().headers());
    return r.fulfill({ json: { message: "How many people?", options: ["2", "4"], multiSelect: false, ready: false, dish: "Jeera aloo" } });
  });
  const composed = { ...SEED_RECIPES[3], id: "ai-aloo-1", name: "AI Aloo", source: { kind: "youtube", url: "https://youtu.be/aaaaaaaaaaa" }, method: "ai" };
  await page.route("**/api/compose", (r) => r.fulfill({ json: { recipe: composed, notes: "Used the creator's recipe." } }));
  await page.goto("/create");
  await expect(page.getByText("AI · Groq")).toBeVisible();
  await sendText(page, "https://youtu.be/aaaaaaaaaaa");
  await expect(page.getByText("How many people?")).toBeVisible();
  expect(sent[0]["x-ai-provider"]).toBe("groq");
  expect(sent[0]["x-ai-key"]).toBe("gsk_test");
  expect(sent[0]["x-ai-model"]).toBe("openai/gpt-oss-120b");
  await page.getByRole("button", { name: "Skip questions, write it now" }).click();
  await expect(page.getByText("AI Aloo")).toBeVisible();
  await expect(page.getByText("Used the creator's recipe.")).toBeVisible();
});

test("AI errors (bad key) point to settings", async ({ page }) => {
  await setStorage(page, { "adukala.settings.v1": { provider: "gemini", keys: { gemini: "bad" }, models: {}, voice: false, listen: false } });
  await page.route("**/api/chat", (r) => r.fulfill({ status: 401, json: { error: "The AI provider rejected the key. Check it in Settings." } }));
  await page.route("**/api/search", (r) => r.fulfill({ json: { results } }));
  await page.goto("/create");
  await sendText(page, "palak paneer");
  await expect(page.getByRole("alert").filter({ hasText: "rejected the key" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open settings/ })).toBeVisible();
});

test("a converted dish we already have can replace the library version, and be restored", async ({ page }) => {
  await setStorage(page, { "adukala.settings.v1": { provider: "gemini", keys: { gemini: "k" }, models: {}, voice: false, listen: false } });
  await stub(page, { video: video({ title: "Sambar | Amma's style", recipe: undefined, description: "" }) });
  await page.route("**/api/chat", (r) => r.fulfill({ json: { message: "Ready", options: [], multiSelect: false, ready: true, dish: "Sambar" } }));
  const sambar = SEED_RECIPES.find((r) => r.id === "sambar")!;
  const composed = { ...sambar, id: "sambar-amma-1", name: "Sambar", blurb: "Amma's sambar from the video.", source: { kind: "youtube", url: "https://youtu.be/aaaaaaaaaaa" }, method: "ai" };
  await page.route("**/api/compose", (r) => r.fulfill({ json: { recipe: composed } }));
  await page.goto("/create");
  await sendText(page, "https://youtu.be/aaaaaaaaaaa");
  await expect(page.getByText(/You already have/)).toBeVisible();
  await page.getByRole("button", { name: "Replace it" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Updated: Sambar in the library" })).toBeVisible();

  await page.goto("/recipe/sambar");
  await expect(page.getByText("Amma's sambar from the video.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restore library recipe" }).click();
  await expect(page.getByText(sambar.blurb)).toBeVisible();
});
