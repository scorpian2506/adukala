// Family profiles and daily targets. Estimates only — not medical advice.

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
  const floor = m.sex === "male" ? 1500 : 1200;
  const adjust = { lose: -500, maintain: 0, gain: 400, muscle: 250 }[m.goal];
  const kcal = round(Math.max(floor, tdee + adjust), 10);
  const perKg = { lose: 1.2, maintain: 0.83, gain: 1.0, muscle: 1.6 }[m.goal];
  const protein = round((m.weightKg ?? (m.sex === "male" ? 65 : 55)) * perKg, 1);
  return { kcal, protein, basis };
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
