"use client";

import { useState } from "react";
import { ACTIVITY, GOALS, dailyTarget, newMemberId, type Member } from "@/lib/family";
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
                      {m.kind === "child" ? `Child · ${m.age} yrs` : `${GOALS.find((g) => g.id === m.goal)?.label} · ${m.age} yrs`} · {m.diet === "veg" ? "Veg" : m.diet === "egg" ? "Eggetarian" : "Non-veg"}
                    </span>
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

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-ink/40 animate-fade" onClick={onClose} role="dialog" aria-modal="true" aria-label={isNew ? "Add family member" : `Edit ${member.name}`}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!m.name.trim()) return;
          saveMember({ ...m, name: m.name.trim(), goal: child ? "maintain" : m.goal });
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
            <input inputMode="numeric" value={m.heightCm ?? ""} onChange={(e) => set("heightCm", num(e.target.value))} aria-label="Height in cm" placeholder="opt." className="mt-1 w-full rounded-2xl border border-line-2 bg-card px-3 py-3 text-[16px] focus:outline-none" />
          </label>
          <label className="text-[13px] font-medium text-ink-2">
            Weight kg
            <input inputMode="decimal" value={m.weightKg ?? ""} onChange={(e) => set("weightKg", num(e.target.value))} aria-label="Weight in kg" placeholder="opt." className="mt-1 w-full rounded-2xl border border-line-2 bg-card px-3 py-3 text-[16px] focus:outline-none" />
          </label>
        </div>

        <p className="mt-4 text-[13px] font-medium text-ink-2">Sex</p>
        <Seg label="Sex" value={m.sex} onChange={(v) => set("sex", v)} options={[{ id: "female", label: child ? "Girl" : "Female" }, { id: "male", label: child ? "Boy" : "Male" }]} />

        <p className="mt-4 text-[13px] font-medium text-ink-2">Eats</p>
        <Seg label="Diet" value={m.diet} onChange={(v) => set("diet", v)} options={[{ id: "veg", label: "Veg" }, { id: "egg", label: "Veg + egg" }, { id: "nonveg", label: "Non-veg" }]} />

        {!child && (
          <>
            <p className="mt-4 text-[13px] font-medium text-ink-2">Goal</p>
            <Seg label="Goal" value={m.goal} onChange={(v) => set("goal", v)} options={GOALS.map((g) => ({ id: g.id, label: g.label }))} />
            <p className="mt-4 text-[13px] font-medium text-ink-2">Activity</p>
            <Seg label="Activity" value={m.activity} onChange={(v) => set("activity", v)} options={ACTIVITY.map((a) => ({ id: a.id, label: a.label }))} />
          </>
        )}

        <div className="mt-5 rounded-2xl bg-ink p-4 text-paper" aria-live="polite">
          <p className="eyebrow text-paper/60">Daily target</p>
          <p className="font-display mt-1 text-[34px] leading-none tnum">
            {t.kcal} <span className="text-[16px] opacity-70">kcal</span> · {t.protein} <span className="text-[16px] opacity-70">g protein</span>
          </p>
          <p className="mt-1 text-[12px] text-paper/60">{t.basis}</p>
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
          <button disabled={!m.name.trim()} className="press flex flex-1 items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-[15px] font-medium text-paper disabled:opacity-40">
            <Check size={18} /> Save
          </button>
        </div>
      </form>
    </div>
  );
}
