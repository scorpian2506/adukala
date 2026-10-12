"use client";

import { useSyncExternalStore } from "react";
import type { Recipe } from "./types";
import { PROVIDERS, isProviderId, type ProviderId } from "./providers";

// Everything personal lives in the browser: AI keys (optional), saved
// recipes, and where they are in a cook.

const KEYS = {
  settings: "adukala.settings.v1",
  recipes: "adukala.recipes.v1",
  progress: "adukala.progress.v1",
} as const;

export interface Settings {
  /** "none" = the free, built-in converter. No AI calls at all. */
  provider: ProviderId | "none";
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  voice: boolean; // read steps aloud
  listen: boolean; // "next" by voice
}

const DEFAULT_SETTINGS: Settings = { provider: "none", keys: {}, models: {}, voice: false, listen: false };

/** True when an AI provider is chosen and has what it needs. */
export function aiReady(s: Settings) {
  if (s.provider === "none") return false;
  const p = PROVIDERS[s.provider];
  return !p.needsKey || !!s.keys[s.provider]?.trim();
}

export function modelFor(s: Settings, id: ProviderId) {
  return s.models[id]?.trim() || PROVIDERS[id].defaultModel;
}

export interface Progress {
  recipeId: string;
  servings: number;
  index: number; // position in the flattened prep+cook list
  updatedAt: number;
}

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full; the app still works for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY_RECIPES: Recipe[] = [];
const EMPTY_PROGRESS: Record<string, Progress> = {};

type LegacySettings = Partial<Settings> & { openaiKey?: string; model?: string };

export function getSettings(): Settings {
  const raw = read<LegacySettings>(KEYS.settings, DEFAULT_SETTINGS);
  const s: Settings = {
    provider: raw.provider === "none" || isProviderId(raw.provider) ? raw.provider : "none",
    keys: { ...(raw.keys ?? {}) },
    models: { ...(raw.models ?? {}) },
    voice: !!raw.voice,
    listen: !!raw.listen,
  };
  // v1 stored a single OpenAI key.
  if (raw.openaiKey && !s.keys.openai) {
    s.keys.openai = raw.openaiKey;
    if (!raw.provider) s.provider = "openai";
    if (raw.model) s.models.openai = raw.model;
  }
  return s;
}

export function saveSettings(patch: Partial<Settings>) {
  write(KEYS.settings, { ...getSettings(), ...patch });
}

export function saveKey(id: ProviderId, key: string) {
  const s = getSettings();
  saveSettings({ keys: { ...s.keys, [id]: key.trim() } });
}

export function saveModel(id: ProviderId, model: string) {
  const s = getSettings();
  saveSettings({ models: { ...s.models, [id]: model } });
}

let settingsSnap: Settings = DEFAULT_SETTINGS;
let settingsRaw = "";
function settingsSnapshot() {
  const next = getSettings();
  const raw = JSON.stringify(next);
  if (raw !== settingsRaw) {
    settingsRaw = raw;
    settingsSnap = next;
  }
  return settingsSnap;
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, settingsSnapshot, () => DEFAULT_SETTINGS);
}

export function getSavedRecipes(): Recipe[] {
  return read<Recipe[]>(KEYS.recipes, EMPTY_RECIPES);
}

export function saveRecipe(recipe: Recipe) {
  const rest = getSavedRecipes().filter((r) => r.id !== recipe.id);
  write(KEYS.recipes, [{ ...recipe, createdAt: recipe.createdAt ?? Date.now() }, ...rest]);
}

export function deleteRecipe(id: string) {
  write(
    KEYS.recipes,
    getSavedRecipes().filter((r) => r.id !== id),
  );
}

export function useSavedRecipes(): Recipe[] {
  return useSyncExternalStore(subscribe, getSavedRecipes, () => EMPTY_RECIPES);
}

export function getProgressMap(): Record<string, Progress> {
  return read<Record<string, Progress>>(KEYS.progress, EMPTY_PROGRESS);
}

export function getProgress(recipeId: string): Progress | undefined {
  return getProgressMap()[recipeId];
}

export function saveProgress(p: Omit<Progress, "updatedAt">) {
  write(KEYS.progress, { ...getProgressMap(), [p.recipeId]: { ...p, updatedAt: Date.now() } });
}

export function clearProgress(recipeId: string) {
  const next = { ...getProgressMap() };
  delete next[recipeId];
  write(KEYS.progress, next);
}

export function useProgressMap(): Record<string, Progress> {
  return useSyncExternalStore(subscribe, getProgressMap, () => EMPTY_PROGRESS);
}

/** Headers for our AI routes. The key is passed per request and never stored server-side. */
export function aiHeaders(): HeadersInit {
  const s = getSettings();
  const h: Record<string, string> = { "content-type": "application/json" };
  if (s.provider !== "none") {
    h["x-ai-provider"] = s.provider;
    h["x-ai-model"] = modelFor(s, s.provider);
    const key = s.keys[s.provider];
    if (key) h["x-ai-key"] = key;
  }
  return h;
}

// One-shot handoff between screens (e.g. a link pasted on the home page).
export function handoff(key: string, value?: string): string | null {
  try {
    if (value !== undefined) {
      window.sessionStorage.setItem(`adukala.${key}`, value);
      return value;
    }
    const v = window.sessionStorage.getItem(`adukala.${key}`);
    window.sessionStorage.removeItem(`adukala.${key}`);
    return v;
  } catch {
    return null;
  }
}
