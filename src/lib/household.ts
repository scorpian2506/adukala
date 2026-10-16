"use client";

import { useEffect, useMemo } from "react";
import { useAccount } from "./account";
import { MEMBER_COLORS, dailyTarget, defaultPortion, eats, memberForUser, type Member } from "./family";
import { DAYS, MEALS, fitPortions, planSlots, slotKey, slotWrites, type Day, type Meal, type Nutrients, type PlanEntry, type Slot } from "./planner";
import { getShared, patchShared, putShared, removeShared, sharedOf, useShared, type SharedEntry } from "./store";
import { normaliseTools, type KitchenTools } from "./kitchen-tools";
import type { Recipe } from "./types";

// Family members, the weekly plan and shopping ticks — shared with the household when signed in.

export function useFamily(): Member[] {
  const shared = useShared();
  const acct = useAccount();
  const members = useMemo(
    () =>
      Object.values(sharedOf<Member>(shared, "member")).sort(
        (a, b) => Number(b.kind === "adult") - Number(a.kind === "adult") || a.name.localeCompare(b.name),
      ),
    [shared],
  );

  // Everyone with a login gets a profile automatically (ids are stable, so two phones can't duplicate them).
  // Stamped at time 0: this can run before the first sync, and must never beat a profile someone already filled in.
  const logins = acct.status === "in" ? acct.household?.members : undefined;
  useEffect(() => {
    if (!logins) return;
    const have = sharedOf<Member>(getShared(), "member");
    logins.forEach((u, i) => {
      const id = `user:${u.username}`;
      if (!have[id]) putShared("member", id, memberForUser(u.username, u.displayName, Object.keys(have).length + i), 0);
    });
  }, [logins]);

  return members;
}

/** The signed-in person's own profile, if any. */
export function useMe(): Member | undefined {
  const members = useFamily();
  const acct = useAccount();
  const username = acct.status === "in" ? acct.user?.username : undefined;
  return username ? members.find((m) => m.id === `user:${username}`) : undefined;
}

export function saveMember(m: Member) {
  putShared("member", m.id, m);
}

export function deleteMember(id: string) {
  removeShared("member", id);
}

export function nextColor(members: Member[]) {
  return MEMBER_COLORS.find((c) => !members.some((m) => m.color === c)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
}

/** All slots of a week: "mon:breakfast" → Slot. */
function planEntries(shared: Record<string, SharedEntry>): Record<string, PlanEntry> {
  const out: Record<string, PlanEntry> = {};
  for (const [k, e] of Object.entries(shared)) if (k.startsWith("plan:")) out[k.slice(5)] = e;
  return out;
}

function allSlots(): Record<string, Slot> {
  return planSlots(planEntries(getShared()));
}

/** Every planned meal, all weeks: "week:day:meal" → Slot. */
export function useAllSlots(): Record<string, Slot> {
  const shared = useShared();
  return useMemo(() => planSlots(planEntries(shared)), [shared]);
}

export function usePlanWeek(week: string): Record<string, Slot> {
  const shared = useShared();
  return useMemo(() => {
    const all = planSlots(planEntries(shared));
    const out: Record<string, Slot> = {};
    for (const d of DAYS) for (const m of MEALS) {
      const s = all[slotKey(week, d, m)];
      if (s?.dishes?.length) out[`${d}:${m}`] = s;
    }
    return out;
  }, [shared, week]);
}

/** Save one meal. Only the dishes that changed are written, so someone else's dish in the same meal survives. */
export function setSlot(week: string, day: Day, meal: Meal, slot: Slot) {
  patchShared("plan", slotWrites(planEntries(getShared()), slotKey(week, day, meal), slot));
}

function currentSlot(week: string, day: Day, meal: Meal): Slot {
  return allSlots()[slotKey(week, day, meal)] ?? { dishes: [] };
}

/** Add a dish for everyone whose diet allows it, at their default portion. */
export function addDish(week: string, day: Day, meal: Meal, recipe: Recipe, members: Member[]) {
  const slot = currentSlot(week, day, meal);
  if (slot.dishes.some((d) => d.recipeId === recipe.id)) return;
  const portions: Record<string, number> = {};
  for (const m of members) portions[m.id] = eats(m, recipe.diet) ? defaultPortion(m) : 0;
  setSlot(week, day, meal, { dishes: [...slot.dishes, { recipeId: recipe.id, portions }] });
}

/** Change a planned dish's portions, or swap it for another version (e.g. "sambar--low_oil"). */
export function updateDish(week: string, day: Day, meal: Meal, recipeId: string, portions: Record<string, number>, newRecipeId = recipeId) {
  const slot = currentSlot(week, day, meal);
  const clash = newRecipeId !== recipeId && slot.dishes.some((d) => d.recipeId === newRecipeId);
  const dishes = slot.dishes.flatMap((d) => (d.recipeId === recipeId ? (clash ? [] : [{ ...d, recipeId: newRecipeId, portions }]) : d.recipeId === newRecipeId && clash ? [{ ...d, portions }] : [d]));
  setSlot(week, day, meal, { dishes });
}

/** Set everyone's portions on these days so their meals add up to their daily target. */
export function fitDays(week: string, days: readonly Day[], members: Member[], perServing: (recipeId: string) => Nutrients | null) {
  const targets = Object.fromEntries(members.map((m) => [m.id, dailyTarget(m).kcal]));
  const all = allSlots();
  for (const d of days) {
    const today: Partial<Record<Meal, Slot>> = {};
    for (const m of MEALS) if (all[slotKey(week, d, m)]?.dishes?.length) today[m] = all[slotKey(week, d, m)];
    const fitted = fitPortions(today, targets, perServing);
    for (const m of MEALS) {
      const s = fitted[m];
      if (s && JSON.stringify(s) !== JSON.stringify(today[m])) setSlot(week, d, m, s);
    }
  }
}

export function removeDish(week: string, day: Day, meal: Meal, recipeId: string) {
  const slot = currentSlot(week, day, meal);
  setSlot(week, day, meal, { dishes: slot.dishes.filter((d) => d.recipeId !== recipeId) });
}

/** Copy every slot of one week into another (filling only empty slots). */
export function copyWeek(from: string, to: string) {
  const all = allSlots();
  for (const d of DAYS) for (const m of MEALS) {
    const src = all[slotKey(from, d, m)];
    if (src?.dishes?.length && !all[slotKey(to, d, m)]?.dishes?.length) setSlot(to, d, m, src);
  }
}

/** The household's hob, oven, measuring spoons and cups, and scale (shared, so everyone cooks with the same kitchen). */
export function useKitchen(): KitchenTools {
  const shared = useShared();
  const raw = sharedOf<unknown>(shared, "kitchen").tools;
  return useMemo(() => normaliseTools(raw), [raw]);
}

export function saveKitchen(patch: Partial<KitchenTools>) {
  const cur = normaliseTools(sharedOf<unknown>(getShared(), "kitchen").tools);
  putShared("kitchen", "tools", { ...cur, ...patch });
}

export function useShopChecks(week: string): Set<string> {
  const shared = useShared();
  return useMemo(() => new Set(sharedOf<{ checked: string[] }>(shared, "shop")[week]?.checked ?? []), [shared, week]);
}

export function toggleShop(week: string, key: string) {
  const cur = new Set(sharedOf<{ checked: string[] }>(getShared(), "shop")[week]?.checked ?? []);
  if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  putShared("shop", week, { checked: [...cur] });
}

export function clearShop(week: string) {
  putShared("shop", week, { checked: [] });
}
