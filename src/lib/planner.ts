// The weekly meal plan: pure helpers (dates, slots, totals). Storage lives in store.ts.

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_LABEL: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export const MEALS = ["breakfast", "lunch", "snack", "dinner"] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Evening snack", dinner: "Dinner" };

export interface PlannedDish {
  recipeId: string;
  /** member id → servings that person eats (0 = not eating this dish). */
  portions: Record<string, number>;
}

export interface Slot {
  dishes: PlannedDish[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-date key "YYYY-MM-DD" (never via toISOString, which shifts to UTC). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The Monday of the week containing `d`, as a local date key. */
export function weekStart(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return dateKey(x);
}

export function addWeeks(week: string, n: number): string {
  const d = parseDateKey(week);
  d.setDate(d.getDate() + n * 7);
  return dateKey(d);
}

export function dayDate(week: string, day: Day): Date {
  const d = parseDateKey(week);
  d.setDate(d.getDate() + DAYS.indexOf(day));
  return d;
}

export function todayDay(d: Date = new Date()): Day {
  return DAYS[(d.getDay() + 6) % 7];
}

export function weekLabel(week: string): string {
  const a = parseDateKey(week);
  const b = dayDate(week, "sun");
  const m = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}`;
}

/** Sync key for one meal slot: plans sync per slot so two people editing different days don't clash. */
export function slotKey(week: string, day: Day, meal: Meal) {
  return `${week}:${day}:${meal}`;
}

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function addN(a: Nutrients, b: Nutrients, k = 1): Nutrients {
  return { kcal: a.kcal + b.kcal * k, protein: a.protein + b.protein * k, carbs: a.carbs + b.carbs * k, fat: a.fat + b.fat * k };
}

/** What one person eats in a set of slots, given per-serving nutrition for each recipe. */
export function personTotals(slots: Slot[], memberId: string, perServing: (recipeId: string) => Nutrients | null): Nutrients {
  let t = ZERO;
  for (const s of slots) for (const d of s.dishes) {
    const p = d.portions[memberId] ?? 0;
    const n = p ? perServing(d.recipeId) : null;
    if (n) t = addN(t, n, p);
  }
  return t;
}

/** Total servings of each recipe across slots (for cooking and shopping). */
export function servingsByRecipe(slots: Slot[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) for (const d of s.dishes) {
    const total = Object.values(d.portions).reduce((a, b) => a + b, 0);
    if (total > 0) m.set(d.recipeId, (m.get(d.recipeId) ?? 0) + total);
  }
  return m;
}
