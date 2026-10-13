"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SEED_RECIPES } from "@/lib/recipes";
import { searchRecipes } from "@/lib/search";
import { markedIds, saveProgress, useMarks, useSavedRecipes } from "@/lib/store";
import { addDish, copyWeek, removeDish, updateDish, useFamily, usePlanWeek } from "@/lib/household";
import { dailyTarget, eats, type Member } from "@/lib/family";
import { recipeNutrition } from "@/lib/nutrition";
import { DAYS, DAY_LABEL, MEALS, MEAL_LABEL, addWeeks, dayDate, personTotals, todayDay, weekLabel, weekStart, type Day, type Meal, type Nutrients, type PlannedDish, type Slot } from "@/lib/planner";
import { useHydrated } from "@/lib/useRecipe";
import type { Recipe } from "@/lib/types";
import { BottomNav } from "./Nav";
import { DishArt } from "./DishArt";
import { HUE_BG } from "./RecipeCard";
import { Avatar } from "./FamilyView";
import { ArrowLeft, ArrowRight, Check, Close, Minus, Plus, SearchIcon, Star } from "./Icons";

export function PlanView() {
  const hydrated = useHydrated();
  const [week, setWeek] = useState(() => weekStart());
  const thisWeek = weekStart();
  const [day, setDay] = useState<Day>(() => todayDay());
  const [picker, setPicker] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<{ meal: Meal; dish: PlannedDish } | null>(null);
  const members = useFamily();
  const plan = usePlanWeek(week);
  const saved = useSavedRecipes();
  const byId = useMemo(() => new Map([...saved, ...SEED_RECIPES].map((r) => [r.id, r])), [saved]);
  const per = (id: string): Nutrients | null => {
    const r = byId.get(id);
    return r ? recipeNutrition(r).perServing : null;
  };

  const daySlots = (d: Day) => MEALS.map((m) => plan[`${d}:${m}`]).filter((s): s is Slot => !!s);
  const weekSlots = DAYS.flatMap(daySlots);
  const plannedCount = weekSlots.reduce((n, s) => n + s.dishes.length, 0);

  if (!hydrated) return <main className="app-min-h" />;

  return (
    <main className="app-min-h pb-32">
      <div className="safe-t px-5">
        <div className="flex items-end justify-between">
          <h1 className="font-display text-[44px] leading-none">Meal plan</h1>
          <Link href="/family" className="press flex -space-x-2 pb-1" aria-label="Family members">
            {members.slice(0, 4).map((m) => (
              <span key={m.id} className="rounded-full ring-2 ring-paper">
                <Avatar m={m} size={30} />
              </span>
            ))}
            <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-paper-2 ring-2 ring-paper">
              <Plus size={14} />
            </span>
          </Link>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-full border border-line-2 p-1">
          <button onClick={() => setWeek((w) => addWeeks(w, -1))} className="press grid h-9 w-9 place-items-center rounded-full" aria-label="Previous week">
            <ArrowLeft size={18} />
          </button>
          <span className="text-[14px] font-medium tnum" aria-live="polite">
            {weekLabel(week)}
            {week === thisWeek && <span className="ml-1.5 rounded-full bg-leaf-soft px-2 py-0.5 text-[11px] text-leaf">This week</span>}
          </span>
          <button onClick={() => setWeek((w) => addWeeks(w, 1))} className="press grid h-9 w-9 place-items-center rounded-full" aria-label="Next week">
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="mx-4 mt-6 rounded-[24px] bg-ink p-5 text-paper">
          <p className="font-display text-[26px] leading-tight">Who are you cooking for?</p>
          <p className="mt-2 text-[14px] text-paper/70">Add your family (kids too) and their goals. The plan then shows each person&rsquo;s calories for the day and the week.</p>
          <Link href="/family" className="press mt-4 inline-flex items-center gap-2 rounded-full bg-turmeric px-4 py-2.5 text-[14px] font-medium text-ink">
            Add family <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <WeekSummary members={members} slots={weekSlots} per={per} />
      )}

      {/* Days */}
      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Day">
        {DAYS.map((d) => {
          const date = dayDate(week, d);
          const n = daySlots(d).reduce((t, s) => t + s.dishes.length, 0);
          const isToday = week === thisWeek && d === todayDay();
          return (
            <button
              key={d}
              role="tab"
              aria-selected={day === d}
              onClick={() => setDay(d)}
              className={`press flex w-[52px] shrink-0 flex-col items-center rounded-2xl border py-2 ${day === d ? "border-ink bg-ink text-paper" : "border-line-2"}`}
            >
              <span className="text-[11px] font-medium opacity-70">{DAY_LABEL[d]}</span>
              <span className={`font-display text-[22px] leading-none tnum ${isToday && day !== d ? "text-chilli" : ""}`}>{date.getDate()}</span>
              <span className={`mt-1 h-1 w-1 rounded-full ${n ? (day === d ? "bg-turmeric" : "bg-chilli") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      <section className="mx-4 mt-4 space-y-3">
        {MEALS.map((meal) => {
          const slot = plan[`${day}:${meal}`];
          return (
            <div key={meal} className="rounded-[22px] border border-line-2 bg-card p-3.5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[22px] leading-none">{MEAL_LABEL[meal]}</h2>
                <button onClick={() => setPicker(meal)} className="press inline-flex items-center gap-1 rounded-full bg-paper-2 px-3 py-1.5 text-[13px] font-medium" aria-label={`Add dish to ${MEAL_LABEL[meal]}`}>
                  <Plus size={14} /> Add
                </button>
              </div>
              {slot?.dishes.length ? (
                <ul className="mt-3 space-y-2">
                  {slot.dishes.map((d) => {
                    const r = byId.get(d.recipeId);
                    if (!r) return null;
                    const kcal = Math.round(recipeNutrition(r).perServing.kcal);
                    const eaters = members.filter((m) => (d.portions[m.id] ?? 0) > 0);
                    return (
                      <li key={d.recipeId}>
                        <button onClick={() => setEditing({ meal, dish: d })} className="press flex w-full items-center gap-3 text-left" aria-label={`${r.name}, edit portions`}>
                          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${HUE_BG[r.hue]}`}>
                            <DishArt recipe={r} className="h-10 w-10" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium">{r.name}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
                              ≈{kcal} kcal/serving ·
                              {eaters.length ? (
                                eaters.map((m) => (
                                  <span key={m.id} className="inline-flex items-center gap-0.5">
                                    <Avatar m={m} size={14} />
                                    {d.portions[m.id] !== 1 && <span className="tnum">{fmtPortion(d.portions[m.id])}</span>}
                                  </span>
                                ))
                              ) : (
                                <span>nobody yet</span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-ink-3">Nothing planned.</p>
              )}
            </div>
          );
        })}
      </section>

      {members.length > 0 && <DayTotals members={members} slots={daySlots(day)} per={per} day={day} />}

      <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
        <Link href={`/plan/shopping?week=${week}`} className="press flex items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[14px] font-medium text-paper">
          Shopping list
        </Link>
        <button
          onClick={() => {
            if (plannedCount && !confirm("Copy last week's dishes into the empty slots of this week?")) return;
            copyWeek(addWeeks(week, -1), week);
          }}
          className="press rounded-2xl border border-line-2 bg-card py-3.5 text-[14px] font-medium"
        >
          Copy last week
        </button>
      </div>
      <p className="mx-5 mt-4 text-[12px] text-ink-3">Calories are estimates from each recipe&rsquo;s measured ingredients.</p>

      {picker && <DishPicker members={members} onClose={() => setPicker(null)} onPick={(r) => (addDish(week, day, picker, r, members), setPicker(null))} />}
      {editing && (
        <PortionSheet
          recipe={byId.get(editing.dish.recipeId)!}
          dish={editing.dish}
          members={members}
          onClose={() => setEditing(null)}
          onSave={(portions) => (updateDish(week, day, editing.meal, editing.dish.recipeId, portions), setEditing(null))}
          onRemove={() => (removeDish(week, day, editing.meal, editing.dish.recipeId), setEditing(null))}
        />
      )}
      <BottomNav />
    </main>
  );
}

const fmtPortion = (p: number) => (p === 0.5 ? "½" : p === 0.25 ? "¼" : p === 0.75 ? "¾" : p === 1.5 ? "1½" : String(p));

function Bar({ value, target }: { value: number; target: number }) {
  const pct = target ? value / target : 0;
  const tone = pct === 0 ? "bg-line-2" : pct < 0.85 ? "bg-turmeric" : pct <= 1.1 ? "bg-leaf" : "bg-chilli";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={target}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
    </div>
  );
}

function WeekSummary({ members, slots, per }: { members: Member[]; slots: Slot[]; per: (id: string) => Nutrients | null }) {
  return (
    <section className="mt-5">
      <p className="eyebrow px-5 text-ink-3">This week, per person</p>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4">
        {members.map((m) => {
          const t = dailyTarget(m);
          const week = personTotals(slots, m.id, per);
          return (
            <div key={m.id} className="w-[156px] shrink-0 rounded-[20px] border border-line-2 bg-card p-3" data-testid={`week-${m.name}`}>
              <div className="flex items-center gap-2">
                <Avatar m={m} size={26} />
                <span className="truncate text-[14px] font-medium">{m.name}</span>
              </div>
              <p className="font-display mt-2 text-[24px] leading-none tnum">{Math.round(week.kcal).toLocaleString()}</p>
              <p className="text-[11px] text-ink-3 tnum">of {(t.kcal * 7).toLocaleString()} kcal · {Math.round(week.protein)}/{t.protein * 7} g protein</p>
              <div className="mt-2">
                <Bar value={week.kcal} target={t.kcal * 7} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DayTotals({ members, slots, per, day }: { members: Member[]; slots: Slot[]; per: (id: string) => Nutrients | null; day: Day }) {
  return (
    <section className="mx-4 mt-4 rounded-[22px] bg-paper-2 p-4">
      <p className="eyebrow text-ink-3">{DAY_LABEL[day]} · per person</p>
      <ul className="mt-3 space-y-3">
        {members.map((m) => {
          const t = dailyTarget(m);
          const n = personTotals(slots, m.id, per);
          return (
            <li key={m.id} data-testid={`day-${m.name}`}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2">
                  <Avatar m={m} size={20} /> {m.name}
                </span>
                <span className="tnum text-ink-2">
                  <strong className="text-ink">{Math.round(n.kcal)}</strong> / {t.kcal} kcal · {Math.round(n.protein)} g protein
                </span>
              </div>
              <div className="mt-1.5">
                <Bar value={n.kcal} target={t.kcal} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DishPicker({ members, onClose, onPick }: { members: Member[]; onClose: () => void; onPick: (r: Recipe) => void }) {
  const [q, setQ] = useState("");
  const marks = useMarks();
  const saved = useSavedRecipes();
  const starred = useMemo(() => new Set(markedIds(marks, "star")), [marks]);
  const all = useMemo(() => [...saved, ...SEED_RECIPES], [saved]);
  const results = useMemo(() => {
    const r = searchRecipes(all, q);
    return q ? r : [...r.filter((x) => starred.has(x.id)), ...r.filter((x) => !starred.has(x.id))];
  }, [all, q, starred]);
  const someoneCantEat = (r: Recipe) => members.some((m) => !eats(m, r.diet));

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-ink/40 animate-fade" onClick={onClose} role="dialog" aria-modal="true" aria-label="Pick a dish">
      <div className="safe-b flex max-h-[88%] flex-col rounded-t-[30px] bg-paper px-4 pt-3 animate-rise" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line-2 bg-card px-3">
          <SearchIcon size={18} className="text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search dishes — starred first" aria-label="Search dishes" className="min-w-0 flex-1 bg-transparent py-3 text-[16px] focus:outline-none" />
          <button onClick={onClose} aria-label="Close" className="press p-1 text-ink-3">
            <Close size={18} />
          </button>
        </div>
        <ul className="no-scrollbar mt-2 flex-1 overflow-y-auto pb-2">
          {results.slice(0, 60).map((r) => (
            <li key={r.id}>
              <button onClick={() => onPick(r)} className="press flex w-full items-center gap-3 border-b border-line py-2.5 text-left">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${HUE_BG[r.hue]}`}>
                  <DishArt recipe={r} className="h-9 w-9" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                    {starred.has(r.id) && <Star size={13} filled className="text-turmeric" />}
                    {r.name}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    ≈{Math.round(recipeNutrition(r).perServing.kcal)} kcal/serving{someoneCantEat(r) ? " · not for everyone's diet" : ""}
                  </span>
                </span>
                <Plus size={18} className="text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PortionSheet({ recipe, dish, members, onClose, onSave, onRemove }: { recipe: Recipe; dish: PlannedDish; members: Member[]; onClose: () => void; onSave: (p: Record<string, number>) => void; onRemove: () => void }) {
  const router = useRouter();
  const [portions, setPortions] = useState<Record<string, number>>(() => ({ ...dish.portions }));
  const total = Object.values(portions).reduce((a, b) => a + b, 0);
  const n = recipeNutrition(recipe).perServing;
  const step = (id: string, d: number) => setPortions((p) => ({ ...p, [id]: Math.max(0, Math.min(4, (p[id] ?? 0) + d)) }));

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-ink/40 animate-fade" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Portions of ${recipe.name}`}>
      <div className="safe-b max-h-[90%] overflow-y-auto rounded-t-[30px] bg-paper px-5 pt-3 animate-rise" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
        <h2 className="font-display mt-4 text-[30px] leading-none">{recipe.name}</h2>
        <p className="mt-1 text-[13px] text-ink-3 tnum">
          One serving ≈ {Math.round(n.kcal)} kcal · {Math.round(n.protein)} g protein · {Math.round(n.carbs)} g carbs · {Math.round(n.fat)} g fat
        </p>
        <ul className="mt-4 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-2xl border border-line-2 bg-card px-3 py-2">
              <span className="flex items-center gap-2 text-[15px]">
                <Avatar m={m} size={28} /> {m.name}
                {!eats(m, recipe.diet) && <span className="text-[11px] text-chilli">diet</span>}
              </span>
              <span className="flex items-center gap-1">
                <button onClick={() => step(m.id, -0.25)} className="press grid h-9 w-9 place-items-center rounded-full border border-line-2" aria-label={`Less for ${m.name}`}>
                  <Minus size={16} />
                </button>
                <span className="w-16 text-center text-[14px] tnum" aria-label={`${m.name} portion`}>
                  {portions[m.id] ? `${fmtPortion(portions[m.id])} srv` : "—"}
                </span>
                <button onClick={() => step(m.id, 0.25)} className="press grid h-9 w-9 place-items-center rounded-full bg-ink text-paper" aria-label={`More for ${m.name}`}>
                  <Plus size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-ink-2 tnum">Cook {Math.ceil(total * 2) / 2} servings in total.</p>
        <div className="mt-4 grid grid-cols-[auto_1fr_1fr] gap-2 pb-2">
          <button onClick={onRemove} className="press rounded-2xl border border-line-2 px-4 text-[14px] text-chilli">
            Remove
          </button>
          <button
            onClick={() => {
              saveProgress({ recipeId: recipe.id, servings: Math.max(1, Math.ceil(total)), index: 0 });
              router.push(`/cook/${recipe.id}`);
            }}
            className="press rounded-2xl border border-line-2 bg-card py-3.5 text-[14px] font-medium"
          >
            Cook now
          </button>
          <button onClick={() => onSave(portions)} className="press flex items-center justify-center gap-1.5 rounded-2xl bg-ink py-3.5 text-[14px] font-medium text-paper">
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
