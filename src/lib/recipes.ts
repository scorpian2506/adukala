import { SEED_RECIPES } from "@/data/recipes";
import { resolveRecipe, type CustomisationId } from "./tweaks";
import type { Ingredient, Recipe, Step } from "./types";

export { SEED_RECIPES };

const SEED_BY_ID = new Map(SEED_RECIPES.map((r) => [r.id, r]));

export function findSeed(id: string): Recipe | undefined {
  return SEED_BY_ID.get(id);
}

/**
 * A recipe by id from saved recipes or the library, including rule-made versions ("sambar--low_oil").
 * A saved recipe with a library id is the household's replacement for that dish, so it wins.
 */
export function findRecipe(id: string, saved: Recipe[] = []): Recipe | undefined {
  return resolveRecipe(id, (x) => saved.find((r) => r.id === x) ?? SEED_BY_ID.get(x));
}

/** Saved recipes plus the library, with household replacements shown instead of the originals. */
export function withSaved(saved: Recipe[]): Recipe[] {
  if (!saved.length) return SEED_RECIPES;
  const mine = new Set(saved.map((r) => r.id));
  return [...saved, ...SEED_RECIPES.filter((r) => !mine.has(r.id))];
}

/** True when a saved recipe replaces the library dish with the same id. */
export function replacesSeed(r: Recipe): boolean {
  return SEED_BY_ID.has(r.id) && SEED_BY_ID.get(r.id) !== r;
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

export {
  CUSTOMISATIONS,
  OFFLINE_CUSTOMISATIONS,
  applyOfflineTweaks,
  canonicalTweaks,
  parseVariantId,
  resolveRecipe,
  tweakRecipe,
  variantId,
  versionOf,
  type CustomisationId,
} from "./tweaks";

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
  if (/(more|high|extra|increase)\s*(in\s*)?protein/.test(t)) tweaks.push("high_protein");
  if (/(less|low|reduce|cut|fewer)\s*(the\s*)?(carbs?|rice|sugar)/.test(t)) tweaks.push("low_carb");
  const servings = n && (n[2] || /^\s*(for\s+)?\d{1,2}\s*$/.test(t)) ? Number(n[1]) : undefined;
  return { servings: servings && servings > 0 && servings <= 20 ? servings : undefined, tweaks };
}
