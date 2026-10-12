"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SEED_RECIPES, flattenSteps, stepNumberAt } from "@/lib/recipes";
import { aiReady, handoff, markedIds, useMarks, useProgressMap, useSavedRecipes, useSettings } from "@/lib/store";
import type { Recipe } from "@/lib/types";
import { Wordmark } from "./Wordmark";
import { RecipeCard, HUE_BG } from "./RecipeCard";
import { DishArt } from "./DishArt";
import { ArrowRight, Gear, YouTube, ChevronRight, SearchIcon, Pin } from "./Icons";
import { BottomNav } from "./Nav";
import { CuisineTiles } from "./CuisineTiles";
import { StepArt } from "./StepArt";


// The first dishes most homes cook; shown on Home before "See all".
const EVERYDAY = ["sambar", "dal-tadka", "idli", "plain-dosa", "chicken-biryani", "paneer-butter-masala", "tomato-rasam", "avial", "chana-masala", "veg-fried-rice", "curd-rice", "kerala-fish-curry"];

export function HomeView() {
  const router = useRouter();
  const saved = useSavedRecipes();
  const progress = useProgressMap();
  const settings = useSettings();
  const marks = useMarks();
  const [link, setLink] = useState("");

  const all = useMemo(() => [...saved, ...SEED_RECIPES], [saved]);

  const resume = useMemo(() => {
    const latest = Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!latest) return null;
    const recipe = all.find((r) => r.id === latest.recipeId);
    if (!recipe) return null;
    return { recipe, step: stepNumberAt(recipe, latest.index), total: flattenSteps(recipe).length };
  }, [progress, all]);

  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all]);
  const pinned = markedIds(marks, "pin").map((id) => byId.get(id)).filter((r): r is Recipe => !!r);
  const everyday = [...EVERYDAY.map((id) => byId.get(id)).filter((r): r is Recipe => !!r), ...SEED_RECIPES.filter((r) => !EVERYDAY.includes(r.id))].slice(0, 10);

  function submitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return router.push("/create");
    handoff("link", link.trim());
    router.push("/create");
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setLink(t.trim());
    } catch {
      // Clipboard permission denied — the field still accepts a normal paste.
    }
  }

  return (
    <main className="app-min-h relative pb-32">
      <header className="safe-t sticky top-0 z-20 flex items-center justify-between bg-paper/85 px-5 pb-3 backdrop-blur-md">
        <Wordmark className="text-[30px]" />
        <Link
          href="/settings"
          className="press relative grid h-10 w-10 place-items-center rounded-full border border-line-2 text-ink"
          aria-label="Settings"
        >
          <Gear />
          {aiReady(settings) && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-leaf ring-2 ring-paper" aria-label="AI connected" />}
        </Link>
      </header>

      <section className="px-5 pt-6">
        <p className="eyebrow animate-rise text-ink-3">Measured Indian cooking</p>
        <h1 className="font-display animate-rise mt-3 text-[52px] leading-[0.92] tracking-[-0.02em] text-ink [animation-delay:60ms]">
          Cook it right
          <br />
          <em className="text-chilli">the first time.</em>
        </h1>
        <p className="animate-rise mt-4 max-w-[330px] text-[15px] leading-relaxed text-ink-2 [animation-delay:120ms]">
          Every gram measured. Every stir timed. One step on screen until you tap <strong className="font-semibold text-ink">Next</strong>.
        </p>
      </section>

      <section className="px-4 pt-6">
        <Link href="/search" className="press flex items-center gap-3 rounded-2xl border border-line-2 bg-card px-4 py-3.5 text-ink-3">
          <SearchIcon size={20} />
          <span className="flex-1 whitespace-nowrap text-[15px]">Search {SEED_RECIPES.length} recipes</span>
          <span className="eyebrow hidden min-[380px]:inline">Biryani · Kids</span>
        </Link>
        <div className="mt-6 flex items-baseline justify-between px-1">
          <h2 className="font-display text-[30px] leading-none">What&rsquo;s cooking?</h2>
          <Link href="/search" className="text-[13px] text-ink-2 underline underline-offset-4">
            All {SEED_RECIPES.length}
          </Link>
        </div>
        <div className="mt-3">
          <CuisineTiles />
        </div>
      </section>

      {/* YouTube import — the main way in */}
      <section className="animate-rise px-4 pt-7 [animation-delay:180ms]">
        <div className="relative overflow-hidden rounded-[28px] bg-ink p-5 pb-4 text-paper">
          <div className="pointer-events-none absolute -right-8 -top-6 h-[150px] w-[180px] opacity-[0.16] invert">
            <StepArt kind="pressure" equipment="pressure_cooker" className="h-full w-full" />
          </div>
          <p className="eyebrow inline-flex items-center gap-2 text-paper/60">
            <YouTube size={16} className="text-chilli" /> From YouTube
          </p>
          <h2 className="font-display mt-3 max-w-[270px] text-[30px] leading-[1.02]">
            Paste a recipe video. <em className="text-turmeric">Get measured steps.</em>
          </h2>
          <form onSubmit={submitLink} className="mt-5 flex items-center gap-2 rounded-2xl bg-paper/10 p-1.5 pl-4 ring-1 ring-paper/15 focus-within:ring-paper/40">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              placeholder="youtube.com/watch?v=…"
              aria-label="YouTube link"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-paper placeholder:text-paper/40 focus:outline-none"
            />
            {!link && (
              <button type="button" onClick={paste} className="press rounded-xl px-3 py-2.5 text-[13px] font-medium text-paper/80">
                Paste
              </button>
            )}
            <button
              type="submit"
              aria-label="Convert"
              className="press grid h-11 w-11 place-items-center rounded-xl bg-turmeric text-ink"
            >
              <ArrowRight />
            </button>
          </form>
          <Link href="/create" className="press mt-3 inline-flex items-center gap-1 py-1 text-[13px] text-paper/70">
            No link? Describe a dish instead <ChevronRight size={14} />
          </Link>
        </div>
      </section>

      {resume && (
        <section className="px-4 pt-4">
          <Link
            href={`/cook/${resume.recipe.id}`}
            className="press flex items-center gap-4 rounded-[22px] border border-line-2 bg-card p-3 pr-4"
          >
            <div className={`grid h-14 w-14 place-items-center rounded-2xl ${HUE_BG[resume.recipe.hue]}`}>
              <DishArt recipe={resume.recipe} className="h-11 w-11" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-chilli">Still cooking</p>
              <p className="font-display truncate text-[21px] leading-tight">{resume.recipe.name}</p>
              <p className="text-[12px] text-ink-3 tnum">
                Step {resume.step} of {resume.total}
              </p>
            </div>
            <span className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper">Resume</span>
          </Link>
        </section>
      )}

      {pinned.length > 0 && (
        <section className="pt-10">
          <div className="flex items-baseline justify-between px-5">
            <h2 className="font-display flex items-center gap-2 text-[30px] leading-none">
              <Pin size={20} filled className="text-chilli" /> Pinned
            </h2>
            <Link href="/saved" className="text-[13px] text-ink-2 underline underline-offset-4">
              All saved
            </Link>
          </div>
          <div className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
            {pinned.map((r) => (
              <Link key={r.id} href={`/recipe/${r.id}`} className="press w-[150px] shrink-0 snap-start rounded-[22px] border border-line bg-card p-3">
                <div className={`grid h-[96px] place-items-center rounded-2xl ${HUE_BG[r.hue]}`}>
                  <DishArt recipe={r} className="h-[76px] w-[76px]" />
                </div>
                <p className="font-display mt-2 line-clamp-2 text-[19px] leading-[1.05]">{r.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section className="pt-10">
          <div className="flex items-baseline justify-between px-5">
            <h2 className="font-display text-[30px] leading-none">Your recipes</h2>
            <span className="eyebrow text-ink-3 tnum">{saved.length}</span>
          </div>
          <div className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
            {saved.map((r) => (
              <Link
                key={r.id}
                href={`/recipe/${r.id}`}
                className="press w-[172px] shrink-0 snap-start rounded-[22px] border border-line bg-card p-3"
              >
                <div className={`grid h-[110px] place-items-center rounded-2xl ${HUE_BG[r.hue]}`}>
                  <DishArt recipe={r} className="h-[86px] w-[86px]" />
                </div>
                <p className="eyebrow mt-3 truncate text-ink-3">
                  {r.source?.kind === "youtube" ? "From YouTube" : r.variant?.length ? r.variant.join(" · ") : "Made with AI"}
                </p>
                <p className="font-display mt-1 line-clamp-2 text-[20px] leading-[1.05]">{r.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="pt-10">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="font-display text-[30px] leading-none">Everyday favourites</h2>
          <Link href="/search" className="text-[13px] text-ink-2 underline underline-offset-4">
            See all {SEED_RECIPES.length}
          </Link>
        </div>
        <div className="mt-3 px-5">
          {everyday.map((r, i) => (
            <RecipeCard key={r.id} recipe={r} index={i} />
          ))}
        </div>
        <div className="px-5 pt-2">
          <Link href="/search" className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-line-2 py-3.5 text-[14px] font-medium">
            Browse all {SEED_RECIPES.length} recipes <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[28px] bg-paper-2 p-5">
        <p className="eyebrow text-ink-3">How it works</p>
        <ol className="mt-4 space-y-5">
          {[
            ["Measure", "Every ingredient in grams, millilitres or spoons. No “a little of this”."],
            ["Tap next", "One action per screen. Timers for stirring, waiting and whistles."],
            ["Eat", "The same taste every time, whether it's your first try or fiftieth."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="font-display w-7 shrink-0 text-[30px] leading-none text-chilli">{i + 1}</span>
              <div>
                <p className="font-display text-[22px] leading-none">{t}</p>
                <p className="mt-1 text-[14px] leading-snug text-ink-2">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="px-5 pt-10 text-[12px] text-ink-3">
        <Wordmark className="text-[22px]" />
        <p className="mt-2">
          <em>Adukala</em> is Malayalam for kitchen. Made for people who&rsquo;ve never cooked, and the people who feed them.
        </p>
      </footer>
      <BottomNav />
    </main>
  );
}
