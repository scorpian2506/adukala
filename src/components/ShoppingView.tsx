"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SEED_RECIPES } from "@/lib/recipes";
import { useSavedRecipes } from "@/lib/store";
import { clearShop, toggleShop, usePlanWeek, useShopChecks } from "@/lib/household";
import { CATEGORY_LABEL, shoppingList, type ShopLine } from "@/lib/nutrition";
import { DAYS, MEALS, servingsByRecipe, weekLabel, weekStart, type Slot } from "@/lib/planner";
import { useHydrated } from "@/lib/useRecipe";
import { TopBar } from "./Nav";
import { Check } from "./Icons";

export function ShoppingView() {
  const params = useSearchParams();
  const week = params.get("week") ?? weekStart();
  const hydrated = useHydrated();
  const plan = usePlanWeek(week);
  const checks = useShopChecks(week);
  const saved = useSavedRecipes();
  const [showPantry, setShowPantry] = useState(false);
  const [copied, setCopied] = useState(false);

  const byId = useMemo(() => new Map([...saved, ...SEED_RECIPES].map((r) => [r.id, r])), [saved]);
  const entries = useMemo(() => {
    const slots = DAYS.flatMap((d) => MEALS.map((m) => plan[`${d}:${m}`]).filter((s): s is Slot => !!s));
    return [...servingsByRecipe(slots).entries()].flatMap(([id, n]) => (byId.get(id) ? [{ recipe: byId.get(id)!, servings: n }] : []));
  }, [plan, byId]);
  const lines = useMemo(() => shoppingList(entries), [entries]);
  const visible = lines.filter((l) => showPantry || !l.pantry);
  const groups = visible.reduce<Record<string, ShopLine[]>>((acc, l) => ((acc[l.cat] ??= []).push(l), acc), {});
  const left = visible.filter((l) => !checks.has(l.key)).length;

  async function share() {
    const text =
      `Shopping · ${weekLabel(week)}\n` +
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
          {weekLabel(week)} · {entries.length} dishes ·{" "}
          <span className="tnum" aria-live="polite">
            {left} to buy
          </span>
        </p>
      </div>

      {hydrated && entries.length === 0 ? (
        <p className="mx-5 mt-6 rounded-[22px] bg-paper-2 p-5 text-[14px] text-ink-2">Plan some dishes for this week and the shopping list fills itself.</p>
      ) : (
        <>
          <div className="mx-4 mt-5 flex items-center gap-2">
            <button onClick={share} className="press flex-1 rounded-2xl bg-ink py-3 text-[14px] font-medium text-paper">
              {copied ? "Copied" : "Share / copy list"}
            </button>
            <button onClick={() => setShowPantry((s) => !s)} aria-pressed={showPantry} className={`press rounded-2xl border px-3 py-3 text-[13px] ${showPantry ? "border-ink" : "border-line-2"}`}>
              {showPantry ? "Hide salt" : "Show salt"}
            </button>
            {checks.size > 0 && (
              <button onClick={() => clearShop(week)} className="press rounded-2xl border border-line-2 px-3 py-3 text-[13px]">
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
                      <button onClick={() => toggleShop(week, l.key)} role="checkbox" aria-checked={done} className="press flex w-full items-center gap-3 px-3.5 py-3 text-left">
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
          <p className="mx-5 mt-5 text-[12px] text-ink-3">Amounts are scaled to everyone&rsquo;s planned portions and rounded up. Ticks are shared with your household.</p>
        </>
      )}
    </main>
  );
}
