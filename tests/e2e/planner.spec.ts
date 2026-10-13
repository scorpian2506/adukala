import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const visible = (page: Page) => ({
  heading: (name: string | RegExp) => page.getByRole("heading", { name }).filter({ visible: true }),
});

async function addMember(page: Page, kind: "adult" | "child", name: string, o: { age: string; sex?: "Female" | "Male" | "Girl" | "Boy"; height?: string; weight?: string; goal?: string }) {
  await page.getByRole("button", { name: kind === "adult" ? "Add adult" : "Add child" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox", { name: "Name" }).fill(name);
  await d.getByRole("textbox", { name: "Age" }).fill(o.age);
  if (o.height) await d.getByRole("textbox", { name: "Height in cm" }).fill(o.height);
  if (o.weight) await d.getByRole("textbox", { name: "Weight in kg" }).fill(o.weight);
  if (o.sex) await d.getByRole("radio", { name: o.sex, exact: true }).click();
  if (o.goal) await d.getByRole("radio", { name: new RegExp(`^${o.goal}`) }).click();
  await d.getByRole("button", { name: "Save" }).click();
}

async function addDish(page: Page, meal: string, dish: string) {
  await page.getByRole("button", { name: `Add dish to ${meal}` }).click();
  await page.getByRole("textbox", { name: "Search dishes" }).fill(dish);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${dish}`) }).first().click();
}

test("family, a week of meals, calories per person, shopping list", async ({ page }) => {
  await page.goto("/family");
  await addMember(page, "adult", "Sriram", { age: "35", sex: "Male", height: "175", weight: "80", goal: "Lose ½ kg a week" });
  await expect(page.getByRole("button", { name: /Sriram/ })).toContainText("1820");
  await addMember(page, "child", "Ammu", { age: "6", sex: "Girl" });
  await expect(page.getByRole("button", { name: /Ammu/ })).toContainText("1360");

  await page.goto("/plan");
  await expect(visible(page).heading("Meal plan")).toBeVisible();
  await page.getByRole("tab").first().click(); // Monday
  await addDish(page, "Breakfast", "Idli");
  await addDish(page, "Lunch", "Sambar");
  await addDish(page, "Lunch", "Plain White Rice");
  // the child gets half portions by default
  const lunch = page.getByRole("button", { name: /Sambar, edit portions/ });
  await expect(lunch).toContainText("½");

  const monSri = page.getByTestId("day-Sriram");
  const sriKcal = Number((await monSri.locator("strong").textContent())!);
  const ammuKcal = Number((await page.getByTestId("day-Ammu").locator("strong").textContent())!);
  expect(sriKcal).toBeGreaterThan(500);
  expect(ammuKcal).toBeGreaterThan(0);
  expect(Math.abs(ammuKcal - sriKcal / 2)).toBeLessThan(5);

  // Tuesday: give Sriram a double portion
  await page.getByRole("tab").nth(1).click();
  await addDish(page, "Dinner", "Chapati");
  await page.getByRole("button", { name: /Chapati, edit portions/ }).click();
  await page.getByRole("button", { name: "More for Sriram" }).click();
  await page.getByRole("button", { name: "More for Sriram" }).click();
  await page.getByRole("button", { name: "More for Sriram" }).click();
  await page.getByRole("button", { name: "More for Sriram" }).click();
  await expect(page.getByLabel("Sriram portion")).toHaveText("2 srv");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();

  // week total = Monday + Tuesday for Sriram
  const tueSri = Number((await page.getByTestId("day-Sriram").locator("strong").textContent())!);
  const weekSri = Number((await page.getByTestId("week-Sriram").locator("p").first().textContent())!.replace(/,/g, ""));
  expect(Math.abs(weekSri - (sriKcal + tueSri))).toBeLessThanOrEqual(2);

  // One pot, different plates: fit Monday's portions to everyone's targets
  await page.getByRole("tab").first().click();
  await page.getByRole("button", { name: "Fit Mon to goals" }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("day-Sriram").locator("strong").textContent()))
    .toBeGreaterThan(1820 * 0.9);
  const fitted = Number(await page.getByTestId("day-Sriram").locator("strong").textContent());
  expect(fitted).toBeLessThan(1820 * 1.1);
  await page.getByRole("button", { name: /Sambar, edit portions/ }).click();
  await expect(page.getByTestId("serving-guide")).toContainText(/Cook [\d.]+ servings in one pot, then serve Sriram .* · Ammu/);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();

  // shopping list from the plan
  await page.getByRole("link", { name: "Shopping list" }).click();
  await expect(visible(page).heading("Shopping list")).toBeVisible();
  const toor = page.getByRole("checkbox", { name: /Toor dal/ });
  await expect(toor).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Salt/ })).toHaveCount(0);
  await toor.click();
  await expect(toor).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Toor dal/ })).toHaveAttribute("aria-checked", "true");
});

test("add to plan from a recipe page shows nutrition", async ({ page }) => {
  await page.goto("/family");
  await addMember(page, "adult", "Wife", { age: "32", sex: "Female", height: "160", weight: "58" });
  await page.goto("/recipe/avial");
  await expect(page.getByText(/≈\d+ kcal/).first()).toBeVisible();
  await page.getByRole("button", { name: "+ Add to meal plan" }).click();
  await page.getByRole("button", { name: "Dinner" }).click();
  await expect(page.getByRole("status").filter({ hasText: "dinner" })).toBeVisible();
  await page.getByRole("link", { name: "Open plan" }).click();
  await expect(page.getByRole("button", { name: /Avial, edit portions/ })).toBeVisible();
});

test("the plan and family are shared with the household", async ({ browser }) => {
  const uniq = `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
  const a = await (await browser.newContext()).newPage();
  await a.goto("/account");
  await a.getByRole("textbox", { name: "Username" }).fill(uniq);
  await a.getByRole("textbox", { name: "Your name" }).fill("Appa");
  await a.getByLabel("Password", { exact: true }).fill("a good password");
  await a.getByRole("button", { name: "Create account" }).last().click();
  const code = (await a.getByTestId("invite-code").textContent())!.trim();
  await a.goto("/family");
  await addMember(a, "child", "Kutty", { age: "4", sex: "Boy" });
  await a.goto("/plan");
  await a.getByRole("tab").nth(2).click();
  await addDish(a, "Dinner", "Curd Rice");
  await a.waitForResponse((r) => r.url().endsWith("/api/sync") && r.request().method() === "POST");

  const b = await (await browser.newContext()).newPage();
  await b.goto("/account");
  await b.getByRole("textbox", { name: "Username" }).fill(`${uniq}b`);
  await b.getByRole("textbox", { name: "Your name" }).fill("Amma");
  await b.getByLabel("Password", { exact: true }).fill("a good password");
  await b.getByRole("textbox", { name: /Household code/ }).fill(code);
  await b.getByRole("button", { name: "Create account" }).last().click();
  await expect(b.getByRole("heading", { name: "Hi, Amma" })).toBeVisible();
  await b.goto("/plan");
  await b.getByRole("tab").nth(2).click();
  await expect(b.getByRole("button", { name: /Curd Rice, edit portions/ })).toBeVisible();
  await b.goto("/family");
  await expect(b.getByRole("button", { name: /Kutty/ })).toBeVisible();
  await expect(b.getByRole("button", { name: /Appa/ })).toBeVisible();
});

test("adults need height and weight; the calorie table sets the goal", async ({ page }) => {
  await page.goto("/family");
  await page.getByRole("button", { name: "Add adult" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox", { name: "Name" }).fill("Appa");
  await expect(d.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(d.getByText(/Height and weight are needed/)).toBeVisible();
  await d.getByRole("textbox", { name: "Height in cm" }).fill("175");
  await d.getByRole("textbox", { name: "Weight in kg" }).fill("80");
  await d.getByRole("radio", { name: "Male", exact: true }).click();
  await d.getByRole("textbox", { name: "Age" }).fill("35");
  await expect(d.getByText(/BMI 26.1/)).toBeVisible();
  const table = d.getByRole("radiogroup", { name: "Goal" });
  await expect(table.getByRole("radio", { name: /^Stay as I am/ })).toContainText("2,370 kcal");
  await expect(table.getByRole("radio", { name: /^Lose 1 kg a week/ })).toContainText("1,500 kcal");
  await table.getByRole("radio", { name: /^Lose ¼ kg a week/ }).click();
  await expect(d.getByText(/2,370 kcal keeps your weight/)).toBeVisible();
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /Appa/ })).toContainText("2100");
  await expect(page.getByRole("button", { name: /Appa/ })).toContainText("Lose ¼ kg/wk");
});

test("your usual tweaks are ticked on recipes and in the plan, and can be unticked", async ({ page }) => {
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
  await expect(d.getByText(/Height and weight are needed/)).toBeVisible();
  await d.getByRole("textbox", { name: "Height in cm" }).fill("175");
  await d.getByRole("textbox", { name: "Weight in kg" }).fill("80");
  await d.getByRole("radiogroup", { name: "Goal" }).getByRole("radio", { name: /^Lose ½ kg a week/ }).click();
  const tweaks = d.getByRole("group", { name: "Usual recipe tweaks" });
  for (const t of ["Low oil", "High protein", "Low carb"]) await expect(tweaks.getByRole("button", { name: t })).toHaveAttribute("aria-pressed", "true");
  await d.getByRole("button", { name: "Save" }).click();

  await page.goto("/recipe/sambar");
  await expect(page.getByText(/Ticked from/)).toBeVisible();
  await expect(page.getByRole("button", { name: "High protein" })).toHaveAttribute("aria-pressed", "true");
  const dal = page.locator("li:visible", { hasText: "Toor dal" }).last(); // the ingredient list, after "What changed"
  await expect(dal).toContainText("150 g");
  await expect(page.getByTestId("tweak-changes")).toContainText("Toor dal");
  await page.getByRole("button", { name: "High protein" }).click();
  await expect(dal).toContainText("100 g");
  await page.getByRole("button", { name: "High protein" }).click();
  await page.getByRole("button", { name: /Start cooking my version/ }).click();
  await expect(page).toHaveURL(/\/cook\/sambar--low_oil-high_protein$/);

  await page.goto("/plan");
  await page.getByRole("tab").first().click();
  await addDish(page, "Lunch", "Sambar");
  const row = page.getByRole("button", { name: /Sambar, edit portions/ });
  await expect(row).toContainText("Low oil · High protein");
  await row.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("group", { name: "Tweaks for this dish" }).getByRole("button", { name: "Low oil" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("High protein");
  await expect(row).not.toContainText("Low oil");
  await page.getByRole("link", { name: "Shopping list" }).click();
  // one serving of the high-protein sambar: 150 g dal for 4 → about 38 g (25 g in the original)
  const grams = Number((await page.getByRole("checkbox", { name: /Toor dal/ }).textContent())!.match(/(\d+)\s*g/)![1]);
  expect(grams).toBeGreaterThan(30);
});
