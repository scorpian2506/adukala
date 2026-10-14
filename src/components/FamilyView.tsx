"use client";

import { useState } from "react";
import { ACTIVITY, CHILD_GOALS, GOALS, bmi, calorieTable, dailyTarget, needsBody, newMemberId, rateOf, usualTweaks, type Member } from "@/lib/family";
import { CUSTOMISATIONS, OFFLINE_CUSTOMISATIONS, type CustomisationId } from "@/lib/tweaks";
import { deleteMember, nextColor, saveMember, useFamily } from "@/lib/household";
import { useHydrated } from "@/lib/useRecipe";
import { useAccount } from "@/lib/account";
import { TopBar } from "./Nav";
import { Check, Plus, Trash, User } from "./Icons";

export function Avatar({ m, size = 40 }: { m: Pick<Member, "name" | "color">; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: m.color, fontSize: size * 0.42 }} aria-hidden>
      {m.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function FamilyView() {
  const members = useFamily();
  const hydrated = useHydrated();
  const acct = useAccount();
  const [editing, setEditing] = useState<Member | null>(null);

  function blank(kind: Member["kind"]): Member {
    return { id: newMemberId(), name: "", kind, age: kind === "child" ? 6 : 30, sex: "female", activity: kind === "child" ? "moderate" : "light", goal: "maintain", diet: "nonveg", color: nextColor(members) };
  }

  return (
    <main className="app-min-h pb-16">
      <header className="px-4 pb-2">
        <TopBar />
      </header>
      <div className="px-5">
        <h1 className="font-display text-[44px] leading-none">Family</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          Everyone you cook for — including little ones without a login. Their goals set the daily calorie targets in your meal plan.
          {acct.status !== "in" && " Sign in on the Me tab to share this with your household."}
        </p>
      </div>

      <ul className="mx-4 mt-6 space-y-2">
        {hydrated &&
          members.map((m) => {
            const t = dailyTarget(m);
            return (
              <li key={m.id}>
                <button onClick={() => setEditing(m)} className="press flex w-full items-center gap-3 rounded-[22px] border border-line-2 bg-card p-3.5 text-left">
                  <Avatar m={m} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-medium">
                      {m.name} {m.username && <span className="text-[12px] font-normal text-ink-3">@{m.username}</span>}
                    </span>
                    <span className="block text-[12px] text-ink-3">
                      {m.kind === "child" ? `Child · ${m.age} yrs${m.goal !== "maintain" ? ` · ${goalLabel(m)}` : ""}` : `${goalLabel(m)} · ${m.age} yrs`} · {m.diet === "veg" ? "Veg" : m.diet === "egg" ? "Eggetarian" : "Non-veg"}
                    </span>
                    {needsBody(m) && <span className="mt-1 inline-block rounded-full bg-turmeric-soft px-2 py-0.5 text-[11px] font-medium text-ink">Add height &amp; weight</span>}
                  </span>
                  <span className="text-right">
                    <span className="font-display block text-[22px] leading-none tnum">{t.kcal}</span>
                    <span className="text-[11px] text-ink-3">kcal/day</span>
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
      {hydrated && members.length === 0 && (
        <div className="mx-4 mt-2 rounded-[22px] bg-paper-2 p-5 text-[14px] text-ink-2">
          <User size={22} />
          <p className="mt-2">Add yourself first, then everyone else at the table.</p>
        </div>
      )}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => setEditing(blank("adult"))} className="press flex items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[14px] font-medium text-paper">
          <Plus size={16} /> Add adult
        </button>
        <button onClick={() => setEditing(blank("child"))} className="press flex items-center justify-center gap-2 rounded-2xl border border-line-2 bg-card py-3.5 text-[14px] font-medium">
          <Plus size={16} /> Add child
        </button>
      </div>
      <p className="mx-5 mt-6 text-[12px] leading-relaxed text-ink-3">
        Targets are estimates (Mifflin–St Jeor for adults, ICMR-NIN guidance for children). Not medical advice — check with a doctor or dietitian for health conditions, pregnancy or big weight changes.
      </p>
      {editing && <MemberSheet member={editing} isNew={!members.some((m) => m.id === editing.id)} onClose={() => setEditing(null)} />}
    </main>
  );
}

function goalLabel(m: Member) {
  if (m.kind === "child") return CHILD_GOALS.find((g) => g.id === m.goal)?.label ?? "";
  const r = rateOf(m);
  const pace = r === 0.25 ? "¼" : r === 0.5 ? "½" : String(r);
  if (m.goal === "lose") return `Lose ${pace} kg/wk`;
  if (m.goal === "gain") return `Gain ${pace} kg/wk`;
  return GOALS.find((g) => g.id === m.goal)?.label ?? "";
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-1 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`press rounded-full border px-3 py-1.5 text-[13px] ${value === o.id ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MemberSheet({ member, isNew, onClose }: { member: Member; isNew: boolean; onClose: () => void }) {
  const [m, setM] = useState<Member>(member);
  const set = <K extends keyof Member>(k: K, v: Member[K]) => setM((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v)));
  const t = dailyTarget(m);
  const child = m.kind === "child";
  const missingBody = !child && (!m.heightCm || !m.weightKg);
  const body = bmi(m);
  const table = child || !missingBody ? calorieTable(m) : [];
  const tweaks = usualTweaks(m);
  const toggleTweak = (id: CustomisationId) => set("tweaks", tweaks.includes(id) ? tweaks.filter((x) => x !== id) : [...tweaks, id]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-ink/40 animate-fade" onClick={onClose} role="dialog" aria-modal="true" aria-label={isNew ? "Add family member" : `Edit ${member.name}`}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.name.trim() || missingBody) return;
          saveMember({ ...m, name: m.name.trim(), goal: child && !table.some((r) => r.goal === m.goal) ? "maintain" : m.goal, rateKg: child ? undefined : m.rateKg });
          onClose();
        }}
        className="safe-b max-h-[92%] overflow-y-auto rounded-t-[30px] bg-paper px-5 pt-3 animate-rise"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
        <h2 className="font-display mt-4 text-[30px] leading-none">{isNew ? (child ? "Add a child" : "Add an adult") : member.name}</h2>

        <label className="mt-5 block text-[13px] font-medium text-ink-2">
          Name
          <input value={m.name} onChange={(e) => set("name", e.target.value)} required maxLength={30} aria-label="Name" className="mt-1 w-full rounded-2xl border border-line-2 bg-card px-3 py-3 text-[16px] focus:border-ink/50 focus:outline-none" />
        </label>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <label className="text-[13px] font-medium text-ink-2">
            Age
            <input inputMode="numeric" value={m.age || ""} onChange={(e) => set("age", Math.min(110, num(e.target.value) ?? 0))} aria-label="Age" className="mt-1 w-full rounded-2xl border border-line-2 bg-card px-3 py-3 text-[16px] focus:outline-none" />
          </label>
          <label className="text-[13px] font-medium text-ink-2">
            Height cm
            <input inputMode="numeric" value={m.heightCm ?? ""} onChange={(e) => set("heightCm", num(e.target.value))} aria-label="Height in cm" placeholder={child ? "opt." : ""} className="mt-1 w-full rounded-2xl border border-line-2 bg-card px-3 py-3 text-[16px] focus:outline-none" />
          </label>
          <label className="text-[13px] font-medium text-ink-2">
            Weight kg
            <input inputMode="decimal" value={m.weightKg ?? ""} onChange={(e) => set("weightKg", num(e.target.value))} aria-label="Weight in kg" placeholder={child ? "opt." : ""} className="mt-1 w-full rounded-2xl border border-line-2 bg-card px-3 py-3 text-[16px] focus:outline-none" />
          </label>
        </div>
        {missingBody && <p className="mt-2 text-[12px] text-chilli">Height and weight are needed to work out calories for an adult.</p>}
        {body && (
          <p className="mt-2 text-[12px] text-ink-3 tnum">
            BMI {body.value} ·{" "}
            {body.label && body.healthy ? (
              <>
                <span className={body.label === "Healthy" ? "text-leaf" : "text-chilli"}>{body.label}</span> · healthy weight for this height {body.healthy[0]}–{body.healthy[1]} kg
              </>
            ) : (
              "for children this is read on an age chart; ask your paediatrician whether it’s in range"
            )}
          </p>
        )}

        <p className="mt-4 text-[13px] font-medium text-ink-2">Sex</p>
        <Seg label="Sex" value={m.sex} onChange={(v) => set("sex", v)} options={[{ id: "female", label: child ? "Girl" : "Female" }, { id: "male", label: child ? "Boy" : "Male" }]} />

        <p className="mt-4 text-[13px] font-medium text-ink-2">Eats</p>
        <Seg label="Diet" value={m.diet} onChange={(v) => set("diet", v)} options={[{ id: "veg", label: "Veg" }, { id: "egg", label: "Veg + egg" }, { id: "nonveg", label: "Non-veg" }]} />

        {child && table.length > 1 && (
          <>
            <p className="mt-4 text-[13px] font-medium text-ink-2">Goal · calories a day</p>
            <div role="radiogroup" aria-label="Goal" className="mt-1 overflow-hidden rounded-2xl border border-line-2 bg-card">
              {table.map((row) => {
                const on = m.goal === row.goal;
                return (
                  <button
                    key={row.label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setM((x) => ({ ...x, goal: row.goal, rateKg: undefined }))}
                    className={`press flex w-full items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 ${on ? "bg-ink text-paper" : ""}`}
                  >
                    <span>
                      <span className="block text-[14px]">{row.label}</span>
                      <span className={`block text-[11px] ${on ? "text-paper/60" : "text-ink-3"}`}>{CHILD_GOALS.find((g) => g.id === row.goal)?.hint}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[13px] tnum">
                      {row.kcal.toLocaleString("en-IN")} kcal <span className={on ? "text-paper/60" : "text-ink-3"}>{row.pct}%</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3">Children shouldn&rsquo;t diet. &ldquo;Keep weight steady&rdquo; trims a little so they grow into their weight; protein is never cut. Check with your paediatrician first.</p>
          </>
        )}

        {!child && (
          <>
            <p className="mt-4 text-[13px] font-medium text-ink-2">Activity</p>
            <Seg label="Activity" value={m.activity} onChange={(v) => set("activity", v)} options={ACTIVITY.map((a) => ({ id: a.id, label: a.label }))} />
            <p className="mt-1 text-[12px] text-ink-3">{ACTIVITY.find((a) => a.id === m.activity)?.hint}</p>

            <p className="mt-4 text-[13px] font-medium text-ink-2">Goal · calories a day</p>
            {table.length ? (
              <div role="radiogroup" aria-label="Goal" className="mt-1 overflow-hidden rounded-2xl border border-line-2 bg-card">
                {table.map((row) => {
                  const on = m.goal === row.goal && (row.goal === "maintain" || rateOf(m) === row.rateKg);
                  return (
                    <button
                      key={row.label}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setM((x) => ({ ...x, goal: row.goal, rateKg: row.rateKg || undefined, tweaks: x.tweaks }))}
                      className={`press flex w-full items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 ${on ? "bg-ink text-paper" : ""}`}
                    >
                      <span className="text-[14px]">{row.label}</span>
                      <span className="shrink-0 font-mono text-[13px] tnum">
                        {row.kcal.toLocaleString("en-IN")} kcal <span className={on ? "text-paper/60" : "text-ink-3"}>{row.floored ? "min" : `${row.pct}%`}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Seg label="Goal" value={m.goal} onChange={(v) => set("goal", v)} options={GOALS.map((g) => ({ id: g.id, label: g.label }))} />
            )}
            {table.some((r) => r.floored) && <p className="mt-1.5 text-[12px] text-ink-3">Rows marked “min” are at the safe minimum ({m.sex === "male" ? "1,500" : "1,200"} kcal) — losing faster than that needs a doctor&rsquo;s advice.</p>}

            {m.username && (<>
            <p className="mt-4 text-[13px] font-medium text-ink-2">Usual recipe tweaks</p>
            <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Usual recipe tweaks">
              {CUSTOMISATIONS.filter((c) => OFFLINE_CUSTOMISATIONS.includes(c.id)).map((c) => {
                const on = tweaks.includes(c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleTweak(c.id)} className={`press inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2"}`}>
                    {on && <Check size={13} />}
                    {c.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[12px] text-ink-3">Ticked for @{m.username} whenever they open a recipe or plan a dish — untick any time.</p>
            </>)}
          </>
        )}

        <div className="mt-5 rounded-2xl bg-ink p-4 text-paper" aria-live="polite">
          <p className="eyebrow text-paper/60">Daily target</p>
          <p className="font-display mt-1 text-[34px] leading-none tnum">
            {t.kcal} <span className="text-[16px] opacity-70">kcal</span> · {t.protein} <span className="text-[16px] opacity-70">g protein</span>
          </p>
          <p className="mt-1 text-[12px] text-paper/80 tnum" data-testid="macro-target">
            Carbs {t.carbs[0]}–{t.carbs[1]} g · Fat {t.fat[0]}–{t.fat[1]} g{child ? " · protein is a minimum for growth" : ""}
          </p>
          <p className="mt-1 text-[12px] text-paper/60">
            {t.maintain && t.maintain !== t.kcal ? `${t.maintain.toLocaleString("en-IN")} kcal ${child ? "is the full amount for their age" : "keeps your weight"} · ` : ""}
            {t.basis}
          </p>
        </div>

        <div className="mt-4 flex gap-2 pb-2">
          {!isNew && !member.username && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remove ${member.name}?`)) {
                  deleteMember(member.id);
                  onClose();
                }
              }}
              className="press grid w-14 place-items-center rounded-2xl border border-line-2 text-chilli"
              aria-label="Remove member"
            >
              <Trash size={18} />
            </button>
          )}
          <button disabled={!m.name.trim() || missingBody} className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-[15px] font-medium text-paper disabled:opacity-40">
            <Check size={18} /> Save
          </button>
        </div>
      </form>
    </div>
  );
}
