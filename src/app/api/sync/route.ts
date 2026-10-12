import { assertSameOrigin, authErrorResponse, readJson, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { mergeItems, sanitize, type SyncItem } from "@/lib/sync-merge";

// Two-way sync of the household's stars, pins and saved recipes.
// The phone sends everything it has; the newest change per item wins; the merged set comes back.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const incoming = sanitize((await readJson(req)).items);
    const db = await getDb();
    const rows = await db.query<{ kind: SyncItem["kind"]; key: string; data: unknown; deleted: boolean; updated_at: string | number }>(
      `select kind, key, data, deleted, updated_at from items where household_id = $1`,
      [user.householdId],
    );
    const server: SyncItem[] = rows.map((r) => ({ kind: r.kind, key: r.key, data: r.data ?? undefined, deleted: r.deleted, updatedAt: Number(r.updated_at) }));
    const serverById = new Map(server.map((s) => [`${s.kind}:${s.key}`, s]));
    const merged = mergeItems(server, incoming);

    // Write only what the phone changed more recently than the server.
    for (const it of merged) {
      const cur = serverById.get(`${it.kind}:${it.key}`);
      if (cur && cur.updatedAt >= it.updatedAt && cur.deleted === !!it.deleted) continue;
      await db.query(
        `insert into items (household_id, kind, key, data, deleted, updated_at, updated_by) values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (household_id, kind, key) do update set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, updated_by = excluded.updated_by
         where excluded.updated_at >= items.updated_at`,
        [user.householdId, it.kind, it.key, it.deleted ? null : JSON.stringify(it.data ?? null), !!it.deleted, it.updatedAt, user.id],
      );
    }
    return Response.json({ items: merged }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return authErrorResponse(e);
  }
}
