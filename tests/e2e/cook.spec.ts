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

async function toFirstTimedStep(page: import("@playwright/test").Page) {
  const timed = page.getByRole("button", { name: "Start timer" });
  for (let i = 0; i < 60 && !(await timed.isVisible()); i++) {
    await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the stove)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Skip timer, I'm done|All whistles done/ }).click();
  }
  return timed;
}

test("a running timer asks to confirm, then minimises into the dock", async ({ page }) => {
  await page.goto("/cook/dal-tadka");
  const timed = await toFirstTimedStep(page);
  const title = await page.locator("main h1:visible").textContent();
  await timed.click();
  await page.getByRole("button", { name: /Next · timer keeps running/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Done with this step?");
  await dialog.getByRole("button", { name: "Not yet — stay on this step" }).click();
  await expect(page.locator("main h1:visible")).toHaveText(title!);
  await page.getByRole("button", { name: /Next · timer keeps running/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Yes, it's done/ }).click();
  const dock = page.getByRole("button", { name: new RegExp(`^${title} timer, `) });
  await expect(dock).toBeVisible();
  await dock.click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(dock).toHaveCount(0);
});

test("an unstarted timer can be started on the way out; when it ends a popup asks to confirm", async ({ page }) => {
  await page.clock.install();
  await page.goto("/cook/dal-tadka");
  await toFirstTimedStep(page);
  const title = await page.locator("main h1:visible").textContent();
  await page.getByRole("button", { name: /^Next$/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Timer not started");
  await page.getByRole("button", { name: "Start timer & next" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${title} timer, `) })).toBeVisible();
  // Jump past the timer: the alarm pops up and stays until confirmed.
  await page.clock.fastForward("02:00:00");
  const alarm = page.getByRole("alertdialog");
  await expect(alarm).toContainText(title!);
  await expect(alarm).toContainText("A timer from an earlier step is done");
  await page.clock.fastForward("00:00:10");
  await expect(alarm).toBeVisible();
  await alarm.getByRole("button", { name: "Done" }).click();
  await expect(alarm).toHaveCount(0);
});

test("timers survive a page refresh", async ({ page }) => {
  await page.goto("/cook/dal-tadka");
  const timed = await toFirstTimedStep(page);
  const title = await page.locator("main h1:visible").textContent();
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
    await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the stove)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Skip timer, I'm done/ }).click();
  }
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.getByRole("dialog")).toContainText(/Timer not started|Whistles not done/);
});

test("whistle counter counts to the target", async ({ page }) => {
  await page.goto("/cook/dal-tadka");
  const whistle = page.getByRole("button", { name: "I heard a whistle" });
  for (let i = 0; i < 60 && !(await whistle.isVisible()); i++) {
    await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the stove)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Skip timer, I'm done/ }).click();
  }
  const target = Number((await page.getByText(/^of \d+$/).textContent())?.replace(/\D/g, ""));
  for (let i = 0; i < target; i++) await whistle.click();
  await expect(page.getByRole("button", { name: /All whistles done/ })).toBeDisabled();
});

test("progress survives a reload and shows on home", async ({ page }) => {
  await page.goto("/cook/sambar");
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /^(Next|Let's begin)/ }).click();
    const d = page.getByRole("dialog");
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /Skip timer, I'm done|All whistles done/ }).click();
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
