"use client";

import { useState } from "react";
import { aiHeaders, aiReady, modelFor, saveKey, saveModel, saveSettings, useSettings } from "@/lib/store";
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from "@/lib/providers";
import { speechRecognitionSupported, speak, unlockAudio } from "@/lib/kitchen";
import { useHydrated } from "@/lib/useRecipe";
import { Check, Eye } from "./Icons";
import { TopBar } from "./Nav";

export function SettingsView() {
  const settings = useSettings();
  const hydrated = useHydrated();

  return (
    <main className="app-min-h pb-16">
      <header className="px-4 pb-2">
        <TopBar />
      </header>
      <div className="px-5">
        <h1 className="font-display text-[48px] leading-none">Settings</h1>
      </div>

      <section className="mt-8 px-4">
        <div className="px-1">
          <p className="eyebrow text-ink-3">Recipe converter</p>
          <p className="mt-2 text-[13px] leading-snug text-ink-2">
            Adukala works without any AI. Connecting a free AI only adds the chat, video watching and extra customisations.
          </p>
        </div>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Recipe converter">
          <Choice
            selected={settings.provider === "none"}
            onSelect={() => saveSettings({ provider: "none" })}
            title="Built-in (no AI)"
            badge="Free · open source"
            body="Reads the cook's written recipe (from the video description or their website) and turns it into measured steps with rules. Uses no AI service at all."
          />
          {PROVIDER_ORDER.map((id) => (
            <ProviderChoice key={id} id={id} />
          ))}
        </div>
        {hydrated && settings.provider !== "none" && !aiReady(settings) && (
          <p className="mt-3 px-1 text-[13px] text-chilli">Add a key for {PROVIDERS[settings.provider].name}, or switch back to Built-in.</p>
        )}
      </section>

      <section className="mx-4 mt-6 rounded-[26px] border border-line-2 bg-card p-5">
        <p className="eyebrow text-ink-3">Hands-free</p>
        <Toggle
          label="Read steps aloud"
          hint="Each step is spoken when it appears. Timers announce when they finish."
          on={settings.voice}
          onChange={(v) => {
            unlockAudio();
            saveSettings({ voice: v });
            if (v) speak("I'll read each step out loud.");
          }}
        />
        <Toggle
          label="Say “next” to move on"
          hint={hydrated && !speechRecognitionSupported() ? "This browser doesn't support voice commands. Try Chrome on Android." : "Also works: “back”, “repeat”, “start timer”, “whistle”. Best in Chrome on Android."}
          on={settings.listen}
          onChange={(v) => saveSettings({ listen: v })}
          disabled={hydrated && !speechRecognitionSupported()}
        />
      </section>

      <p className="mx-5 mt-8 text-[12px] leading-relaxed text-ink-3">
        Keys and recipes are stored only in this browser. AI keys are sent with each request to your chosen provider and never saved on our server. Adukala is open source:{" "}
        <a className="underline underline-offset-2" href="https://github.com/scorpian2506/adukala" target="_blank" rel="noreferrer">
          github.com/scorpian2506/adukala
        </a>
        .
      </p>
    </main>
  );
}

function Choice({ selected, onSelect, title, badge, body, children }: { selected: boolean; onSelect: () => void; title: string; badge?: string; body: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-[22px] border p-4 transition-colors ${selected ? "border-ink bg-card" : "border-line-2 bg-card/50"}`}>
      <button onClick={onSelect} role="radio" aria-checked={selected} className="press flex w-full items-start gap-3 text-left">
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-ink" : "border-line-2"}`}>
          {selected && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-medium">{title}</span>
            {badge && <span className="eyebrow rounded-full bg-paper-2 px-2 py-0.5 text-ink-2">{badge}</span>}
          </span>
          <span className="mt-1 block text-[13px] leading-snug text-ink-2">{body}</span>
        </span>
      </button>
      {selected && children}
    </div>
  );
}

function ProviderChoice({ id }: { id: ProviderId }) {
  const settings = useSettings();
  const p = PROVIDERS[id];
  const [draft, setDraft] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; msg?: string; detail?: string }>({ state: "idle" });
  const [live, setLive] = useState<{ state: "idle" | "busy" | "ok" | "fail"; models?: string[]; msg?: string }>({ state: "idle" });
  const saved = settings.keys[id] ?? "";
  const key = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved;

  async function check() {
    if (dirty) saveKey(id, draft ?? "");
    setDraft(null);
    setTest({ state: "busy" });
    try {
      const res = await fetch("/api/ping", { method: "POST", headers: aiHeaders() });
      const data = await res.json();
      setTest(res.ok ? { state: "ok", msg: `Working · ${data.model}` } : { state: "fail", msg: data.error, detail: data.detail });
    } catch {
      setTest({ state: "fail", msg: "Couldn't reach the server." });
    }
  }

  async function loadModels() {
    if (dirty) saveKey(id, draft ?? "");
    setDraft(null);
    setLive({ state: "busy" });
    try {
      const res = await fetch("/api/models", { method: "POST", headers: aiHeaders() });
      const data = await res.json();
      if (!res.ok) return setLive({ state: "fail", msg: data.error });
      setLive({ state: "ok", models: data.models });
      // The saved model no longer exists for this key: switch to one that does.
      if (!data.available && data.models.length) {
        const pick = data.models.includes(p.defaultModel) ? p.defaultModel : data.models[0];
        saveModel(id, pick);
      }
    } catch {
      setLive({ state: "fail", msg: "Couldn't reach the server." });
    }
  }

  return (
    <Choice
      selected={settings.provider === id}
      onSelect={() => {
        saveSettings({ provider: id });
        setTest({ state: "idle" });
      }}
      title={p.name}
      badge={p.free ? (p.localOnly ? "Free · local" : "Free key") : "Paid"}
      body={p.tagline}
    >
      <div className="mt-4 border-t border-line pt-4">
        {p.needsKey && (
          <>
            <div className="flex items-center gap-2 rounded-2xl border border-line-2 bg-paper px-3 focus-within:border-ink/50">
              <input
                value={key}
                onChange={(e) => setDraft(e.target.value)}
                type={show ? "text" : "password"}
                placeholder="Paste your API key"
                autoComplete="off"
                spellCheck={false}
                aria-label={`${p.name} API key`}
                className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[14px] placeholder:text-ink-3 focus:outline-none"
              />
              <button onClick={() => setShow((s) => !s)} className="press p-2 text-ink-3" aria-label={show ? "Hide key" : "Show key"}>
                <Eye size={18} />
              </button>
            </div>
            {p.keyUrl && (
              <a href={p.keyUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] text-ink-3 underline underline-offset-4">
                Get a {p.free ? "free " : ""}key from {p.name}
              </a>
            )}
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.needsKey && (
            <button
              onClick={() => {
                saveKey(id, draft ?? "");
                setDraft(null);
                setTest({ state: "idle" });
              }}
              disabled={!dirty}
              className="press rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-paper disabled:opacity-30"
            >
              Save key
            </button>
          )}
          <button onClick={check} disabled={(p.needsKey && !key) || test.state === "busy"} className="press rounded-full border border-line-2 px-4 py-2.5 text-[13px] font-medium disabled:opacity-30">
            {test.state === "busy" ? "Testing…" : "Test connection"}
          </button>
          {saved && !dirty && (
            <button
              onClick={() => {
                saveKey(id, "");
                setTest({ state: "idle" });
              }}
              className="press px-2 py-2.5 text-[13px] text-chilli"
            >
              Remove
            </button>
          )}
        </div>
        {test.state === "ok" && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-leaf" role="status">
            <Check size={16} /> {test.msg}
          </p>
        )}
        {test.state === "fail" && (
          <div className="mt-3 text-[13px] text-chilli" role="alert">
            <p>{test.msg}</p>
            {test.detail && <p className="mt-1 break-words rounded-lg bg-chilli-soft/30 px-2 py-1.5 font-mono text-[11px] text-ink-2">{test.detail}</p>}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <p className="eyebrow text-ink-3">Model</p>
          {(!p.needsKey || key) && (
            <button onClick={loadModels} className="press text-[12px] text-ink-2 underline underline-offset-4">
              {live.state === "busy" ? "Loading…" : "Load models for my key"}
            </button>
          )}
        </div>
        {live.state === "fail" && <p className="mt-1 text-[12px] text-chilli">{live.msg}</p>}
        {live.state === "ok" && live.models && (
          <p className="mt-1 text-[12px] text-ink-3">
            {live.models.length} models available{live.models.includes(modelFor(settings, id)) ? "" : " — your saved model isn't one of them"}.
          </p>
        )}
        <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {(live.models?.length ? live.models : p.models).map((m) => (
            <button
              key={m}
              onClick={() => saveModel(id, m)}
              className={`press rounded-full border px-3 py-1.5 font-mono text-[11px] ${modelFor(settings, id) === m ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          value={settings.models[id] ?? p.defaultModel}
          onChange={(e) => saveModel(id, e.target.value)}
          aria-label={`${p.name} model name`}
          className="mt-2 w-full rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-[13px] focus:border-ink/50 focus:outline-none"
        />
        <p className="mt-1.5 text-[12px] text-ink-3">Free models change often. Type any model name your key can use.</p>
      </div>
    </Choice>
  );
}

function Toggle({ label, hint, on, onChange, disabled }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className="press mt-4 flex w-full items-start justify-between gap-4 text-left disabled:opacity-40"
    >
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{hint}</span>
      </span>
      <span className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-leaf" : "bg-line-2"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}
