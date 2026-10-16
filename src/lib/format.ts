import type { Equipment, Flame, Recipe, StepKind, Unit } from "./types";

const FRACTIONS: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
];

function spoonish(n: number): string {
  // Snap to the nearest eighth so the number matches a real measuring spoon.
  const snapped = Math.max(0.125, Math.round(n * 8) / 8);
  const whole = Math.floor(snapped);
  const frac = snapped - whole;
  if (frac < 0.01) return String(whole);
  const match = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - frac) < Math.abs(best[0] - frac) ? f : best));
  return whole ? `${whole}${match[1]}` : match[1];
}

export function roundQty(qty: number, unit: Unit): number {
  switch (unit) {
    case "g":
    case "ml":
      if (qty >= 200) return Math.round(qty / 10) * 10;
      if (qty >= 50) return Math.round(qty / 5) * 5;
      if (qty >= 10) return Math.round(qty);
      return Math.max(0.5, Math.round(qty * 2) / 2);
    case "kg":
    case "L":
      return Math.round(qty * 100) / 100;
    case "pc":
      return Math.max(1, Math.round(qty * 2) / 2);
    default:
      return Math.max(0.125, Math.round(qty * 8) / 8);
  }
}

export function formatNumber(qty: number, unit: Unit): string {
  const q = roundQty(qty, unit);
  if (unit === "tsp" || unit === "tbsp" || unit === "cup") return spoonish(q);
  if (unit === "pc") return q % 1 ? spoonish(q) : String(q);
  return String(q);
}

const UNIT_LABEL: Record<Unit, [string, string]> = {
  g: ["g", "g"],
  kg: ["kg", "kg"],
  ml: ["ml", "ml"],
  L: ["L", "L"],
  tsp: ["tsp", "tsp"],
  tbsp: ["tbsp", "tbsp"],
  cup: ["cup", "cups"],
  pc: ["", ""],
};

export function unitLabel(qty: number, unit: Unit): string {
  const [one, many] = UNIT_LABEL[unit];
  return roundQty(qty, unit) > 1 ? many : one;
}

export function formatQty(qty: number, unit: Unit): string {
  const label = unitLabel(qty, unit);
  return label ? `${formatNumber(qty, unit)} ${label}` : formatNumber(qty, unit);
}

export const UNIT_WORDS: Record<Unit, string> = {
  g: "grams",
  kg: "kilograms",
  ml: "millilitres",
  L: "litres",
  tsp: "teaspoon",
  tbsp: "tablespoon",
  cup: "cup",
  pc: "",
};

export function speakQty(qty: number, unit: Unit): string {
  const n = roundQty(qty, unit);
  const words = formatNumber(qty, unit)
    .replace("⅛", " one eighth")
    .replace("¼", " a quarter")
    .replace("⅓", " a third")
    .replace("½", " and a half")
    .replace("⅔", " two thirds")
    .replace("¾", " three quarters")
    .trim()
    .replace(/^and a half/, "half");
  const u = UNIT_WORDS[unit];
  if (!u) return words;
  return `${words} ${u}${n > 1 && (unit === "tsp" || unit === "tbsp" || unit === "cup") ? "s" : ""}`;
}

export function formatDuration(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m} min ${s} s` : `${m} min`;
  }
  return `${sec} s`;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  pressure_cooker: "Pressure cooker",
  kadai: "Kadai",
  pan: "Pan",
  tawa: "Tawa",
  saucepan: "Saucepan",
  tadka_pan: "Tadka pan",
  mixer: "Mixer grinder",
  chopper: "Chopper",
  knife: "Knife & board",
  bowl: "Bowls",
  sieve: "Sieve",
  ladle: "Ladle",
  oven: "Oven",
  baking_tin: "Baking tin or tray",
  whisk: "Whisk",
};

export const FLAME_LABEL: Record<Flame, string> = {
  off: "Flame off",
  low: "Low flame",
  medium: "Medium flame",
  high: "High flame",
};

export const KIND_LABEL: Record<StepKind, string> = {
  measure: "Measure",
  chop: "Chop",
  grind: "Grind",
  rinse: "Rinse",
  soak: "Soak",
  heat: "Heat",
  flame: "Flame",
  add: "Add",
  stir: "Stir",
  wait: "Wait",
  lid_close: "Lid on",
  lid_open: "Lid off",
  pressure: "Pressure cook",
  release: "Let it rest",
  serve: "Serve",
  note: "Note",
};

export const REGION_LABEL = { north: "North Indian", south: "South Indian", indo_chinese: "Indo-Chinese", baking: "Bakes" } as const;

export function scaleFactor(recipe: Recipe, servings: number) {
  return servings / recipe.servings;
}

export function totalMinutes(r: Recipe) {
  return r.prepMin + r.cookMin;
}
