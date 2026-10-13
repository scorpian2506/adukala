import { describe, expect, it } from "vitest";
import { SEED_RECIPES, findRecipe, findSeed, parseOfflineTweak, replacesSeed, withSaved } from "@/lib/recipes";
import { OFFLINE_CUSTOMISATIONS, canonicalTweaks, parseVariantId, tweakRecipe, versionOf, type CustomisationId } from "@/lib/tweaks";
import { recipeNutrition } from "@/lib/nutrition";
import { validateRecipe } from "@/lib/validate";
import { bmi, calorieTable, dailyTarget, usualTweaks, type Member } from "@/lib/family";
import { fitPortions, personTotals, potServings, type Slot } from "@/lib/planner";
import type { Recipe } from "@/lib/types";

const seed = (id: string) => findSeed(id)!;
const qty = (r: Recipe, id: string) => r.ingredients.find((i) => i.id === id)?.qty;
const stepItem = (r: Recipe, title: RegExp, id: string) => [...r.prep, ...r.cook].find((s) => title.test(s.title))?.items?.find((i) => i.ingredient === id)?.qty;

const COMBOS: CustomisationId[][] = [["low_oil"], ["high_protein"], ["low_carb"], ["less_spicy"], ["kid_friendly"], ["low_oil", "high_protein", "low_carb"], ["high_protein", "low_carb", "kid_friendly"]];

describe("rule-based tweaks across the whole library", () => {
  it("every recipe stays valid, whole items stay whole, and nutrition moves the right way", () => {
    const problems: string[] = [];
    for (const r of SEED_RECIPES) {
      const base = recipeNutrition(r).total;
      for (const combo of COMBOS) {
        const { recipe: v, applied } = tweakRecipe(r, combo);
        const tag = `${r.id} [${combo}]`;
        for (const i of validateRecipe(v, { seed: true }).filter((x) => x.level === "error")) problems.push(`${tag}: ${i.msg}`);
        for (const s of [...v.prep, ...v.cook]) for (const it of s.items ?? []) if (it.unit === "pc" && !Number.isInteger(it.qty)) problems.push(`${tag}: ${it.ingredient} ${it.qty} pc`);
        if (!applied.length) {
          if (v !== r) problems.push(`${tag}: changed without a label`);
          continue;
        }
        const n = recipeNutrition(v).total;
        if (combo.length === 1 && applied.includes("high_protein") && !(n.protein > base.protein)) problems.push(`${tag}: protein ${base.protein} → ${n.protein}`);
        if (combo.length === 1 && applied.includes("low_carb") && !(n.carbs < base.carbs)) problems.push(`${tag}: carbs ${base.carbs} → ${n.carbs}`);
        if (combo.length === 1 && applied.includes("low_oil") && !(n.fat < base.fat)) problems.push(`${tag}: fat ${base.fat} → ${n.fat}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("works for most of the library without AI", () => {
    const count = (c: CustomisationId) => SEED_RECIPES.filter((r) => tweakRecipe(r, [c]).applied.length).length;
    expect(count("low_oil")).toBeGreaterThan(150);
    expect(count("high_protein")).toBeGreaterThan(60);
    expect(count("low_carb")).toBeGreaterThan(50);
  });

  it("gives the same version whatever order the tweaks are picked in", () => {
    const a = tweakRecipe(seed("chicken-biryani"), ["low_carb", "low_oil", "high_protein"]).recipe;
    const b = tweakRecipe(seed("chicken-biryani"), ["high_protein", "low_oil", "low_carb"]).recipe;
    expect(a.id).toBe("chicken-biryani--low_oil-high_protein-low_carb");
    expect(b).toEqual(a);
    expect(canonicalTweaks(["vegan", "low_carb", "low_oil", "low_carb"])).toEqual(["low_oil", "low_carb"]);
  });
});

describe("individual rules", () => {
  it("high protein: more dal, and the water cooked with it goes up too", () => {
    const { recipe: v, notes } = tweakRecipe(seed("sambar"), ["high_protein"]);
    expect(qty(v, "toor-dal")).toBe(150);
    expect(stepItem(v, /dal and water in cooker/i, "water")).toBeCloseTo(562.5);
    // Tamarind water (a separate step) is unchanged.
    expect(stepItem(v, /tamarind in warm water/i, "water")).toBe(200);
    expect(qty(v, "salt")!).toBeGreaterThan(qty(seed("sambar"), "salt")!);
    expect(v.variant).toEqual(["High protein"]);
    expect(notes.high_protein).toBeUndefined();
  });

  it("low carb swaps potato for more cauliflower in aloo gobi", () => {
    const { recipe: v } = tweakRecipe(seed("aloo-gobi"), ["low_carb"]);
    expect(qty(v, "potato")).toBeLessThan(qty(seed("aloo-gobi"), "potato")!);
    expect(qty(v, "cauliflower")).toBeGreaterThan(qty(seed("aloo-gobi"), "cauliflower")!);
  });

  it("keeps batters, doughs and plain rice as they are, and says why", () => {
    for (const id of ["idli", "plain-rice"]) {
      const res = tweakRecipe(seed(id), ["low_carb", "high_protein"]);
      expect(res.applied, id).toEqual([]);
      expect(res.recipe, id).toBe(seed(id));
      expect(res.notes.low_carb, id).toMatch(/smaller portion/);
      expect(res.notes.high_protein, id).toMatch(/curd|egg/);
    }
  });

  it("rounds whole eggs up, never to half an egg", () => {
    const eggy = SEED_RECIPES.filter((r) => r.ingredients.some((i) => i.unit === "pc" && /egg/i.test(i.name) && i.group !== "garnish"));
    expect(eggy.length).toBeGreaterThan(0);
    for (const r of eggy) {
      const v = tweakRecipe(r, ["high_protein"]).recipe;
      for (const i of v.ingredients.filter((i) => i.unit === "pc")) expect(Number.isInteger(i.qty), `${r.id} ${i.id}`).toBe(true);
    }
  });

  it("leaves deep-frying oil alone but explains", () => {
    const res = tweakRecipe(seed("poori-masala"), ["low_oil"]);
    expect(res.notes.low_oil).toMatch(/deep-frying oil stays/);
  });

  it("understands typed requests", () => {
    expect(parseOfflineTweak("make it high protein and less carbs").tweaks).toEqual(["high_protein", "low_carb"]);
    expect(parseOfflineTweak("more protein please").tweaks).toEqual(["high_protein"]);
  });
});

describe("versions by id", () => {
  it("re-derives a version from its id without saving it", () => {
    const v = findRecipe("sambar--low_oil-high_protein");
    expect(v?.variant).toEqual(["Low oil", "High protein"]);
    expect(findRecipe("sambar--low_oil-high_protein")).toBe(v); // cached: same object
    expect(versionOf(seed("sambar"), ["high_protein", "low_oil"])).toBe(v);
    expect(findRecipe("sambar--vegan")).toBeUndefined();
    expect(findRecipe("nope--low_oil")).toBeUndefined();
    expect(parseVariantId("sambar")).toBeNull();
    expect(OFFLINE_CUSTOMISATIONS).toContain("low_carb");
  });

  it("a household's replacement recipe wins over the library one", () => {
    const mine: Recipe = { ...seed("sambar"), name: "Amma's Sambar" };
    expect(findRecipe("sambar", [mine])?.name).toBe("Amma's Sambar");
    expect(findRecipe("sambar--low_oil", [mine])?.name).toBe("Amma's Sambar");
    const list = withSaved([mine]);
    expect(list.filter((r) => r.id === "sambar")).toEqual([mine]);
    expect(list.length).toBe(SEED_RECIPES.length);
    expect(replacesSeed(mine)).toBe(true);
    expect(replacesSeed(seed("sambar"))).toBe(false);
  });
});

describe("calorie calculator", () => {
  const me: Member = { id: "user:s", name: "S", kind: "adult", age: 35, sex: "male", heightCm: 175, weightKg: 80, activity: "light", goal: "maintain", diet: "nonveg", color: "#000" };
  it("lists maintain and each weekly pace like a calorie calculator", () => {
    const t = calorieTable(me);
    const kcal = (label: string) => t.find((r) => r.label === label)!.kcal;
    expect(kcal("Stay as I am")).toBe(2370);
    expect(kcal("Lose ¼ kg a week")).toBe(2100);
    expect(kcal("Lose ½ kg a week")).toBe(1820);
    expect(kcal("Lose 1 kg a week")).toBe(1500); // 1270 asked, floored at the safe minimum
    expect(t.find((r) => r.label === "Lose 1 kg a week")!.floored).toBe(true);
    expect(kcal("Gain ½ kg a week")).toBe(2920);
    expect(dailyTarget({ ...me, goal: "lose", rateKg: 0.25 }).maintain).toBe(2370);
  });
  it("works out BMI with Asian-Indian cut-offs", () => {
    expect(bmi(me)).toEqual({ value: 26.1, label: "Obese", healthy: [57, 70] });
    expect(bmi({ heightCm: 160, weightKg: 55 })?.label).toBe("Healthy");
    expect(bmi({})).toBeNull();
  });
  it("suggests tweaks from the goal until the person picks their own", () => {
    expect(usualTweaks({ ...me, goal: "lose" })).toEqual(["low_oil", "high_protein", "low_carb"]);
    expect(usualTweaks({ ...me, goal: "muscle" })).toEqual(["high_protein"]);
    expect(usualTweaks({ ...me, goal: "lose", tweaks: [] })).toEqual([]);
    expect(usualTweaks({ ...me, kind: "child" })).toEqual([]);
    expect(usualTweaks(undefined)).toEqual([]);
  });
});

describe("one pot, different plates", () => {
  const per = (id: string) => (id === "idli" ? { kcal: 100, protein: 3, carbs: 20, fat: 0 } : { kcal: 200, protein: 8, carbs: 20, fat: 6 });
  it("sizes each person's portions to their daily target", () => {
    const day: Partial<Record<"breakfast" | "lunch" | "snack" | "dinner", Slot>> = {
      breakfast: { dishes: [{ recipeId: "idli", portions: { dad: 1, kid: 1, mum: 0 } }] },
      dinner: { dishes: [{ recipeId: "sambar", portions: { dad: 1, kid: 1, mum: 1 } }] },
    };
    const out = fitPortions(day, { dad: 1100, kid: 550, mum: 300 }, per);
    // Breakfast takes 25/55 of the day and dinner 30/55.
    expect(out.breakfast!.dishes[0].portions).toEqual({ dad: 3, kid: 2.5, mum: 0 }); // dad wanted 5, capped at 3
    expect(out.dinner!.dishes[0].portions).toEqual({ dad: 3, kid: 1.5, mum: 1.5 });
    const slots = Object.values(out) as Slot[];
    expect(personTotals(slots, "kid", per).kcal).toBeCloseTo(550, -1);
    expect(day.breakfast!.dishes[0].portions.dad).toBe(1); // input untouched
    expect(potServings({ dad: 1.25, kid: 0.5, mum: 0.75 })).toBe(2.5);
  });
  it("never goes below a quarter for someone eating, nor feeds someone who isn't", () => {
    const out = fitPortions({ lunch: { dishes: [{ recipeId: "sambar", portions: { a: 1, b: 0 } }] } }, { a: 10, b: 2000 }, per);
    expect(out.lunch!.dishes[0].portions).toEqual({ a: 0.25, b: 0 });
  });
});
