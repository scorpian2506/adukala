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
  if (o.goal) await d.getByRole("radio", { name: o.goal, exact: true }).click();
  await d.getByRole("button", { name: "Save" }).click();
}

async function addDish(page: Page, meal: string, dish: string) {
  await page.getByRole("button", { name: `Add dish to ${meal}` }).click();
  await page.getByRole("textbox", { name: "Search dishes" }).fill(dish);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${dish}`) }).first().click();
}

test("family, a week of meals, calories per person, shopping list", async ({ page }) => {
  await page.goto("/family");
  await addMember(page, "adult", "Sriram", { age: "35", sex: "Male", height: "175", weight: "80", goal: "Lose weight" });
  await expect(page.getByRole("button", { name: /Sriram/ })).toContainText("1870");
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
  await addMember(page, "adult", "Wife", { age: "32", sex: "Female" });
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
