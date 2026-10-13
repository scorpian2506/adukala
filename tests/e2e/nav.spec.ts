import { test, expect, setStorage } from "./fixtures";

test("bottom navigation reaches every main screen", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await nav.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
  await nav.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meal plan" })).toBeVisible();
  await nav.getByRole("link", { name: "Saved", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  await nav.getByRole("link", { name: "Me", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your kitchen" })).toBeVisible();
  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Cook it right/ })).toBeVisible();
  // The YouTube studio stays one tap away from Home and Search.
  await page.getByRole("link", { name: "New recipe from YouTube" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: /What are we/ })).toBeVisible();
});

test("every inner screen has a Home button, and Back works from a direct link", async ({ page }) => {
  for (const path of ["/recipe/sambar", "/create", "/settings", "/guide"]) {
    await page.goto(path);
    await page.getByRole("link", { name: "Home" }).first().click();
    await expect(page).toHaveURL("/");
  }
  // Opened directly (no history): Back goes Home instead of nowhere.
  await page.goto("/recipe/idli");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/");
});

test("search finds dishes with typos and filters by category", async ({ page }) => {
  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search recipes" }).fill("chiken biriyani");
  await expect(page.getByRole("link", { name: /Chicken Biryani/ }).first()).toBeVisible();
  await page.getByRole("searchbox", { name: "Search recipes" }).fill("");
  await page.getByRole("button", { name: "Kerala", exact: true }).click();
  await expect(page).toHaveURL(/f=kerala/);
  await expect(page.getByRole("link", { name: /Avial/ }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dal Tadka/ }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search recipes" }).fill("zzzz pizza");
  await expect(page.getByText("Not in the book yet.")).toBeVisible();
});

test("home category tiles open filtered search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Indo-Chinese \d+$/ }).click();
  await expect(page).toHaveURL(/f=indochinese/);
  await expect(page.getByRole("link", { name: /Gobi Manchurian/ }).filter({ visible: true })).toBeVisible();
});

test("star and pin a recipe; it shows in Saved and pinned on Home", async ({ page }) => {
  await page.goto("/recipe/avial");
  await page.getByRole("button", { name: "Star", exact: true }).click();
  await page.getByRole("button", { name: "Pin to Home" }).click();
  await expect(page.getByRole("button", { name: "Unpin from Home" })).toBeVisible();
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).getByRole("link", { name: "Saved", exact: true }).click();
  const avial = page.getByRole("link", { name: /Avial/ }).filter({ visible: true }).first();
  await expect(avial).toBeVisible();
  await page.getByRole("tab", { name: /Pinned/ }).click();
  await expect(avial).toBeVisible();
});

test("star from a list card", async ({ page }) => {
  await setStorage(page, {});
  await page.goto("/search?q=idli");
  await page.getByRole("button", { name: "Star Idli", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unstar Idli", exact: true })).toBeVisible();
});
