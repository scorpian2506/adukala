"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SEED_RECIPES } from "@/lib/recipes";
import { FACETS, searchRecipes, type Facet } from "@/lib/search";
import { handoff, useSavedRecipes } from "@/lib/store";
import { RecipeCard } from "./RecipeCard";
import { BottomNav } from "./Nav";
import { Close, SearchIcon, YouTube } from "./Icons";

export function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const saved = useSavedRecipes();
  // The URL is the single source of truth. Next keeps this page alive in the
  // background, so local copies of the filters would go stale when a different
  // cuisine tile links here.
  const fParam = params.get("f") ?? "";
  const facets = useMemo(() => fParam.split(",").filter((f): f is Facet => FACETS.some((x) => x.id === f)), [fParam]);
  const urlQ = params.get("q") ?? "";
  // The text box keeps its own state so typing stays smooth; it follows the URL when the URL changes from outside.
  const [q, setQ] = useState(urlQ);
  const typed = useRef(urlQ);
  useEffect(() => {
    if (urlQ !== typed.current) {
      typed.current = urlQ;
      setQ(urlQ);
    }
  }, [urlQ]);
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLimit(30);
  }, [fParam, urlQ]);

  const all = useMemo(() => [...saved, ...SEED_RECIPES], [saved]);
  const results = useMemo(() => searchRecipes(all, q, facets), [all, q, facets]);

  function sync(nextQ: string, nextF: Facet[]) {
    typed.current = nextQ;
    const sp = new URLSearchParams();
    if (nextQ) sp.set("q", nextQ);
    if (nextF.length) sp.set("f", nextF.join(","));
    router.replace(`/search${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }

  function toggle(f: Facet) {
    const next = facets.includes(f) ? facets.filter((x) => x !== f) : [...facets, f];
    sync(q, next);
  }

  return (
    <main className="app-min-h pb-32">
      <div className="safe-t sticky top-0 z-20 bg-paper/92 px-4 pb-3 backdrop-blur-md">
        <h1 className="font-display px-1 text-[36px] leading-none">Search</h1>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line-2 bg-card px-3 focus-within:border-ink/50">
          <SearchIcon size={19} className="shrink-0 text-ink-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              sync(e.target.value, facets);
            }}
            autoFocus
            type="search"
            enterKeyHint="search"
            placeholder="Biryani, sambar, paneer, kids…"
            aria-label="Search recipes"
            className="min-w-0 flex-1 bg-transparent py-3 text-[16px] placeholder:text-ink-3 focus:outline-none"
          />
          {q && (
            <button onClick={() => (setQ(""), sync("", facets))} aria-label="Clear search" className="press p-1 text-ink-3">
              <Close size={18} />
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {FACETS.map((f) => {
            const on = facets.includes(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                aria-pressed={on}
                className={`press shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${on ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2"}`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="eyebrow px-5 pt-2 text-ink-3 tnum" aria-live="polite">
        {results.length} {results.length === 1 ? "recipe" : "recipes"}
      </p>

      <div className="px-5">
        {results.slice(0, limit).map((r, i) => (
          <RecipeCard key={r.id} recipe={r} index={i} />
        ))}
      </div>
      {results.length > limit && (
        <div className="px-5 pt-2">
          <button onClick={() => setLimit((l) => l + 30)} className="press w-full rounded-2xl border border-line-2 py-3 text-[14px] font-medium">
            Show more ({results.length - limit} left)
          </button>
        </div>
      )}

      {results.length === 0 && (
        <div className="mx-4 mt-6 rounded-[24px] bg-paper-2 p-5">
          <p className="font-display text-[26px] leading-tight">Not in the book yet.</p>
          <p className="mt-2 text-[14px] text-ink-2">Find it on YouTube and Adukala will measure it for you.</p>
          <button
            onClick={() => {
              handoff("link", q);
              router.push("/create");
            }}
            className="press mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-paper"
          >
            <YouTube size={18} className="text-chilli" /> Search YouTube for “{q || "this"}”
          </button>
          {facets.length > 0 && (
            <button onClick={() => sync(q, [])} className="press ml-3 text-[13px] text-ink-2 underline underline-offset-4">
              Clear filters
            </button>
          )}
        </div>
      )}
      <p className="px-5 pt-8 text-center text-[12px] text-ink-3">
        Can&rsquo;t find a dish? <Link href="/create" className="underline underline-offset-2">Paste a YouTube link</Link>.
      </p>
      <BottomNav />
    </main>
  );
}
