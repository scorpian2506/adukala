"use client";

import Link from "next/link";
import { useState } from "react";
import { SEED_RECIPES } from "@/lib/recipes";
import { markedIds, useMarks, useSavedRecipes } from "@/lib/store";
import { useHydrated } from "@/lib/useRecipe";
import type { Recipe } from "@/lib/types";
import { RecipeCard } from "./RecipeCard";
import { BottomNav } from "./Nav";
import { Pin, Star } from "./Icons";

type Tab = "star" | "pin" | "mine";

export function SavedView() {
  const marks = useMarks();
  const saved = useSavedRecipes();
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>("star");
  const byId = new Map<string, Recipe>([...SEED_RECIPES, ...saved].map((r) => [r.id, r]));
  const list: Recipe[] =
    tab === "mine" ? saved : markedIds(marks, tab).map((id) => byId.get(id)).filter((r): r is Recipe => !!r);

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "star", label: "Starred", n: markedIds(marks, "star").length },
    { id: "pin", label: "Pinned", n: markedIds(marks, "pin").length },
    { id: "mine", label: "My recipes", n: saved.length },
  ];

  return (
    <main className="app-min-h pb-32">
      <div className="safe-t px-5">
        <h1 className="font-display text-[44px] leading-none">Saved</h1>
        <p className="mt-2 text-[14px] text-ink-2">Star the ones you love. Pin the ones you cook every week — they sit at the top of Home.</p>
      </div>
      <div className="mx-5 mt-5 grid grid-cols-3 rounded-full border border-line-2 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`press rounded-full py-2 text-[13px] font-medium ${tab === t.id ? "bg-ink text-paper" : "text-ink-2"}`}
          >
            {t.label}
            {hydrated && t.n > 0 && <span className="ml-1 opacity-60 tnum">{t.n}</span>}
          </button>
        ))}
      </div>
      <div className="mt-2 px-5">
        {hydrated && list.map((r, i) => <RecipeCard key={r.id} recipe={r} index={i} />)}
      </div>
      {hydrated && list.length === 0 && (
        <div className="mx-5 mt-6 rounded-[24px] bg-paper-2 p-5 text-[14px] text-ink-2">
          {tab === "star" && (
            <p className="flex items-center gap-2">
              <Star size={18} /> Tap the star on any recipe to keep it here.
            </p>
          )}
          {tab === "pin" && (
            <p className="flex items-center gap-2">
              <Pin size={18} /> Pin your weekly dishes from the recipe page.
            </p>
          )}
          {tab === "mine" && (
            <p>
              Recipes you convert from YouTube or customise land here. <Link href="/create" className="underline underline-offset-2">Make one</Link>.
            </p>
          )}
        </div>
      )}
      <BottomNav />
    </main>
  );
}
