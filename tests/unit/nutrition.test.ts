import { describe, expect, it } from "vitest";
import { SEED_RECIPES, findSeed } from "@/lib/recipes";
import { FRYING_ABSORPTION, foodFor, gramsOf, recipeNutrition, shoppingList } from "@/lib/nutrition";

describe("nutrition", () => {
  it("resolves every ingredient line in the library", () => {
    const missing = SEED_RECIPES.flatMap((r) => recipeNutrition(r).unknown.map((u) => `${r.id}: ${u}`));
    expect(missing).toEqual([]);
  });
  it("keeps per-serving calories in a sane range", () => {
    for (const r of SEED_RECIPES) {
      const k = recipeNutrition(r).perServing.kcal;
      expect(k, r.id).toBeGreaterThan(15);
      expect(k, r.id).toBeLessThan(1000);
    }
  });
  it("matches known anchors", () => {
    const k = (id: string) => recipeNutrition(findSeed(id)!).perServing.kcal;
    expect(k("sambar")).toBeGreaterThan(100);
    expect(k("sambar")).toBeLessThan(320);
    expect(k("plain-rice")).toBeGreaterThan(150);
    expect(k("plain-rice")).toBeLessThan(380);
    expect(k("chicken-biryani")).toBeGreaterThan(450);
    expect(k("chicken-biryani")).toBeLessThan(900);
    expect(k("masala-chai")).toBeLessThan(200);
  });
  it("counts only absorbed deep-frying oil", () => {
    const oil = foodFor("oil for deep frying (groundnut or sunflower)");
    expect(oil?.frying).toBe(true);
    expect(FRYING_ABSORPTION).toBeLessThan(0.2);
    const vada = recipeNutrition(findSeed("medu-vada")!).perServing.kcal;
    expect(vada).toBeLessThan(600);
  });
  it("converts measures to grams", () => {
    const oil = foodFor("oil");
    expect(gramsOf(1, "tbsp", oil)).toBeCloseTo(13.5, 0);
    expect(gramsOf(2, "kg", undefined)).toBe(2000);
    expect(gramsOf(1, "pc", undefined)).toBeNull();
  });
  it("water has no calories and is never shopped", () => {
    expect(foodFor("water")?.water).toBe(true);
    const list = shoppingList([{ recipe: findSeed("dal-tadka")!, servings: 3 }]);
    expect(list.some((l) => /water/i.test(l.name))).toBe(false);
  });
});

describe("shopping list", () => {
  it("scales to planned servings and merges the same item across recipes", () => {
    const sambar = findSeed("sambar")!;
    const one = shoppingList([{ recipe: sambar, servings: sambar.servings }]);
    const two = shoppingList([{ recipe: sambar, servings: sambar.servings * 2 }]);
    const toorOne = one.find((l) => /toor/i.test(l.name))!;
    const toorTwo = two.find((l) => /toor/i.test(l.name))!;
    expect(parseFloat(toorTwo.amount)).toBeGreaterThan(parseFloat(toorOne.amount) * 1.8);
    const both = shoppingList([
      { recipe: sambar, servings: 4 },
      { recipe: findSeed("dal-tadka")!, servings: 3 },
    ]);
    const toor = both.filter((l) => /toor/i.test(l.name) && l.amount.endsWith("g"));
    expect(toor).toHaveLength(1);
    expect(toor[0].recipes.sort()).toEqual(["Dal Tadka", "Sambar"]);
  });
  it("marks salt as a pantry item and groups by aisle", () => {
    const list = shoppingList([{ recipe: findSeed("sambar")!, servings: 4 }]);
    expect(list.find((l) => /^salt/i.test(l.name))?.pantry).toBe(true);
    const cats = list.map((l) => l.cat);
    expect(cats.indexOf("vegetables")).toBeLessThan(cats.indexOf("spices & masalas"));
  });
});
