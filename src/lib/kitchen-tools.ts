// What's in this household's kitchen: the hob, the oven, the measuring spoons and cups, a scale.
// Recipes stay as written; these rules only change how amounts, heat and oven temperatures are shown.
import { FLAME_LABEL, KIND_LABEL, roundQty } from "./format";
import { foodFor } from "./nutrition";
import type { Flame, Recipe, Step, StepKind, Unit } from "./types";

export type SpoonId = "1/8tsp" | "1/4tsp" | "1/2tsp" | "1tsp" | "1/2tbsp" | "1tbsp";
export type CupId = "1/4" | "1/3" | "1/2" | "2/3" | "3/4" | "1";

export interface KitchenTools {
  hob: "gas" | "induction";
  /** The highest number on an induction hob (AEG: 14 on most new hobs, 9 on older ones). */
  hobMax: 9 | 14;
  oven: "fan" | "conventional";
  spoons: SpoonId[];
  cups: CupId[];
  scale: boolean;
}

export const DEFAULT_TOOLS: KitchenTools = {
  hob: "gas",
  hobMax: 14,
  oven: "fan",
  spoons: ["1/4tsp", "1/2tsp", "1tsp", "1tbsp"],
  cups: ["1/4", "1/3", "1/2", "1"],
  scale: false,
};

/** One measure, sized in teaspoons (1 tbsp = 3 tsp, 1 cup = 240 ml = 48 tsp). */
interface Measure {
  label: string;
  tsp: number;
}

export const SPOONS: (Measure & { id: SpoonId })[] = [
  { id: "1/8tsp", label: "⅛ tsp", tsp: 0.125 },
  { id: "1/4tsp", label: "¼ tsp", tsp: 0.25 },
  { id: "1/2tsp", label: "½ tsp", tsp: 0.5 },
  { id: "1tsp", label: "1 tsp", tsp: 1 },
  { id: "1/2tbsp", label: "½ tbsp", tsp: 1.5 },
  { id: "1tbsp", label: "1 tbsp", tsp: 3 },
];

export const CUPS: (Measure & { id: CupId })[] = [
  { id: "1/4", label: "¼ cup", tsp: 12 },
  { id: "1/3", label: "⅓ cup", tsp: 16 },
  { id: "1/2", label: "½ cup", tsp: 24 },
  { id: "2/3", label: "⅔ cup", tsp: 32 },
  { id: "3/4", label: "¾ cup", tsp: 36 },
  { id: "1", label: "1 cup", tsp: 48 },
];

/** Keep only known values, so a bad or older saved value can't break the page. */
export function normaliseTools(raw: unknown): KitchenTools {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<KitchenTools>;
  return {
    hob: r.hob === "induction" ? "induction" : "gas",
    hobMax: r.hobMax === 9 ? 9 : 14,
    oven: r.oven === "conventional" ? "conventional" : "fan",
    spoons: Array.isArray(r.spoons) ? SPOONS.filter((s) => r.spoons!.includes(s.id)).map((s) => s.id) : DEFAULT_TOOLS.spoons,
    cups: Array.isArray(r.cups) ? CUPS.filter((c) => r.cups!.includes(c.id)).map((c) => c.id) : DEFAULT_TOOLS.cups,
    scale: !!r.scale,
  };
}

// ---------- heat ----------

type Heat = "lowest" | "low" | "medium-low" | "medium" | "medium-high" | "high" | "full";

/** Gas words → induction levels, from the AEG heat-setting tables (simmer ≈ 3–5 of 14, gentle fry 9–12, boil 14). */
const LEVELS: Record<9 | 14, Record<Heat, number>> = {
  9: { lowest: 1, low: 3, "medium-low": 4, medium: 5, "medium-high": 6, high: 8, full: 9 },
  14: { lowest: 2, low: 4, "medium-low": 6, medium: 8, "medium-high": 10, high: 12, full: 14 },
};

export function hobLevel(flame: Flame | Heat, t: KitchenTools): number {
  return flame === "off" ? 0 : LEVELS[t.hobMax][flame];
}

/** "Medium flame" on gas, "Level 8 of 14" on induction. */
export function flameLabel(flame: Flame, t: KitchenTools): string {
  if (t.hob === "gas") return FLAME_LABEL[flame];
  return flame === "off" ? "Hob off" : `Level ${hobLevel(flame, t)} of ${t.hobMax}`;
}

/** The step-kind chip: "Flame" on gas, "Hob" on induction. */
export function kindLabel(kind: StepKind, t: KitchenTools): string {
  return kind === "flame" && t.hob === "induction" ? "Hob" : KIND_LABEL[kind];
}

/** For speech: "Keep the flame medium." / "Keep the hob at level 8." */
export function keepHeat(flame: Flame, t: KitchenTools): string {
  return t.hob === "gas" ? `Keep the flame ${flame}.` : `Keep the hob at level ${hobLevel(flame, t)}.`;
}

const W = "(lowest|low|medium[- ]low|medium[- ]high|medium|high|full)";
const heat = (w: string) => w.toLowerCase().replace(" ", "-") as Heat;
const keepCase = (from: string, to: string) => (/^[A-Z]/.test(from) ? to[0].toUpperCase() + to.slice(1) : to);

/** Rewrites gas wording in a step for an induction hob: "Turn the flame to low" → "Turn the hob to level 4". */
export function hobText(s: string, t: KitchenTools): string {
  if (t.hob === "gas" || !s) return s;
  const lv = (w: string) => `level ${LEVELS[t.hobMax][heat(w)]}`;
  return s
    .replace(/\bgas burner\b/gi, (m) => keepCase(m, "hob"))
    .replace(/\b(turn|switch|put) (off|on) the (flame|gas|stove|burner)\b/gi, (_m, a, b) => `${a} ${b} the hob`)
    .replace(/\b(turn|switch) the (flame|gas|stove|burner) (off|on|down|up)\b/gi, (_m, a, _f, b) => `${a} the hob ${b}`)
    // "the heat" only with "the": a bare "Heat" starts a step ("Heat on low for 2 minutes").
    .replace(new RegExp(`\\b(?:(the )?(?:flame|gas)|(the )heat) (to|back to|down to|up to|on|at) (?:its )?${W}\\b(?![- ](?:flame|heat))`, "gi"), (m, the, the2, prep, w) => keepCase(m, `${the || the2 ? "the " : ""}hob ${prep} ${lv(w)}`))
    .replace(new RegExp(`\\b(?:(the )?flame|(the )heat) ${W}\\b`, "gi"), (m, the, the2, w) => keepCase(m, `${the || the2 ? "the " : ""}hob at ${lv(w)}`))
    .replace(new RegExp(`\\b(?:an? )?${W}[- ](?:flame|heat)\\b`, "gi"), (m, w) => keepCase(m, lv(w)))
    // "Simmer on low", "Heat the kadai on medium" — but not the mixer's "on low speed".
    .replace(new RegExp(`\\b(on|to|over) ${W}\\b(?![- ](?:speed|pressure|setting|power))`, "gi"), (m, p, w) => keepCase(m, `${p} ${lv(w)}`))
    .replace(/\bnotch(es)?\b/gi, (m, es) => keepCase(m, es ? "levels" : "level"))
    .replace(/\bflames\b/gi, (m) => keepCase(m, "heat"))
    .replace(/\bflame\b/gi, (m) => keepCase(m, "heat"));
}

// ---------- oven ----------

/** Recipes give conventional °C; fan ovens run 20 °C cooler. */
export function ovenTemp(c: number, t: KitchenTools): number {
  return t.oven === "fan" ? c - 20 : c;
}

export function ovenLabel(c: number, t: KitchenTools): string {
  return `Oven ${ovenTemp(c, t)} °C${t.oven === "fan" ? " fan" : ""}`;
}

/** A recipe with its step wording matched to this kitchen's hob (cached per recipe and hob). */
const textCache = new WeakMap<Recipe, Map<string, Recipe>>();
export function forKitchen(r: Recipe, t: KitchenTools): Recipe {
  if (t.hob === "gas") return r;
  const key = `${t.hob}${t.hobMax}`;
  const byKey = textCache.get(r) ?? new Map<string, Recipe>();
  textCache.set(r, byKey);
  const hit = byKey.get(key);
  if (hit) return hit;
  const step = (s: Step): Step => ({
    ...s,
    title: hobText(s.title, t),
    detail: s.detail && hobText(s.detail, t),
    cue: s.cue && hobText(s.cue, t),
    tip: s.tip && hobText(s.tip, t),
  });
  const out = { ...r, prep: r.prep.map(step), cook: r.cook.map(step) };
  byKey.set(key, out);
  return out;
}

// ---------- measuring ----------

const EIGHTH = 8; // work in eighths of a teaspoon: every spoon and cup is a whole number of them

/** The fewest fills of the measures you own that make `tsp`, within a small tolerance. */
export function fills(tsp: number, measures: Measure[]): { m: Measure; n: number }[] | null {
  if (!measures.length || !(tsp > 0)) return null;
  const sizes = measures.map((m) => Math.round(m.tsp * EIGHTH));
  const target = tsp * EIGHTH;
  const smallest = Math.min(...sizes);
  const tol = Math.max(smallest / 2, target * 0.05);
  const max = Math.ceil(target + tol);
  if (max > 48 * 8 * EIGHTH) return null; // over 8 cups: use a jug or the scale
  // count[v] = fewest fills that add up to v; from[v] = the measure used last.
  const count = new Array<number>(max + 1).fill(Infinity);
  const from = new Array<number>(max + 1).fill(-1);
  count[0] = 0;
  for (let v = 1; v <= max; v++)
    sizes.forEach((s, i) => {
      if (s <= v && count[v - s] + 1 < count[v]) {
        count[v] = count[v - s] + 1;
        from[v] = i;
      }
    });
  let best = -1;
  for (let v = Math.max(1, Math.floor(target - tol)); v <= max; v++) {
    if (Math.abs(v - target) > tol || count[v] === Infinity) continue;
    if (best < 0 || count[v] < count[best] || (count[v] === count[best] && Math.abs(v - target) < Math.abs(best - target))) best = v;
  }
  if (best < 0 || count[best] > 6) return null;
  const used = new Map<number, number>();
  for (let v = best; v > 0; v -= sizes[from[v]]) used.set(from[v], (used.get(from[v]) ?? 0) + 1);
  return [...used.entries()].sort((a, b) => sizes[b[0]] - sizes[a[0]]).map(([i, n]) => ({ m: measures[i], n }));
}

export function fillsText(f: { m: Measure; n: number }[]): string {
  return f.map(({ m, n }) => (n > 1 ? `${n} × ${m.label}` : m.label)).join(" + ");
}

function owned(t: KitchenTools): Measure[] {
  return [...SPOONS.filter((s) => t.spoons.includes(s.id)), ...CUPS.filter((c) => t.cups.includes(c.id))];
}

const TSP_PER: Partial<Record<Unit, number>> = { tsp: 1, tbsp: 3, cup: 48 };
const NOT_BY_VOLUME = new Set(["vegetables", "fruit", "meat & fish", "herbs", "eggs", "other"]);

/**
 * How to measure an amount with what this kitchen has, or null when the amount as shown is already
 * one of your measures (or can't be measured another way).
 * - Spoon and cup amounts become fills of your spoons and cups: "2 × ½ tsp", "1 cup + ⅓ cup".
 * - Millilitres become cups and spoons.
 * - Grams of something pourable (flour, rice, dal, sugar) become cups and spoons when there's no scale.
 * - With a scale, cup amounts of solid food also get their weight.
 */
export function measureHint(qty: number, unit: Unit, name: string, t: KitchenTools): string | null {
  const measures = owned(t);
  const food = foodFor(name);
  if (unit === "tsp" || unit === "tbsp" || unit === "cup") {
    const tsp = roundQty(qty, unit) * TSP_PER[unit]!;
    const f = fills(tsp, measures);
    const text = f && !(f.length === 1 && f[0].n === 1 && Math.abs(f[0].m.tsp - tsp) < 1e-9) ? fillsText(f) : null;
    const grams = t.scale && unit === "cup" && food?.g?.cup && !food.g.ml && !NOT_BY_VOLUME.has(food.cat) ? Math.round((roundQty(qty, unit) * food.g.cup) / 5) * 5 : null;
    if (text && grams) return `${text} · or weigh ${grams} g`;
    if (grams) return `or weigh ${grams} g`;
    return text;
  }
  if (unit === "ml" || unit === "L") {
    const ml = unit === "L" ? qty * 1000 : roundQty(qty, unit);
    if (ml < 2.5) return null;
    const f = fills(ml / 5, measures);
    return f ? fillsText(f) : null;
  }
  if ((unit === "g" || unit === "kg") && !t.scale && food && !NOT_BY_VOLUME.has(food.cat) && !food.water) {
    const g = unit === "kg" ? qty * 1000 : roundQty(qty, unit);
    const per = food.g?.tsp ?? (food.g?.tbsp ? food.g.tbsp / 3 : food.g?.cup ? food.g.cup / 48 : undefined);
    // Big amounts measure better by the cup's own density (a packed cup isn't 48 level teaspoons).
    const perTsp = g >= 30 && food.g?.cup ? food.g.cup / 48 : per;
    if (!perTsp) return null;
    const f = fills(g / perTsp, measures);
    return f ? `≈ ${fillsText(f)}` : null;
  }
  return null;
}
