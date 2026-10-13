"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CUSTOMISATIONS,
  OFFLINE_CUSTOMISATIONS,
  applyOfflineTweaks,
  flattenSteps,
  stepNumberAt,
  type CustomisationId,
} from "@/lib/recipes";
import { aiHeaders, aiReady, deleteRecipe, getProgress, isMarked, saveProgress, saveRecipe, toggleMark, useMarks, useSettings } from "@/lib/store";
import { useRecipe } from "@/lib/useRecipe";
import { EQUIPMENT_LABEL, KIND_LABEL, REGION_LABEL, formatQty, totalMinutes } from "@/lib/format";
import type { Ingredient, Recipe } from "@/lib/types";
import { recipeNutrition } from "@/lib/nutrition";
import { addDish, useFamily } from "@/lib/household";
import { DAYS, DAY_LABEL, MEALS, MEAL_LABEL, dayDate, todayDay, weekStart, type Day } from "@/lib/planner";
import { DishArt } from "./DishArt";
import { Dots, HUE_BG } from "./RecipeCard";
import { ArrowRight, Check, Minus, Plus, Pin, Star, Trash, YouTube } from "./Icons";
import { TopBar } from "./Nav";
import { Loading, NotFound } from "./States";
import { CookingLoader } from "./CookingLoader";

const GROUP_LABEL: Record<NonNullable<Ingredient["group"]>, string> = {
  main: "Main",
  liquid: "Liquids",
  spice: "Spices",
  tempering: "For the tempering",
  garnish: "To finish",
};

export function RecipeView({ id }: { id: string }) {
  const { recipe, ready } = useRecipe(id);
  if (!ready) return <Loading />;
  if (!recipe) return <NotFound />;
  return <RecipeDetail key={recipe.id} recipe={recipe} />;
}

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const settings = useSettings();
  const marks = useMarks();
  const starred = isMarked(marks, "star", recipe.id);
  const pinned = isMarked(marks, "pin", recipe.id);
  const [servings, setServings] = useState(() => getProgress(recipe.id)?.servings ?? recipe.servings);
  const [mods, setMods] = useState<CustomisationId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const factor = servings / recipe.servings;
  const steps = flattenSteps(recipe);
  const progress = getProgress(recipe.id);
  const isSaved = recipe.source?.kind !== "seed" || !!recipe.variant?.length;

  // Imported recipes keep the creator's own sections ("For the masala paste").
  const bySection = recipe.ingredients.some((i) => i.section);
  const groupList: { label: string; items: Ingredient[] }[] = [];
  for (const ing of recipe.ingredients) {
    const label = bySection ? (ing.section ?? "Other") : GROUP_LABEL[ing.group ?? "main"];
    const g = groupList.find((x) => x.label === label) ?? groupList[groupList.push({ label, items: [] }) - 1];
    g.items.push(ing);
  }
  if (!bySection) {
    const order = Object.values(GROUP_LABEL);
    groupList.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }

  const needsAI = mods.some((m) => !OFFLINE_CUSTOMISATIONS.includes(m));

  function toggle(m: CustomisationId) {
    setError(null);
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function makeVersion() {
    if (!mods.length) return;
    setError(null);
    if (!needsAI) {
      const v = applyOfflineTweaks(recipe, mods);
      saveRecipe(v);
      router.push(`/recipe/${v.id}`);
      return;
    }
    if (!aiReady(settings)) {
      setError("key");
      return;
    }
    setBusy(true);
    try {
      const labels = CUSTOMISATIONS.filter((c) => mods.includes(c.id)).map((c) => `${c.label} (${c.hint})`);
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({ recipe, customisations: labels, servings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      const v: Recipe = data.recipe;
      saveRecipe(v);
      router.push(`/recipe/${v.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  function start(fresh: boolean) {
    if (fresh || !progress) saveProgress({ recipeId: recipe.id, servings, index: 0 });
    else saveProgress({ ...progress, servings });
    router.push(`/cook/${recipe.id}`);
  }

  if (busy) return <CookingLoader title={`Making your ${recipe.name}`} lines={["Reading the recipe", "Adjusting every quantity", "Re-timing the steps", "Checking it still tastes right"]} />;

  return (
    <main className="app-min-h relative pb-36">
      <div className={`relative ${HUE_BG[recipe.hue]} rounded-b-[36px] px-5 pb-8`}>
        <TopBar
          tone="glass"
          right={
            <>
              <button
                onClick={() => toggleMark("star", recipe.id)}
                aria-pressed={starred}
                aria-label={starred ? "Unstar" : "Star"}
                className={`press grid h-10 w-10 place-items-center rounded-full bg-card/70 ${starred ? "text-turmeric" : ""}`}
              >
                <Star size={19} filled={starred} />
              </button>
              <button
                onClick={() => toggleMark("pin", recipe.id)}
                aria-pressed={pinned}
                aria-label={pinned ? "Unpin from Home" : "Pin to Home"}
                className={`press grid h-10 w-10 place-items-center rounded-full bg-card/70 ${pinned ? "text-chilli" : ""}`}
              >
                <Pin size={19} filled={pinned} />
              </button>
              {isSaved && (
                <button
                  onClick={() => {
                    if (confirm("Delete this recipe?")) {
                      deleteRecipe(recipe.id);
                      router.replace("/");
                    }
                  }}
                  className="press grid h-10 w-10 place-items-center rounded-full bg-card/70"
                  aria-label="Delete recipe"
                >
                  <Trash size={18} />
                </button>
              )}
            </>
          }
        />
        <p className="eyebrow mt-3 text-center text-ink/60">
          {recipe.cuisine === "kerala" ? "Kerala" : recipe.cuisine === "tamil" ? "Tamil Nadu" : REGION_LABEL[recipe.region]}
          {recipe.kidFriendly ? " · Kid friendly" : ""}
        </p>
        <div className="mt-2 flex justify-center">
          <DishArt recipe={recipe} className="h-[190px] w-[190px] animate-rise" />
        </div>
        {recipe.variant?.length ? (
          <p className="eyebrow mt-2 text-center text-ink/70">Your version · {recipe.variant.join(" · ")}</p>
        ) : null}
        <h1 className="font-display mt-2 text-center text-[46px] leading-[0.95] text-ink">{recipe.name}</h1>
        {recipe.native && <p className="mt-1 text-center text-[15px] italic text-ink/60">{recipe.native}</p>}
        <p className="mx-auto mt-3 max-w-[320px] text-center text-[15px] leading-snug text-ink/80">{recipe.blurb}</p>
        {recipe.source?.url && (
          <a href={recipe.source.url} target="_blank" rel="noreferrer" className="press mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-card/70 px-3 py-1.5 text-[12px]">
            <YouTube size={16} className="text-chilli" />
            <span className="max-w-[230px] truncate">{recipe.source.channel || recipe.source.title || "Watch the video"}</span>
          </a>
        )}
      </div>

      {(recipe.method === "rules" || recipe.warnings?.length) && (
        <div className="mx-5 mt-6 rounded-2xl border border-turmeric/60 bg-turmeric-soft/30 p-4 text-[13px] leading-snug text-ink-2">
          <p className="eyebrow mb-1.5 text-ink">{recipe.method === "rules" ? "Converted without AI" : "Worth a check"}</p>
          {recipe.method === "rules" && <p>Amounts come straight from the creator&rsquo;s written recipe. Steps were split by rules, so glance through them once.</p>}
          {recipe.warnings?.map((w) => (
            <p key={w} className="mt-1.5">
              {w}
            </p>
          ))}
        </div>
      )}

      {recipe.source?.refs?.length ? (
        <div className="mx-5 mt-6 rounded-2xl border border-line-2 bg-card p-4">
          <p className="eyebrow text-ink-3">Measurements checked against</p>
          <ul className="mt-2 space-y-1.5">
            {recipe.source.refs.slice(0, 4).map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer" className="text-[13px] text-ink underline decoration-line-2 underline-offset-4">
                  {r.title || new URL(r.url).hostname.replace(/^www\./, "")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="mx-5 mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line">
        <Stat label="Total" value={`${totalMinutes(recipe)} min`} />
        <Stat label="Level" value={<Dots n={recipe.level} label="Level" />} />
        <Stat label="Heat" value={<Dots n={recipe.spice} label="Spice" />} />
      </dl>

      <NutritionCard recipe={recipe} />

      {/* Servings */}
      <section className="mx-5 mt-8 flex items-center justify-between">
        <div>
          <h2 className="font-display text-[28px] leading-none">Cooking for</h2>
          <p className="mt-1 text-[13px] text-ink-3">Every quantity rescales.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-line-2 p-1">
          <button onClick={() => setServings((s) => Math.max(1, s - 1))} className="press grid h-10 w-10 place-items-center rounded-full" aria-label="Fewer people">
            <Minus />
          </button>
          <span className="font-display w-16 text-center text-[26px] leading-none tnum">
            {servings}
            <span className="ml-1 font-sans text-[12px] text-ink-3">{servings === 1 ? "person" : "people"}</span>
          </span>
          <button onClick={() => setServings((s) => Math.min(12, s + 1))} className="press grid h-10 w-10 place-items-center rounded-full bg-ink text-paper" aria-label="More people">
            <Plus />
          </button>
        </div>
      </section>

      {/* Customise */}
      <section className="mt-8">
        <div className="px-5">
          <h2 className="font-display text-[28px] leading-none">Make it yours</h2>
          <p className="mt-1 text-[13px] text-ink-3">Pick any. We rewrite the quantities and steps.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 px-5">
          {CUSTOMISATIONS.map((c) => {
            const on = mods.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] ${on ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2"}`}
              >
                {on && <Check size={14} />}
                {c.label}
              </button>
            );
          })}
        </div>
        {mods.length > 0 && (
          <div className="mx-5 mt-4 animate-rise rounded-2xl bg-paper-2 p-4">
            <p className="text-[13px] leading-snug text-ink-2">
              {CUSTOMISATIONS.filter((c) => mods.includes(c.id))
                .map((c) => c.hint)
                .join(". ")}
              .
            </p>
            {error === "key" ? (
              <p className="mt-3 text-[13px] text-chilli">
                {`High protein, low carb, Jain, vegan and diabetic need AI to rewrite the recipe. `}
                <Link href="/settings" className="underline underline-offset-2">
                  Connect a free AI
                </Link>
                {` (Gemini or Groq), or pick only Low oil, Less spicy or Kid friendly.`}
              </p>
            ) : error ? (
              <p className="mt-3 text-[13px] text-chilli">{error}</p>
            ) : null}
            <button onClick={makeVersion} className="press mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-paper">
              Make my version <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>

      {/* Equipment */}
      <section className="mt-9 px-5">
        <h2 className="font-display text-[28px] leading-none">You&rsquo;ll need</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {recipe.equipment.map((e) => (
            <span key={e} className="rounded-full bg-paper-2 px-3 py-1.5 text-[13px] text-ink-2">
              {EQUIPMENT_LABEL[e]}
            </span>
          ))}
          <Link href="/guide" className="press rounded-full border border-dashed border-line-2 px-3 py-1.5 text-[13px] text-ink-2">
            Spoons &amp; cups guide →
          </Link>
        </div>
      </section>

      {/* Ingredients */}
      <section className="mt-9 px-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[28px] leading-none">Ingredients</h2>
          <span className="eyebrow text-ink-3 tnum">For {servings}</span>
        </div>
        {groupList.map((g) => (
          <div key={g.label} className="mt-5">
            <p className="eyebrow text-ink-3">{g.label}</p>
            <ul className="mt-1">
              {g.items.map((ing) => (
                <li key={ing.id} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink">
                      {ing.name}
                      {ing.estimated && <span className="ml-1.5 rounded bg-turmeric-soft px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-ink-2">est.</span>}
                    </p>
                    {(ing.native || ing.approx) && (
                      <p className="mt-0.5 text-[12px] text-ink-3">{[ing.native, ing.approx].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[14px] text-ink tnum">{formatQty(ing.qty * factor, ing.unit)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Steps preview */}
      <section className="mt-9 px-5">
        <button onClick={() => setShowSteps((s) => !s)} className="press flex w-full items-baseline justify-between">
          <h2 className="font-display text-[28px] leading-none">The steps</h2>
          <span className="text-[13px] text-ink-2 underline underline-offset-4">{showSteps ? "Hide" : `Preview all ${steps.length}`}</span>
        </button>
        <p className="mt-1 text-[13px] text-ink-3">
          {recipe.prep.length} to get ready · {recipe.cook.length} at the stove
        </p>
        {showSteps && (
          <ol className="mt-4 animate-fade">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 border-b border-line py-2.5">
                <span className="w-6 shrink-0 font-mono text-[12px] text-ink-3 tnum">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[14px] text-ink">{s.title}</p>
                  <p className="eyebrow mt-0.5 text-ink-3">
                    {s.phase === "prep" ? "Prep" : "Cook"} · {KIND_LABEL[s.kind]}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {recipe.serveWith && (
          <p className="mt-6 rounded-2xl bg-paper-2 p-4 text-[14px] text-ink-2">
            <span className="eyebrow mb-1 block text-ink-3">Serve with</span>
            {recipe.serveWith}
          </p>
        )}
      </section>

      <div className="safe-b fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pt-8">
        {progress && progress.index > 0 ? (
          <div className="flex gap-2">
            <button onClick={() => start(true)} className="press rounded-[20px] border border-line-2 bg-card px-5 text-[14px] font-medium">
              Restart
            </button>
            <button onClick={() => start(false)} className="press flex flex-1 items-center justify-between rounded-[20px] bg-ink px-6 py-5 text-paper">
              <span className="text-[17px] font-medium">Resume · step {stepNumberAt(recipe, progress.index)}</span>
              <ArrowRight />
            </button>
          </div>
        ) : (
          <button onClick={() => start(true)} className="press flex w-full items-center justify-between rounded-[20px] bg-ink px-6 py-5 text-paper">
            <span className="text-left">
              <span className="block text-[17px] font-medium">Start cooking</span>
              <span className="block text-[12px] text-paper/60">
                {steps.length} steps · about {totalMinutes(recipe)} min
              </span>
            </span>
            <ArrowRight />
          </button>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-3">
      <dt className="eyebrow text-ink-3">{label}</dt>
      <dd className="text-[15px] font-medium tnum">{value}</dd>
    </div>
  );
}

function NutritionCard({ recipe }: { recipe: Recipe }) {
  const n = recipeNutrition(recipe).perServing;
  const members = useFamily();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [day, setDay] = useState<Day>(() => todayDay());
  const week = weekStart();
  return (
    <section className="mx-5 mt-4 rounded-2xl border border-line-2 bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow text-ink-3">Per serving · estimate</p>
        <p className="font-display text-[26px] leading-none tnum">≈{Math.round(n.kcal)} kcal</p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px] text-ink-2">
        {(
          [
            ["Protein", n.protein],
            ["Carbs", n.carbs],
            ["Fat", n.fat],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-paper-2 py-2">
            <dd className="text-[16px] font-semibold text-ink tnum">{Math.round(v)} g</dd>
            <dt>{k}</dt>
          </div>
        ))}
      </dl>
      {done ? (
        <p className="mt-3 flex items-center justify-between rounded-xl bg-leaf-soft/60 px-3 py-2.5 text-[13px]" role="status">
          Added to {done}.
          <Link href="/plan" className="font-medium underline underline-offset-2">
            Open plan
          </Link>
        </p>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="press mt-3 w-full rounded-xl border border-line-2 py-2.5 text-[14px] font-medium">
          + Add to meal plan
        </button>
      ) : (
        <div className="mt-3">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Day">
            {DAYS.map((d) => (
              <button key={d} role="radio" aria-checked={day === d} onClick={() => setDay(d)} className={`press shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${day === d ? "border-ink bg-ink text-paper" : "border-line-2"}`}>
                {DAY_LABEL[d]} {dayDate(week, d).getDate()}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {MEALS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  addDish(week, day, m, recipe, members);
                  setDone(`${DAY_LABEL[day]} ${MEAL_LABEL[m].toLowerCase()}`);
                  setOpen(false);
                }}
                className="press rounded-xl bg-paper-2 py-2.5 text-[13px] font-medium"
              >
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
