import { test, expect } from "./fixtures";

test("an induction hob shows levels instead of flames, and amounts use the spoons and cups you have", async ({ page }) => {
  await page.goto("/settings");
  const kitchen = page.getByRole("region", { name: "Your kitchen" });
  await kitchen.getByRole("radiogroup", { name: "Hob" }).getByRole("radio", { name: "Induction" }).click();
  await expect(kitchen.getByTestId("hob-preview")).toContainText("Low → Level 4 of 14");
  await kitchen.getByRole("radiogroup", { name: "Highest hob number" }).getByRole("radio", { name: "9" }).click();
  await expect(kitchen.getByTestId("hob-preview")).toContainText("Medium → Level 5 of 9");
  await kitchen.getByRole("radiogroup", { name: "Highest hob number" }).getByRole("radio", { name: /14/ }).click();
  // Only ¼ and ½ teaspoons in the drawer.
  const spoons = kitchen.getByRole("group", { name: "Measuring spoons" });
  await spoons.getByRole("checkbox", { name: "1 tsp" }).click();
  await expect(spoons.getByRole("checkbox", { name: "1 tsp" })).toHaveAttribute("aria-checked", "false");
  await expect(kitchen.getByTestId("measure-preview")).toContainText("2 tsp → 4 × ½ tsp");

  await page.goto("/recipe/jeera-rice");
  await page.getByText(/Preview all/).click();
  const steps = page.locator("ol");
  await expect(steps).toContainText("Turn off the hob");
  await expect(steps).not.toContainText(/flame/i);
  // the cumin, measured with a ½ tsp spoon
  await expect(page.locator("li:visible", { hasText: "Cumin" }).first().getByTestId("measure-hint")).toHaveText(/^\d × ½ tsp$/);

  await page.getByRole("button", { name: /Start cooking/ }).click();
  // Walk to the first step at the hob: its badge shows the level, not a flame.
  for (let i = 0; i < 40 && !(await page.getByText(/Level \d+ of 14/).first().isVisible()); i++) {
    await page.locator("main button").filter({ hasText: /^(Next|Let's begin|Turn on the (?:stove|hob|oven)|Start the timer first|Wait)/ }).last().click();
    const confirm = page.getByRole("dialog");
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /Skip timer, I'm done|Yes, it's done|It's already done — next|It's done early — next/ }).click();
  }
  await expect(page.getByText(/Level \d+ of 14/).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText(/flame/i);
});

test("shop for any picked meals across days", async ({ page }) => {
  const add = async (meal: string, dish: string) => {
    await page.getByRole("button", { name: `Add dish to ${meal}` }).click();
    await page.getByRole("textbox", { name: "Search dishes" }).fill(dish);
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${dish}`) }).first().click();
  };
  await page.goto("/family");
  await page.getByRole("button", { name: "Add adult" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox", { name: "Name" }).fill("Appa");
  await d.getByRole("textbox", { name: "Height in cm" }).fill("175");
  await d.getByRole("textbox", { name: "Weight in kg" }).fill("75");
  await d.getByRole("button", { name: "Save" }).click();

  await page.goto("/plan");
  await page.getByRole("tab").nth(2).click(); // Wed
  await add("Dinner", "Jeera Rice");
  await page.getByRole("tab").nth(3).click(); // Thu
  await add("Lunch", "Sambar");
  await add("Dinner", "Matar Paneer");
  await page.getByRole("tab").nth(4).click(); // Fri
  await add("Breakfast", "Idli");
  await add("Dinner", "Curd Rice");

  await page.goto("/plan/shopping");
  await page.getByRole("tab", { name: "Pick meals" }).click();
  const picker = page.getByRole("region", { name: "Pick meals" });
  for (const name of [/^Wed \d+ dinner$/, /^Thu \d+ lunch$/, /^Thu \d+ dinner$/, /^Fri \d+ dinner$/]) await picker.getByRole("checkbox", { name }).click();
  await expect(picker.getByRole("checkbox", { name: /^Fri \d+ breakfast$/ })).toHaveAttribute("aria-checked", "false");
  await expect(picker.getByRole("checkbox", { name: /^Mon \d+ lunch$/ })).toBeDisabled(); // nothing planned
  const dishes = page.getByTestId("shop-dishes");
  for (const dish of ["Jeera Rice", "Sambar", "Matar Paneer", "Curd Rice"]) await expect(dishes).toContainText(dish);
  await expect(dishes).not.toContainText("Idli");
  await expect(page).toHaveURL(/pick=\d{4}-\d{2}-\d{2}:dinner/);
  // the picks survive a reload (they're in the link, so it can be shared)
  await page.reload();
  await expect(page.getByTestId("picked-meals")).toContainText(/Wed \d+ dinner · Thu \d+ lunch · Thu \d+ dinner · Fri \d+ dinner/);
});

test("kids' treats: find a low-sugar bake and cook it with the oven at fan temperature", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Kids' treats/ }).first().click();
  await expect(page.getByText("Banana Oat Muffins").first()).toBeVisible();
  await page.goto("/cook/banana-oat-muffins");
  let sawOven = false;
  for (let i = 0; i < 80; i++) {
    if (await page.getByRole("button", { name: "Finish" }).isVisible()) break;
    if (!sawOven && (await page.getByTestId("oven-badge").isVisible())) {
      await expect(page.getByTestId("oven-badge")).toHaveText("Oven 160 °C fan");
      sawOven = true;
    }
    await page.locator("main button").filter({ hasText: /^(Next|Let's begin|Turn on the (?:stove|hob|oven)|Start the timer first|Wait)/ }).last().click();
    const confirm = page.getByRole("dialog");
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /Skip timer, I'm done|Yes, it's done|All whistles done|It's already done — next|It's done early — next/ }).click();
  }
  expect(sawOven).toBe(true);
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
});
