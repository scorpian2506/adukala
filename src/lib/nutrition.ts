// Calories and shopping quantities from a recipe's measured ingredients.
// Estimates: ingredient values come from IFCT/USDA averages (see nutrition-data.ts).

import { ALIASES, FOODS, type Food, type FoodCategory } from "./nutrition-data";
import type { Nutrients } from "./planner";
import type { Ingredient, Recipe, Unit } from "./types";

/** Share of deep-frying oil that ends up in the food. */
export const FRYING_ABSORPTION = 0.12;

export function foodKey(name: string): string | undefined {
  const n = name.toLowerCase().trim();
  if (ALIASES[n]) return ALIASES[n];
  if (FOODS[n]) return n;
  // Light fallbacks for names added after the table was built.
  const stripped = n.replace(/\s*\(.*?\)\s*/g, " ").replace(/,.*$/, "").replace(/\s+/g, " ").trim();
  if (ALIASES[stripped]) return ALIASES[stripped];
  if (FOODS[stripped]) return stripped;
  const singular = stripped.replace(/(es|s)$/, "");
  if (ALIASES[singular]) return ALIASES[singular];
  if (FOODS[singular]) return singular;
  return undefined;
}

export function foodFor(name: string): Food | undefined {
  const k = foodKey(name);
  return k ? FOODS[k] : undefined;
}

/** Grams for a measured amount, or null when the unit can't be converted for this food. */
export function gramsOf(qty: number, unit: Unit, food: Food | undefined): number | null {
  switch (unit) {
    case "g":
      return qty;
    case "kg":
      return qty * 1000;
    case "ml":
      return qty * (food?.g?.ml ?? 1);
    case "L":
      return qty * 1000 * (food?.g?.ml ?? 1);
    default: {
      const per = food?.g?.[unit];
      return per != null ? qty * per : null;
    }
  }
}

export interface RecipeNutrition {
  total: Nutrients;
  perServing: Nutrients;
  /** Share of ingredient lines we could turn into nutrition (1 = all). */
  coverage: number;
  unknown: string[];
}

const cache = new WeakMap<Recipe, RecipeNutrition>();

export function recipeNutrition(r: Recipe): RecipeNutrition {
  const hit = cache.get(r);
  if (hit) return hit;
  const total: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const unknown: string[] = [];
  let counted = 0;
  for (const ing of r.ingredients) {
    const food = foodFor(ing.name);
    if (food?.water) {
      counted++;
      continue;
    }
    const g = gramsOf(ing.qty, ing.unit, food);
    if (!food || g == null) {
      unknown.push(ing.name);
      continue;
    }
    counted++;
    const eaten = g * (food.frying ? FRYING_ABSORPTION : 1);
    total.kcal += (food.kcal * eaten) / 100;
    total.protein += (food.protein * eaten) / 100;
    total.carbs += (food.carbs * eaten) / 100;
    total.fat += (food.fat * eaten) / 100;
  }
  const s = Math.max(1, r.servings);
  const out: RecipeNutrition = {
    total,
    perServing: { kcal: total.kcal / s, protein: total.protein / s, carbs: total.carbs / s, fat: total.fat / s },
    coverage: r.ingredients.length ? counted / r.ingredients.length : 1,
    unknown,
  };
  cache.set(r, out);
  return out;
}

// ---------- shopping ----------

export interface ShopLine {
  key: string; // stable id for ticking off ("Onion|g")
  name: string;
  amount: string; // "450 g", "3 pc", "1.2 L"
  cat: FoodCategory;
  pantry: boolean;
  recipes: string[];
}

const CAT_ORDER: FoodCategory[] = ["vegetables", "herbs", "fruit", "meat & fish", "eggs", "dairy", "dals & beans", "grains & flours", "bakery", "nuts & seeds", "oils & ghee", "spices & masalas", "sauces & condiments", "sweeteners", "beverages", "other"];

export const CATEGORY_LABEL: Record<FoodCategory, string> = {
  vegetables: "Vegetables",
  fruit: "Fruit",
  herbs: "Herbs & leaves",
  dairy: "Dairy",
  "meat & fish": "Meat & fish",
  eggs: "Eggs",
  "grains & flours": "Rice, grains & flours",
  "dals & beans": "Dals & beans",
  "spices & masalas": "Spices & masalas",
  "oils & ghee": "Oils & ghee",
  "nuts & seeds": "Nuts & seeds",
  "sauces & condiments": "Sauces & condiments",
  sweeteners: "Sugar & jaggery",
  bakery: "Bread & bakery",
  beverages: "Tea & coffee",
  other: "Other",
};

function prettyAmount(qty: number, unit: string): string {
  if (unit === "g") return qty >= 1000 ? `${(qty / 1000).toFixed(qty >= 10000 ? 0 : 2).replace(/\.?0+$/, "")} kg` : `${Math.ceil(qty / 5) * 5} g`;
  if (unit === "ml") return qty >= 1000 ? `${(qty / 1000).toFixed(2).replace(/\.?0+$/, "")} L` : `${Math.ceil(qty / 10) * 10} ml`;
  if (unit === "pc") return `${Math.ceil(qty)}`;
  return `${Math.round(qty * 4) / 4} ${unit}`;
}

/**
 * Everything to buy for these recipes at these servings. Weights merge across
 * recipes; liquids stay in ml; whole items stay as counts.
 */
export function shoppingList(entries: { recipe: Recipe; servings: number }[]): ShopLine[] {
  const acc = new Map<string, { name: string; qty: number; unit: string; cat: FoodCategory; pantry: boolean; recipes: Set<string> }>();
  for (const { recipe, servings } of entries) {
    const f = servings / Math.max(1, recipe.servings);
    for (const ing of recipe.ingredients) {
      const food = foodFor(ing.name);
      if (food?.water) continue;
      const name = food?.shop ?? ing.name;
      const cat = food?.cat ?? "other";
      const pantry = !!food?.pantry;
      // Keep liquids in ml and countables as pieces; everything else as grams when we can.
      let unit: string;
      let qty: number;
      if (ing.unit === "ml" || ing.unit === "L") {
        unit = "ml";
        qty = (ing.unit === "L" ? 1000 : 1) * ing.qty;
      } else if (ing.unit === "pc") {
        unit = "pc";
        qty = ing.qty;
      } else {
        const g = gramsOf(ing.qty, ing.unit, food);
        if (g != null) {
          unit = "g";
          qty = g;
        } else {
          unit = ing.unit;
          qty = ing.qty;
        }
      }
      const key = `${name}|${unit}`;
      const cur = acc.get(key) ?? { name, qty: 0, unit, cat, pantry, recipes: new Set<string>() };
      cur.qty += qty * f;
      cur.recipes.add(recipe.name);
      acc.set(key, cur);
    }
  }
  return [...acc.entries()]
    .map(([key, v]) => ({ key, name: v.name, amount: prettyAmount(v.qty, v.unit), cat: v.cat, pantry: v.pantry, recipes: [...v.recipes] }))
    .sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name));
}

export function roundN(n: Nutrients): Nutrients {
  return { kcal: Math.round(n.kcal), protein: Math.round(n.protein), carbs: Math.round(n.carbs), fat: Math.round(n.fat) };
}

export type { Ingredient };
