"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { findRecipe } from "@/lib/recipes";
import { useSavedRecipes } from "@/lib/store";
import { clearShop, toggleShop, useAllSlots, usePlanWeek, useShopChecks } from "@/lib/household";
import { CATEGORY_LABEL, shoppingList, type ShopLine } from "@/lib/nutrition";
import {
  DAYS,
  DAY_LABEL,
  MEALS,
  MEAL_LABEL,
  addWeeks,
  cleanPicks,
  dateKey,
  dayDate,
  pickKey,
  pickLabel,
  pickScopeKey,
  shopDishes,
  shopDishesForPicks,
  shopScopeKey,
  shopScopeLabel,
  slotKey,
  weekLabel,
  weekStart,
  type Day,
  type Meal,
  type ShopScope,
  type Slot,
} from "@/lib/planner";
import { useHydrated } from "@/lib/useRecipe";
import { TopBar } from "./Nav";
import { Check } from "./Icons";

export function ShoppingView() {
  const params = useSearchParams();
  const router = useRouter();
  const week = params.get("week") ?? weekStart();
  const day = DAYS.find((d) => d === params.get("day"));
  const meal = day ? MEALS.find((m) => m === params.get("meal")) : undefined;
  const scope: ShopScope = { day, meal };
  // "Pick meals": any meals on any days, even across weeks ("Wed dinner, Thu lunch and dinner, Fri dinner").
  const picking = params.has("pick");
  // Held here too: quick taps must each build on the last one, not on a link that hasn't updated yet.
  const [tapped, setTapped] = useState<string[] | null>(null);
  const picks = tapped ?? cleanPicks((params.get("pick") ?? "").split(",").filter(Boolean));
  const scopeKey = picking ? pickScopeKey(picks) : shopScopeKey(week, scope);
  const scopeLabel = picking ? `${picks.length} picked ${picks.length === 1 ? "meal" : "meals"}` : shopScopeLabel(scope);
  const hydrated = useHydrated();
  const plan = usePlanWeek(week);
  const allSlots = useAllSlots();
  const checks = useShopChecks(scopeKey);
  const saved = useSavedRecipes();
  const [showPantry, setShowPantry] = useState(false);
  const [copied, setCopied] = useState(false);

  // The React compiler memoises these.
  const entries = (picking ? shopDishesForPicks(allSlots, picks) : shopDishes(plan, scope)).flatMap((d) => {
    const recipe = findRecipe(d.recipeId, saved);
    return recipe ? [{ recipe, servings: d.servings, meals: d.meals }] : [];
  });
  const go = (d?: Day, m?: Meal) => (setTapped(null), router.replace(`/plan/shopping?week=${week}${d ? `&day=${d}` : ""}${d && m ? `&meal=${m}` : ""}`, { scroll: false }));
  const pick = (next: string[], w = week) => {
    const clean = cleanPicks(next);
    setTapped(clean);
    router.replace(`/plan/shopping?week=${w}&pick=${clean.join(",")}`, { scroll: false });
  };
  const hasDishes = (d: Day, m?: Meal) => shopDishes(plan, { day: d, meal: m }).length > 0;
  const lines = shoppingList(entries);
  const visible = lines.filter((l) => showPantry || !l.pantry);
  const groups = visible.reduce<Record<string, ShopLine[]>>((acc, l) => ((acc[l.cat] ??= []).push(l), acc), {});
  const left = visible.filter((l) => !checks.has(l.key)).length;

  async function share() {
    const text =
      `Shopping · ${picking ? picks.map(pickLabel).join(", ") : `${shopScopeLabel(scope)} · ${weekLabel(week)}`}\n` +
      `For: ${entries.map((e) => `${e.recipe.name} (${e.servings})`).join(", ")}\n` +
      Object.entries(groups)
        .map(([cat, ls]) => `\n${CATEGORY_LABEL[cat as ShopLine["cat"]]}\n${ls.filter((l) => !checks.has(l.key)).map((l) => `• ${l.name} — ${l.amount}`).join("\n")}`)
        .join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "Shopping list", text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }

  return (
    <main className="app-min-h pb-16">
      <header className="px-4 pb-2">
        <TopBar />
      </header>
      <div className="px-5">
        <h1 className="font-display text-[44px] leading-none">Shopping list</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          {scopeLabel}
          {picking ? "" : ` · ${weekLabel(week)}`} · {entries.length} {entries.length === 1 ? "dish" : "dishes"} ·{" "}
          <span className="tnum" aria-live="polite">
            {left} to buy
          </span>
        </p>
      </div>

      <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Shop for">
        <button role="tab" aria-selected={!day && !picking} onClick={() => go()} className={`press shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${!day && !picking ? "border-ink bg-ink text-paper" : "border-line-2"}`}>
          Week
        </button>
        <button role="tab" aria-selected={picking} onClick={() => pick(picks)} className={`press shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${picking ? "border-ink bg-ink text-paper" : "border-line-2"}`}>
          Pick meals
        </button>
        {DAYS.map((d) => (
          <button key={d} role="tab" aria-selected={!picking && day === d} onClick={() => go(d)} className={`press shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${!picking && day === d ? "border-ink bg-ink text-paper" : "border-line-2"} ${hasDishes(d) ? "" : "opacity-40"}`}>
            {DAY_LABEL[d]}
          </button>
        ))}
      </div>
      {picking && <MealPicker week={week} picks={picks} slots={allSlots} onChange={pick} />}
      {day && !picking && (
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Meal">
          <button role="tab" aria-selected={!meal} onClick={() => go(day)} className={`press shrink-0 rounded-full border px-3 py-1.5 text-[12px] ${!meal ? "border-ink bg-ink text-paper" : "border-line-2"}`}>
            Whole day
          </button>
          {MEALS.map((m) => (
            <button key={m} role="tab" aria-selected={meal === m} onClick={() => go(day, m)} className={`press shrink-0 rounded-full border px-3 py-1.5 text-[12px] ${meal === m ? "border-ink bg-ink text-paper" : "border-line-2"} ${hasDishes(day, m) ? "" : "opacity-40"}`}>
              {MEAL_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      {hydrated && entries.length === 0 ? (
        <p className="mx-5 mt-6 rounded-[22px] bg-paper-2 p-5 text-[14px] text-ink-2">
          {picking ? (picks.length ? "Nothing planned in the picked meals." : "Tick the meals you're shopping for.") : day ? `Nothing planned for ${shopScopeLabel(scope)}.` : "Plan some dishes for this week and the shopping list fills itself."}
        </p>
      ) : (
        <>
          <section className="mx-4 mt-4 rounded-[20px] bg-paper-2 p-3.5" data-testid="shop-dishes">
            <p className="eyebrow text-ink-3">Only for these dishes</p>
            <ul className="mt-2 space-y-1 text-[13px]">
              {entries.map((e) => (
                <li key={e.recipe.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {e.recipe.name}
                    {e.recipe.variant?.length ? <span className="text-leaf"> · {e.recipe.variant.join(" · ")}</span> : null}
                    {(picking || !meal) && <span className="text-ink-3"> · {e.meals.join(", ")}</span>}
                  </span>
                  <span className="shrink-0 tnum text-ink-2">cook {e.servings}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="mx-4 mt-4 flex items-center gap-2">
            <button onClick={share} className="press flex-1 rounded-2xl bg-ink py-3 text-[14px] font-medium text-paper">
              {copied ? "Copied" : "Share / copy list"}
            </button>
            <button onClick={() => setShowPantry((s) => !s)} aria-pressed={showPantry} className={`press rounded-2xl border px-3 py-3 text-[13px] ${showPantry ? "border-ink" : "border-line-2"}`}>
              {showPantry ? "Hide salt" : "Show salt"}
            </button>
            {checks.size > 0 && (
              <button onClick={() => clearShop(scopeKey)} className="press rounded-2xl border border-line-2 px-3 py-3 text-[13px]">
                Untick all
              </button>
            )}
          </div>
          {Object.entries(groups).map(([cat, ls]) => (
            <section key={cat} className="mx-4 mt-5">
              <h2 className="eyebrow px-1 text-ink-3">{CATEGORY_LABEL[cat as ShopLine["cat"]]}</h2>
              <ul className="mt-2 overflow-hidden rounded-[20px] border border-line-2 bg-card">
                {ls.map((l) => {
                  const done = checks.has(l.key);
                  return (
                    <li key={l.key} className="border-b border-line last:border-b-0">
                      <button onClick={() => toggleShop(scopeKey, l.key)} role="checkbox" aria-checked={done} className="press flex w-full items-center gap-3 px-3.5 py-3 text-left">
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${done ? "border-leaf bg-leaf text-paper" : "border-line-2"}`}>{done && <Check size={14} />}</span>
                        <span className={`min-w-0 flex-1 ${done ? "text-ink-3 line-through" : ""}`}>
                          <span className="block text-[15px]">{l.name}</span>
                          <span className="block truncate text-[11px] text-ink-3">{l.recipes.join(", ")}</span>
                        </span>
                        <span className={`shrink-0 font-mono text-[13px] tnum ${done ? "text-ink-3" : ""}`}>{l.amount}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="mx-5 mt-5 text-[12px] text-ink-3">Amounts match what you cook: everyone&rsquo;s planned portions for these dishes, nothing else. Water is left out and salt is hidden. Ticks are kept per list and shared with your household.</p>
        </>
      )}
    </main>
  );
}

const MEAL_SHORT: Record<Meal, string> = { breakfast: "Bkfst", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };

/** Tick any meals on any days; arrows move between weeks and keep what's ticked. */
function MealPicker({ week, picks, slots, onChange }: { week: string; picks: string[]; slots: Record<string, Slot>; onChange: (picks: string[], week?: string) => void }) {
  const planned = (d: Day, m: Meal) => (slots[slotKey(week, d, m)]?.dishes.length ?? 0) > 0;
  const has = new Set(picks);
  const toggle = (keys: string[]) => {
    const allOn = keys.every((k) => has.has(k));
    onChange(allOn ? picks.filter((k) => !keys.includes(k)) : [...picks, ...keys]);
  };
  const today = dateKey(new Date());
  const fromToday = DAYS.flatMap((d) => MEALS.filter((m) => planned(d, m) && dateKey(dayDate(week, d)) >= today).map((m) => pickKey(week, d, m)));
  return (
    <section className="mx-4 mt-3 rounded-[20px] border border-line-2 bg-card p-3" aria-label="Pick meals">
      <div className="flex items-center justify-between">
        <button onClick={() => onChange(picks, addWeeks(week, -1))} className="press rounded-full px-2.5 py-1 text-[18px]" aria-label="Previous week">
          ‹
        </button>
        <span className="text-[13px] font-medium">{weekLabel(week)}</span>
        <button onClick={() => onChange(picks, addWeeks(week, 1))} className="press rounded-full px-2.5 py-1 text-[18px]" aria-label="Next week">
          ›
        </button>
      </div>
      <table className="mt-1 w-full table-fixed text-center text-[12px]">
        <thead>
          <tr>
            <th className="w-[64px]" />
            {MEALS.map((m) => (
              <th key={m} scope="col" className="pb-1 font-normal text-ink-3">
                <button onClick={() => toggle(DAYS.filter((d) => planned(d, m)).map((d) => pickKey(week, d, m)))} className="press" aria-label={`Pick every ${MEAL_LABEL[m].toLowerCase()} this week`}>
                  {MEAL_SHORT[m]}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((d) => {
            const date = dayDate(week, d);
            const row = MEALS.filter((m) => planned(d, m)).map((m) => pickKey(week, d, m));
            return (
              <tr key={d}>
                <th scope="row" className="py-0.5 text-left font-normal">
                  <button onClick={() => row.length && toggle(row)} disabled={!row.length} className="press text-[12px] disabled:text-ink-3" aria-label={`Pick all of ${DAY_LABEL[d]} ${date.getDate()}`}>
                    {DAY_LABEL[d]} {date.getDate()}
                  </button>
                </th>
                {MEALS.map((m) => {
                  const k = pickKey(week, d, m);
                  const on = has.has(k);
                  const ok = planned(d, m);
                  return (
                    <td key={m} className="p-0.5">
                      <button
                        role="checkbox"
                        aria-checked={on}
                        aria-label={pickLabel(k)}
                        disabled={!ok && !on}
                        onClick={() => toggle([k])}
                        className={`press grid h-8 w-full place-items-center rounded-lg border ${on ? "border-leaf bg-leaf text-paper" : ok ? "border-line-2" : "border-transparent text-line-2"}`}
                      >
                        {on ? <Check size={14} /> : ok ? "" : "–"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => onChange([...picks, ...fromToday])} disabled={!fromToday.length} className="press rounded-full border border-line-2 px-3 py-1 text-[12px] disabled:opacity-40">
          Rest of this week
        </button>
        {picks.length > 0 && (
          <button onClick={() => onChange([])} className="press rounded-full border border-line-2 px-3 py-1 text-[12px]">
            Clear
          </button>
        )}
      </div>
      {picks.length > 0 && (
        <p className="mt-2 text-[12px] leading-snug text-ink-2" data-testid="picked-meals">
          {picks.map(pickLabel).join(" · ")}
        </p>
      )}
    </section>
  );
}
