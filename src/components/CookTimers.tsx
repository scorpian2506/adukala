"use client";

import { useState } from "react";
import { clock, formatDuration } from "@/lib/format";
import { Bell, Check, Plus } from "./Icons";

interface DockTimer {
  id: number;
  label: string;
  endAt: number;
  duration: number;
  stepIndex: number;
}

/** Timers from earlier steps, minimised into a stack above the controls. */
export function TimerDock({
  timers,
  now,
  onGo,
  onAdd,
  onCancel,
}: {
  timers: DockTimer[];
  now: number;
  onGo: (t: DockTimer) => void;
  onAdd: (t: DockTimer) => void;
  onCancel: (t: DockTimer) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!timers.length) return null;
  return (
    <div className="pointer-events-none absolute bottom-[112px] right-3 z-30 flex flex-col items-end gap-2" aria-label="Running timers">
      {timers.map((t) => {
        const left = Math.max(0, (t.endAt - now) / 1000);
        const frac = t.duration ? 1 - left / t.duration : 1;
        const R = 13;
        const C = 2 * Math.PI * R;
        const expanded = open === t.id;
        return (
          <div key={t.id} className="pointer-events-auto animate-rise">
            <button
              onClick={() => setOpen(expanded ? null : t.id)}
              aria-expanded={expanded}
              aria-label={`${t.label} timer, ${clock(left)} left`}
              className="press flex items-center gap-2 rounded-full bg-ink py-1.5 pl-1.5 pr-3.5 text-paper shadow-[0_12px_28px_-12px_rgba(28,24,19,.7)]"
            >
              <span className="relative grid h-8 w-8 place-items-center">
                <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
                  <circle cx="16" cy="16" r={R} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={3} />
                  <circle cx="16" cy="16" r={R} fill="none" stroke="var(--turmeric)" strokeWidth={3} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
                </svg>
                <Bell size={13} />
              </span>
              <span className="max-w-[120px] truncate text-[12px]">{t.label}</span>
              <span className="font-mono text-[13px] tnum">{clock(left)}</span>
            </button>
            {expanded && (
              <div className="mt-1.5 flex justify-end gap-1.5 animate-fade">
                <button onClick={() => (setOpen(null), onGo(t))} className="press rounded-full border border-line-2 bg-card px-3 py-1.5 text-[12px] font-medium">
                  Go to step
                </button>
                <button onClick={() => onAdd(t)} className="press inline-flex items-center gap-1 rounded-full border border-line-2 bg-card px-3 py-1.5 text-[12px] font-medium">
                  <Plus size={12} /> 1 min
                </button>
                <button onClick={() => (setOpen(null), onCancel(t))} className="press rounded-full border border-line-2 bg-card px-3 py-1.5 text-[12px] font-medium text-chilli">
                  Stop
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Before leaving a timed step: is it actually done? */
export function ConfirmSheet({
  confirm,
  title,
  onStay,
  onNext,
  onStartAndNext,
}: {
  confirm: { kind: "running" | "notStarted" | "paused" | "whistles"; left: number };
  title: string;
  onStay: () => void;
  onNext: () => void;
  onStartAndNext: () => void;
}) {
  const time = formatDuration(Math.ceil(confirm.left));
  const copy = {
    running: { h: "Done with this step?", p: `“${title}” — the timer keeps running in the corner (${time} left) and will pop up when it's over.`, yes: "Yes, it's done — next" },
    notStarted: { h: "Timer not started", p: `“${title}” needs ${time}. Start the timer and carry on — it'll run in the corner and pop up when it's over.`, yes: "Skip timer, I'm done" },
    paused: { h: "Timer is paused", p: `“${title}” still has ${time} on the timer.`, yes: "Skip timer, I'm done" },
    whistles: { h: "Whistles not done", p: `You've still got ${confirm.left} whistle${confirm.left === 1 ? "" : "s"} to go. Only move on once you've heard them all.`, yes: "All whistles done — next" },
  }[confirm.kind];
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-ink/45 animate-fade" onClick={onStay} role="dialog" aria-modal="true" aria-labelledby="confirm-h">
      <div className="safe-b rounded-t-[30px] bg-paper px-5 pt-3 animate-rise" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
        <h2 id="confirm-h" className="font-display mt-4 text-[32px] leading-none">
          {copy.h}
        </h2>
        <p className="mt-2 text-[15px] leading-snug text-ink-2">{copy.p}</p>
        <div className="mt-5 space-y-2 pb-2">
          {(confirm.kind === "notStarted" || confirm.kind === "paused") && (
            <button onClick={onStartAndNext} className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-[15px] font-medium text-paper">
              <Bell size={17} /> {confirm.kind === "paused" ? "Resume timer & next" : "Start timer & next"}
            </button>
          )}
          <button onClick={onNext} className={`press w-full rounded-2xl py-4 text-[15px] font-medium ${confirm.kind === "running" || confirm.kind === "whistles" ? "bg-ink text-paper" : "border border-line-2 bg-card"}`}>
            {copy.yes}
          </button>
          <button onClick={onStay} className="press w-full rounded-2xl py-3 text-[14px] text-ink-2">
            Not yet — stay on this step
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full-screen alarm when any timer ends; stays (and rings) until confirmed. */
export function TimeUpModal({ alert, more, onDone, onMore }: { alert: { label: string; current: boolean }; more: number; onDone: () => void; onMore: () => void }) {
  return (
    <div className="absolute inset-0 z-[60] grid place-items-center bg-ink/70 px-5 animate-fade" role="alertdialog" aria-modal="true" aria-labelledby="timeup-h">
      <div className="w-full rounded-[30px] bg-chilli p-6 text-paper shadow-2xl animate-rise">
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 rounded-full bg-paper/25" style={{ animation: "pulse-ring 1.4s ease-out infinite" }} />
          <span className="grid h-16 w-16 place-items-center rounded-full bg-paper text-chilli" style={{ animation: "jiggle .5s ease-in-out infinite" }}>
            <Bell size={30} />
          </span>
        </div>
        <p className="eyebrow mt-5 text-center text-paper/70">Time&rsquo;s up{more ? ` · ${more} more` : ""}</p>
        <h2 id="timeup-h" className="font-display mt-2 text-center text-[34px] leading-[1.02]">
          {alert.label}
        </h2>
        <p className="mt-2 text-center text-[14px] text-paper/80">{alert.current ? "This step's timer is done." : "A timer from an earlier step is done. Check it now."}</p>
        <button onClick={onDone} autoFocus className="press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-paper py-4 text-[16px] font-semibold text-chilli">
          <Check size={19} /> Done
        </button>
        <button onClick={onMore} className="press mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[14px] text-paper/85">
          <Plus size={14} /> Needs 1 more minute
        </button>
      </div>
    </div>
  );
}
