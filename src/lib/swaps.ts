// Rule-based ingredient swaps (no AI): leave one out, use an alternative (ghee → oil),
// or switch between fresh ginger + garlic and ready ginger garlic paste.
//
// A swap is a token in the version id, after the tweaks: "aloo-matar--low_oil~ggp~oil_ghee".
//   x_<id>        leave the ingredient out
//   <alt>_<id>    use an alternative (oil, ghee, jaggery, sugar, milk)
//   ggp           fresh ginger + garlic → ginger garlic paste
//   ggf           ginger garlic paste → fresh ginger + garlic

import { foodFor, foodKey, gramsOf } from "./nutrition";
import type { Ingredient, Recipe, Step, StepItem, Unit } from "./types";

export type SwapId = string;

export const ALTS = {
  oil: { name: "Oil", label: "Oil", tag: "oil" },
  ghee: { name: "Ghee", label: "Ghee", tag: "oil" },
  jaggery: { name: "Jaggery, grated", label: "Jaggery", tag: "sugar" },
  sugar: { name: "Sugar", label: "Sugar", tag: "sugar" },
  milk: { name: "Milk", label: "Milk", tag: undefined },
} as const;
export type Alt = keyof typeof ALTS;

/** What each food can be swapped for, same amount. */
const ALTERNATIVES: Record<string, Alt[]> = {
  ghee: ["oil"],
  butter: ["ghee", "oil"],
  "coconut oil": ["oil"],
  "gingelly oil": ["oil"],
  "mustard oil": ["oil"],
  sugar: ["jaggery"],
  jaggery: ["sugar"],
  "fresh cream": ["milk"],
};

const ALT_NOTE: Partial<Record<string, string>> = {
  "ghee>oil": "Oil instead of ghee: lighter, a little less nutty.",
  "butter>oil": "Oil instead of butter: less rich.",
  "butter>ghee": "Ghee instead of butter: the same richness, a little nuttier.",
  "coconut oil>oil": "Any cooking oil instead of coconut oil: the Kerala aroma will be milder.",
  "sugar>jaggery": "Jaggery instead of sugar: a deeper, caramel taste and a darker colour.",
  "jaggery>sugar": "Sugar instead of jaggery: lighter in taste and colour.",
  "fresh cream>milk": "Milk instead of cream: thinner and less rich. Simmer a minute longer.",
};

const COUNTED = new Set(["add", "grind"]);
const DROPPABLE = new Set(["chop", "measure", "add", "grind", "rinse", "soak"]);
const TSP_PASTE = 5; // g of ginger garlic paste per tsp

const allSteps = (r: Recipe) => [...r.prep, ...r.cook];
const has = (s: Step, id: string) => !!s.items?.some((it) => it.ingredient === id);
const keyOf = (i: Ingredient) => foodKey(i.name) ?? "";
const isFat = (i: Ingredient) => i.tag === "oil" || foodFor(i.name)?.cat === "oils & ghee" || keyOf(i) === "butter";
const isWater = (i: Ingredient) => !!foodFor(i.name)?.water || /^(hot |warm |cold )?water\b/i.test(i.name);

function grams(qty: number, unit: Unit, ing: Ingredient): number {
  return gramsOf(qty, unit, foodFor(ing.name)) ?? qty * ({ g: 1, kg: 1000, ml: 1, L: 1000, tsp: 4, tbsp: 12, cup: 200, pc: 10 } as Record<Unit, number>)[unit];
}

const quarter = (n: number) => Math.max(0.25, Math.round(n * 4) / 4);
const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

// ---------- what can be swapped ----------

export interface IngredientSwaps {
  id: string;
  /** Can it be left out without breaking a step (e.g. the only fat a tempering is fried in)? */
  canRemove: boolean;
  /** Why not, in plain words. */
  removeBlock?: string;
  /** It's the heart of the dish: leaving it out changes what you're making. */
  main?: boolean;
  alts: Alt[];
}

export interface SwapOptions {
  ingredients: Record<string, IngredientSwaps>;
  /** Separate ginger and garlic always go in together, so ready paste can replace them. */
  paste: boolean;
  /** The recipe uses ginger garlic paste, which can be made with fresh ginger and garlic. */
  fresh: boolean;
}

const optionsCache = new WeakMap<Recipe, SwapOptions>();

function gingerGarlic(r: Recipe) {
  const ginger = r.ingredients.find((i) => keyOf(i) === "ginger");
  const garlic = r.ingredients.find((i) => keyOf(i) === "garlic");
  const paste = r.ingredients.find((i) => keyOf(i) === "ginger garlic paste");
  return { ginger, garlic, paste };
}

/** Every counted step that adds one adds the other, so one paste can go in their place. */
function pasteable(r: Recipe): boolean {
  const { ginger, garlic, paste } = gingerGarlic(r);
  if (!ginger || !garlic || paste) return false;
  if (ginger.group === "garnish" || garlic.group === "garnish") return false;
  const counted = allSteps(r).filter((s) => COUNTED.has(s.kind));
  const a = counted.filter((s) => has(s, ginger.id));
  const b = counted.filter((s) => has(s, garlic.id));
  return a.length > 0 && a.length === b.length && a.every((s) => has(s, garlic.id));
}

function freshable(r: Recipe): boolean {
  const { ginger, garlic, paste } = gingerGarlic(r);
  return !!paste && !ginger && !garlic && (paste.unit === "tsp" || paste.unit === "tbsp" || paste.unit === "g") && allSteps(r).some((s) => COUNTED.has(s.kind) && has(s, paste.id));
}

export function swapOptions(r: Recipe): SwapOptions {
  const hit = optionsCache.get(r);
  if (hit) return hit;
  const steps = allSteps(r);
  const solids = r.ingredients.filter((i) => !isWater(i) && !isFat(i) && i.tag !== "salt");
  const total = solids.reduce((n, i) => n + grams(i.qty, i.unit, i), 0);
  const ingredients: Record<string, IngredientSwaps> = {};
  for (const ing of r.ingredients) {
    let removeBlock: string | undefined;
    if (isWater(ing)) removeBlock = "Water cooks the food, so it can't be left out.";
    else if (isFat(ing)) {
      // Only a finishing drizzle (garnish, or stirred in off the flame) can just go, or fat that
      // goes in alongside another fat. Otherwise something is fried in it.
      const uses = steps.filter((s) => has(s, ing.id) && (COUNTED.has(s.kind) || s.kind === "heat"));
      const otherFat = (s: Step) =>
        (s.items ?? []).some((it) => {
          const o = it.ingredient !== ing.id && r.ingredients.find((i) => i.id === it.ingredient);
          return !!o && isFat(o);
        });
      const finishing = ing.group === "garnish" || (uses.length > 0 && uses.every((s) => s.flame === "off"));
      if (!finishing && !uses.every(otherFat))
        removeBlock = (ALTERNATIVES[keyOf(ing)] ?? []).includes("oil") ? "Something is cooked in it. Use oil instead." : "Something is cooked in it, so it has to stay.";
    }
    const g = grams(ing.qty, ing.unit, ing);
    const role = ing.tag === "protein" || ing.tag === "carb";
    ingredients[ing.id] = {
      id: ing.id,
      canRemove: !removeBlock,
      removeBlock,
      main: !isWater(ing) && !isFat(ing) && (total > 0 && g / total >= 0.25 ? true : role && g / Math.max(1, total) >= 0.15),
      alts: ALTERNATIVES[keyOf(ing)] ?? [],
    };
  }
  const out = { ingredients, paste: pasteable(r), fresh: freshable(r) };
  optionsCache.set(r, out);
  return out;
}

// ---------- ids ----------

const TOKEN = /^(ggp|ggf|(x|oil|ghee|jaggery|sugar|milk)_[a-z0-9]+(-[a-z0-9]+)*)$/;

export function isSwapToken(t: string) {
  return TOKEN.test(t);
}

/** Sorted, de-duplicated; one choice per ingredient (leaving out wins); paste and fresh can't both apply. */
export function canonicalSwaps(list: readonly string[]): SwapId[] {
  const byIng = new Map<string, string>();
  const out = new Set<string>();
  for (const t of list) {
    if (!isSwapToken(t)) continue;
    if (t === "ggp" || t === "ggf") {
      out.add(t);
      continue;
    }
    const id = t.slice(t.indexOf("_") + 1);
    const cur = byIng.get(id);
    if (!cur || t.startsWith("x_")) byIng.set(id, t);
  }
  if (out.has("ggp") && out.has("ggf")) out.delete("ggf");
  return [...out, ...byIng.values()].sort();
}

/** The ingredient a token is about (none for the ginger garlic ones). */
export function swapTarget(t: string): { kind: "x" | Alt; id: string } | null {
  const at = t.indexOf("_");
  if (at < 0) return null;
  return { kind: t.slice(0, at) as "x" | Alt, id: t.slice(at + 1) };
}

// ---------- applying ----------

export interface SwapChange {
  /** The swap that made this change (to undo it). */
  token: SwapId;
  id: string;
  name: string;
  /** "left out", or the new ingredient's name. */
  to: string;
}

export interface SwapResult {
  recipe: Recipe;
  applied: SwapId[];
  labels: string[];
  notes: string[];
  changes: SwapChange[];
}

function stripIds(list: Step[], gone: Set<string>): Step[] {
  return list.flatMap((s) => {
    if (!s.items?.some((it) => gone.has(it.ingredient))) return [s];
    const items = s.items.filter((it) => !gone.has(it.ingredient));
    if (!items.length && DROPPABLE.has(s.kind)) return [];
    return [{ ...s, items: items.length ? items : undefined }];
  });
}

function retext(s: Step, from: RegExp, to: string): Step {
  // "Measure oil, oil and flour" → "Measure oil and flour".
  const r = (t?: string) => (t ? t.replace(from, to).replace(/\b(\w+)(?:, \1\b)+/gi, "$1").replace(/\b(\w+) and \1\b/gi, "$1") : t);
  return { ...s, title: r(s.title)!, detail: r(s.detail), cue: r(s.cue), tip: r(s.tip) };
}

/** Take a left-out ingredient's name out of step text: lists lose it, sentences about it go. */
function scrub(s: Step, words: string[]): Step {
  if (!words.length) return s;
  const alt = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const any = new RegExp(`\\b(${alt})\\b`, "i");
  const list = (t: string) => {
    let out = t
      .replace(new RegExp(`(,\\s*|\\s+and\\s+)(the\\s+)?(${alt})\\b`, "gi"), "")
      .replace(new RegExp(`\\b(the\\s+)?(${alt})(,\\s*|\\s+and\\s+)`, "gi"), "");
    if (out !== t && !/\band\b/.test(out)) out = out.replace(/,\s*([^,]+)$/, " and $1");
    return out;
  };
  const prose = (t?: string) => {
    if (!t || !any.test(t)) return t;
    const kept = t.split(/(?<=[.!?])\s+/).filter((x) => !any.test(x)).join(" ");
    return kept || undefined;
  };
  return { ...s, title: any.test(s.title) ? list(s.title) : s.title, detail: prose(s.detail), cue: prose(s.cue), tip: prose(s.tip) };
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Apply swaps to a recipe. The id stays the same (the caller builds the version id);
 * tokens that don't fit this recipe are ignored.
 */
export function applySwaps(r: Recipe, requested: readonly string[]): SwapResult {
  const tokens = canonicalSwaps(requested);
  const res: SwapResult = { recipe: r, applied: [], labels: [], notes: [], changes: [] };
  if (!tokens.length) return res;
  const opts = swapOptions(r);
  let ingredients = r.ingredients;
  let prep = r.prep;
  let cook = r.cook;
  const byId = (id: string) => ingredients.find((i) => i.id === id);
  const mapSteps = (f: (s: Step) => Step) => {
    prep = prep.map(f);
    cook = cook.map(f);
  };

  // Ginger + garlic → paste
  if (tokens.includes("ggp") && opts.paste) {
    const { ginger, garlic } = gingerGarlic(r);
    const g = ginger!;
    const ga = garlic!;
    const pid = r.ingredients.some((i) => i.id === "ginger-garlic-paste") ? "gg-paste" : "ginger-garlic-paste";
    const both = (it: StepItem) => it.ingredient === g.id || it.ingredient === ga.id;
    // Where ginger and garlic go in, one measure of paste goes in instead.
    const conv = (list: Step[]) =>
      list.map((s): Step => {
        if (!COUNTED.has(s.kind) || !s.items?.some(both)) return s;
        const grm = s.items.reduce((n, it) => n + (it.ingredient === g.id ? grams(it.qty, it.unit, g) : it.ingredient === ga.id ? grams(it.qty, it.unit, ga) : 0), 0);
        const at = s.items.findIndex(both);
        const items = s.items.filter((it) => !both(it));
        items.splice(Math.min(at, items.length), 0, { ingredient: pid, qty: quarter(grm / TSP_PASTE), unit: "tsp" });
        return { ...retext(s, /\bginger(,| and|, and)? garlic\b/gi, "ginger garlic paste"), items };
      });
    prep = conv(prep);
    cook = conv(cook);
    const qty = [...prep, ...cook].filter((s) => COUNTED.has(s.kind)).reduce((n, s) => n + (s.items ?? []).filter((it) => it.ingredient === pid).reduce((a, it) => a + it.qty, 0), 0);
    // Peeling and chopping go; a measure of paste takes the place of the first of them.
    const measure: Step = { kind: "measure", title: "Measure the ginger garlic paste", items: [{ ingredient: pid, qty, unit: "tsp" }] };
    let placed = false;
    const tidy = (list: Step[], first: boolean) =>
      list.flatMap((s): Step[] => {
        if (COUNTED.has(s.kind) || !s.items?.some(both)) return [s];
        const rest = s.items.filter((it) => !both(it));
        const out: Step[] = rest.length || !DROPPABLE.has(s.kind) ? [{ ...s, items: rest.length ? rest : undefined }] : [];
        if (first && !placed) {
          placed = true;
          out.unshift(measure);
        }
        return out;
      });
    prep = tidy(prep, true);
    cook = tidy(cook, false);
    if (!placed) prep = [measure, ...prep];
    const paste: Ingredient = { id: pid, name: "Ginger garlic paste", native: undefined, qty, unit: "tsp", group: g.group };
    ingredients = ingredients.flatMap((i) => (i.id === g.id ? [paste] : i.id === ga.id ? [] : [i]));
    res.applied.push("ggp");
    res.labels.push("Ginger garlic paste");
    res.changes.push({ token: "ggp", id: g.id, name: "Ginger & garlic", to: "Paste" });
    res.notes.push("Ready ginger garlic paste instead of chopping fresh ginger and garlic. Fry it until the raw smell goes.");
  }

  // Paste → fresh ginger + garlic
  if (tokens.includes("ggf") && !res.applied.includes("ggp") && opts.fresh) {
    const p = gingerGarlic(r).paste!;
    const free = (id: string) => (r.ingredients.some((i) => i.id === id) ? `fresh-${id}` : id);
    const gi = free("ginger");
    const ga = free("garlic");
    const split = (s: Step): Step => {
      if (!has(s, p.id)) return s;
      const items = s.items!.flatMap((it) => {
        if (it.ingredient !== p.id) return [it];
        const grm = grams(it.qty, it.unit, p);
        return [
          { ingredient: gi, qty: half(grm / 2), unit: "g" as Unit },
          { ingredient: ga, qty: half(grm / 2), unit: "g" as Unit },
        ];
      });
      return retext({ ...s, items }, /\bginger[- ]garlic paste\b/gi, "ginger and garlic");
    };
    mapSteps(split);
    const sum = (id: string) => [...prep, ...cook].filter((s) => COUNTED.has(s.kind)).reduce((n, s) => n + (s.items ?? []).filter((it) => it.ingredient === id).reduce((a, it) => a + it.qty, 0), 0);
    const gQty = sum(gi);
    const gaQty = sum(ga);
    prep = [
      ...prep,
      { kind: "chop", title: "Peel and finely grate the ginger", equipment: "knife", items: [{ ingredient: gi, qty: gQty, unit: "g" }] },
      { kind: "chop", title: "Peel and crush the garlic", equipment: "knife", items: [{ ingredient: ga, qty: gaQty, unit: "g" }], tip: "Crush the cloves under the flat of a knife, then chop finely." },
    ];
    ingredients = ingredients.flatMap((i) =>
      i.id === p.id
        ? [
            { id: gi, name: "Ginger", native: "Adrak / Inji", qty: gQty, unit: "g" as Unit, group: p.group },
            { id: ga, name: "Garlic", native: "Lehsun / Poondu", qty: gaQty, unit: "g" as Unit, group: p.group },
          ]
        : [i],
    );
    res.applied.push("ggf");
    res.labels.push("Fresh ginger & garlic");
    res.changes.push({ token: "ggf", id: p.id, name: "Ginger garlic paste", to: "Fresh" });
  }

  // Leave out / alternatives
  const gone = new Set<string>();
  for (const t of tokens) {
    const target = swapTarget(t);
    if (!target) continue;
    const ing = byId(target.id);
    const o = opts.ingredients[target.id];
    if (!ing || !o) continue;
    if (target.kind === "x") {
      if (!o.canRemove) continue;
      gone.add(ing.id);
      res.applied.push(t);
      res.labels.push(`No ${ing.name.replace(/\s*\(.*?\)/g, "").replace(/,.*$/, "").toLowerCase()}`);
      res.changes.push({ token: t, id: ing.id, name: ing.name, to: "left out" });
      if (o.main) res.notes.push(`${ing.name} is a main part of this dish, so it will turn out quite different without it.`);
      continue;
    }
    if (!o.alts.includes(target.kind)) continue;
    const alt = ALTS[target.kind];
    const fromKey = keyOf(ing);
    const word = new RegExp(`\\b${fromKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    ingredients = ingredients.map((i) => (i.id === ing.id ? { ...i, name: alt.name, native: undefined, approx: undefined, tag: alt.tag ?? (i.tag === "oil" || i.tag === "sugar" ? undefined : i.tag) } : i));
    // Once none of it is left, every mention goes ("Flip and spread ghee"); otherwise only its own steps.
    const allGone = !ingredients.some((i) => keyOf(i) === fromKey);
    mapSteps((s) => (allGone || has(s, ing.id) ? retext(s, word, alt.name.split(",")[0].toLowerCase()) : s));
    res.applied.push(t);
    res.labels.push(`${alt.label} for ${fromKey}`);
    res.changes.push({ token: t, id: ing.id, name: ing.name, to: alt.name });
    const note = ALT_NOTE[`${fromKey}>${target.kind}`];
    if (note) res.notes.push(note);
    if (r.course === "dessert" && (fromKey === "ghee" || fromKey === "butter")) res.notes.push("Sweets set and taste best with ghee; oil works but the flavour changes.");
  }
  if (gone.size) {
    prep = stripIds(prep, gone);
    cook = stripIds(cook, gone);
    ingredients = ingredients.filter((i) => !gone.has(i.id));
    // Words for foods that are now gone entirely (not "oil" while another oil stays).
    const plain = (i: Ingredient) => i.name.toLowerCase().replace(/\s*\(.*?\)/g, "").replace(/,.*$/, "").trim();
    const left = new Set(ingredients.flatMap((i) => [keyOf(i), plain(i)]));
    const words = [...new Set(r.ingredients.filter((i) => gone.has(i.id)).flatMap((i) => [keyOf(i), plain(i)]))].filter((k) => k && !left.has(k));
    mapSteps((s) => scrub(s, words));
    const names = r.ingredients.filter((i) => gone.has(i.id)).map((i) => i.name.toLowerCase());
    res.notes.push(sentence(`If a step still mentions the ${names.join(" or ")}, skip that part.`));
  }

  if (!res.applied.length) return res;
  res.applied = canonicalSwaps(res.applied);
  res.recipe = {
    ...r,
    ingredients,
    prep,
    cook,
    variant: [...new Set([...(r.variant ?? []), ...res.labels])],
  };
  return res;
}

// ---------- defaults from a profile ----------

export interface SwapPrefs {
  /** What to do with ghee in every recipe. */
  ghee?: "oil" | "leave";
  /** Ginger and garlic: use ready paste, or always fresh. */
  gingerGarlic?: "paste" | "fresh";
}

/** The swaps someone's kitchen preferences mean for this recipe (sweets keep their ghee). */
export function usualSwaps(prefs: SwapPrefs | undefined, r: Recipe): SwapId[] {
  if (!prefs) return [];
  const opts = swapOptions(r);
  const out: SwapId[] = [];
  if (prefs.ghee && r.course !== "dessert") {
    for (const i of r.ingredients) {
      if (keyOf(i) !== "ghee") continue;
      const o = opts.ingredients[i.id];
      // A drizzle of ghee on top just goes; ghee that something is cooked in becomes oil.
      const leave = i.group === "garnish" || prefs.ghee === "leave";
      out.push(leave && o.canRemove ? `x_${i.id}` : `oil_${i.id}`);
    }
  }
  if (prefs.gingerGarlic === "paste" && opts.paste) out.push("ggp");
  if (prefs.gingerGarlic === "fresh" && opts.fresh) out.push("ggf");
  return canonicalSwaps(out);
}
