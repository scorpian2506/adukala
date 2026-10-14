import { describe, expect, it } from "vitest";
import { SEED_RECIPES, findRecipe, findSeed } from "@/lib/recipes";
import { parseVariantId, resolveRecipe, tweakRecipe, versionOf } from "@/lib/tweaks";
import { swapOptions, usualSwaps } from "@/lib/swaps";
import { recipeNutrition, shoppingList } from "@/lib/nutrition";
import { validateRecipe } from "@/lib/validate";
import type { Recipe } from "@/lib/types";

const lookup = (id: string) => findRecipe(id, []);
const tokensFor = (r: Recipe) => {
  const o = swapOptions(r);
  const out: string[] = [];
  for (const i of Object.values(o.ingredients)) {
    if (i.canRemove) out.push(`x_${i.id}`);
    for (const a of i.alts) out.push(`${a}_${i.id}`);
  }
  if (o.paste) out.push("ggp");
  if (o.fresh) out.push("ggf");
  return out;
};

describe("ingredient swaps across the whole library", () => {
  it("every swap keeps every recipe valid, round-trips by id, and never leaves a step frying in nothing", () => {
    const problems: string[] = [];
    let n = 0;
    for (const r of SEED_RECIPES) {
      for (const t of tokensFor(r)) {
        for (const tweaks of [[], ["low_oil", "high_protein", "low_carb"]] as const) {
          const res = tweakRecipe(r, [...tweaks], [t]);
          const v = res.recipe;
          const tag = `${r.id} [${t}${tweaks.length ? " +tweaks" : ""}]`;
          n++;
          if (!res.swaps.includes(t)) problems.push(`${tag}: offered but not applied`);
          for (const i of validateRecipe(v, { seed: true }).filter((x) => x.level === "error")) problems.push(`${tag}: ${i.msg}`);
          const again = resolveRecipe(v.id, lookup);
          if (!again || JSON.stringify(again.ingredients) !== JSON.stringify(v.ingredients)) problems.push(`${tag}: ${v.id} doesn't resolve`);
          const before = new Map([...r.prep, ...r.cook].map((s) => [s.title, s]));
          for (const s of [...v.prep, ...v.cook]) if (s.kind === "heat" && before.get(s.title)?.items?.length && !s.items?.length) problems.push(`${tag}: empty "${s.title}"`);
        }
      }
    }
    expect(problems.slice(0, 40)).toEqual([]);
    expect(n).toBeGreaterThan(1000);
  });

  it("keeps old version ids working", () => {
    expect(parseVariantId("sambar--low_oil-high_protein")).toEqual({ base: "sambar", tweaks: ["low_oil", "high_protein"], swaps: [] });
    expect(parseVariantId("aloo-matar--~ggp")).toEqual({ base: "aloo-matar", tweaks: [], swaps: ["ggp"] });
    expect(parseVariantId("aloo-matar--low_oil~ggp~oil_ghee")).toEqual({ base: "aloo-matar", tweaks: ["low_oil"], swaps: ["ggp", "oil_ghee"] });
    expect(parseVariantId("aloo-matar--~bogus")).toBeNull();
    expect(parseVariantId("aloo-matar--")).toBeNull();
  });
});

describe("ginger and garlic", () => {
  it("swaps separate ginger and garlic for ready paste", () => {
    const r = findSeed("aloo-matar")!;
    const v = tweakRecipe(r, [], ["ggp"]).recipe;
    expect(v.id).toBe("aloo-matar--~ggp");
    expect(v.ingredients.find((i) => i.id === "ginger-garlic-paste")).toMatchObject({ qty: 2.5, unit: "tsp" }); // 6 g + 6 g
    expect(v.ingredients.some((i) => i.id === "ginger" || i.id === "garlic")).toBe(false);
    expect(v.prep.some((s) => s.kind === "chop" && /ginger|garlic/i.test(s.title))).toBe(false);
    expect(v.prep.find((s) => s.title === "Measure the ginger garlic paste")?.items).toEqual([{ ingredient: "ginger-garlic-paste", qty: 2.5, unit: "tsp" }]);
    expect(v.cook.find((s) => s.items?.some((it) => it.ingredient === "ginger-garlic-paste"))?.title).toMatch(/ginger garlic paste/);
    expect(v.variant).toContain("Ginger garlic paste");
    const shop = shoppingList([{ recipe: v, servings: v.servings }]).map((l) => l.name);
    expect(shop).toContain("Ginger garlic paste");
    expect(shop).not.toContain("Ginger");
  });
  it("and paste for fresh ginger and garlic", () => {
    const r = findSeed("chicken-curry")!;
    const v = tweakRecipe(r, [], ["ggf"]).recipe;
    expect(v.ingredients.find((i) => i.id === "ginger")).toMatchObject({ qty: 7.5, unit: "g" }); // 1 tbsp = 15 g, half each
    expect(v.prep.some((s) => s.title === "Peel and finely grate the ginger")).toBe(true);
    expect(JSON.stringify(v.cook)).not.toMatch(/ginger[- ]garlic paste/i);
  });
  it("only offers paste when ginger and garlic always go in together", () => {
    const offered = SEED_RECIPES.filter((r) => swapOptions(r).paste).length;
    const fresh = SEED_RECIPES.filter((r) => swapOptions(r).fresh).length;
    expect(offered).toBeGreaterThan(25);
    expect(fresh).toBeGreaterThan(20);
  });
});

describe("ghee and other swaps", () => {
  const withGhee = SEED_RECIPES.filter((r) => r.course !== "dessert" && r.ingredients.some((i) => i.name === "Ghee"));
  it("ghee → oil keeps the calories and Low oil halves the new oil", () => {
    const r = withGhee.find((x) => swapOptions(x).ingredients[x.ingredients.find((i) => i.name === "Ghee")!.id].alts.includes("oil"))!;
    const ghee = r.ingredients.find((i) => i.name === "Ghee")!;
    const v = tweakRecipe(r, [], [`oil_${ghee.id}`]);
    const oil = v.recipe.ingredients.find((i) => i.id === ghee.id)!;
    expect(oil.name).toBe("Oil");
    expect(oil.qty).toBe(ghee.qty);
    expect(Math.abs(recipeNutrition(v.recipe).total.kcal - recipeNutrition(r).total.kcal)).toBeLessThan(40);
    expect(v.changes[0]).toMatchObject({ name: "Ghee", swap: "Oil" });
    const low = tweakRecipe(r, ["low_oil"], [`oil_${ghee.id}`]).recipe;
    expect(low.ingredients.find((i) => i.id === ghee.id)!.qty).toBeCloseTo(ghee.qty / 2);
    expect(low.id).toBe(`${r.id}--low_oil~oil_${ghee.id}`);
  });
  it("won't leave out the only fat something is fried in", () => {
    const blocked = withGhee.flatMap((r) => r.ingredients.filter((i) => i.name === "Ghee" && !swapOptions(r).ingredients[i.id].canRemove));
    expect(blocked.length).toBeGreaterThan(0);
    const r = withGhee.find((x) => x.ingredients.some((i) => i.name === "Ghee" && !swapOptions(x).ingredients[i.id].canRemove))!;
    const id = r.ingredients.find((i) => i.name === "Ghee")!.id;
    expect(tweakRecipe(r, [], [`x_${id}`]).recipe).toBe(r);
    // Jeera rice: the ghee goes in alone and the cumin is fried in it next — it can't just go.
    expect(swapOptions(findSeed("jeera-rice")!).ingredients.ghee.canRemove).toBe(false);
    // Rava upma: a spoon of ghee stirred in at the end can.
    expect(swapOptions(findSeed("rava-upma")!).ingredients.ghee.canRemove).toBe(true);
  });
  it("leaving something out removes it from every step", () => {
    const r = findSeed("sambar")!;
    const v = tweakRecipe(r, [], ["x_curry-leaves"]).recipe;
    expect(v.ingredients.some((i) => i.id === "curry-leaves")).toBe(false);
    expect(JSON.stringify([...v.prep, ...v.cook])).not.toContain('"curry-leaves"');
    expect(v.variant).toContain("No curry leaves");
  });
  it("profile preferences: ghee → oil (garnish ghee just goes), ready paste, sweets untouched", () => {
    const am = findSeed("aloo-matar")!;
    expect(usualSwaps({ gingerGarlic: "paste" }, am)).toEqual(["ggp"]);
    for (const r of withGhee) {
      const s = usualSwaps({ ghee: "oil" }, r);
      const v = versionOf(r, [], s);
      expect(v.ingredients.some((i) => i.name === "Ghee")).toBe(false);
      const text = [...v.prep, ...v.cook].map((x) => [x.title, x.detail, x.cue, x.tip].join(" ")).join(" ");
      expect(text, r.id).not.toMatch(/\bghee\b/i);
      expect(text, r.id).not.toMatch(/\boil, oil\b/i);
    }
    const sweet = SEED_RECIPES.find((r) => r.course === "dessert" && r.ingredients.some((i) => i.name === "Ghee"))!;
    expect(usualSwaps({ ghee: "oil" }, sweet)).toEqual([]);
  });
});
