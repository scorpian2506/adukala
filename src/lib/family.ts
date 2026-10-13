// Family profiles and daily targets. Estimates only — not medical advice.

import type { CustomisationId } from "./tweaks";

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
  goal: Goal; // children are always "maintain" (growing)
  /** Weekly change for lose/gain/muscle, in kg (0.25, 0.5 or 1). */
  rateKg?: number;
  /** Recipe tweaks applied by default when this person opens a recipe or plans a dish. */
  tweaks?: CustomisationId[];
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

// ICMR-NIN 2020 adult reference values when height/weight aren't given (sedentary / moderate).
const ADULT_REF = { male: { sedentary: 2110, moderate: 2710 }, female: { sedentary: 1660, moderate: 2130 } };

export interface Target {
  kcal: number;
  protein: number; // g/day
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

export function dailyTarget(m: Member): Target {
  if (m.kind === "child" || m.age < 18) {
    const row = CHILD_KCAL.find((r) => m.age <= r.maxAge) ?? CHILD_KCAL[CHILD_KCAL.length - 1];
    const kcal = row[m.sex];
    const protein = round((m.weightKg ?? Math.max(10, m.age * 3 + 8)) * (m.age < 4 ? 1.2 : 1.0), 1);
    return { kcal, protein, basis: `ICMR-NIN guide for a ${m.age}-year-old ${m.sex === "male" ? "boy" : "girl"}` };
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
  return { kcal, protein, basis, maintain: round(tdee, 10), floored: wanted < floor };
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

/** Calories per day for each goal and pace — the calculator table. Adults only. */
export function calorieTable(m: Member): CalorieRow[] {
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

/** Body mass index, with the Asian-Indian cut-offs (ICMR / WHO Asia-Pacific). */
export function bmi(m: Pick<Member, "heightCm" | "weightKg">): { value: number; label: string; healthy: [number, number] } | null {
  if (!m.heightCm || !m.weightKg) return null;
  const h = m.heightCm / 100;
  const value = Math.round((m.weightKg / (h * h)) * 10) / 10;
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
