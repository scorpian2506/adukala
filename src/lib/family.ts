// Family profiles and daily targets. Estimates only — not medical advice.

import type { CustomisationId } from "./tweaks";
import type { SwapPrefs } from "./swaps";

export type Goal = "lose" | "maintain" | "gain" | "muscle";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very";
export type Sex = "male" | "female";

export interface Member {
  /** "user:<username>" for someone with a login, "m:<random>" for everyone else (e.g. kids). */
  id: string;
  name: string;
  kind: "adult" | "child";
  username?: string;
  age: number;
  sex: Sex;
  heightCm?: number;
  weightKg?: number;
  activity: Activity;
  goal: Goal; // children: maintain (growing), lose = keep weight steady, gain = catch up
  /** Weekly change for lose/gain/muscle, in kg (0.25, 0.5 or 1). */
  rateKg?: number;
  /** Recipe tweaks applied by default when this person opens a recipe or plans a dish. */
  tweaks?: CustomisationId[];
  /** Kitchen swaps applied by default: no ghee, ready ginger garlic paste. */
  swaps?: SwapPrefs;
  diet: "veg" | "egg" | "nonveg";
  color: string;
}

export const GOALS: { id: Goal; label: string; hint: string }[] = [
  { id: "lose", label: "Lose weight", hint: "About 0.5 kg a week" },
  { id: "maintain", label: "Stay as I am", hint: "Keep my weight steady" },
  { id: "gain", label: "Gain weight", hint: "Slow, steady gain" },
  { id: "muscle", label: "Build muscle", hint: "Small surplus, more protein" },
];

export const ACTIVITY: { id: Activity; label: string; hint: string; factor: number }[] = [
  { id: "sedentary", label: "Mostly sitting", hint: "Desk job, little exercise", factor: 1.2 },
  { id: "light", label: "Lightly active", hint: "Walks, light exercise 1–3 days", factor: 1.375 },
  { id: "moderate", label: "Active", hint: "Exercise 3–5 days a week", factor: 1.55 },
  { id: "active", label: "Very active", hint: "Hard exercise 6–7 days", factor: 1.725 },
  { id: "very", label: "Athlete / manual work", hint: "Training twice a day or heavy labour", factor: 1.9 },
];

export const MEMBER_COLORS = ["#c4402a", "#355236", "#e3a22a", "#6a3a25", "#4b6fa8", "#a8457a", "#2f8a83", "#8a6d1f"];

// ICMR-NIN 2020 energy requirements for children (moderate activity), kcal/day.
const CHILD_KCAL: { maxAge: number; male: number; female: number }[] = [
  { maxAge: 0.99, male: 650, female: 650 },
  { maxAge: 3, male: 1110, female: 1110 },
  { maxAge: 6, male: 1360, female: 1360 },
  { maxAge: 9, male: 1700, female: 1700 },
  { maxAge: 12, male: 2220, female: 2060 },
  { maxAge: 15, male: 2860, female: 2400 },
  { maxAge: 17, male: 3320, female: 2500 },
];

// ICMR-NIN 2020 protein RDA for children, g/day.
const CHILD_PROTEIN: { maxAge: number; male: number; female: number }[] = [
  { maxAge: 0.99, male: 10.5, female: 10.5 },
  { maxAge: 3, male: 12.5, female: 12.5 },
  { maxAge: 6, male: 16, female: 16 },
  { maxAge: 9, male: 23, female: 23 },
  { maxAge: 12, male: 32, female: 33 },
  { maxAge: 15, male: 45, female: 43 },
  { maxAge: 17, male: 55, female: 46 },
];

/**
 * Goals for children never mean dieting: "keep weight steady" trims about 10% so they grow
 * into their weight, "catch up" adds about 10%. Protein is never cut.
 */
export const CHILD_GOALS: { id: Goal; label: string; hint: string; factor: number }[] = [
  { id: "maintain", label: "Growing normally", hint: "Full ICMR-NIN amount for their age", factor: 1 },
  { id: "lose", label: "Keep weight steady", hint: "About 10% less, so they grow into their weight", factor: 0.9 },
  { id: "gain", label: "Catch up", hint: "About 10% more, for an underweight child", factor: 1.1 },
];

/** Children under 2 always get the full amount. */
export function childGoalsFor(age: number) {
  return age < 2 ? CHILD_GOALS.slice(0, 1) : CHILD_GOALS;
}

// Healthy shares of the day's calories (IOM acceptable ranges, used by ICMR-NIN too).
export const CARB_PCT: [number, number] = [45, 65];
function fatPct(m: Pick<Member, "kind" | "age">): [number, number] {
  if (m.age < 4) return [30, 40];
  if (m.kind === "child" || m.age < 18) return [25, 35];
  return [20, 35];
}

// ICMR-NIN 2020 adult reference values when height/weight aren't given (sedentary / moderate).
const ADULT_REF = { male: { sedentary: 2110, moderate: 2710 }, female: { sedentary: 1660, moderate: 2130 } };

export interface Target {
  kcal: number;
  protein: number; // g/day, a minimum
  /** Healthy range in g/day (from the share of calories). */
  carbs: [number, number];
  fat: [number, number];
  basis: string; // how it was worked out, in plain words
  /** Calories to keep the current weight (adults). */
  maintain?: number;
  /** The goal asked for less than the safe minimum, so the minimum is used. */
  floored?: boolean;
}

/** ~7,700 kcal per kg of body weight. */
export const KCAL_PER_KG = 7700;
export const RATES = [0.25, 0.5, 1] as const;
export const DEFAULT_RATE: Record<Goal, number> = { lose: 0.5, maintain: 0, gain: 0.5, muscle: 0.25 };

export function rateOf(m: Pick<Member, "goal" | "rateKg">): number {
  if (m.goal === "maintain") return 0;
  return m.rateKg && m.rateKg > 0 ? m.rateKg : DEFAULT_RATE[m.goal];
}

export function minKcal(sex: Sex) {
  return sex === "male" ? 1500 : 1200;
}

const round = (n: number, to: number) => Math.round(n / to) * to;

/** Mifflin–St Jeor resting energy. */
export function bmr(m: Pick<Member, "sex" | "age" | "heightCm" | "weightKg">): number | null {
  if (!m.heightCm || !m.weightKg) return null;
  return 10 * m.weightKg + 6.25 * m.heightCm - 5 * m.age + (m.sex === "male" ? 5 : -161);
}

function withMacros(m: Pick<Member, "kind" | "age">, t: Omit<Target, "carbs" | "fat">): Target {
  const f = fatPct(m);
  return { ...t, carbs: [round((t.kcal * CARB_PCT[0]) / 400, 5), round((t.kcal * CARB_PCT[1]) / 400, 5)], fat: [round((t.kcal * f[0]) / 900, 5), round((t.kcal * f[1]) / 900, 5)] };
}

export function isChild(m: Pick<Member, "kind" | "age">) {
  return m.kind === "child" || m.age < 18;
}

export function dailyTarget(m: Member): Target {
  if (isChild(m)) {
    const row = CHILD_KCAL.find((r) => m.age <= r.maxAge) ?? CHILD_KCAL[CHILD_KCAL.length - 1];
    const goal = childGoalsFor(m.age).find((g) => g.id === m.goal) ?? CHILD_GOALS[0];
    const full = row[m.sex];
    const kcal = round(full * goal.factor, 10);
    const pRow = CHILD_PROTEIN.find((r) => m.age <= r.maxAge) ?? CHILD_PROTEIN[CHILD_PROTEIN.length - 1];
    const who = `${m.age}-year-old ${m.sex === "male" ? "boy" : "girl"}`;
    return withMacros(m, {
      kcal,
      protein: pRow[m.sex],
      basis: goal.factor === 1 ? `ICMR-NIN guide for a ${who}` : `ICMR-NIN guide for a ${who}, ${goal.label.toLowerCase()} (${goal.factor < 1 ? "−" : "+"}10%)`,
      maintain: full,
    });
  }
  const factor = ACTIVITY.find((a) => a.id === m.activity)?.factor ?? 1.375;
  const rest = bmr(m);
  let tdee: number;
  let basis: string;
  if (rest) {
    tdee = rest * factor;
    basis = "Mifflin–St Jeor formula × activity";
  } else {
    const ref = ADULT_REF[m.sex];
    tdee = factor >= 1.55 ? ref.moderate : ref.sedentary;
    basis = "ICMR-NIN adult reference (add height and weight for a closer number)";
  }
  const floor = minKcal(m.sex);
  const rate = rateOf(m);
  const adjust = ((m.goal === "lose" ? -1 : 1) * rate * KCAL_PER_KG) / 7;
  const wanted = tdee + adjust;
  const kcal = round(Math.max(floor, wanted), 10);
  const perKg = { lose: 1.2, maintain: 0.83, gain: 1.0, muscle: 1.6 }[m.goal];
  const protein = round((m.weightKg ?? (m.sex === "male" ? 65 : 55)) * perKg, 1);
  return withMacros(m, { kcal, protein, basis, maintain: round(tdee, 10), floored: wanted < floor });
}

export type Check = "ok" | "low" | "high";

export interface DayCheck {
  /** Planned calories as a share of the target; checks only mean something once most of the day is planned. */
  planned: number;
  complete: boolean;
  protein: Check;
  carbs: Check;
  fat: Check;
  /** Share of the day's calories from carbs and fat, in %. */
  carbPct: number;
  fatPct: number;
  hints: string[];
}

/** Most of the day must be planned before protein, carbs and fat are judged. */
export const CHECK_FROM = 0.7;

/** Are this person's protein, carbs and fat in a healthy range for what's planned? Rules only. */
export function checkDay(m: Member, eaten: { kcal: number; protein: number; carbs: number; fat: number }, t: Target = dailyTarget(m)): DayCheck {
  const planned = t.kcal ? eaten.kcal / t.kcal : 0;
  const carbPct = eaten.kcal ? Math.round((eaten.carbs * 400) / eaten.kcal) : 0;
  const fatShare = eaten.kcal ? Math.round((eaten.fat * 900) / eaten.kcal) : 0;
  const f = fatPct(m);
  const complete = planned >= CHECK_FROM;
  const protein: Check = !complete ? "ok" : eaten.protein < t.protein * 0.9 ? "low" : "ok";
  const carbs: Check = !complete ? "ok" : carbPct < CARB_PCT[0] ? "low" : carbPct > CARB_PCT[1] ? "high" : "ok";
  const child = isChild(m);
  // Low fat only matters for children (adults may be cutting oil on purpose).
  const fat: Check = !complete ? "ok" : fatShare < f[0] && child ? "low" : fatShare > f[1] ? "high" : "ok";
  const hints: string[] = [];
  if (protein === "low") {
    const extra = m.diet === "veg" ? "" : m.diet === "egg" ? ", an egg" : ", an egg, chicken or fish";
    hints.push(`Protein is short by ${Math.round(t.protein - eaten.protein)} g: add dal, paneer, curd or sprouts${extra}${child ? "" : ", or tick High protein"}.`);
  }
  if (carbs === "high") hints.push(`Carbs are ${carbPct}% of calories: swap some rice or roti for dal and vegetables${child ? "" : ", or tick Low carb"}.`);
  if (carbs === "low") hints.push(child ? `Carbs are only ${carbPct}% of calories: growing kids need rice, roti, idli or fruit for energy.` : `Carbs are only ${carbPct}% of calories: add some rice, roti or fruit.`);
  if (fat === "high") hints.push(`Fat is ${fatShare}% of calories: tick Low oil or choose fewer fried dishes.`);
  if (fat === "low" && child) hints.push(`Fat is only ${fatShare}% of calories: children need some ghee, oil, nuts or full-fat milk.`);
  return { planned, complete, protein, carbs, fat, carbPct, fatPct: fatShare, hints };
}

export interface CalorieRow {
  goal: Goal;
  rateKg: number;
  label: string;
  kcal: number;
  /** Share of maintenance calories. */
  pct: number;
  floored: boolean;
}

/** Calories per day for each goal and pace — the calculator table. Children get the gentle child goals. */
export function calorieTable(m: Member): CalorieRow[] {
  if (isChild(m)) {
    const full = dailyTarget({ ...m, goal: "maintain" }).kcal;
    return childGoalsFor(m.age).map((g) => {
      const kcal = dailyTarget({ ...m, goal: g.id }).kcal;
      return { goal: g.id, rateKg: 0, label: g.label, kcal, pct: Math.round((kcal / full) * 100), floored: false };
    });
  }
  const maintain = dailyTarget({ ...m, goal: "maintain" }).maintain ?? 0;
  const row = (goal: Goal, rateKg: number, label: string): CalorieRow => {
    const t = dailyTarget({ ...m, goal, rateKg });
    return { goal, rateKg, label, kcal: t.kcal, pct: Math.round((t.kcal / maintain) * 100), floored: !!t.floored };
  };
  return [
    row("maintain", 0, "Stay as I am"),
    row("lose", 0.25, "Lose ¼ kg a week"),
    row("lose", 0.5, "Lose ½ kg a week"),
    row("lose", 1, "Lose 1 kg a week"),
    row("gain", 0.25, "Gain ¼ kg a week"),
    row("gain", 0.5, "Gain ½ kg a week"),
    row("muscle", 0.25, "Build muscle (+¼ kg a week)"),
  ];
}

/**
 * Body mass index, with the Asian-Indian adult cut-offs (ICMR / WHO Asia-Pacific).
 * Children's BMI is read on age-and-sex growth charts, so they get the number only (label null).
 */
export function bmi(m: Pick<Member, "heightCm" | "weightKg"> & Partial<Pick<Member, "kind" | "age">>): { value: number; label: string | null; healthy: [number, number] | null } | null {
  if (!m.heightCm || !m.weightKg) return null;
  const h = m.heightCm / 100;
  const value = Math.round((m.weightKg / (h * h)) * 10) / 10;
  if (m.kind === "child" || (m.age != null && m.age < 18)) return { value, label: null, healthy: null };
  const label = value < 18.5 ? "Underweight" : value < 23 ? "Healthy" : value < 25 ? "Overweight" : "Obese";
  return { value, label, healthy: [Math.round(18.5 * h * h), Math.round(22.9 * h * h)] };
}

/** Tweaks this person usually wants: their own choice, else one that suits their goal. */
export function usualTweaks(m: Pick<Member, "goal" | "tweaks" | "kind"> | undefined): CustomisationId[] {
  if (!m) return [];
  if (m.tweaks) return m.tweaks;
  if (m.kind === "child") return [];
  return m.goal === "lose" ? ["low_oil", "high_protein", "low_carb"] : m.goal === "muscle" ? ["high_protein"] : [];
}

export function needsBody(m: Member) {
  return m.kind === "adult" && (!m.heightCm || !m.weightKg);
}

/** How much of each dish someone eats by default (a full serving for adults). */
export function defaultPortion(m: Member): number {
  if (m.kind === "adult" && m.age >= 18) return 1;
  if (m.age < 4) return 0.25;
  if (m.age < 10) return 0.5;
  return 0.75;
}

export function newMemberId() {
  return `m:${Math.random().toString(36).slice(2, 10)}`;
}

export function memberForUser(username: string, displayName: string, index = 0): Member {
  return {
    id: `user:${username}`,
    username,
    name: displayName,
    kind: "adult",
    age: 30,
    sex: "male",
    activity: "light",
    goal: "maintain",
    diet: "nonveg",
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
  };
}

/** Does this person eat this dish's diet? */
export function eats(m: Pick<Member, "diet">, diet: string[]): boolean {
  if (m.diet === "nonveg") return true;
  if (diet.includes("non_veg")) return false;
  if (m.diet === "veg" && diet.includes("egg")) return false;
  return true;
}
