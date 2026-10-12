"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_MODEL, aiHeaders, saveSettings, useSettings } from "@/lib/store";
import { speechRecognitionSupported, speak, unlockAudio } from "@/lib/kitchen";
import { useHydrated } from "@/lib/useRecipe";
import { ArrowLeft, Check, Eye } from "./Icons";

const MODELS = [DEFAULT_MODEL, "gpt-5.4", "gpt-5-mini"];

export function SettingsView() {
  const router = useRouter();
  const settings = useSettings();
  const hydrated = useHydrated();
  const [draft, setDraft] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; msg?: string }>({ state: "idle" });

  const key = draft ?? settings.openaiKey;
  const dirty = draft !== null && draft !== settings.openaiKey;

  async function check() {
    if (dirty) saveSettings({ openaiKey: (draft ?? "").trim() });
    setDraft(null);
    setTest({ state: "busy" });
    try {
      const res = await fetch("/api/ping", { method: "POST", headers: aiHeaders() });
      const data = await res.json();
      setTest(res.ok ? { state: "ok", msg: `Connected · ${data.model}` } : { state: "fail", msg: data.error });
    } catch {
      setTest({ state: "fail", msg: "Couldn't reach the server." });
    }
  }

  return (
    <main className="app-min-h pb-16">
      <header className="safe-t flex items-center gap-3 px-4 pb-2">
        <button onClick={() => router.back()} className="press grid h-10 w-10 place-items-center rounded-full border border-line-2" aria-label="Back">
          <ArrowLeft />
        </button>
      </header>
      <div className="px-5">
        <h1 className="font-display text-[48px] leading-none">Settings</h1>
      </div>

      <section className="mx-4 mt-8 rounded-[26px] border border-line-2 bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="eyebrow text-ink-3">AI · OpenAI</p>
          {hydrated && (
            <span className={`eyebrow inline-flex items-center gap-1.5 ${settings.openaiKey ? "text-leaf" : "text-turmeric"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${settings.openaiKey ? "bg-leaf" : "bg-turmeric"}`} />
              {settings.openaiKey ? "Key saved" : "No key"}
            </span>
          )}
        </div>
        <h2 className="font-display mt-2 text-[28px] leading-none">Your OpenAI key</h2>
        <p className="mt-2 text-[13px] leading-snug text-ink-2">
          Powers the YouTube converter, the chat and &ldquo;make it yours&rdquo;. It&rsquo;s stored only on this phone and sent with each request — never saved on our server.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line-2 bg-paper px-3 focus-within:border-ink/50">
          <input
            value={key}
            onChange={(e) => setDraft(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            aria-label="OpenAI API key"
            className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-[14px] placeholder:text-ink-3 focus:outline-none"
          />
          <button onClick={() => setShow((s) => !s)} className="press p-2 text-ink-3" aria-label={show ? "Hide key" : "Show key"}>
            <Eye size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              saveSettings({ openaiKey: (draft ?? "").trim() });
              setDraft(null);
              setTest({ state: "idle" });
            }}
            disabled={!dirty}
            className="press rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-paper disabled:opacity-30"
          >
            Save key
          </button>
          <button onClick={check} disabled={!key || test.state === "busy"} className="press rounded-full border border-line-2 px-4 py-2.5 text-[13px] font-medium disabled:opacity-30">
            {test.state === "busy" ? "Testing…" : "Test connection"}
          </button>
          {settings.openaiKey && !dirty && (
            <button
              onClick={() => {
                saveSettings({ openaiKey: "" });
                setTest({ state: "idle" });
              }}
              className="press px-2 py-2.5 text-[13px] text-chilli"
            >
              Remove
            </button>
          )}
        </div>
        {test.state === "ok" && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-leaf">
            <Check size={16} /> {test.msg}
          </p>
        )}
        {test.state === "fail" && <p className="mt-3 text-[13px] text-chilli">{test.msg}</p>}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="mt-4 block text-[12px] text-ink-3 underline underline-offset-4">
          Get a key at platform.openai.com
        </a>

        <div className="mt-6 border-t border-line pt-5">
          <p className="eyebrow text-ink-3">Model</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MODELS.map((m) => (
              <button
                key={m}
                onClick={() => saveSettings({ model: m })}
                className={`press rounded-full border px-3.5 py-2 font-mono text-[12px] ${settings.model === m ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            value={settings.model}
            onChange={(e) => saveSettings({ model: e.target.value })}
            aria-label="Custom model name"
            className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-[13px] focus:border-ink/50 focus:outline-none"
          />
          <p className="mt-2 text-[12px] text-ink-3">Or type any model your account has.</p>
        </div>
      </section>

      <section className="mx-4 mt-4 rounded-[26px] border border-line-2 bg-card p-5">
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
        Adukala keeps your recipes and progress in this browser. Clearing site data removes them.
      </p>
    </main>
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
