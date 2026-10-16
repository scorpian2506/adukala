// Two-way merge for household data: per item, the newest change wins.
// Pure, so the server and tests share it.

export type SyncKind = "recipe" | "star" | "pin" | "member" | "plan" | "shop" | "kitchen";
/** Kinds whose value lives in `data` (stars/pins are just on/off). */
export const DATA_KINDS = new Set<SyncKind>(["recipe", "member", "plan", "shop", "kitchen"]);

export interface SyncItem {
  kind: SyncKind;
  key: string;
  data?: unknown;
  deleted?: boolean;
  updatedAt: number;
}

export const SYNC_KINDS = new Set<string>(["recipe", "star", "pin", "member", "plan", "shop", "kitchen"]);
export const MAX_ITEMS = 2000;
export const MAX_ITEM_BYTES = 200_000;

export function itemId(i: Pick<SyncItem, "kind" | "key">) {
  return `${i.kind}:${i.key}`;
}

/** Keep only well-formed items; never trust the client. */
export function sanitize(items: unknown): SyncItem[] {
  if (!Array.isArray(items)) return [];
  const out: SyncItem[] = [];
  for (const raw of items.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    if (typeof it.kind !== "string" || !SYNC_KINDS.has(it.kind)) continue;
    if (typeof it.key !== "string" || !it.key || it.key.length > 200) continue;
    const updatedAt = Number(it.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt < 0) continue;
    const deleted = !!it.deleted;
    let data: unknown;
    if (!deleted && DATA_KINDS.has(it.kind as SyncKind)) {
      if (!it.data || typeof it.data !== "object") continue;
      if (JSON.stringify(it.data).length > MAX_ITEM_BYTES) continue;
      data = it.data;
    }
    // Clocks on phones drift; don't let a future timestamp win forever.
    out.push({ kind: it.kind as SyncItem["kind"], key: it.key, data, deleted, updatedAt: Math.min(updatedAt, Date.now() + 60_000) });
  }
  return out;
}

export function mergeItems(a: SyncItem[], b: SyncItem[]): SyncItem[] {
  const map = new Map<string, SyncItem>();
  for (const it of [...a, ...b]) {
    const id = itemId(it);
    const cur = map.get(id);
    if (!cur || it.updatedAt > cur.updatedAt || (it.updatedAt === cur.updatedAt && it.deleted && !cur.deleted)) map.set(id, it);
  }
  return [...map.values()];
}
