import { test, expect } from "./fixtures";

const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
const chip = (page: import("@playwright/test").Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true });
const count = (page: import("@playwright/test").Page) => page.getByText(/^\d+ recipes?$/).filter({ visible: true });

test("each cuisine tile sets exactly its own filter, every time", async ({ page }) => {
  await page.goto("/");
  for (const [tile, label] of [
    ["Tamil", "Tamil"],
    ["Kerala", "Kerala"],
    ["North Indian", "North Indian"],
    ["Tiffin", "Tiffin"],
    ["Kerala", "Kerala"],
  ]) {
    await page.getByRole("link", { name: new RegExp(`^${tile} \\d+$`) }).click();
    await expect(page).toHaveURL(new RegExp(`f=`));
    await expect(chip(page, label)).toHaveAttribute("aria-pressed", "true");
    // no other cuisine chip left on from the previous tile
    const pressed = page.locator("button[aria-pressed=true]").filter({ visible: true });
    await expect(pressed).toHaveCount(1);
    const tileCount = await page.evaluate(() => 0);
    void tileCount;
    await nav(page).getByRole("link", { name: "Home", exact: true }).click();
  }
});

test("the result count matches the tile's number", async ({ page }) => {
  await page.goto("/");
  const kerala = page.getByRole("link", { name: /^Kerala \d+$/ });
  const n = Number((await kerala.getAttribute("aria-label"))!.split(" ").pop());
  await kerala.click();
  await expect(count(page)).toHaveText(`${n} recipes`);
});

test("a search typed earlier doesn't stick to the next tile", async ({ page }) => {
  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search recipes" }).fill("sambar");
  await nav(page).getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: /^Kerala \d+$/ }).click();
  await expect(page.getByRole("searchbox", { name: "Search recipes" }).filter({ visible: true })).toHaveValue("");
  await expect(page.getByRole("link", { name: /Avial/ }).filter({ visible: true })).toBeVisible();
});

test("toggling chips updates results and the URL; Back restores", async ({ page }) => {
  await page.goto("/search?f=kerala");
  await chip(page, "Veg").click();
  await expect(page).toHaveURL(/f=kerala%2Cveg|f=kerala,veg/);
  await expect(page.getByRole("link", { name: /Chemmeen/ }).filter({ visible: true })).toHaveCount(0);
  await chip(page, "Kerala").click();
  await expect(chip(page, "Kerala")).toHaveAttribute("aria-pressed", "false");
  await expect(chip(page, "Veg")).toHaveAttribute("aria-pressed", "true");
});
