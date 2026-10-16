import { test, expect, cookThrough, setStorage } from "./fixtures";

test("cook a whole recipe from start to finish", async ({ page }) => {
  await page.goto("/recipe/masala-chai");
  await page.getByRole("button", { name: /Start cooking/ }).click();
  await expect(page).toHaveURL(/\/cook\/masala-chai/);
  await expect(page.getByRole("heading", { name: /Get ready/ })).toBeVisible();
  const clicks = await cookThrough(page);
  expect(clicks).toBeGreaterThan(15);
  await expect(page.getByRole("heading", { name: /is ready/ })).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL("/");
  // finished cooks don't show up as "still cooking"
  await expect(page.getByText("Still cooking")).toHaveCount(0);
});

test("measured items show on the step", async ({ page }) => {
  await page.goto("/recipe/dal-tadka");
  await page.getByRole("button", { name: /Start cooking/ }).click();
  await page.getByRole("button", { name: /Let's begin/ }).click();
  await expect(page.getByRole("heading", { name: "Rinse the toor dal" })).toBeVisible();
  await expect(page.locator("main li").first()).toContainText("100g");
});

type Page = import("@playwright/test").Page;
const SKIP = /Skip timer, I'm done|Yes, it's done|All whistles done|It's already done — next|It's done early — next/;

/** Walk forward (answering prompts) until a step with a timer, optionally in a given phase. */
async function toTimedStep(page: Page, phase?: "Prep" | "Cook") {
  const timed = page.getByRole("button", { name: "Start timer" });
  for (let i = 0; i < 80; i++) {
    const here = await timed.isVisible();
    const tag = (await page.getByText(/^(Prep|Cook) · /).filter({ visible: true }).allTextContents())[0] ?? "";
    // For stove steps, stop on one that actually blocks (pressure steps go by whistles instead).
    const blocks = phase === "Cook" ? await page.getByRole("button", { name: "Start the timer first" }).isVisible() : true;
    if (here && blocks && (!phase || tag?.startsWith(phase))) break;
    await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the (?:stove|hob|oven)|Start the timer first|Wait)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: SKIP }).click();
  }
  return timed;
}
const heading = (page: Page) => page.locator("main h1:visible");

test("prep timers: confirm, then keep running in the dock", async ({ page }) => {
  await page.goto("/cook/chicken-biryani");
  const timed = await toTimedStep(page, "Prep");
  const title = await heading(page).textContent();
  await timed.click();
  await page.getByRole("button", { name: /Next · timer keeps running/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Done with this step?");
  await dialog.getByRole("button", { name: "Not yet — stay on this step" }).click();
  await expect(heading(page)).toHaveText(title!);
  await page.getByRole("button", { name: /Next · timer keeps running/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Yes, it's done/ }).click();
  const dock = page.getByRole("button", { name: new RegExp(`^${title} timer, `) });
  await expect(dock).toBeVisible();
  await dock.click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(dock).toHaveCount(0);
});

test("stove timers block the next step until they finish", async ({ page }) => {
  await page.clock.install();
  await page.goto("/cook/dal-tadka");
  await toTimedStep(page, "Cook");
  const title = await heading(page).textContent();
  // Not started: Next asks to start it, and stays on this step.
  await page.getByRole("button", { name: "Start the timer first" }).click();
  await expect(page.getByRole("dialog")).toContainText("Start the timer first");
  await page.getByRole("dialog").getByRole("button", { name: "Start timer" }).click();
  await expect(heading(page)).toHaveText(title!);
  // Running: Next says wait, and still stays.
  await page.getByRole("button", { name: /^Wait · / }).click();
  await expect(page.getByRole("dialog")).toContainText("Wait for this step");
  await page.getByRole("dialog").getByRole("button", { name: "OK, I'll wait" }).click();
  await expect(heading(page)).toHaveText(title!);
  // Pressing Next twice never skips a blocking timer.
  await page.getByRole("button", { name: /^Wait · / }).click();
  await page.keyboard.press("ArrowRight");
  await expect(heading(page)).toHaveText(title!);
  await page.getByRole("dialog").getByRole("button", { name: "OK, I'll wait" }).click();
  // When it ends: the alarm, then Next works.
  await page.clock.fastForward("01:00:00");
  const alarm = page.getByRole("alertdialog");
  await expect(alarm).toContainText(title!);
  await alarm.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: /^Next$/ }).click();
  await expect(heading(page)).not.toHaveText(title!);
  // No floating timer for stove steps.
  await expect(page.getByRole("button", { name: / timer, / })).toHaveCount(0);
});

test("a stove step can be marked done early when the cue shows", async ({ page }) => {
  await page.goto("/cook/dal-tadka");
  await toTimedStep(page, "Cook");
  const title = await heading(page).textContent();
  await page.getByRole("button", { name: "Start the timer first" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start timer" }).click();
  await page.getByRole("button", { name: /^Wait · / }).click();
  await page.getByRole("dialog").getByRole("button", { name: "It's done early — next" }).click();
  await expect(heading(page)).not.toHaveText(title!);
});

test("an unstarted prep timer can be started on the way out; when it ends a popup asks to confirm", async ({ page }) => {
  await page.clock.install();
  await page.goto("/cook/chicken-biryani");
  await toTimedStep(page, "Prep");
  const title = await heading(page).textContent();
  await page.getByRole("button", { name: /^Next$/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Timer not started");
  await page.getByRole("button", { name: "Start timer & next" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${title} timer, `) })).toBeVisible();
  await page.clock.fastForward("02:00:00");
  const alarm = page.getByRole("alertdialog");
  await expect(alarm).toContainText(title!);
  await expect(alarm).toContainText("A timer from an earlier step is done");
  await page.clock.fastForward("00:00:10");
  await expect(alarm).toBeVisible();
  await alarm.getByRole("button", { name: "Done" }).click();
  await expect(alarm).toHaveCount(0);
});

test("prep timers survive a page refresh", async ({ page }) => {
  await page.goto("/cook/chicken-biryani");
  const timed = await toTimedStep(page, "Prep");
  const title = await heading(page).textContent();
  await timed.click();
  await page.getByRole("button", { name: /Next · timer keeps running/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Yes, it's done/ }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(`^${title} timer, `) })).toBeVisible();
});

test("moving on before all whistles asks first", async ({ page }) => {
  await page.goto("/cook/dal-tadka");
  const whistle = page.getByRole("button", { name: "I heard a whistle" });
  for (let i = 0; i < 60 && !(await whistle.isVisible()); i++) {
    await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the (?:stove|hob|oven)|Start the timer first|Wait)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Skip timer, I'm done|Yes, it's done|All whistles done|It's already done — next|It's done early — next/ }).click();
  }
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("dialog")).toContainText(/Timer not started|Whistles not done/);
});

test("whistle counter counts to the target", async ({ page }) => {
  await page.goto("/cook/dal-tadka");
  const whistle = page.getByRole("button", { name: "I heard a whistle" });
  for (let i = 0; i < 60 && !(await whistle.isVisible()); i++) {
    await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the (?:stove|hob|oven)|Start the timer first|Wait)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Skip timer, I'm done|Yes, it's done|All whistles done|It's already done — next|It's done early — next/ }).click();
  }
  const target = Number((await page.getByText(/^of \d+$/).textContent())?.replace(/\D/g, ""));
  for (let i = 0; i < target; i++) await whistle.click();
  await expect(page.getByRole("button", { name: /All whistles done/ })).toBeDisabled();
});

test("progress survives a reload and shows on home", async ({ page }) => {
  await page.goto("/cook/sambar");
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /^(Next|Let's begin|Start the timer first|Wait)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Skip timer, I'm done|Yes, it's done|All whistles done|It's already done — next|It's done early — next/ }).click();
  }
  const heading = await page.locator("main h1:visible").textContent();
  await page.reload();
  await expect(page.locator("main h1:visible")).toHaveText(heading!);
  await page.goto("/");
  await expect(page.getByText("Still cooking")).toBeVisible();
  await page.getByRole("link", { name: /Resume/ }).click();
  await expect(page.locator("main h1:visible")).toHaveText(heading!);
});

test("ingredients sheet ticks off what's already in", async ({ page }) => {
  await setStorage(page, { "adukala.progress.v1": { "lemon-rice": { recipeId: "lemon-rice", servings: 3, index: 40, updatedAt: 1 } } });
  await page.goto("/cook/lemon-rice");
  await page.getByRole("button", { name: "All ingredients" }).click();
  await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
  await expect(page.locator("li.opacity-45").first()).toBeVisible();
  await page.getByRole("button", { name: "Back to the step" }).click();
});

test("servings chosen on the recipe page carry into cook mode", async ({ page }) => {
  await page.goto("/recipe/dal-tadka");
  await page.getByRole("button", { name: "More people" }).click();
  await page.getByRole("button", { name: "More people" }).click(); // 5
  await page.getByRole("button", { name: /Start cooking/ }).click();
  await expect(page.getByText(/Cooking for 5/)).toBeVisible();
});
