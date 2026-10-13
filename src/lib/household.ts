"use client";

import { useEffect, useMemo } from "react";
import { useAccount } from "./account";
import { MEMBER_COLORS, defaultPortion, eats, memberForUser, type Member } from "./family";
import { DAYS, MEALS, slotKey, type Day, type Meal, type Slot } from "./planner";
import { getShared, putShared, removeShared, sharedOf, useShared } from "./store";
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
  const logins = acct.status === "in" ? acct.household?.members : undefined;
  useEffect(() => {
    if (!logins) return;
    const have = sharedOf<Member>(getShared(), "member");
    logins.forEach((u, i) => {
      const id = `user:${u.username}`;
      if (!have[id]) putShared("member", id, memberForUser(u.username, u.displayName, Object.keys(have).length + i));
    });
  }, [logins]);

  return members;
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
export function usePlanWeek(week: string): Record<string, Slot> {
  const shared = useShared();
  return useMemo(() => {
    const all = sharedOf<Slot>(shared, "plan");
    const out: Record<string, Slot> = {};
    for (const d of DAYS) for (const m of MEALS) {
      const s = all[slotKey(week, d, m)];
      if (s?.dishes?.length) out[`${d}:${m}`] = s;
    }
    return out;
  }, [shared, week]);
}

export function setSlot(week: string, day: Day, meal: Meal, slot: Slot) {
  if (slot.dishes.length) putShared("plan", slotKey(week, day, meal), slot);
  else removeShared("plan", slotKey(week, day, meal));
}

function currentSlot(week: string, day: Day, meal: Meal): Slot {
  const s = sharedOf<Slot>(getShared(), "plan")[slotKey(week, day, meal)];
  return s?.dishes ? s : { dishes: [] };
}

/** Add a dish for everyone whose diet allows it, at their default portion. */
export function addDish(week: string, day: Day, meal: Meal, recipe: Recipe, members: Member[]) {
  const slot = currentSlot(week, day, meal);
  if (slot.dishes.some((d) => d.recipeId === recipe.id)) return;
  const portions: Record<string, number> = {};
  for (const m of members) portions[m.id] = eats(m, recipe.diet) ? defaultPortion(m) : 0;
  setSlot(week, day, meal, { dishes: [...slot.dishes, { recipeId: recipe.id, portions }] });
}

export function updateDish(week: string, day: Day, meal: Meal, recipeId: string, portions: Record<string, number>) {
  const slot = currentSlot(week, day, meal);
  setSlot(week, day, meal, { dishes: slot.dishes.map((d) => (d.recipeId === recipeId ? { ...d, portions } : d)) });
}

export function removeDish(week: string, day: Day, meal: Meal, recipeId: string) {
  const slot = currentSlot(week, day, meal);
  setSlot(week, day, meal, { dishes: slot.dishes.filter((d) => d.recipeId !== recipeId) });
}

/** Copy every slot of one week into another (filling only empty slots). */
export function copyWeek(from: string, to: string) {
  const all = sharedOf<Slot>(getShared(), "plan");
  for (const d of DAYS) for (const m of MEALS) {
    const src = all[slotKey(from, d, m)];
    if (src?.dishes?.length && !all[slotKey(to, d, m)]?.dishes?.length) setSlot(to, d, m, src);
  }
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
