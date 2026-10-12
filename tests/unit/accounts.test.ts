// Account, household and sync flows against the real route handlers and a real
// (in-memory, WebAssembly) Postgres.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as join } from "@/app/api/household/join/route";
import { POST as rename } from "@/app/api/household/rename/route";
import { POST as sync } from "@/app/api/sync/route";
import { hashPassword, verifyPassword, normaliseUsername, newInviteCode } from "@/lib/auth";
import { resetDbForTests, getDb } from "@/lib/db";
import { mergeItems, sanitize } from "@/lib/sync-merge";

const URL_ = "https://adukala.test";
const post = (path: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`${URL_}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: URL_, ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
const get = (path: string, cookie?: string) => new Request(`${URL_}${path}`, { headers: cookie ? { cookie } : {} });
const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];

async function newUser(username: string, extra: Record<string, unknown> = {}) {
  const res = await signup(post("/api/auth/signup", { username, password: "correct horse", displayName: username, ...extra }));
  return { res, cookie: res.status === 201 ? cookieOf(res) : "", body: await res.json() };
}

beforeAll(async () => {
  await getDb();
}, 60_000);
beforeEach(async () => {
  await resetDbForTests();
});

describe("passwords and inputs", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword("secret-123");
    const b = await hashPassword("secret-123");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$/);
    expect(await verifyPassword("secret-123", a)).toBe(true);
    expect(await verifyPassword("secret-124", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("normalises usernames", () => {
    expect(normaliseUsername("  Sriram.S ")).toBe("sriram.s");
    expect(() => normaliseUsername("ab")).toThrow();
    expect(() => normaliseUsername("has space")).toThrow();
    expect(() => normaliseUsername("x".repeat(25))).toThrow();
  });
  it("makes readable invite codes", () => {
    expect(newInviteCode()).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
  });
});

describe("sign up, log in, log out", () => {
  it("signs up, sets an httpOnly secure cookie and creates a household", async () => {
    const { res, body } = await newUser("sriram");
    expect(res.status).toBe(201);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).toMatch(/Secure/);
    expect(body.user).toEqual({ username: "sriram", displayName: "sriram" });
    expect(body.household.inviteCode).toHaveLength(6);
    expect(body.household.members).toHaveLength(1);
  });
  it("rejects duplicate usernames (any case), short passwords and bad codes", async () => {
    await newUser("sriram");
    expect((await newUser("SRIRAM")).res.status).toBe(409);
    expect((await signup(post("/api/auth/signup", { username: "abc", password: "short" }))).status).toBe(400);
    expect((await newUser("bob", { inviteCode: "NOPE99" })).res.status).toBe(404);
  });
  it("knows who you are, and forgets you after log out", async () => {
    const { cookie } = await newUser("sriram");
    expect((await (await me(get("/api/auth/me", cookie))).json()).user.username).toBe("sriram");
    expect((await logout(post("/api/auth/logout", {}, cookie))).status).toBe(200);
    expect((await (await me(get("/api/auth/me", cookie))).json()).user).toBeNull();
    expect((await (await me(get("/api/auth/me"))).json()).user).toBeNull();
  });
  it("logs in with the right password only, without revealing which part was wrong", async () => {
    await newUser("sriram");
    const bad = await login(post("/api/auth/login", { username: "sriram", password: "wrong pass" }));
    const nouser = await login(post("/api/auth/login", { username: "nobody", password: "wrong pass" }));
    expect(bad.status).toBe(401);
    expect(nouser.status).toBe(401);
    expect((await bad.json()).error).toBe((await nouser.json()).error);
    const ok = await login(post("/api/auth/login", { username: "Sriram", password: "correct horse" }));
    expect(ok.status).toBe(200);
    expect((await (await me(get("/api/auth/me", cookieOf(ok)))).json()).user.username).toBe("sriram");
  });
  it("locks the account after repeated wrong passwords", async () => {
    await newUser("sriram");
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await login(post("/api/auth/login", { username: "sriram", password: `nope-${i}xx` }))).status;
    expect(last).toBe(429);
    expect((await login(post("/api/auth/login", { username: "sriram", password: "correct horse" }))).status).toBe(429);
  }, 30_000);
  it("rejects cross-site and non-JSON posts", async () => {
    const evil = await signup(post("/api/auth/signup", { username: "eve", password: "password1" }, undefined, { origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    const form = await signup(new Request(`${URL_}/api/auth/signup`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "username=eve" }));
    expect(form.status).toBe(415);
  });
});

describe("households and sync", () => {
  const recipe = (id: string) => ({ id, name: id, ingredients: [], prep: [], cook: [] });

  it("shares stars, pins and recipes between two members", async () => {
    const a = await newUser("sriram");
    const code = a.body.household.inviteCode;
    const b = await newUser("wife", { inviteCode: code });
    expect(b.body.household.members.map((m: { username: string }) => m.username)).toEqual(["sriram", "wife"]);

    const r1 = await sync(post("/api/sync", { items: [{ kind: "star", key: "sambar", updatedAt: 100 }, { kind: "recipe", key: "my-dal", data: recipe("my-dal"), updatedAt: 100 }] }, a.cookie));
    expect(r1.status).toBe(200);
    const fromB = await (await sync(post("/api/sync", { items: [{ kind: "pin", key: "idli", updatedAt: 150 }] }, b.cookie))).json();
    expect(fromB.items.map((i: { kind: string; key: string }) => `${i.kind}:${i.key}`).sort()).toEqual(["pin:idli", "recipe:my-dal", "star:sambar"]);
    expect(fromB.items.find((i: { key: string }) => i.key === "my-dal").data.name).toBe("my-dal");
  });

  it("newest change wins, including un-starring", async () => {
    const a = await newUser("sriram");
    await sync(post("/api/sync", { items: [{ kind: "star", key: "sambar", updatedAt: 100 }] }, a.cookie));
    await sync(post("/api/sync", { items: [{ kind: "star", key: "sambar", deleted: true, updatedAt: 200 }] }, a.cookie));
    const stale = await (await sync(post("/api/sync", { items: [{ kind: "star", key: "sambar", updatedAt: 150 }] }, a.cookie))).json();
    expect(stale.items).toEqual([expect.objectContaining({ key: "sambar", deleted: true, updatedAt: 200 })]);
  });

  it("keeps households separate", async () => {
    const a = await newUser("sriram");
    const c = await newUser("stranger");
    await sync(post("/api/sync", { items: [{ kind: "star", key: "secret", updatedAt: 1 }] }, a.cookie));
    const other = await (await sync(post("/api/sync", { items: [] }, c.cookie))).json();
    expect(other.items).toEqual([]);
  });

  it("joining a household brings your saved items along", async () => {
    const a = await newUser("sriram");
    const b = await newUser("wife");
    await sync(post("/api/sync", { items: [{ kind: "star", key: "avial", updatedAt: 5 }] }, b.cookie));
    const res = await join(post("/api/household/join", { code: a.body.household.inviteCode.toLowerCase() }, b.cookie));
    expect(res.status).toBe(200);
    const items = await (await sync(post("/api/sync", { items: [] }, a.cookie))).json();
    expect(items.items.map((i: { key: string }) => i.key)).toContain("avial");
  });

  it("renames the household", async () => {
    const a = await newUser("sriram");
    const res = await rename(post("/api/household/rename", { name: "  Swaminathan   home " }, a.cookie));
    expect((await res.json()).household.name).toBe("Swaminathan home");
  });

  it("requires login and ignores malformed items", async () => {
    expect((await sync(post("/api/sync", { items: [] }))).status).toBe(401);
    const a = await newUser("sriram");
    const res = await (await sync(post("/api/sync", { items: [{ kind: "evil", key: "x", updatedAt: 1 }, { kind: "star", key: "", updatedAt: 1 }, { kind: "recipe", key: "r", updatedAt: 1 }, "junk"] }, a.cookie))).json();
    expect(res.items).toEqual([]);
  });
});

describe("merge rules", () => {
  it("prefers the newer change and deletions on ties", () => {
    const m = mergeItems([{ kind: "star", key: "a", updatedAt: 1 }], [{ kind: "star", key: "a", deleted: true, updatedAt: 1 }]);
    expect(m).toEqual([{ kind: "star", key: "a", deleted: true, updatedAt: 1 }]);
  });
  it("caps timestamps from the future", () => {
    const [it] = sanitize([{ kind: "star", key: "a", updatedAt: Date.now() + 10 ** 10 }]);
    expect(it.updatedAt).toBeLessThanOrEqual(Date.now() + 60_000);
  });
});
