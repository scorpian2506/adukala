"use client";

import Link from "next/link";
import { useState } from "react";
import { joinHousehold, logIn, logOut, renameHousehold, signUp, syncNow, useAccount } from "@/lib/account";
import { BottomNav } from "./Nav";
import { Check, ChevronRight, Eye, Gear, User } from "./Icons";

export function AccountView() {
  const acct = useAccount();
  return (
    <main className="app-min-h pb-32">
      <div className="safe-t px-5">
        <h1 className="font-display text-[44px] leading-none">{acct.status === "in" ? `Hi, ${acct.user?.displayName}` : "Your kitchen"}</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          {acct.status === "in" ? "Your stars, pins and saved recipes are shared with everyone in your household." : "Sign in to keep your stars, pins and saved recipes on every phone — and share them with your family."}
        </p>
      </div>
      {acct.status === "loading" && <div className="mx-4 mt-6 h-40 animate-pulse rounded-[26px] bg-paper-2" />}
      {acct.status === "out" && <AuthForms />}
      {acct.status === "in" && <Signed />}

      <section className="mx-4 mt-6 overflow-hidden rounded-[22px] border border-line-2 bg-card">
        {[
          { href: "/settings", label: "Settings", hint: "Recipe converter, AI, voice", icon: <Gear size={20} /> },
          { href: "/guide", label: "Spoons, cups & flame guide", hint: "Kitchen basics for beginners", icon: <span className="font-display text-[18px]">½</span> },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="press flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-paper-2">{l.icon}</span>
            <span className="flex-1">
              <span className="block text-[15px] font-medium">{l.label}</span>
              <span className="block text-[12px] text-ink-3">{l.hint}</span>
            </span>
            <ChevronRight size={18} className="text-ink-3" />
          </Link>
        ))}
      </section>
      <BottomNav />
    </main>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [show, setShow] = useState(false);
  const isPw = props.type === "password";
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <span className="mt-1 flex items-center rounded-2xl border border-line-2 bg-paper px-3 focus-within:border-ink/50">
        <input {...props} type={isPw && show ? "text" : props.type} className="min-w-0 flex-1 bg-transparent py-3 text-[16px] placeholder:text-ink-3 focus:outline-none" />
        {isPw && (
          <button type="button" onClick={() => setShow((s) => !s)} className="press p-1.5 text-ink-3" aria-label={show ? "Hide password" : "Show password"}>
            <Eye size={18} />
          </button>
        )}
      </span>
    </label>
  );
}

function AuthForms() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [form, setForm] = useState({ username: "", password: "", displayName: "", inviteCode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const up = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUp(form);
      else await logIn(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-4 mt-6 rounded-[26px] border border-line-2 bg-card p-5">
      <div className="grid grid-cols-2 rounded-full border border-line-2 p-1" role="tablist">
        {(["signup", "login"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => (setMode(m), setError(null))}
            className={`press rounded-full py-2 text-[14px] font-medium ${mode === m ? "bg-ink text-paper" : "text-ink-2"}`}
          >
            {m === "signup" ? "Create account" : "Log in"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <Field label="Username" value={form.username} onChange={up("username")} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} placeholder="e.g. sriram" />
        {mode === "signup" && <Field label="Your name" value={form.displayName} onChange={up("displayName")} autoComplete="nickname" maxLength={40} placeholder="Shown to your household" />}
        <Field label="Password" type="password" value={form.password} onChange={up("password")} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : 1} placeholder={mode === "signup" ? "At least 8 characters" : ""} />
        {mode === "signup" && (
          <Field label="Household code (optional)" value={form.inviteCode} onChange={up("inviteCode")} autoCapitalize="characters" spellCheck={false} maxLength={12} placeholder="Joining your family? Enter their code" />
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-chilli-soft/40 px-3 py-2 text-[13px] text-ink">
            {error}
          </p>
        )}
        <button disabled={busy} className="press w-full rounded-2xl bg-ink py-4 text-[15px] font-medium text-paper disabled:opacity-50">
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>
      <p className="mt-3 text-[12px] text-ink-3">No email needed. Passwords are stored as one-way hashes; nobody can read them.</p>
    </section>
  );
}

function Signed() {
  const acct = useAccount();
  const h = acct.household!;
  const [code, setCode] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(fn: () => Promise<void>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  async function share() {
    const text = `Join our kitchen on Adukala: open ${window.location.origin}/account and use household code ${h.inviteCode}`;
    try {
      if (navigator.share) await navigator.share({ title: "Adukala household", text });
      else {
        await navigator.clipboard.writeText(h.inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  return (
    <>
      <section className="mx-4 mt-6 rounded-[26px] bg-ink p-5 text-paper">
        <p className="eyebrow text-paper/60">Household</p>
        {name === null ? (
          <button onClick={() => setName(h.name)} className="press mt-1 text-left">
            <span className="font-display text-[30px] leading-tight">{h.name}</span>
            <span className="ml-2 text-[12px] text-paper/50 underline underline-offset-2">rename</span>
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await renameHousehold(name);
                setName(null);
              }, "Renamed.");
            }}
            className="mt-2 flex gap-2"
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Household name" className="min-w-0 flex-1 rounded-xl bg-paper/10 px-3 py-2 text-[16px] text-paper ring-1 ring-paper/20 focus:outline-none" />
            <button className="press rounded-xl bg-turmeric px-3 text-[13px] font-medium text-ink">Save</button>
          </form>
        )}
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-paper/10 p-3 ring-1 ring-paper/15">
          <div>
            <p className="text-[11px] text-paper/60">Invite code</p>
            <p className="font-mono text-[26px] tracking-[0.2em]" data-testid="invite-code">
              {h.inviteCode}
            </p>
          </div>
          <button onClick={share} className="press rounded-full bg-turmeric px-4 py-2.5 text-[13px] font-medium text-ink">
            {copied ? "Copied" : "Share"}
          </button>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-paper/60">Your wife or family can enter this code when they create an account, or under &ldquo;Join a household&rdquo;.</p>
        <ul className="mt-4 space-y-2">
          {h.members.map((m) => (
            <li key={m.username} className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-paper/15">
                <User size={16} />
              </span>
              <span className="text-[14px]">
                {m.displayName} <span className="text-paper/50">@{m.username}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-4 mt-4 rounded-[22px] border border-line-2 bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-medium">Sync</p>
          <button onClick={() => void syncNow()} className="press text-[13px] text-ink-2 underline underline-offset-4">
            {acct.syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <p className="mt-1 text-[12px] text-ink-3">
          {acct.syncError ? `Last sync failed: ${acct.syncError}` : acct.lastSync ? `Up to date · ${new Date(acct.lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Syncs automatically when you open the app."}
        </p>
      </section>

      <section className="mx-4 mt-4 rounded-[22px] border border-line-2 bg-card p-4">
        <p className="text-[14px] font-medium">Join a household</p>
        <p className="mt-1 text-[12px] text-ink-3">Your saved recipes come with you.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await joinHousehold(code);
              setCode("");
            }, "Joined. Your saved recipes are now shared.");
          }}
          className="mt-3 flex gap-2"
        >
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" aria-label="Household code" maxLength={12} autoCapitalize="characters" className="min-w-0 flex-1 rounded-xl border border-line-2 bg-paper px-3 py-2.5 font-mono text-[16px] uppercase tracking-widest focus:outline-none" />
          <button disabled={!code.trim()} className="press rounded-xl bg-ink px-4 text-[14px] font-medium text-paper disabled:opacity-30">
            Join
          </button>
        </form>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`mt-3 flex items-center gap-1.5 text-[13px] ${msg.ok ? "text-leaf" : "text-chilli"}`}>
            {msg.ok && <Check size={15} />} {msg.text}
          </p>
        )}
      </section>

      <div className="mx-4 mt-4 flex justify-end">
        <button onClick={() => void logOut()} className="press rounded-full border border-line-2 px-4 py-2.5 text-[13px] font-medium">
          Log out @{acct.user?.username}
        </button>
      </div>
    </>
  );
}
