import "server-only";
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getDb } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

export const SESSION_COOKIE = "adukala_session";
const SESSION_DAYS = 60;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// ---------- validation ----------

export function normaliseUsername(raw: unknown): string {
  const u = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,24}$/.test(u)) throw new AuthError("Username: 3–24 letters, numbers, dots or underscores.");
  return u;
}

export function checkPassword(raw: unknown): string {
  const p = String(raw ?? "");
  if (p.length < 8) throw new AuthError("Password must be at least 8 characters.");
  if (p.length > 128) throw new AuthError("Password is too long.");
  return p;
}

export function checkDisplayName(raw: unknown, fallback: string): string {
  const n = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  return n || fallback;
}

// ---------- passwords ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A real hash to compare against when the username doesn't exist, so timing doesn't reveal it.
let dummyHash: Promise<string> | undefined;

// ---------- sessions ----------

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const db = await getDb();
  await db.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), userId]);
  return token;
}

export function sessionCookie(token: string, req: Request, maxAge = SESSION_DAYS * 86400) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearCookie(req: Request) {
  return sessionCookie("", req, 0);
}

function tokenFrom(req: Request): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m?.[1];
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  householdId: string;
}

export async function currentUser(req: Request): Promise<SessionUser | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const db = await getDb();
  const rows = await db.query<{ id: string; username: string; display_name: string; household_id: string }>(
    `select u.id, u.username, u.display_name, u.household_id from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  const u = rows[0];
  return u ? { id: u.id, username: u.username, displayName: u.display_name, householdId: u.household_id } : null;
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const u = await currentUser(req);
  if (!u) throw new AuthError("Please log in.", 401);
  return u;
}

export async function endSession(req: Request) {
  const token = tokenFrom(req);
  if (!token) return;
  const db = await getDb();
  await db.query(`delete from sessions where token_hash = $1`, [sha256(token)]);
}

// ---------- requests ----------

/** Reject cross-site form posts: JSON only, and Origin (when sent) must be this site. */
export function assertSameOrigin(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new AuthError("Bad request.", 415);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) throw new AuthError("Bad origin.", 403);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new AuthError("Bad request.");
  }
}

export function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof Error && e.message === "NO_DATABASE") return Response.json({ error: "Accounts aren't switched on yet. Everything still works on this phone." }, { status: 503 });
  console.error(e);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

// ---------- households ----------

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export function newInviteCode() {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

export function normaliseCode(raw: unknown) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

async function createHousehold(name: string): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.query(`insert into households (id, name, invite_code) values ($1, $2, $3)`, [id, name, newInviteCode()]);
      return id;
    } catch (e) {
      if (attempt === 4) throw e; // invite code collision: try another
    }
  }
  return id;
}

async function householdByCode(code: string): Promise<string | null> {
  if (!code) return null;
  const db = await getDb();
  const rows = await db.query<{ id: string }>(`select id from households where invite_code = $1`, [code]);
  return rows[0]?.id ?? null;
}

// ---------- flows ----------

export async function signUp(input: { username: unknown; password: unknown; displayName?: unknown; inviteCode?: unknown }) {
  const username = normaliseUsername(input.username);
  const password = checkPassword(input.password);
  const displayName = checkDisplayName(input.displayName, username);
  const db = await getDb();
  const taken = await db.query(`select 1 from users where username = $1`, [username]);
  if (taken.length) throw new AuthError("That username is taken.", 409);

  const code = normaliseCode(input.inviteCode);
  let householdId = await householdByCode(code);
  if (code && !householdId) throw new AuthError("That household code doesn't exist.", 404);
  householdId ??= await createHousehold(`${displayName}'s kitchen`);

  const id = randomUUID();
  try {
    await db.query(`insert into users (id, username, display_name, password_hash, household_id) values ($1, $2, $3, $4, $5)`, [id, username, displayName, await hashPassword(password), householdId]);
  } catch {
    throw new AuthError("That username is taken.", 409);
  }
  return { id, username, displayName, householdId };
}

export async function logIn(input: { username: unknown; password: unknown }) {
  const generic = new AuthError("Wrong username or password.", 401);
  let username: string;
  try {
    username = normaliseUsername(input.username);
  } catch {
    throw generic;
  }
  const password = String(input.password ?? "");
  const db = await getDb();
  const rows = await db.query<{ id: string; password_hash: string; failed_logins: number; locked: boolean }>(
    `select id, password_hash, failed_logins, (locked_until is not null and locked_until > now()) as locked from users where username = $1`,
    [username],
  );
  const u = rows[0];
  if (!u) {
    dummyHash ??= hashPassword("not-a-real-password");
    await verifyPassword(password, await dummyHash);
    throw generic;
  }
  if (u.locked) throw new AuthError(`Too many tries. Wait ${LOCK_MINUTES} minutes and try again.`, 429);
  if (!(await verifyPassword(password, u.password_hash))) {
    const failed = u.failed_logins + 1;
    const lock = failed >= MAX_FAILED;
    await db.query(
      `update users set failed_logins = $2, locked_until = case when $3 then now() + interval '${LOCK_MINUTES} minutes' else locked_until end where id = $1`,
      [u.id, lock ? 0 : failed, lock],
    );
    if (failed >= MAX_FAILED) throw new AuthError(`Too many tries. Wait ${LOCK_MINUTES} minutes and try again.`, 429);
    throw generic;
  }
  await db.query(`update users set failed_logins = 0, locked_until = null where id = $1`, [u.id]);
  return u.id;
}

export async function householdInfo(householdId: string) {
  const db = await getDb();
  const [h] = await db.query<{ name: string; invite_code: string }>(`select name, invite_code from households where id = $1`, [householdId]);
  const members = await db.query<{ username: string; display_name: string }>(`select username, display_name from users where household_id = $1 order by created_at`, [householdId]);
  return { name: h?.name ?? "", inviteCode: h?.invite_code ?? "", members: members.map((m) => ({ username: m.username, displayName: m.display_name })) };
}

/** Move a user into another household, bringing their saved items along. */
export async function joinHousehold(user: SessionUser, rawCode: unknown) {
  const code = normaliseCode(rawCode);
  const target = await householdByCode(code);
  if (!target) throw new AuthError("That household code doesn't exist.", 404);
  if (target === user.householdId) return target;
  const db = await getDb();
  // Copy items over; where both have the same item, the newer change wins.
  await db.query(
    `insert into items (household_id, kind, key, data, deleted, updated_at, updated_by)
       select $2, kind, key, data, deleted, updated_at, updated_by from items where household_id = $1
     on conflict (household_id, kind, key) do update
       set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, updated_by = excluded.updated_by
       where excluded.updated_at > items.updated_at`,
    [user.householdId, target],
  );
  await db.query(`update users set household_id = $2 where id = $1`, [user.id, target]);
  // Remove the old household if nobody is left in it.
  const left = await db.query(`select 1 from users where household_id = $1 limit 1`, [user.householdId]);
  if (!left.length) await db.query(`delete from households where id = $1`, [user.householdId]);
  return target;
}

export async function renameHousehold(user: SessionUser, rawName: unknown) {
  const name = String(rawName ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) throw new AuthError("Give your household a name.");
  const db = await getDb();
  await db.query(`update households set name = $2 where id = $1`, [user.householdId, name]);
}
