"use client";

import { useSyncExternalStore } from "react";
import { applySyncItems, clearSharedData, localSyncItems, type SyncItem } from "./store";
import { itemId, mergeItems } from "./sync-merge";

// Who's signed in, and keeping the household's shared data in sync.

export interface Household {
  name: string;
  inviteCode: string;
  members: { username: string; displayName: string }[];
}
export interface AccountState {
  status: "loading" | "out" | "in";
  user?: { username: string; displayName: string };
  household?: Household;
  syncing?: boolean;
  lastSync?: number;
  syncError?: string;
}

let state: AccountState = { status: "loading" };
const listeners = new Set<() => void>();
function set(next: Partial<AccountState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
const SERVER_STATE: AccountState = { status: "loading" };

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => SERVER_STATE,
  );
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

type MeResponse = { user: AccountState["user"] | null; household?: Household };

function signedIn(r: MeResponse) {
  if (r.user) set({ status: "in", user: r.user, household: r.household });
  else set({ status: "out", user: undefined, household: undefined });
}

export async function refreshAccount() {
  try {
    signedIn(await call<MeResponse>("/api/auth/me"));
  } catch {
    // Offline or no database yet: behave as signed out, keep local data.
    set({ status: "out" });
  }
}

export async function signUp(input: { username: string; password: string; displayName: string; inviteCode?: string }) {
  signedIn(await call<MeResponse>("/api/auth/signup", input));
  await syncNow();
}

export async function logIn(input: { username: string; password: string }) {
  signedIn(await call<MeResponse>("/api/auth/login", input));
  await syncNow();
}

export async function logOut() {
  await call("/api/auth/logout", {});
  // The household's data stays in the account, not on a phone someone else may use next.
  clearSharedData();
  set({ status: "out", user: undefined, household: undefined, lastSync: undefined });
}

export async function joinHousehold(code: string) {
  const r = await call<{ household: Household }>("/api/household/join", { code });
  set({ household: r.household });
  await syncNow();
}

export async function renameHousehold(name: string) {
  const r = await call<{ household: Household }>("/api/household/rename", { name });
  set({ household: r.household });
}

let inflight: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (state.status !== "in") return Promise.resolve();
  inflight ??= (async () => {
    set({ syncing: true, syncError: undefined });
    try {
      const r = await call<{ items: SyncItem[] }>("/api/sync", { items: localSyncItems() });
      // Anything changed on this phone while the request was in flight must survive:
      // merge the reply with what's here *now*, not what was sent.
      const now = localSyncItems();
      const merged = mergeItems(now, r.items);
      applySyncItems(merged);
      const server = new Map(r.items.map((i) => [itemId(i), i.updatedAt]));
      const newer = now.some((i) => (server.get(itemId(i)) ?? -1) < i.updatedAt);
      set({ syncing: false, lastSync: Date.now() });
      if (newer) queueMicrotask(() => void syncNow());
    } catch (e) {
      set({ syncing: false, syncError: e instanceof Error ? e.message : "Sync failed" });
      if (e instanceof Error && /log in/i.test(e.message)) set({ status: "out" });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
