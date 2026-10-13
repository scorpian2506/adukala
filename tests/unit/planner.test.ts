import { describe, expect, it } from "vitest";
import { addWeeks, dateKey, dayDate, personTotals, servingsByRecipe, slotKey, todayDay, weekLabel, weekStart, type Slot } from "@/lib/planner";
import { dailyTarget, defaultPortion, eats, type Member } from "@/lib/family";

describe("weeks", () => {
  it("starts on Monday, in local time, even near midnight", () => {
    expect(weekStart(new Date(2026, 9, 13, 0, 5))).toBe("2026-10-12"); // Tue just after midnight
    expect(weekStart(new Date(2026, 9, 18, 23, 59))).toBe("2026-10-12"); // Sunday night
    expect(weekStart(new Date(2026, 9, 19, 0, 1))).toBe("2026-10-19"); // Monday
    expect(weekStart(new Date(2026, 0, 1))).toBe("2025-12-29"); // across the year
  });
  it("moves between weeks and days", () => {
    expect(addWeeks("2026-10-12", 1)).toBe("2026-10-19");
    expect(addWeeks("2026-10-12", -2)).toBe("2026-09-28");
    expect(dateKey(dayDate("2026-10-12", "sun"))).toBe("2026-10-18");
    expect(todayDay(new Date(2026, 9, 18))).toBe("sun");
    expect(weekLabel("2026-10-12")).toBe("12–18 Oct");
    expect(weekLabel("2026-09-28")).toBe("28 Sept – 4 Oct".replace("Sept", new Date(2026, 8, 1).toLocaleDateString("en-GB", { month: "short" })));
    expect(slotKey("2026-10-12", "mon", "dinner")).toBe("2026-10-12:mon:dinner");
  });
});

describe("totals", () => {
  const slots: Slot[] = [
    { dishes: [{ recipeId: "idli", portions: { a: 1, kid: 0.5 } }] },
    { dishes: [{ recipeId: "sambar", portions: { a: 2, kid: 0 } }, { recipeId: "idli", portions: { a: 1 } }] },
  ];
  const per = (id: string) => (id === "idli" ? { kcal: 200, protein: 6, carbs: 40, fat: 1 } : { kcal: 150, protein: 8, carbs: 20, fat: 4 });
  it("adds up what each person eats", () => {
    expect(personTotals(slots, "a", per)).toEqual({ kcal: 700, protein: 28, carbs: 120, fat: 10 });
    expect(personTotals(slots, "kid", per).kcal).toBe(100);
    expect(personTotals(slots, "nobody", per).kcal).toBe(0);
  });
  it("counts servings to cook per recipe", () => {
    expect(Object.fromEntries(servingsByRecipe(slots))).toEqual({ idli: 2.5, sambar: 2 });
  });
});

describe("targets", () => {
  const adult = (o: Partial<Member>): Member => ({ id: "m:a", name: "A", kind: "adult", age: 35, sex: "male", heightCm: 175, weightKg: 80, activity: "light", goal: "maintain", diet: "nonveg", color: "#000", ...o });
  it("uses Mifflin-St Jeor with activity and goal", () => {
    // BMR = 800 + 1093.75 - 175 + 5 = 1723.75; × 1.375 = 2370 → maintain
    expect(dailyTarget(adult({})).kcal).toBe(2370);
    expect(dailyTarget(adult({ goal: "lose" })).kcal).toBe(1870);
    expect(dailyTarget(adult({ goal: "muscle" })).protein).toBe(128);
  });
  it("never goes below a safe floor when losing weight", () => {
    expect(dailyTarget(adult({ sex: "female", heightCm: 150, weightKg: 45, age: 60, activity: "sedentary", goal: "lose" })).kcal).toBe(1200);
  });
  it("uses the ICMR table for children and ignores weight goals", () => {
    const kid = adult({ kind: "child", age: 7, sex: "female", goal: "lose", heightCm: undefined, weightKg: undefined });
    expect(dailyTarget(kid).kcal).toBe(1700);
    expect(dailyTarget(adult({ kind: "child", age: 2 })).kcal).toBe(1110);
  });
  it("falls back to the adult reference without height/weight", () => {
    expect(dailyTarget(adult({ heightCm: undefined, weightKg: undefined, sex: "female", activity: "sedentary" })).kcal).toBe(1660);
  });
  it("default portions and diets", () => {
    expect(defaultPortion(adult({}))).toBe(1);
    expect(defaultPortion(adult({ kind: "child", age: 6 }))).toBe(0.5);
    expect(eats({ diet: "veg" }, ["egg"])).toBe(false);
    expect(eats({ diet: "egg" }, ["egg"])).toBe(true);
    expect(eats({ diet: "egg" }, ["non_veg"])).toBe(false);
    expect(eats({ diet: "nonveg" }, ["non_veg"])).toBe(true);
  });
});
