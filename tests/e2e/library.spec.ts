import { test, expect } from "./fixtures";

test("home shows the library, categories and everyday favourites", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Cook it right/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Search \d+ recipes/ })).toBeVisible();
  for (const c of ["Tamil", "Kerala", "North Indian", "Biryani", "Indo-Chinese", "Kids' meals"]) await expect(page.getByRole("link", { name: new RegExp(`^${c} \\d+$`) })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everyday favourites" })).toBeVisible();
  await page.getByRole("link", { name: /Browse all/ }).click();
  await expect(page).toHaveURL(/\/search/);
});

test("recipe page rescales quantities with servings", async ({ page }) => {
  await page.goto("/recipe/dal-tadka");
  await expect(page.getByRole("heading", { name: "Dal Tadka" })).toBeVisible();
  const toor = page.locator("li:visible", { hasText: "Toor dal" });
  await expect(toor).toContainText("100 g");
  await page.getByRole("button", { name: "More people" }).click(); // 3 → 4
  await expect(page.getByText("For 4")).toBeVisible();
  await expect(toor).toContainText("135 g");
  await page.getByRole("button", { name: "Fewer people" }).click();
  await page.getByRole("button", { name: "Fewer people" }).click(); // → 2
  await expect(toor).toContainText("65 g");
});

test("low oil version halves the ghee and is saved", async ({ page }) => {
  await page.goto("/recipe/dal-tadka");
  await expect(page.locator("li:visible", { hasText: "Ghee" }).last()).toContainText("2 tbsp");
  await page.getByRole("button", { name: "Low oil" }).click();
  // the quantities change straight away, before saving
  await expect(page.locator("li:visible", { hasText: "Ghee" }).last()).toContainText("1 tbsp");
  await page.getByRole("button", { name: "Save to my recipes" }).click();
  await expect(page.getByText(/Your version · Low oil/)).toBeVisible();
  await expect(page.locator("li:visible", { hasText: "Ghee" }).last()).toContainText("1 tbsp");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your recipes" })).toBeVisible();
});

test("AI-only customisations explain how to unlock them", async ({ page }) => {
  await page.goto("/recipe/sambar");
  await page.getByRole("button", { name: /^Vegan/ }).click();
  await page.getByRole("button", { name: /Make my version with AI/ }).click();
  await expect(page.getByText(/need AI to rewrite/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect a free AI" })).toHaveAttribute("href", "/settings");
});

test("unknown recipe shows a friendly not-found", async ({ page }) => {
  await page.goto("/recipe/does-not-exist");
  await expect(page.getByRole("heading", { name: "Recipe not found" })).toBeVisible();
});

test("guide and settings pages render", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: /Measure like/ })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: /Built-in \(no AI\)/ })).toHaveAttribute("aria-checked", "true");
});

test("manifest is installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.short_name).toBe("Adukala");
  expect(m.display).toBe("standalone");
});

test("high protein and low carb work without AI", async ({ page }) => {
  await page.goto("/recipe/aloo-gobi");
  await page.getByRole("button", { name: "Low carb" }).click();
  const changes = page.getByTestId("tweak-changes");
  await expect(changes).toContainText("Potato");
  await expect(changes).toContainText("Cauliflower");
  await page.goto("/recipe/idli");
  await page.getByRole("button", { name: "Low carb" }).click();
  await expect(page.getByText(/mostly rice or flour, so we kept the recipe/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Make my version with AI/ })).toHaveCount(0);
});
