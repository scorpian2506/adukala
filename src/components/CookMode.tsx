"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildScreens, ingredientMap, type FlatStep, type Screen } from "@/lib/recipes";
import { clearProgress, getProgress, saveProgress, saveSettings, useSettings } from "@/lib/store";
import { useRecipe } from "@/lib/useRecipe";
import {
  EQUIPMENT_LABEL,
  FLAME_LABEL,
  KIND_LABEL,
  clock,
  formatDuration,
  formatNumber,
  speakQty,
  unitLabel,
  formatQty,
} from "@/lib/format";
import { chime, speak, speechRecognitionSupported, stopSpeaking, unlockAudio, useVoiceCommands, useWakeLock } from "@/lib/kitchen";
import type { Flame, Recipe } from "@/lib/types";
import { StepArt } from "./StepArt";
import { HUE_BG } from "./RecipeCard";
import { DishArt } from "./DishArt";
import { Loading, NotFound } from "./States";
import { ArrowLeft, ArrowRight, Bell, Check, Close, Eye, List, Mic, Pause, Play, Plus, Reset, Speaker, SpeakerOff } from "./Icons";

export function CookMode({ id }: { id: string }) {
  const { recipe, ready } = useRecipe(id);
  if (!ready) return <Loading />;
  if (!recipe) return <NotFound />;
  return <Cook recipe={recipe} />;
}

interface MainTimer {
  key: number; // screen index it belongs to
  duration: number;
  remaining: number; // seconds, when paused
  endAt: number | null; // ms, when running
  fired: boolean;
}

interface BgTimer {
  id: number;
  label: string;
  endAt: number;
  fired: boolean;
}

function freshTimer(key: number, screen: Screen | undefined): MainTimer | null {
  if (screen?.type !== "step" || !screen.step.durationSec) return null;
  const d = screen.step.durationSec;
  return { key, duration: d, remaining: d, endAt: null, fired: false };
}

function timeLeft(t: MainTimer | BgTimer, now: number) {
  if ("remaining" in t && t.endAt === null) return t.remaining;
  return Math.max(0, ((t.endAt as number) - now) / 1000);
}

function Cook({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const settings = useSettings();
  const screens = useMemo(() => buildScreens(recipe), [recipe]);
  const ings = useMemo(() => ingredientMap(recipe), [recipe]);
  const saved = useMemo(() => getProgress(recipe.id), [recipe.id]);
  const servings = saved?.servings ?? recipe.servings;
  const factor = servings / recipe.servings;

  const [index, setIndex] = useState(() => Math.min(saved?.index ?? 0, screens.length - 1));
  const [dir, setDir] = useState<1 | -1>(1);
  const [timer, setTimer] = useState<MainTimer | null>(() => freshTimer(index, screens[index]));
  const [bg, setBg] = useState<BgTimer[]>([]);
  const [whistles, setWhistles] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const screen = screens[index];
  const step = screen.type === "step" ? screen.step : null;

  useWakeLock(true);

  // Persist position.
  useEffect(() => {
    if (screen.type === "done") clearProgress(recipe.id);
    else saveProgress({ recipeId: recipe.id, servings, index });
  }, [index, recipe.id, servings, screen.type]);

  // One clock for every running timer.
  const anyRunning = (timer?.endAt != null && !timer.fired) || bg.some((b) => !b.fired);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [anyRunning]);

  // Fire alarms. Driven by the clock tick, so we update state here deliberately.
  useEffect(() => {
    if (timer && timer.endAt !== null && !timer.fired && now >= timer.endAt) {
      chime();
      if (settings.voice) speak("Time's up.");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimer({ ...timer, fired: true, remaining: 0, endAt: null });
    }
    const due = bg.filter((b) => !b.fired && now >= b.endAt);
    if (due.length) {
      chime();
      setToast(`${due[0].label} — time's up`);
      if (settings.voice) speak(`${due[0].label}. Time's up.`);
      setBg((cur) => cur.map((b) => (due.some((d) => d.id === b.id) ? { ...b, fired: true } : b)));
    }
  }, [now, timer, bg, settings.voice]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const sayStep = useCallback(
    (s: Screen) => {
      if (s.type === "intro") {
        speak(s.phase === "prep" ? "Let's get everything ready before we turn on the stove." : "Everything's measured. Time to cook.");
      } else if (s.type === "done") {
        speak(`That's it. Your ${recipe.name} is ready.`);
      } else {
        const st = s.step;
        const parts = [st.title + "."];
        if (st.items?.length) {
          parts.push(
            st.items
              .map((it) => `${speakQty(it.qty * factor, it.unit)} ${ings[it.ingredient]?.name ?? it.ingredient}`)
              .join(", ") + ".",
          );
        }
        if (st.detail) parts.push(st.detail);
        if (st.flame && st.kind !== "flame") parts.push(`Keep the flame ${st.flame}.`);
        if (st.whistles) parts.push(`Wait for ${st.whistles} whistle${st.whistles > 1 ? "s" : ""}.`);
        else if (st.durationSec) parts.push(`This takes ${formatDuration(st.durationSec).replace("min", "minutes").replace(" s", " seconds")}.`);
        speak(parts.join(" "));
      }
    },
    [factor, ings, recipe.name],
  );

  useEffect(() => {
    if (settings.voice) sayStep(screen);
    return () => stopSpeaking();
  }, [screen, settings.voice, sayStep]);

  const go = useCallback(
    (delta: 1 | -1) => {
      unlockAudio();
      const next = Math.max(0, Math.min(screens.length - 1, index + delta));
      if (next === index) return;
      // A running timer keeps going in the background when you move on.
      if (timer && timer.endAt !== null && !timer.fired && screen.type === "step") {
        const label = screen.step.title;
        const endAt = timer.endAt;
        setBg((cur) => [...cur.filter((b) => !b.fired), { id: Date.now(), label, endAt, fired: false }]);
      }
      setDir(delta);
      setIndex(next);
      setTimer(freshTimer(next, screens[next]));
      setWhistles(0);
    },
    [index, screens, timer, screen],
  );

  const toggleTimer = useCallback(() => {
    unlockAudio();
    setTimer((t) => {
      if (!t) return t;
      if (t.fired) return { ...t, fired: false, remaining: t.duration, endAt: Date.now() + t.duration * 1000 };
      if (t.endAt !== null) return { ...t, remaining: (t.endAt - Date.now()) / 1000, endAt: null };
      return { ...t, endAt: Date.now() + t.remaining * 1000 };
    });
    setNow(Date.now());
  }, []);

  const countWhistle = useCallback(() => {
    unlockAudio();
    if (!step?.whistles) return;
    setWhistles((w) => {
      const n = Math.min(step.whistles!, w + 1);
      if (n === step.whistles) {
        chime();
        if (settings.voice) speak(`That's ${n} whistle${n > 1 ? "s" : ""}. Tap next.`);
      }
      return n;
    });
  }, [step, settings.voice]);

  useVoiceCommands(settings.listen, (c) => {
    if (c === "next") go(1);
    else if (c === "back") go(-1);
    else if (c === "repeat") sayStep(screen);
    else if (c === "timer" && timer) toggleTimer();
    else if (c === "whistle") countWhistle();
  });

  // Keyboard: arrows and space, for tablets with keyboards and desktop testing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === " " && timer) {
        e.preventDefault();
        toggleTimer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, timer, toggleTimer]);

  // Swipe between steps.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) go(dx < 0 ? 1 : -1);
  };

  // Which ingredients are already in, for the ingredients sheet.
  const usedUpTo = useMemo(() => {
    const used = new Set<string>();
    screens.slice(0, index).forEach((s) => {
      if (s.type === "step" && (s.step.kind === "add" || s.step.kind === "grind")) s.step.items?.forEach((it) => used.add(it.ingredient));
    });
    return used;
  }, [screens, index]);

  const stepScreens = screens.filter((s) => s.type === "step") as Extract<Screen, { type: "step" }>[];
  const currentNumber = screen.type === "step" ? screen.number : screen.type === "done" ? stepScreens.length : (stepScreens.find((s) => screens.indexOf(s) > index)?.number ?? 1) - 1;
  const pct = Math.max(0, Math.min(1, currentNumber / stepScreens.length));

  const timerRunning = timer?.endAt != null && !timer?.fired;
  const nextLabel =
    screen.type === "done"
      ? "Finish"
      : screen.type === "intro"
        ? screen.phase === "prep"
          ? "Let's begin"
          : "Turn on the stove"
        : timerRunning
          ? "Next · timer keeps running"
          : "Next";

  return (
    <main className="app-h relative flex flex-col overflow-hidden bg-paper" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Top bar */}
      <div className="safe-t relative z-20 px-4">
        <div className="flex items-center gap-3">
          <Link href={`/recipe/${recipe.id}`} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-2" aria-label="Leave cook mode">
            <Close size={18} />
          </Link>
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <p className="font-display truncate text-[17px] leading-none">{recipe.name}</p>
              <p className="eyebrow text-ink-3 tnum">
                {currentNumber}/{stepScreens.length}
              </p>
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
          <button
            onClick={() => {
              unlockAudio();
              saveSettings({ voice: !settings.voice });
              if (settings.voice) stopSpeaking();
            }}
            className={`press grid h-10 w-10 shrink-0 place-items-center rounded-full border ${settings.voice ? "border-ink bg-ink text-paper" : "border-line-2"}`}
            aria-label={settings.voice ? "Stop reading steps aloud" : "Read steps aloud"}
            aria-pressed={settings.voice}
          >
            {settings.voice ? <Speaker size={18} /> : <SpeakerOff size={18} />}
          </button>
          <button onClick={() => setSheet(true)} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line-2" aria-label="All ingredients">
            <List size={18} />
          </button>
        </div>

        {/* Background timers */}
        {bg.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {bg.map((b) => (
              <button
                key={b.id}
                onClick={() => setBg((cur) => cur.filter((x) => x.id !== b.id))}
                aria-label={`Dismiss ${b.label} timer`}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] ${b.fired ? "bg-chilli text-paper" : "bg-ink text-paper"}`}
              >
                <Bell size={13} />
                <span className="max-w-[140px] truncate">{b.label}</span>
                <span className="font-mono tnum">{b.fired ? "Done" : clock(timeLeft(b, now))} ✕</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Screen */}
      <div key={index} className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar" style={{ animation: `${dir > 0 ? "rise" : "fade"} 420ms cubic-bezier(.2,.7,.2,1) both` }}>
        {screen.type === "intro" && <Intro recipe={recipe} phase={screen.phase} servings={servings} />}
        {screen.type === "done" && <Done recipe={recipe} />}
        {screen.type === "step" && step && (
          <StepScreen
            recipe={recipe}
            step={step}
            number={screen.number}
            factor={factor}
            ings={ings}
            timer={timer}
            now={now}
            onToggleTimer={toggleTimer}
            onResetTimer={() => setTimer(freshTimer(index, screen))}
            onAddTime={() =>
              setTimer((t) => (t ? { ...t, fired: false, duration: t.duration + 30, ...(t.endAt !== null ? { endAt: t.endAt + 30000 } : { remaining: t.remaining + 30 }) } : t))
            }
            whistles={whistles}
            onWhistle={countWhistle}
          />
        )}
      </div>

      {/* Controls */}
      <div className="safe-b relative z-20 flex items-stretch gap-2 px-4 pt-2">
        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          className="press grid w-[68px] place-items-center rounded-[22px] border border-line-2 bg-card disabled:opacity-30"
          aria-label="Previous step"
        >
          <ArrowLeft />
        </button>
        <button
          onClick={() => (screen.type === "done" ? router.push("/") : go(1))}
          className="press flex min-h-[72px] flex-1 items-center justify-between rounded-[22px] bg-ink px-6 text-paper"
        >
          <span className="text-left">
            <span className="block text-[19px] font-medium leading-tight">{nextLabel}</span>
            {settings.listen && speechRecognitionSupported() && (
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-paper/60">
                <Mic size={12} /> or say “next”
              </span>
            )}
          </span>
          {screen.type === "done" ? <Check /> : <ArrowRight />}
        </button>
      </div>

      {toast && (
        <div className="absolute inset-x-4 top-20 z-40 animate-rise rounded-2xl bg-chilli px-4 py-3 text-[14px] font-medium text-paper shadow-lg" role="status">
          {toast}
        </div>
      )}

      {sheet && <IngredientSheet recipe={recipe} factor={factor} servings={servings} used={usedUpTo} onClose={() => setSheet(false)} />}
    </main>
  );
}

function FlameBadge({ flame }: { flame: Flame }) {
  const n = flame === "off" ? 0 : flame === "low" ? 1 : flame === "medium" ? 2 : 3;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ${flame === "off" ? "bg-card text-ink-2" : "bg-chilli text-paper"}`}>
      <span className="inline-flex items-end gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-[4px] rounded-full ${i < n ? (flame === "off" ? "bg-ink" : "bg-paper") : flame === "off" ? "bg-line-2" : "bg-paper/30"}`} style={{ height: 6 + i * 3 }} />
        ))}
      </span>
      {FLAME_LABEL[flame]}
    </span>
  );
}

function StepScreen({
  recipe,
  step,
  number,
  factor,
  ings,
  timer,
  now,
  onToggleTimer,
  onResetTimer,
  onAddTime,
  whistles,
  onWhistle,
}: {
  recipe: Recipe;
  step: FlatStep;
  number: number;
  factor: number;
  ings: ReturnType<typeof ingredientMap>;
  timer: MainTimer | null;
  now: number;
  onToggleTimer: () => void;
  onResetTimer: () => void;
  onAddTime: () => void;
  whistles: number;
  onWhistle: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
      <div className={`relative overflow-hidden rounded-[30px] ${HUE_BG[recipe.hue]}`}>
        <StepArt kind={step.kind} flame={step.flame} equipment={step.equipment} hue={recipe.hue} offStove={(step.phase === "prep" && !step.flame) || step.equipment === "bowl"} className="mx-auto block h-[clamp(130px,24vh,200px)] w-full" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="eyebrow rounded-full bg-card/85 px-2.5 py-1.5 text-ink">
            {step.phase === "prep" ? "Prep" : "Cook"} · {KIND_LABEL[step.kind]}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
          {step.flame && <FlameBadge flame={step.flame} />}
          {step.equipment && <span className="rounded-full bg-card/85 px-3 py-1.5 text-[12px] font-medium">{EQUIPMENT_LABEL[step.equipment]}</span>}
        </div>
      </div>

      <p className="eyebrow mt-5 text-ink-3 tnum">
        Step {number} · {step.phase === "prep" ? `getting ready ${step.phaseIndex + 1} of ${step.phaseTotal}` : `at the stove ${step.phaseIndex + 1} of ${step.phaseTotal}`}
      </p>
      <h1 className="font-display mt-1.5 text-[clamp(34px,10vw,42px)] leading-[0.98] text-ink">{step.title}</h1>

      {step.items && step.items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {step.items.map((it, i) => {
            const ing = ings[it.ingredient];
            const unit = unitLabel(it.qty * factor, it.unit);
            return (
              <li key={i} className="flex items-center gap-4 rounded-[20px] border border-line-2 bg-card px-4 py-3">
                <span className="font-display min-w-[76px] text-[38px] leading-none text-ink tnum">
                  {formatNumber(it.qty * factor, it.unit)}
                  {unit && <span className="ml-1 font-sans text-[15px] font-medium text-ink-2">{unit}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium leading-tight text-ink">{ing?.name ?? it.ingredient}</span>
                  {(ing?.native || ing?.approx) && <span className="mt-0.5 block text-[12px] text-ink-3">{[ing.native, ing.approx].filter(Boolean).join(" · ")}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {step.detail && <p className="mt-4 text-[17px] leading-snug text-ink-2">{step.detail}</p>}

      {step.cue && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-paper-2 px-3.5 py-3 text-[14px] leading-snug text-ink">
          <Eye size={18} className="mt-px shrink-0 text-leaf" />
          <span>
            <span className="font-semibold">Look for: </span>
            {step.cue}
          </span>
        </p>
      )}

      {step.whistles ? <WhistleCounter target={step.whistles} count={whistles} onWhistle={onWhistle} /> : null}

      {timer && <TimerCard timer={timer} now={now} onToggle={onToggleTimer} onReset={onResetTimer} onAdd={onAddTime} label={step.kind === "stir" ? "Stir until the timer ends" : step.whistles ? "Rough guide — trust the whistles" : "Timer"} />}

      {step.tip && <p className="mt-3 text-[13px] leading-snug text-ink-3">Tip — {step.tip}</p>}
    </div>
  );
}

function TimerCard({ timer, now, onToggle, onReset, onAdd, label }: { timer: MainTimer; now: number; onToggle: () => void; onReset: () => void; onAdd: () => void; label: string }) {
  const left = timeLeft(timer, now);
  const running = timer.endAt !== null;
  const frac = timer.duration ? 1 - left / timer.duration : 0;
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div className={`mt-4 flex items-center gap-4 rounded-[24px] p-3 pr-4 transition-colors ${timer.fired ? "bg-chilli text-paper" : "bg-ink text-paper"}`}>
      <button onClick={onToggle} className="press relative grid h-[68px] w-[68px] shrink-0 place-items-center" aria-label={running ? "Pause timer" : "Start timer"}>
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={5} />
          <circle cx="32" cy="32" r={R} fill="none" stroke="var(--turmeric)" strokeWidth={5} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset .25s linear" }} />
        </svg>
        {running && <span className="absolute inset-1 rounded-full border-2 border-turmeric/50" style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />}
        {timer.fired ? <Reset size={22} /> : running ? <Pause size={22} /> : <Play size={24} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-paper/60">{timer.fired ? "Time's up" : running ? label : "Tap to start"}</p>
        <p className="font-display text-[44px] leading-none tnum">{clock(left)}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <button onClick={onAdd} className="press inline-flex items-center gap-1 rounded-full bg-paper/12 px-2.5 py-1.5 text-[12px] ring-1 ring-paper/20">
          <Plus size={12} /> 30s
        </button>
        <button onClick={onReset} className="press inline-flex items-center gap-1 rounded-full bg-paper/12 px-2.5 py-1.5 text-[12px] ring-1 ring-paper/20">
          <Reset size={12} /> Reset
        </button>
      </div>
    </div>
  );
}

function WhistleCounter({ target, count, onWhistle }: { target: number; count: number; onWhistle: () => void }) {
  const done = count >= target;
  return (
    <div className={`mt-4 rounded-[24px] border-2 p-4 ${done ? "border-leaf bg-leaf text-paper" : "border-ink bg-card"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`eyebrow ${done ? "text-paper/70" : "text-ink-3"}`}>Whistles</p>
          <p className="font-display text-[34px] leading-none tnum">
            {count} <span className="text-[22px] opacity-60">of {target}</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: target }, (_, i) => (
            <span key={i} className={`h-4 w-4 rounded-full border-2 transition-colors ${i < count ? (done ? "border-paper bg-paper" : "border-ink bg-ink") : done ? "border-paper/50" : "border-line-2"}`} />
          ))}
        </div>
      </div>
      <button
        onClick={onWhistle}
        disabled={done}
        className={`press mt-3 w-full rounded-2xl py-3.5 text-[15px] font-medium ${done ? "bg-paper/15" : "bg-ink text-paper"}`}
      >
        {done ? "All whistles done. Flame off next." : "I heard a whistle"}
      </button>
    </div>
  );
}

function Intro({ recipe, phase, servings }: { recipe: Recipe; phase: "prep" | "cook"; servings: number }) {
  const n = phase === "prep" ? recipe.prep.length : recipe.cook.length;
  return (
    <div className="flex flex-1 flex-col px-5 pb-6 pt-6">
      <p className="eyebrow text-chilli">{phase === "prep" ? "Part one" : "Part two"}</p>
      <h1 className="font-display mt-2 text-[52px] leading-[0.92]">
        {phase === "prep" ? (
          <>
            Get ready.
            <br />
            <em className="text-ink-3">No flame yet.</em>
          </>
        ) : (
          <>
            Now we cook.
            <br />
            <em className="text-ink-3">One thing at a time.</em>
          </>
        )}
      </h1>
      <p className="mt-4 text-[16px] leading-snug text-ink-2">
        {phase === "prep"
          ? `${n} small jobs: rinse, chop and measure everything into bowls. Cooking for ${servings}, so the amounts are already adjusted.`
          : `${n} steps at the stove. Timers start when you tap them, and nothing moves on until you tap Next.`}
      </p>
      <div className="mt-6 rounded-[24px] border border-line-2 bg-card p-4">
        <p className="eyebrow text-ink-3">{phase === "prep" ? "Put these on the counter" : "Before you start"}</p>
        {phase === "prep" ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {recipe.equipment.map((e) => (
              <li key={e} className="rounded-full bg-paper-2 px-3 py-1.5 text-[13px]">
                {EQUIPMENT_LABEL[e]}
              </li>
            ))}
            <li className="rounded-full bg-paper-2 px-3 py-1.5 text-[13px]">Measuring spoons &amp; cup</li>
          </ul>
        ) : (
          <ul className="mt-3 space-y-2 text-[14px] text-ink-2">
            <li className="flex gap-2">
              <Check size={18} className="shrink-0 text-leaf" /> All measured bowls within reach of the stove
            </li>
            <li className="flex gap-2">
              <Check size={18} className="shrink-0 text-leaf" /> A ladle or flat spoon for stirring
            </li>
            <li className="flex gap-2">
              <Check size={18} className="shrink-0 text-leaf" /> Phone propped up where you can see it
            </li>
          </ul>
        )}
      </div>
      <div className="mt-auto flex justify-center pt-6">
        <StepArt kind={phase === "prep" ? "measure" : "heat"} hue={recipe.hue} className="h-36 w-44" />
      </div>
    </div>
  );
}

function Done({ recipe }: { recipe: Recipe }) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-6 pt-8 text-center">
      <div className={`grid h-[220px] w-[220px] place-items-center rounded-full ${HUE_BG[recipe.hue]}`}>
        <DishArt recipe={recipe} className="h-[180px] w-[180px] animate-rise" />
      </div>
      <p className="eyebrow mt-6 text-chilli">Done</p>
      <h1 className="font-display mt-2 text-[48px] leading-[0.95]">
        Your {recipe.name.toLowerCase()} <em>is ready.</em>
      </h1>
      {recipe.serveWith && <p className="mt-4 max-w-[300px] text-[15px] leading-snug text-ink-2">Serve with {recipe.serveWith.charAt(0).toLowerCase() + recipe.serveWith.slice(1)}</p>}
      <p className="mt-6 text-[13px] text-ink-3">Made it once, you can make it again. It&rsquo;s saved right here.</p>
    </div>
  );
}

function IngredientSheet({ recipe, factor, servings, used, onClose }: { recipe: Recipe; factor: number; servings: number; used: Set<string>; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-ink/40 animate-fade" onClick={onClose}>
      <div className="safe-b max-h-[82%] overflow-y-auto rounded-t-[30px] bg-paper px-5 pt-3 animate-rise" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-1 w-10 rounded-full bg-line-2" />
        <div className="mt-4 flex items-baseline justify-between">
          <h2 className="font-display text-[30px] leading-none">Ingredients</h2>
          <span className="eyebrow text-ink-3">For {servings}</span>
        </div>
        <ul className="mt-3">
          {recipe.ingredients.map((ing) => {
            const done = used.has(ing.id);
            return (
              <li key={ing.id} className={`flex items-center justify-between gap-3 border-b border-line py-3 ${done ? "opacity-45" : ""}`}>
                <span className="flex items-center gap-3">
                  <span className={`grid h-5 w-5 place-items-center rounded-full border ${done ? "border-leaf bg-leaf text-paper" : "border-line-2"}`}>{done && <Check size={12} />}</span>
                  <span className={`text-[15px] ${done ? "line-through" : ""}`}>{ing.name}</span>
                </span>
                <span className="font-mono text-[14px] tnum">{formatQty(ing.qty * factor, ing.unit)}</span>
              </li>
            );
          })}
        </ul>
        <button onClick={onClose} className="press mb-2 mt-4 w-full rounded-2xl bg-ink py-4 text-[15px] font-medium text-paper">
          Back to the step
        </button>
      </div>
    </div>
  );
}
