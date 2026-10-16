import { describe, expect, it } from "vitest";
import { DAYS, MEALS, addWeeks, cleanPicks, dateKey, dayDate, dishKey, personTotals, pickKey, pickScopeKey, planSlots, shopDishesForPicks, servingsByRecipe, shopDishes, shopScopeKey, shopScopeLabel, slotKey, slotWrites, todayDay, weekLabel, weekStart, type PlanEntry, type Slot } from "@/lib/planner";
import { bmi, calorieTable, checkDay, dailyTarget, defaultPortion, eats, type Member } from "@/lib/family";
import { shoppingList } from "@/lib/nutrition";
import { findRecipe } from "@/lib/recipes";

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

describe("shopping scope", () => {
  const plan: Record<string, Slot> = {
    "mon:breakfast": { dishes: [{ recipeId: "idli", portions: { a: 1, kid: 0.5 } }, { recipeId: "coconut-chutney", portions: { a: 0, kid: 0 } }] },
    "mon:lunch": { dishes: [{ recipeId: "sambar", portions: { a: 1.25, kid: 0.5 } }] },
    "tue:breakfast": { dishes: [{ recipeId: "idli", portions: { a: 2 } }] },
  };
  it("covers only the chosen meal, day or week, at the servings you cook", () => {
    expect(shopDishes(plan, { day: "mon", meal: "breakfast" })).toEqual([{ recipeId: "idli", servings: 1.5, meals: ["Mon breakfast"] }]);
    expect(shopDishes(plan, { day: "mon" }).map((d) => [d.recipeId, d.servings])).toEqual([["idli", 1.5], ["sambar", 2]]); // 1.75 → cook 2
    expect(shopDishes(plan, { day: "wed" })).toEqual([]);
    const week = shopDishes(plan);
    expect(week.find((d) => d.recipeId === "idli")).toEqual({ recipeId: "idli", servings: 3.5, meals: ["Mon breakfast", "Tue breakfast"] });
    expect(week.some((d) => d.recipeId === "coconut-chutney")).toBe(false); // nobody eats it
  });
  it("the week equals the sum of its days", () => {
    const sum = new Map<string, number>();
    for (const d of DAYS) for (const m of MEALS) for (const x of shopDishes(plan, { day: d, meal: m })) sum.set(x.recipeId, (sum.get(x.recipeId) ?? 0) + x.servings);
    expect(Object.fromEntries(shopDishes(plan).map((x) => [x.recipeId, x.servings]))).toEqual(Object.fromEntries(sum));
  });
  it("a meal's list has only that meal's ingredients", () => {
    const list = (scope: Parameters<typeof shopDishes>[1]) => shoppingList(shopDishes(plan, scope).map((d) => ({ recipe: findRecipe(d.recipeId, [])!, servings: d.servings })));
    const breakfast = list({ day: "mon", meal: "breakfast" });
    expect(breakfast.every((l) => l.recipes.every((r) => r === "Idli"))).toBe(true);
    expect(breakfast.some((l) => l.name === "Toor dal")).toBe(false);
    expect(list({ day: "mon", meal: "lunch" }).some((l) => l.name === "Toor dal")).toBe(true);
  });
  it("labels and tick keys per scope", () => {
    expect(shopScopeKey("2026-10-12", {})).toBe("2026-10-12");
    expect(shopScopeKey("2026-10-12", { day: "mon" })).toBe("2026-10-12:mon");
    expect(shopScopeKey("2026-10-12", { day: "mon", meal: "lunch" })).toBe("2026-10-12:mon:lunch");
    expect(shopScopeLabel({ day: "mon", meal: "snack" })).toBe("Mon evening snack");
    expect(shopScopeLabel({})).toBe("Whole week");
  });
});

describe("targets", () => {
  const adult = (o: Partial<Member>): Member => ({ id: "m:a", name: "A", kind: "adult", age: 35, sex: "male", heightCm: 175, weightKg: 80, activity: "light", goal: "maintain", diet: "nonveg", color: "#000", ...o });
  it("uses Mifflin-St Jeor with activity and goal", () => {
    // BMR = 800 + 1093.75 - 175 + 5 = 1723.75; × 1.375 = 2370 → maintain
    expect(dailyTarget(adult({})).kcal).toBe(2370);
    expect(dailyTarget(adult({ goal: "lose" })).kcal).toBe(1820); // ½ kg a week = 550 kcal a day
    expect(dailyTarget(adult({ goal: "muscle" })).protein).toBe(128);
  });
  it("never goes below a safe floor when losing weight", () => {
    expect(dailyTarget(adult({ sex: "female", heightCm: 150, weightKg: 45, age: 60, activity: "sedentary", goal: "lose" })).kcal).toBe(1200);
  });
  it("uses the ICMR table for children, with gentle goals that never cut protein", () => {
    const kid = adult({ kind: "child", age: 7, sex: "female", heightCm: undefined, weightKg: undefined });
    expect(dailyTarget(kid).kcal).toBe(1700);
    expect(dailyTarget(kid).protein).toBe(23);
    expect(dailyTarget({ ...kid, goal: "lose" }).kcal).toBe(1530); // keep weight steady: −10%
    expect(dailyTarget({ ...kid, goal: "lose" }).protein).toBe(23);
    expect(dailyTarget({ ...kid, goal: "gain" }).kcal).toBe(1870);
    // A goal adults use (muscle, a weekly rate) falls back to growing normally.
    expect(dailyTarget({ ...kid, goal: "muscle", rateKg: 1 }).kcal).toBe(1700);
    expect(dailyTarget(adult({ kind: "child", age: 2 })).kcal).toBe(1110);
    expect(dailyTarget(adult({ kind: "child", age: 1, goal: "lose" })).kcal).toBe(1110); // under 2: always full
    const six = adult({ kind: "child", age: 6, sex: "male", heightCm: 115, weightKg: 20 });
    expect(calorieTable(six).map((r) => [r.label, r.kcal])).toEqual([["Growing normally", 1360], ["Keep weight steady", 1220], ["Catch up", 1500]]);
    expect(dailyTarget(six).protein).toBe(16);
    // No adult BMI label for children: a healthy 6-year-old's BMI (≈15) isn't "underweight".
    expect(bmi(six)).toEqual({ value: 15.1, label: null, healthy: null });
  });
  it("sets carb and fat ranges from calories", () => {
    const t = dailyTarget(adult({}));
    expect(t.carbs).toEqual([265, 385]); // 45–65% of 2370 kcal
    expect(t.fat).toEqual([55, 90]); // 20–35%
    expect(dailyTarget(adult({ kind: "child", age: 6 })).fat).toEqual([40, 55]); // 25–35% of 1360
  });
  it("checks protein, carbs and fat only once most of the day is planned", () => {
    const kid = adult({ kind: "child", age: 6, sex: "male", diet: "veg" });
    const t = dailyTarget(kid); // 1360 kcal, 16 g protein
    const lunchOnly = checkDay(kid, { kcal: 400, protein: 4, carbs: 80, fat: 5 }, t);
    expect(lunchOnly.complete).toBe(false);
    expect([lunchOnly.protein, lunchOnly.carbs, lunchOnly.fat, lunchOnly.hints]).toEqual(["ok", "ok", "ok", []]);
    const riceDay = checkDay(kid, { kcal: 1300, protein: 10, carbs: 245, fat: 25 }, t);
    expect(riceDay.complete).toBe(true);
    expect(riceDay.protein).toBe("low");
    expect(riceDay.carbs).toBe("high"); // 75%
    expect(riceDay.fat).toBe("low"); // 17%
    expect(riceDay.hints.join(" ")).toMatch(/dal, paneer, curd or sprouts\./); // veg: no egg or meat, no "tick High protein" for a child
    expect(riceDay.hints.join(" ")).toMatch(/ghee, oil, nuts or full-fat milk/);
    const balanced = checkDay(kid, { kcal: 1350, protein: 30, carbs: 190, fat: 45 }, t);
    expect([balanced.protein, balanced.carbs, balanced.fat, balanced.hints]).toEqual(["ok", "ok", "ok", []]);
    const me = adult({ diet: "nonveg" });
    expect(checkDay(me, { kcal: 2300, protein: 100, carbs: 400, fat: 30 }).fat).toBe("ok"); // 12% fat: fine for an adult cutting oil
    expect(checkDay(me, { kcal: 2300, protein: 40, carbs: 300, fat: 80 }).hints[0]).toMatch(/an egg, chicken or fish, or tick High protein/);
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

describe("plan storage: one synced item per dish", () => {
  const slot = "2026-10-12:wed:dinner";
  const sync = (a: Record<string, PlanEntry>, b: Record<string, PlanEntry>) => {
    // Newest change per key wins (as the server does).
    const out = { ...a };
    for (const [k, e] of Object.entries(b)) if (!out[k] || e.at > out[k].at) out[k] = e;
    return out;
  };
  const apply = (plan: Record<string, PlanEntry>, writes: ReturnType<typeof slotWrites>, at: number) => {
    const out = { ...plan };
    for (const [k, d] of writes) out[k] = d === null ? { deleted: true, at } : { data: d, at };
    return out;
  };
  const names = (plan: Record<string, PlanEntry>) => planSlots(plan)[slot]?.dishes.map((d) => d.recipeId) ?? [];

  it("two phones adding to the same meal keep both dishes", () => {
    const a = apply({}, slotWrites({}, slot, { dishes: [{ recipeId: "jeera-rice", portions: { p: 1 } }] }, 1), 1);
    const b = apply({}, slotWrites({}, slot, { dishes: [{ recipeId: "dal-tadka", portions: { p: 1 } }] }, 2), 2);
    expect(names(sync(a, b))).toEqual(["jeera-rice", "dal-tadka"]);
  });

  it("reads an old whole-meal entry and retires it on the first edit", () => {
    const old: Record<string, PlanEntry> = { [slot]: { data: { dishes: [{ recipeId: "sambar", portions: { p: 1 } }, { recipeId: "avial", portions: { p: 1 } }] }, at: 1 } };
    expect(names(old)).toEqual(["sambar", "avial"]);
    const next = { dishes: [{ recipeId: "sambar", portions: { p: 2 } }, { recipeId: "avial", portions: { p: 1 } }] };
    const after = apply(old, slotWrites(old, slot, next, 5), 5);
    expect(after[slot].deleted).toBe(true);
    expect(planSlots(after)[slot]).toEqual(next);
  });

  it("only writes dishes that changed, and removing one leaves the others", () => {
    let plan = apply({}, slotWrites({}, slot, { dishes: [{ recipeId: "sambar", portions: { p: 1 } }, { recipeId: "avial", portions: { p: 1 } }] }, 1), 1);
    const w = slotWrites(plan, slot, { dishes: [{ recipeId: "sambar", portions: { p: 1 } }, { recipeId: "avial", portions: { p: 2 } }] }, 2);
    expect(w.map(([k]) => k)).toEqual([dishKey(slot, "avial")]);
    plan = apply(plan, slotWrites(plan, slot, { dishes: [{ recipeId: "avial", portions: { p: 1 } }] }, 3), 3);
    expect(names(plan)).toEqual(["avial"]);
    plan = apply(plan, slotWrites(plan, slot, { dishes: [] }, 4), 4);
    expect(planSlots(plan)[slot]).toBeUndefined();
  });

  it("swapping a dish's version replaces it in place", () => {
    let plan = apply({}, slotWrites({}, slot, { dishes: [{ recipeId: "sambar", portions: { p: 1 } }, { recipeId: "avial", portions: { p: 1 } }] }, 1), 1);
    plan = apply(plan, slotWrites(plan, slot, { dishes: [{ recipeId: "sambar--low_oil", portions: { p: 1 } }, { recipeId: "avial", portions: { p: 1 } }] }, 2), 2);
    expect(names(plan)).toEqual(["sambar--low_oil", "avial"]);
  });

  it("keeps sync keys under 200 characters", () => {
    const long = `aloo-matar--low_oil~${Array.from({ length: 30 }, (_, i) => `x_ingredient${i}`).join("~")}`;
    expect(dishKey(slot, long).length).toBeLessThanOrEqual(200);
    expect(dishKey(slot, long)).not.toBe(dishKey(slot, `${long}~ggp`));
  });
});

describe("shopping for picked meals across days and weeks", () => {
  const slots: Record<string, Slot> = {
    "2026-10-12:wed:dinner": { dishes: [{ recipeId: "sambar", portions: { a: 1, b: 1 } }] },
    "2026-10-12:thu:lunch": { dishes: [{ recipeId: "sambar", portions: { a: 1 } }, { recipeId: "avial", portions: { a: 1 } }] },
    "2026-10-12:thu:dinner": { dishes: [{ recipeId: "jeera-rice", portions: { a: 1, b: 0.5 } }] },
    "2026-10-12:fri:breakfast": { dishes: [{ recipeId: "idli", portions: { a: 2 } }] },
    "2026-10-19:mon:dinner": { dishes: [{ recipeId: "sambar", portions: { a: 1 } }] },
  };

  it("adds up only the picked meals, even into next week", () => {
    const picks = ["2026-10-14:dinner", "2026-10-15:lunch", "2026-10-15:dinner", "2026-10-19:dinner", "2026-10-19:dinner"];
    const got = shopDishesForPicks(slots, picks);
    expect(got.map((d) => [d.recipeId, d.servings])).toEqual([
      ["sambar", 4],
      ["avial", 1],
      ["jeera-rice", 1.5],
    ]);
    expect(got[0].meals).toEqual(["Wed 14 dinner", "Thu 15 lunch", "Mon 19 dinner"]);
    expect(got.some((d) => d.recipeId === "idli")).toBe(false);
  });

  it("keeps picks tidy and their ticks separate from other lists", () => {
    expect(cleanPicks(["2026-10-15:dinner", "junk", "2026-10-15:breakfast", "2026-10-14:dinner", "2026-10-14:dinner"])).toEqual(["2026-10-14:dinner", "2026-10-15:breakfast", "2026-10-15:dinner"]);
    expect(pickKey("2026-10-12", "wed", "dinner")).toBe("2026-10-14:dinner");
    expect(pickScopeKey(["2026-10-15:dinner", "2026-10-14:dinner"])).toBe(pickScopeKey(["2026-10-14:dinner", "2026-10-15:dinner"]));
    expect(pickScopeKey(["2026-10-14:dinner"])).not.toBe(shopScopeKey("2026-10-12", { day: "wed", meal: "dinner" }));
  });
});
