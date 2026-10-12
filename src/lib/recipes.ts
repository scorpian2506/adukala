import { SEED_RECIPES } from "@/data/recipes";
import type { Ingredient, Recipe, Step } from "./types";

export { SEED_RECIPES };

export function findSeed(id: string): Recipe | undefined {
  return SEED_RECIPES.find((r) => r.id === id);
}

export interface FlatStep extends Step {
  phase: "prep" | "cook";
  phaseIndex: number;
  phaseTotal: number;
}

const VESSELS = new Set(["pressure_cooker", "kadai", "pan", "tawa", "saucepan", "tadka_pan"]);
const STOVE_KINDS = new Set(["heat", "flame", "add", "stir", "wait", "lid_close", "lid_open", "release"]);

export function flattenSteps(r: Recipe): FlatStep[] {
  // Steps often omit the vessel ("Turn off the flame"); carry the last one forward
  // so the illustration shows the pot you're actually using.
  let vessel: Step["equipment"];
  const cook = r.cook.map((s, i) => {
    if (s.equipment && VESSELS.has(s.equipment)) vessel = s.equipment;
    const equipment = s.equipment ?? (STOVE_KINDS.has(s.kind) ? vessel : undefined);
    return { ...s, equipment, phase: "cook" as const, phaseIndex: i, phaseTotal: r.cook.length };
  });
  return [...r.prep.map((s, i) => ({ ...s, phase: "prep" as const, phaseIndex: i, phaseTotal: r.prep.length })), ...cook];
}

/**
 * Stove steps run one after another in the same pan, so their timer must finish
 * before the next step. Prep timers (soak, marinate), pressure steps (they go by
 * whistles) and cook steps marked `background` don't block.
 */
export function timerBlocks(step: Pick<FlatStep, "phase" | "durationSec" | "kind" | "background">) {
  return step.phase === "cook" && !!step.durationSec && step.kind !== "pressure" && !step.background;
}

export function ingredientMap(r: Recipe): Record<string, Ingredient> {
  return Object.fromEntries(r.ingredients.map((i) => [i.id, i]));
}

export const CUSTOMISATIONS = [
  { id: "low_oil", label: "Low oil", hint: "Half the oil and ghee" },
  { id: "high_protein", label: "High protein", hint: "More dal, paneer or chana" },
  { id: "low_carb", label: "Low carb", hint: "Less rice, potato and sugar" },
  { id: "kid_friendly", label: "Kid friendly", hint: "Mild, no whole spices to bite" },
  { id: "less_spicy", label: "Less spicy", hint: "Half the chilli" },
  { id: "jain", label: "Jain", hint: "No onion, garlic or root veg" },
  { id: "vegan", label: "Vegan", hint: "No ghee, curd or paneer" },
  { id: "diabetic", label: "Diabetic friendly", hint: "Low GI swaps, no sugar" },
] as const;

export type CustomisationId = (typeof CUSTOMISATIONS)[number]["id"];

/** Tweaks we can make without AI: they only scale tagged ingredients. */
export const OFFLINE_CUSTOMISATIONS: CustomisationId[] = ["low_oil", "less_spicy", "kid_friendly"];

export function applyOfflineTweaks(r: Recipe, ids: CustomisationId[]): Recipe {
  const factor: Record<string, number> = {};
  for (const ing of r.ingredients) {
    let f = 1;
    if (ids.includes("low_oil") && ing.tag === "oil") f *= 0.5;
    if ((ids.includes("less_spicy") || ids.includes("kid_friendly")) && ing.tag === "chilli") {
      f *= ids.includes("kid_friendly") ? 0.25 : 0.5;
    }
    factor[ing.id] = f;
  }
  // Whole items (a green chilli) can't be quartered: round down, and drop them at zero.
  const scale = (qty: number, unit: string, f: number) => (unit === "pc" && f < 1 ? Math.floor(qty * f) : qty * f);
  const scaleSteps = (steps: Step[]) =>
    steps.flatMap((s) => {
      if (!s.items) return [s];
      const items = s.items.map((it) => ({ ...it, qty: scale(it.qty, it.unit, factor[it.ingredient] ?? 1) })).filter((it) => it.qty > 0);
      // A step that only handled a removed ingredient ("Slit the green chilli") goes too.
      if (!items.length && ["chop", "measure", "add", "grind"].includes(s.kind)) return [];
      return [{ ...s, items: items.length ? items : undefined }];
    });
  const labels = CUSTOMISATIONS.filter((c) => ids.includes(c.id)).map((c) => c.label);
  return {
    ...r,
    id: `${r.id}--${ids.join("-")}`,
    ingredients: r.ingredients.map((i) => ({ ...i, qty: scale(i.qty, i.unit, factor[i.id] ?? 1) })).filter((i) => i.qty > 0),
    prep: scaleSteps(r.prep),
    cook: scaleSteps(r.cook),
    variant: [...new Set([...(r.variant ?? []), ...labels])],
    source: { ...(r.source ?? { kind: "seed" }), kind: r.source?.kind ?? "seed" },
  };
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export type Screen =
  | { type: "intro"; phase: "prep" | "cook" }
  | { type: "step"; step: FlatStep; number: number; total: number }
  | { type: "done" };

/** The cook-mode sequence: step screens plus phase intros and a finish screen. */
export function buildScreens(r: Recipe): Screen[] {
  const flat = flattenSteps(r);
  const total = flat.length;
  const out: Screen[] = [];
  flat.forEach((step, i) => {
    if (step.phaseIndex === 0) out.push({ type: "intro", phase: step.phase });
    out.push({ type: "step", step, number: i + 1, total });
  });
  out.push({ type: "done" });
  return out;
}

/** "Step N" for a saved screen index, for resume labels. */
export function stepNumberAt(r: Recipe, index: number): number {
  const screens = buildScreens(r);
  for (let i = Math.min(index, screens.length - 1); i >= 0; i--) {
    const s = screens[i];
    if (s.type === "step") return s.number;
  }
  return 1;
}

/** Rewrite every quantity for a new number of people. */
export function scaleRecipe(r: Recipe, servings: number): Recipe {
  if (!servings || servings === r.servings) return r;
  const f = servings / r.servings;
  const scaleSteps = (steps: Step[]) => steps.map((s) => (s.items ? { ...s, items: s.items.map((it) => ({ ...it, qty: it.qty * f })) } : s));
  return {
    ...r,
    servings,
    ingredients: r.ingredients.map((i) => ({ ...i, qty: i.qty * f })),
    prep: scaleSteps(r.prep),
    cook: scaleSteps(r.cook),
  };
}

/** Best library match for a typed dish name, if any. */
export function findInLibrary(query: string, recipes: Recipe[] = SEED_RECIPES): Recipe | undefined {
  const q = query
    .toLowerCase()
    .replace(/\b(i want to (make|cook)|how to (make|cook)|recipe|please|make|cook)\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (q.length < 3) return undefined;
  const names = (r: Recipe) => [r.name, r.native ?? ""].map((n) => n.toLowerCase()).filter(Boolean);
  // Exact name first, then the shortest name that contains the query, then names inside the query.
  return (
    recipes.find((r) => names(r).some((n) => n === q)) ??
    recipes.filter((r) => names(r).some((n) => n.includes(q))).sort((a, b) => a.name.length - b.name.length)[0] ??
    recipes.filter((r) => names(r).some((n) => q.includes(n) && n.length > 3)).sort((a, b) => b.name.length - a.name.length)[0]
  );
}

/** Offline understanding of simple tweak requests typed in the studio. */
export function parseOfflineTweak(text: string): { servings?: number; tweaks: CustomisationId[] } {
  const t = text.toLowerCase();
  const n = t.match(/(?:for\s+)?(\d{1,2})\s*(people|persons|person|servings|pax|members)?/);
  const tweaks: CustomisationId[] = [];
  if (/(less|low|reduce|cut|no extra)\s*(the\s*)?(oil|ghee|fat)/.test(t)) tweaks.push("low_oil");
  if (/(less|mild|not|low|reduce)\s*(too\s*)?(spic|chilli|hot|heat)/.test(t)) tweaks.push("less_spicy");
  if (/(kid|child|toddler|baby)/.test(t)) tweaks.push("kid_friendly");
  const servings = n && (n[2] || /^\s*(for\s+)?\d{1,2}\s*$/.test(t)) ? Number(n[1]) : undefined;
  return { servings: servings && servings > 0 && servings <= 20 ? servings : undefined, tweaks };
}
