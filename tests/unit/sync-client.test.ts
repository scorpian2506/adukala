// The phone-side sync: a change made while a sync request is in flight must not be lost.
import { beforeAll, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
    addEventListener() {},
    removeEventListener() {},
  };
});

describe("syncNow", () => {
  it("keeps a star tapped while the request is in flight, then pushes it", async () => {
    const store = await import("@/lib/store");
    const account = await import("@/lib/account");
    let releaseSync: (v: Response) => void = () => {};
    const bodies: { items: { kind: string; key: string; deleted?: boolean }[] }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/auth/login")) return Response.json({ user: { username: "s", displayName: "S" }, household: { name: "h", inviteCode: "ABC234", members: [] } });
      if (url.endsWith("/api/sync")) {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        if (bodies.length === 1) return new Promise<Response>((r) => (releaseSync = r));
        return Response.json({ items: body.items });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const login = account.logIn({ username: "s", password: "x" });
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    // User taps a star while the first sync is still on its way back.
    store.toggleMark("star", "idli");
    // Server replies with what it knew before the tap: nothing.
    releaseSync(Response.json({ items: [] }));
    await login;
    expect(store.isMarked(store.getMarks(), "star", "idli")).toBe(true);
    // …and the star gets pushed in a follow-up sync.
    await vi.waitFor(() => expect(bodies.some((b) => b.items.some((i) => i.kind === "star" && i.key === "idli" && !i.deleted))).toBe(true));
    vi.unstubAllGlobals();
  });
});
