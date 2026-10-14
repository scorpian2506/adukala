"use client";

import { useSyncExternalStore } from "react";
import type { Recipe } from "./types";
import { PROVIDERS, RETIRED_MODELS, isProviderId, type ProviderId } from "./providers";
import type { SyncItem } from "./sync-merge";

// Everything personal lives in the browser: AI keys (optional), saved
// recipes, and where they are in a cook.

const KEYS = {
  settings: "adukala.settings.v1",
  recipes: "adukala.recipes.v1",
  progress: "adukala.progress.v1",
  marks: "adukala.marks.v1",
  deleted: "adukala.deleted.v1",
  shared: "adukala.shared.v1", // members, plan slots, shopping ticks
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
  const m = s.models[id]?.trim();
  return m && !RETIRED_MODELS.has(m) ? m : PROVIDERS[id].defaultModel;
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
  const now = Date.now();
  write(KEYS.recipes, [{ ...recipe, createdAt: recipe.createdAt ?? now, updatedAt: now }, ...rest]);
  const tomb = { ...getDeleted() };
  delete tomb[recipe.id];
  write(KEYS.deleted, tomb);
  changed();
}

export function deleteRecipe(id: string) {
  write(
    KEYS.recipes,
    getSavedRecipes().filter((r) => r.id !== id),
  );
  write(KEYS.deleted, { ...getDeleted(), [id]: Date.now() });
  changed();
}

// ---------- stars & pins ----------
// Each mark keeps when it last changed, so two phones in a household can merge (latest wins).

export type MarkKind = "star" | "pin";
export interface Mark {
  on: boolean;
  at: number;
}
const EMPTY_MARKS: Record<string, Mark> = {};
const EMPTY_DELETED: Record<string, number> = {};

export function getMarks(): Record<string, Mark> {
  return read<Record<string, Mark>>(KEYS.marks, EMPTY_MARKS);
}

export function getDeleted(): Record<string, number> {
  return read<Record<string, number>>(KEYS.deleted, EMPTY_DELETED);
}

export function useMarks(): Record<string, Mark> {
  return useSyncExternalStore(subscribe, getMarks, () => EMPTY_MARKS);
}

export function isMarked(marks: Record<string, Mark>, kind: MarkKind, id: string) {
  return !!marks[`${kind}:${id}`]?.on;
}

export function toggleMark(kind: MarkKind, id: string) {
  const marks = getMarks();
  const key = `${kind}:${id}`;
  write(KEYS.marks, { ...marks, [key]: { on: !marks[key]?.on, at: Date.now() } });
  changed();
}

/** Ids marked with `kind`, most recently marked first. */
export function markedIds(marks: Record<string, Mark>, kind: MarkKind): string[] {
  return Object.entries(marks)
    .filter(([k, m]) => m.on && k.startsWith(`${kind}:`))
    .sort((a, b) => b[1].at - a[1].at)
    .map(([k]) => k.slice(kind.length + 1));
}

// ---------- shared household data: members, plan slots, shopping ticks ----------
// One entry per item, each with its own timestamp, so edits on different phones merge.

export type SharedKind = "member" | "plan" | "shop";
export interface SharedEntry {
  data?: unknown;
  deleted?: boolean;
  at: number;
}
const EMPTY_SHARED: Record<string, SharedEntry> = {};

export function getShared(): Record<string, SharedEntry> {
  return read<Record<string, SharedEntry>>(KEYS.shared, EMPTY_SHARED);
}

export function useShared(): Record<string, SharedEntry> {
  return useSyncExternalStore(subscribe, getShared, () => EMPTY_SHARED);
}

/** `at` defaults to now; pass 0 for a placeholder that any real edit, here or on the server, should beat. */
export function putShared(kind: SharedKind, key: string, data: unknown, at = Date.now()) {
  write(KEYS.shared, { ...getShared(), [`${kind}:${key}`]: { data, at } });
  changed();
}

/** Several writes at once (null removes). */
export function patchShared(kind: SharedKind, writes: [key: string, data: unknown][]) {
  if (!writes.length) return;
  const at = Date.now();
  const next = { ...getShared() };
  for (const [key, data] of writes) next[`${kind}:${key}`] = data === null ? { deleted: true, at } : { data, at };
  write(KEYS.shared, next);
  changed();
}

export function removeShared(kind: SharedKind, key: string) {
  write(KEYS.shared, { ...getShared(), [`${kind}:${key}`]: { deleted: true, at: Date.now() } });
  changed();
}

/** Live values of one kind, keyed by item key. */
export function sharedOf<T>(all: Record<string, SharedEntry>, kind: SharedKind): Record<string, T> {
  const out: Record<string, T> = {};
  const prefix = `${kind}:`;
  for (const [k, v] of Object.entries(all)) if (k.startsWith(prefix) && !v.deleted && v.data !== undefined) out[k.slice(prefix.length)] = v.data as T;
  return out;
}

// ---------- sync hooks ----------
// The account layer registers a listener; every change to shared data pings it.

const changeListeners = new Set<() => void>();
function changed() {
  changeListeners.forEach((l) => l());
}
export function onSharedChange(cb: () => void) {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

export type { SyncItem };

/** Everything this phone knows about shared data, for a two-way merge with the household. */
export function localSyncItems(): SyncItem[] {
  const items: SyncItem[] = [];
  for (const r of getSavedRecipes()) items.push({ kind: "recipe", key: r.id, data: r, updatedAt: r.updatedAt ?? r.createdAt ?? 0 });
  for (const [id, at] of Object.entries(getDeleted())) items.push({ kind: "recipe", key: id, deleted: true, updatedAt: at });
  for (const [k, m] of Object.entries(getMarks())) {
    const [kind, ...rest] = k.split(":");
    items.push({ kind: kind as MarkKind, key: rest.join(":"), deleted: !m.on, updatedAt: m.at });
  }
  for (const [k, e] of Object.entries(getShared())) {
    const i = k.indexOf(":");
    items.push({ kind: k.slice(0, i) as SharedKind, key: k.slice(i + 1), data: e.deleted ? undefined : e.data, deleted: e.deleted, updatedAt: e.at });
  }
  return items;
}

export function clearSharedData() {
  write(KEYS.recipes, []);
  write(KEYS.deleted, {});
  write(KEYS.marks, {});
  write(KEYS.shared, {});
}

/** Replace local shared data with the merged household set from the server. */
export function applySyncItems(items: SyncItem[]) {
  const recipes: Recipe[] = [];
  const deleted: Record<string, number> = {};
  const marks: Record<string, Mark> = {};
  const shared: Record<string, SharedEntry> = {};
  for (const it of items) {
    if (it.kind === "recipe") {
      if (it.deleted) deleted[it.key] = it.updatedAt;
      else if (it.data) recipes.push({ ...(it.data as Recipe), updatedAt: it.updatedAt });
    } else if (it.kind === "star" || it.kind === "pin") marks[`${it.kind}:${it.key}`] = { on: !it.deleted, at: it.updatedAt };
    else shared[`${it.kind}:${it.key}`] = { data: it.deleted ? undefined : it.data, deleted: it.deleted, at: it.updatedAt };
  }
  recipes.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  write(KEYS.recipes, recipes);
  write(KEYS.deleted, deleted);
  write(KEYS.marks, marks);
  write(KEYS.shared, shared);
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
