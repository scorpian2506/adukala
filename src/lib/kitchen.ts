"use client";

import { useEffect, useRef } from "react";

// Browser capabilities for hands-busy cooking: chime, vibration, speech,
// voice commands, and keeping the screen awake.

let audio: AudioContext | null = null;

/** Call from a tap so iOS lets us play sound later. */
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

export function chime() {
  try {
    unlockAudio();
    if (!audio) return;
    const now = audio.currentTime;
    [880, 1175, 1568].forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.3, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
      o.connect(g).connect(audio!.destination);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.55);
    });
  } catch {
    // No audio available.
  }
  try {
    navigator.vibrate?.([220, 120, 220, 120, 400]);
  } catch {
    // Vibration unsupported (iOS).
  }
}

export function speak(text: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = s.getVoices();
    u.voice = voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    u.rate = 0.95;
    s.speak(u);
  } catch {
    // Speech unsupported.
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // Denied (battery saver, unsupported).
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

export function speechRecognitionSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export type VoiceCommand = "next" | "back" | "repeat" | "timer" | "whistle";

const COMMANDS: [RegExp, VoiceCommand][] = [
  [/\b(next|done|okay next|ok next|added)\b/, "next"],
  [/\b(back|previous|go back)\b/, "back"],
  [/\b(repeat|again|say again)\b/, "repeat"],
  [/\b(start|timer|start timer)\b/, "timer"],
  [/\b(whistle|whistled)\b/, "whistle"],
];

/** Listens continuously for a handful of words while `active`. */
export function useVoiceCommands(active: boolean, onCommand: (c: VoiceCommand) => void) {
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  });

  useEffect(() => {
    if (!active || !speechRecognitionSupported()) return;
    const w = window as unknown as Record<string, new () => Recognition>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-IN";
    let stopped = false;
    let last = 0;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const said = e.results[i][0].transcript.toLowerCase();
        const hit = COMMANDS.find(([re]) => re.test(said));
        if (hit && Date.now() - last > 900) {
          last = Date.now();
          handler.current(hit[1]);
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") stopped = true;
    };
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start();
        } catch {}
      }
    };
    try {
      rec.start();
    } catch {}
    return () => {
      stopped = true;
      try {
        rec.stop();
      } catch {}
    };
  }, [active]);
}
