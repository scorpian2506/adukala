import { test, expect } from "./fixtures";

test("swap ghee for oil, use ready ginger garlic paste, and cook that version", async ({ page }) => {
  await page.goto("/recipe/jeera-rice");
  await page.getByRole("button", { name: "Swap Ghee" }).click();
  const sheet = page.getByRole("dialog", { name: "Swap Ghee" });
  await expect(sheet.getByRole("radio", { name: /Leave it out/ })).toBeDisabled(); // the cumin is fried in it
  await sheet.getByRole("radio", { name: "Use oil instead", exact: true }).click();
  const oil = page.locator("li:visible", { hasText: "instead of ghee" });
  await expect(oil).toContainText("Oil");
  await expect(page.getByTestId("tweak-changes")).toContainText("Ghee");
  await expect(page.getByTestId("tweak-changes")).toContainText("→ Oil");
  await page.getByRole("button", { name: /Start cooking/ }).click();
  await expect(page).toHaveURL(/\/cook\/jeera-rice--~oil_ghee$/);
  await page.reload(); // the version is re-made from its id
  await page.getByRole("button", { name: "All ingredients" }).click();
  await expect(page.getByText("Oil", { exact: true })).toBeVisible();
  await expect(page.getByText("Ghee", { exact: true })).toHaveCount(0);

  await page.goto("/recipe/aloo-matar");
  await page.getByRole("button", { name: "Use ginger garlic paste" }).click();
  await expect(page.locator("li:visible", { hasText: "Ginger garlic paste" }).last()).toContainText("2½ tsp");
  await expect(page.getByRole("button", { name: "Swap Ginger", exact: true })).toHaveCount(0);
  // undo from the "What changed" list
  await page.getByRole("button", { name: /^Undo Ginger/ }).click();
  await expect(page.getByRole("button", { name: "Swap Ginger", exact: true })).toBeVisible();

  // leave something out
  await page.getByRole("button", { name: "Swap Green chilli" }).first().click();
  await page.getByRole("dialog").getByRole("radio", { name: /Leave it out/ }).click();
  await expect(page.getByTestId("tweak-changes")).toContainText("left out");
});

test("kitchen preferences apply everywhere, stay through plan tweaks, and reach the shopping list", async ({ page }) => {
  const uniq = `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
  await page.goto("/account");
  await page.getByRole("textbox", { name: "Username" }).fill(uniq);
  await page.getByRole("textbox", { name: "Your name" }).fill("Sri");
  await page.getByLabel("Password", { exact: true }).fill("a good password");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page.getByRole("heading", { name: "Hi, Sri" })).toBeVisible();

  await page.goto("/family");
  await page.getByRole("button", { name: /Sri/ }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox", { name: "Height in cm" }).fill("175");
  await d.getByRole("textbox", { name: "Weight in kg" }).fill("80");
  await d.getByRole("radiogroup", { name: "Ghee" }).getByRole("radio", { name: "Oil instead" }).click();
  await d.getByRole("radiogroup", { name: "Ginger and garlic" }).getByRole("radio", { name: "Ready paste" }).click();
  await d.getByRole("button", { name: "Save" }).click();

  await page.goto("/recipe/aloo-matar");
  await expect(page.getByRole("button", { name: "Use ginger garlic paste" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/recipe/jeera-rice");
  await expect(page.locator("li:visible", { hasText: "instead of ghee" })).toBeVisible();

  await page.goto("/plan");
  await page.getByRole("tab").first().click();
  await page.getByRole("button", { name: "Add dish to Dinner" }).click();
  await page.getByRole("textbox", { name: "Search dishes" }).fill("Aloo Matar");
  await page.getByRole("dialog").getByRole("button", { name: /^Aloo Matar/ }).first().click();
  const row = page.getByRole("button", { name: /Aloo Matar, edit portions/ });
  await expect(row).toContainText("Ginger garlic paste");
  // changing a tweak in the plan keeps the swap
  await row.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("group", { name: "Tweaks for this dish" }).getByRole("button", { name: "Less spicy" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Ginger garlic paste");
  await expect(row).toContainText("Less spicy");
  await page.getByRole("link", { name: "Shopping for Mon Dinner" }).click();
  await expect(page.getByRole("checkbox", { name: /Ginger garlic paste/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Ginger\b(?! garlic)/ })).toHaveCount(0);
});

test("tapping a planned dish lower down the page opens it on screen, and Cook now starts cooking", async ({ page }) => {
  await page.goto("/family");
  await page.getByRole("button", { name: "Add adult" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox", { name: "Name" }).fill("Sri");
  await d.getByRole("textbox", { name: "Height in cm" }).fill("175");
  await d.getByRole("textbox", { name: "Weight in kg" }).fill("80");
  await d.getByRole("button", { name: "Save" }).click();
  await page.goto("/plan");
  await page.getByRole("button", { name: "Add dish to Dinner" }).click();
  await page.getByRole("textbox", { name: "Search dishes" }).fill("Chapati");
  await page.getByRole("dialog").getByRole("button", { name: /^Chapati/ }).first().click();
  const row = page.getByRole("button", { name: /Chapati, edit portions/ });
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const cook = page.getByRole("dialog").getByRole("button", { name: "Cook now" });
  await expect(cook).toBeInViewport({ ratio: 1 });
  await cook.click();
  await expect(page).toHaveURL(/\/cook\/chapati$/);
});
