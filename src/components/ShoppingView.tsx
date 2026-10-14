"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { findRecipe } from "@/lib/recipes";
import { useSavedRecipes } from "@/lib/store";
import { clearShop, toggleShop, usePlanWeek, useShopChecks } from "@/lib/household";
import { CATEGORY_LABEL, shoppingList, type ShopLine } from "@/lib/nutrition";
import { DAYS, DAY_LABEL, MEALS, MEAL_LABEL, shopDishes, shopScopeKey, shopScopeLabel, weekLabel, weekStart, type Day, type Meal, type ShopScope } from "@/lib/planner";
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
  const scopeKey = shopScopeKey(week, scope);
  const hydrated = useHydrated();
  const plan = usePlanWeek(week);
  const checks = useShopChecks(scopeKey);
  const saved = useSavedRecipes();
  const [showPantry, setShowPantry] = useState(false);
  const [copied, setCopied] = useState(false);

  // The React compiler memoises these.
  const entries = shopDishes(plan, scope).flatMap((d) => {
    const recipe = findRecipe(d.recipeId, saved);
    return recipe ? [{ recipe, servings: d.servings, meals: d.meals }] : [];
  });
  const go = (d?: Day, m?: Meal) => router.replace(`/plan/shopping?week=${week}${d ? `&day=${d}` : ""}${d && m ? `&meal=${m}` : ""}`, { scroll: false });
  const hasDishes = (d: Day, m?: Meal) => shopDishes(plan, { day: d, meal: m }).length > 0;
  const lines = shoppingList(entries);
  const visible = lines.filter((l) => showPantry || !l.pantry);
  const groups = visible.reduce<Record<string, ShopLine[]>>((acc, l) => ((acc[l.cat] ??= []).push(l), acc), {});
  const left = visible.filter((l) => !checks.has(l.key)).length;

  async function share() {
    const text =
      `Shopping · ${shopScopeLabel(scope)} · ${weekLabel(week)}\n` +
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
          {shopScopeLabel(scope)} · {weekLabel(week)} · {entries.length} {entries.length === 1 ? "dish" : "dishes"} ·{" "}
          <span className="tnum" aria-live="polite">
            {left} to buy
          </span>
        </p>
      </div>

      <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Shop for">
        <button role="tab" aria-selected={!day} onClick={() => go()} className={`press shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${!day ? "border-ink bg-ink text-paper" : "border-line-2"}`}>
          Week
        </button>
        {DAYS.map((d) => (
          <button key={d} role="tab" aria-selected={day === d} onClick={() => go(d)} className={`press shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${day === d ? "border-ink bg-ink text-paper" : "border-line-2"} ${hasDishes(d) ? "" : "opacity-40"}`}>
            {DAY_LABEL[d]}
          </button>
        ))}
      </div>
      {day && (
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
          {day ? `Nothing planned for ${shopScopeLabel(scope)}.` : "Plan some dishes for this week and the shopping list fills itself."}
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
                    {!meal && <span className="text-ink-3"> · {e.meals.join(", ")}</span>}
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
