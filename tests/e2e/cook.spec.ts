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

test("a running timer keeps going in the background after Next", async ({ page }) => {
  // Jump straight to the first timed cook step of dal tadka.
  await page.goto("/cook/dal-tadka");
  const timed = page.getByRole("button", { name: "Start timer" });
  for (let i = 0; i < 60 && !(await timed.isVisible()); i++) await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the stove)/ }).click();
  await timed.click();
  await expect(page.getByRole("button", { name: "Pause timer" })).toBeVisible();
  await page.getByRole("button", { name: /Next · timer keeps running/ }).click();
  const pill = page.getByRole("button", { name: /^Dismiss .* timer$/ });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(pill).toHaveCount(0);
});

test("whistle counter counts to the target", async ({ page }) => {
  await page.goto("/cook/dal-tadka");
  const whistle = page.getByRole("button", { name: "I heard a whistle" });
  for (let i = 0; i < 60 && !(await whistle.isVisible()); i++) await page.getByRole("button", { name: /^(Next|Let's begin|Turn on the stove)/ }).click();
  const target = Number((await page.getByText(/^of \d+$/).textContent())?.replace(/\D/g, ""));
  for (let i = 0; i < target; i++) await whistle.click();
  await expect(page.getByRole("button", { name: /All whistles done/ })).toBeDisabled();
});

test("progress survives a reload and shows on home", async ({ page }) => {
  await page.goto("/cook/sambar");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /^(Next|Let's begin)/ }).click();
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
