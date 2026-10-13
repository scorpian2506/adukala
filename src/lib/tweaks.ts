// Rule-based recipe tweaks (no AI): low oil, high protein, low carb, less spicy, kid friendly.
// Every rule only rescales measured ingredients, keeps the cooking water in step with the
// rice or dal it cooks, and keeps step items summing to the ingredient totals.

import { foodFor, foodKey, gramsOf } from "./nutrition";
import type { Ingredient, Recipe, Step, Unit } from "./types";

export const CUSTOMISATIONS = [
  { id: "low_oil", label: "Low oil", hint: "Half the oil and ghee" },
  { id: "high_protein", label: "High protein", hint: "Half as much again of the dal, paneer, egg or meat" },
  { id: "low_carb", label: "Low carb", hint: "Less rice, flour, potato and sugar, more vegetables" },
  { id: "kid_friendly", label: "Kid friendly", hint: "Mild, no whole spices to bite" },
  { id: "less_spicy", label: "Less spicy", hint: "Half the chilli" },
  { id: "jain", label: "Jain", hint: "No onion, garlic or root veg" },
  { id: "vegan", label: "Vegan", hint: "No ghee, curd or paneer" },
  { id: "diabetic", label: "Diabetic friendly", hint: "Low GI swaps, no sugar" },
] as const;

export type CustomisationId = (typeof CUSTOMISATIONS)[number]["id"];

/** Tweaks the app makes itself, by rules. The rest need AI to rewrite the recipe. */
export const OFFLINE_CUSTOMISATIONS: CustomisationId[] = ["low_oil", "high_protein", "low_carb", "less_spicy", "kid_friendly"];

const ORDER = CUSTOMISATIONS.map((c) => c.id) as CustomisationId[];
const COUNTED = new Set(["add", "grind"]);

export const PROTEIN_FACTOR = 1.5;
export const STARCH_FACTOR = 0.6;
export const SUGAR_FACTOR = 0.5;
export const OIL_FACTOR = 0.5;
const VEG_CAP = 1.5;

/** Stable order, no duplicates, offline ones only. */
export function canonicalTweaks(ids: readonly string[]): CustomisationId[] {
  return ORDER.filter((id) => ids.includes(id) && OFFLINE_CUSTOMISATIONS.includes(id));
}

export function isCustomisation(id: string): id is CustomisationId {
  return (ORDER as string[]).includes(id);
}

type Role = "water" | "salt" | "oil" | "fry_oil" | "chilli" | "sugar" | "protein" | "starch" | "veg" | "other";

const AROMATIC = /\b(onions?|shallots?|tomato(es)?|garlic|ginger|chill?i(es)?|lemon|lime|curry leaves|coriander|mint|tamarind|coconut)\b/i;
const STARCHY = /\b(potato(es)?|tapioca|raw banana|plantain|yam|colocasia|sago|sabudana|poha|aval|vermicelli|semiya|noodles?|pasta|bread)\b/i;
const PROTEIN_NAME = /\b(paneer|tofu|soya|chicken|mutton|lamb|prawns?|shrimp|fish|eggs?|chana|rajma|dal|lentils?|beans|peas|gram)\b/i;

function roleOf(ing: Ingredient): Role {
  const food = foodFor(ing.name);
  const name = ing.name.toLowerCase();
  if (food?.water || /^(hot |warm |cold )?water\b/.test(name)) return "water";
  if (ing.tag === "salt" || foodKey(ing.name) === "salt") return "salt";
  if (food?.frying || /deep.?fry|for frying/.test(name)) return "fry_oil";
  if (ing.tag === "oil" || food?.cat === "oils & ghee") return "oil";
  if (ing.tag === "chilli") return "chilli";
  if (ing.tag === "sugar" || food?.cat === "sweeteners") return "sugar";
  // Tempering and garnish amounts (a teaspoon of urad dal in the tadka) aren't the dish's protein or carbs.
  const side = ing.group === "tempering" || ing.group === "garnish" || ing.group === "spice";
  if (side) return "other";
  if (ing.tag === "protein" || food?.cat === "meat & fish" || food?.cat === "eggs" || food?.cat === "dals & beans" || /\b(paneer|tofu|soya)\b/.test(name)) return "protein";
  if (ing.tag === "carb" || food?.cat === "grains & flours" || food?.cat === "bakery" || STARCHY.test(name)) return "starch";
  if (food?.cat === "vegetables" && !AROMATIC.test(name)) return "veg";
  if (!food && PROTEIN_NAME.test(name) && !AROMATIC.test(name)) return "protein";
  return "other";
}

function grams(qty: number, unit: Unit, ing: Ingredient): number {
  const g = gramsOf(qty, unit, foodFor(ing.name));
  if (g != null) return g;
  // Rough fallbacks so a missing conversion doesn't hide an ingredient from the weighting.
  return qty * ({ g: 1, kg: 1000, ml: 1, L: 1000, tsp: 4, tbsp: 12, cup: 200, pc: 60 } as Record<Unit, number>)[unit];
}

export interface TweakChange {
  name: string;
  unit: Unit;
  from: number;
  to: number;
}

export interface TweakResult {
  recipe: Recipe;
  /** Tweaks that actually changed something (the version's label). */
  applied: CustomisationId[];
  /** Why a tweak did nothing, or what the cook should know. */
  notes: Partial<Record<CustomisationId, string>>;
  changes: TweakChange[];
}

/**
 * Apply rule-based tweaks. Batters and doughs (anything ground, breads, sweets) keep their
 * ratios; a dish that is only rice or flour isn't shrunk — the note says to eat less of it instead.
 */
export function tweakRecipe(r: Recipe, requested: readonly CustomisationId[]): TweakResult {
  const ids = canonicalTweaks(requested);
  const notes: TweakResult["notes"] = {};
  if (!ids.length) return { recipe: r, applied: [], notes, changes: [] };

  const steps = [...r.prep, ...r.cook];
  const ground = new Set(steps.filter((s) => s.kind === "grind").flatMap((s) => (s.items ?? []).map((it) => it.ingredient)));
  const sweet = r.course === "dessert";
  const dough = r.course === "bread";
  const role = new Map(r.ingredients.map((i) => [i.id, roleOf(i)]));
  const g = new Map(r.ingredients.map((i) => [i.id, grams(i.qty, i.unit, i)]));
  const locked = (i: Ingredient) => ground.has(i.id) || sweet || dough;
  const of = (want: Role, free = true) => r.ingredients.filter((i) => role.get(i.id) === want && (!free || !locked(i)));
  const mass = (list: Ingredient[]) => list.reduce((n, i) => n + (g.get(i.id) ?? 0), 0);

  const factor = new Map<string, number>(r.ingredients.map((i) => [i.id, 1]));
  const mul = (id: string, f: number) => factor.set(id, (factor.get(id) ?? 1) * f);
  const applied = new Set<CustomisationId>();

  if (ids.includes("low_oil")) {
    const oils = of("oil", false);
    if (sweet && oils.length) notes.low_oil = "Sweets need their ghee to set, so we kept it. Have a smaller piece.";
    else if (oils.length) {
      oils.forEach((i) => mul(i.id, OIL_FACTOR));
      applied.add("low_oil");
    }
    if (of("fry_oil", false).length) notes.low_oil = (notes.low_oil ? notes.low_oil + " " : "") + "The deep-frying oil stays: it has to cover the food. Drain well on kitchen paper.";
    if (!oils.length && !notes.low_oil) notes.low_oil = "There's no oil or ghee to cut in this one.";
  }

  if (ids.includes("high_protein")) {
    const proteins = of("protein").filter((i) => i.unit === "pc" || (g.get(i.id) ?? 0) >= 25);
    if (proteins.length) {
      proteins.forEach((i) => mul(i.id, PROTEIN_FACTOR));
      applied.add("high_protein");
    } else
      notes.high_protein = of("protein", false).length
        ? "Its dal is part of a batter or dough, so we kept the recipe as is. Serve with curd, a boiled egg or sundal."
        : "No dal, paneer, egg or meat to add more of. Serve with a cup of curd, a boiled egg or some sundal.";
  }

  if (ids.includes("low_carb")) {
    const starch = of("starch").filter((i) => (g.get(i.id) ?? 0) >= 20 || i.unit === "pc");
    const starchG = mass(starch);
    const removed = starchG * (1 - STARCH_FACTOR);
    const veg = of("veg");
    // Only lean proteins can stand in for rice: dal is itself more than half carbs.
    const prot = of("protein").filter((i) => ((g.get(i.id) ?? 0) >= 25 || i.unit === "pc") && (foodFor(i.name)?.carbs ?? 0) < 15 && foodFor(i.name)?.cat !== "dals & beans");
    // Put the removed rice or flour back as vegetables (or the protein), so the pot still feeds everyone.
    const fill = mass(veg) >= starchG * 0.25 ? veg : mass(prot) >= starchG * 0.25 ? prot : [];
    if (starch.length && fill.length) {
      starch.forEach((i) => mul(i.id, STARCH_FACTOR));
      const fillG = mass(fill);
      for (const i of fill) {
        const cur = factor.get(i.id) ?? 1;
        factor.set(i.id, Math.max(cur, Math.min(VEG_CAP, 1 + removed / fillG)));
      }
      applied.add("low_carb");
    } else if (starch.length || of("starch", false).length) {
      notes.low_carb = `${r.name} is mostly ${sweet ? "sugar and flour" : "rice or flour"}, so we kept the recipe. Have a smaller portion with more of the curry, dal or vegetables.`;
    }
    const sugars = of("sugar", false);
    if (sugars.length && !sweet) {
      sugars.forEach((i) => mul(i.id, SUGAR_FACTOR));
      applied.add("low_carb");
      if (notes.low_carb) notes.low_carb += " We did halve the sugar.";
    } else if (sugars.length && sweet) notes.low_carb = "Sweets need their sugar to set, so we kept it. Have a smaller piece.";
    if (!starch.length && !of("starch", false).length && !sugars.length) notes.low_carb = "There's no rice, flour, potato or sugar to cut in this one.";
  }

  if (ids.includes("less_spicy") || ids.includes("kid_friendly")) {
    const chillies = of("chilli", false);
    const f = ids.includes("kid_friendly") ? 0.25 : 0.5;
    chillies.forEach((i) => mul(i.id, f));
    if (chillies.length) ids.filter((x) => x === "less_spicy" || x === "kid_friendly").forEach((x) => applied.add(x));
    else for (const x of ids.filter((x) => x === "less_spicy" || x === "kid_friendly")) notes[x] = "It's already mild — no chilli to cut.";
  }

  if (!applied.size) return { recipe: r, applied: [], notes, changes: [] };

  // Salt follows the amount of food (not the water), within limits.
  const solids = r.ingredients.filter((i) => !["water", "salt", "oil", "fry_oil"].includes(role.get(i.id)!));
  const before = mass(solids);
  const after = solids.reduce((n, i) => n + (g.get(i.id) ?? 0) * (factor.get(i.id) ?? 1), 0);
  const saltF = before > 0 ? Math.min(1.4, Math.max(0.75, after / before)) : 1;
  if (Math.abs(saltF - 1) > 0.05) of("salt", false).forEach((i) => factor.set(i.id, saltF));

  const pcRound = (qty: number, id: string, f: number) => {
    if (f === 1) return qty;
    const x = qty * f;
    if (role.get(id) === "chilli") return Math.floor(x); // a whole chilli can't be quartered: drop it at zero
    if (f > 1) return Math.ceil(x - 0.01);
    return Math.max(1, Math.round(x));
  };
  const scaleItem = (qty: number, unit: Unit, id: string, f: number) => (unit === "pc" ? pcRound(qty, id, f) : qty * f);

  const scaleSteps = (list: Step[]) =>
    list.flatMap((s) => {
      if (!s.items) return [s];
      // Water cooked with rice or dal moves with it (weighted by what's in the pot at that step).
      let w = 0;
      let wf = 0;
      for (const it of s.items) {
        const ing = r.ingredients.find((i) => i.id === it.ingredient);
        const rl = role.get(it.ingredient);
        if (!ing || rl === "water" || rl === "salt" || rl === "oil" || rl === "fry_oil") continue;
        const gr = grams(it.qty, it.unit, ing);
        w += gr;
        wf += gr * (factor.get(it.ingredient) ?? 1);
      }
      const waterF = w > 0 ? wf / w : 1;
      const items = s.items
        .map((it) => {
          const f = role.get(it.ingredient) === "water" ? waterF : (factor.get(it.ingredient) ?? 1);
          return { ...it, qty: scaleItem(it.qty, it.unit, it.ingredient, f) };
        })
        .filter((it) => it.qty > 0);
      // A step that only handled a removed ingredient ("Slit the green chilli") goes too.
      if (!items.length && ["chop", "measure", "add", "grind"].includes(s.kind)) return [];
      return [{ ...s, items: items.length ? items : undefined }];
    });

  let prep = scaleSteps(r.prep);
  let cook = scaleSteps(r.cook);
  const counted = new Map<string, number>();
  for (const s of [...prep, ...cook]) if (COUNTED.has(s.kind)) for (const it of s.items ?? []) counted.set(it.ingredient, (counted.get(it.ingredient) ?? 0) + it.qty);
  const origCounted = new Map<string, number>();
  for (const s of steps) if (COUNTED.has(s.kind)) for (const it of s.items ?? []) origCounted.set(it.ingredient, (origCounted.get(it.ingredient) ?? 0) + it.qty);

  // An ingredient that rounded away (a quartered green chilli) leaves every step, not just some.
  const gone = new Set(r.ingredients.filter((i) => origCounted.has(i.id) && !(counted.get(i.id)! > 0)).map((i) => i.id));
  if (gone.size) {
    const strip = (list: Step[]) =>
      list.flatMap((s) => {
        if (!s.items?.some((it) => gone.has(it.ingredient))) return [s];
        const items = s.items.filter((it) => !gone.has(it.ingredient));
        if (!items.length && ["chop", "measure", "add", "grind"].includes(s.kind)) return [];
        return [{ ...s, items: items.length ? items : undefined }];
      });
    prep = strip(prep);
    cook = strip(cook);
  }

  const changes: TweakChange[] = [];
  const ingredients = r.ingredients
    .map((i) => {
      // Totals are the sum of what the steps add, so the two always agree.
      const qty = origCounted.has(i.id) ? i.qty + ((counted.get(i.id) ?? 0) - origCounted.get(i.id)!) : scaleItem(i.qty, i.unit, i.id, factor.get(i.id) ?? 1);
      const to = Math.max(0, +qty.toFixed(4));
      if (Math.abs(to - i.qty) > 1e-6) changes.push({ name: i.name, unit: i.unit, from: i.qty, to });
      return to === i.qty ? i : { ...i, qty: to, approx: undefined };
    })
    .filter((i) => i.qty > 0);

  const list = [...applied];
  const labels = CUSTOMISATIONS.filter((c) => applied.has(c.id)).map((c) => c.label);
  const warnings = [...(r.warnings ?? [])];
  if (applied.has("high_protein") || applied.has("low_carb")) warnings.push("Quantities were changed by rules — if the gravy gets too thick, add a splash of hot water.");
  return {
    recipe: {
      ...r,
      id: `${r.id}--${list.join("-")}`,
      ingredients,
      prep,
      cook,
      variant: [...new Set([...(r.variant ?? []), ...labels])],
      warnings: warnings.length ? warnings : undefined,
    },
    applied: list,
    notes,
    changes,
  };
}

/** The tweaked recipe (unchanged when no rule applies). */
export function applyOfflineTweaks(r: Recipe, ids: readonly CustomisationId[]): Recipe {
  return tweakRecipe(r, ids).recipe;
}

/** "sambar--low_oil-high_protein" → base id + tweaks, if it is a rule-made version. */
export function parseVariantId(id: string): { base: string; tweaks: CustomisationId[] } | null {
  const at = id.lastIndexOf("--");
  if (at <= 0) return null;
  const parts = id.slice(at + 2).split("-");
  if (!parts.length || !parts.every((p) => OFFLINE_CUSTOMISATIONS.includes(p as CustomisationId))) return null;
  return { base: id.slice(0, at), tweaks: parts as CustomisationId[] };
}

/** Find a recipe by id, re-deriving rule-made versions from their base so they never need saving. */
export function resolveRecipe(id: string, lookup: (id: string) => Recipe | undefined): Recipe | undefined {
  const direct = lookup(id);
  if (direct) return direct;
  const v = parseVariantId(id);
  if (!v) return undefined;
  const base = resolveRecipe(v.base, lookup);
  if (!base) return undefined;
  const out = versionOf(base, v.tweaks);
  return out.id === id ? out : { ...out, id };
}

const derived = new WeakMap<Recipe, Map<string, Recipe>>();

/** tweakRecipe(r, ids).recipe, cached per recipe object so lists and React memos stay cheap. */
export function versionOf(r: Recipe, ids: readonly CustomisationId[]): Recipe {
  const key = canonicalTweaks(ids).join("-");
  if (!key) return r;
  const memo = derived.get(r) ?? new Map<string, Recipe>();
  derived.set(r, memo);
  let out = memo.get(key);
  if (!out) memo.set(key, (out = tweakRecipe(r, ids).recipe));
  return out;
}

/** Id of a rule-made version (the base id when nothing would change). */
export function variantId(r: Recipe, ids: readonly CustomisationId[]): string {
  return versionOf(r, ids).id;
}
