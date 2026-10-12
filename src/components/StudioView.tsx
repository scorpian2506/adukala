"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { aiHeaders, handoff, saveProgress, saveRecipe, useSettings } from "@/lib/store";
import { useHydrated } from "@/lib/useRecipe";
import { totalMinutes } from "@/lib/format";
import type { Recipe } from "@/lib/types";
import { ArrowLeft, ArrowRight, Check, LinkIcon, Send, YouTube } from "./Icons";
import { CookingLoader } from "./CookingLoader";
import { DishArt } from "./DishArt";
import { HUE_BG } from "./RecipeCard";

interface Video {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  lengthSec?: number;
  description: string;
  transcript?: string;
  linkedRecipe?: { url: string; text: string };
}

type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; options?: string[]; multiSelect?: boolean }
  | { role: "video"; video: Video }
  | { role: "recipe"; recipe: Recipe; notes?: string }
  | { role: "error"; content: string; needsKey?: boolean };

const YT = /(youtube\.com|youtu\.be)\//i;

const IDEAS = ["Palak paneer", "Kerala avial", "Veg pulao", "Pesarattu", "Kadai paneer", "Bisi bele bath"];

export function StudioView() {
  const router = useRouter();
  const settings = useSettings();
  const hydrated = useHydrated();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "video" | "chat" | "compose">(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  // A link pasted on the home screen arrives here.
  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;
    const link = handoff("link");
    if (link) void send(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const conversation = (list: Msg[]) =>
    list.flatMap((m): { role: "user" | "assistant"; content: string }[] => {
      if (m.role === "user") return [{ role: "user", content: m.content }];
      if (m.role === "assistant") return [{ role: "assistant", content: m.content + (m.options?.length ? ` [options: ${m.options.join(" / ")}]` : "") }];
      return [];
    });

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, { method: "POST", headers: aiHeaders(), body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: "Unexpected response." }));
    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong") as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return data as T;
  }

  function fail(e: unknown) {
    const status = (e as { status?: number }).status;
    setMsgs((m) => [...m, { role: "error", content: e instanceof Error ? e.message : "Something went wrong", needsKey: status === 401 }]);
    setBusy(null);
  }

  async function ask(list: Msg[], v: Video | null) {
    if (!settings.openaiKey) {
      setMsgs([...list, { role: "error", content: "To chat and write recipes, add your OpenAI key. It stays on this phone.", needsKey: true }]);
      return;
    }
    setBusy("chat");
    try {
      const out = await post<{ message: string; options: string[]; multiSelect: boolean; ready: boolean }>("/api/chat", {
        messages: conversation(list),
        video: v,
      });
      const next: Msg[] = [...list, { role: "assistant", content: out.message, options: out.ready ? [] : out.options, multiSelect: out.multiSelect }];
      setMsgs(next);
      setPicked([]);
      setBusy(null);
      if (out.ready) await compose(next, v);
    } catch (e) {
      fail(e);
    }
  }

  async function compose(list: Msg[], v: Video | null, tweak?: string) {
    setBusy("compose");
    try {
      const body = tweak && recipe ? { recipe, instruction: tweak } : { video: v, conversation: conversation(list) };
      const out = await post<{ recipe: Recipe; notes: string }>("/api/compose", body);
      saveRecipe(out.recipe);
      setRecipe(out.recipe);
      setMsgs([...list, { role: "recipe", recipe: out.recipe, notes: out.notes }]);
      setBusy(null);
    } catch (e) {
      fail(e);
    }
  }

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || busy) return;
    setText("");
    const list: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(list);

    // A finished recipe in the chat: further messages are tweaks to it.
    if (recipe && !YT.test(content)) {
      if (!settings.openaiKey) return ask(list, video);
      return compose(list, video, content);
    }

    if (YT.test(content)) {
      setBusy("video");
      try {
        const { video: v } = await post<{ video: Video }>("/api/youtube", { url: content });
        setVideo(v);
        setRecipe(null);
        const withVideo: Msg[] = [...list, { role: "video", video: v }];
        setMsgs(withVideo);
        setBusy(null);
        await ask(withVideo, v);
      } catch (e) {
        fail(e);
      }
      return;
    }
    await ask(list, video);
  }

  function choose(option: string, multi?: boolean) {
    if (multi) {
      setPicked((p) => (p.includes(option) ? p.filter((x) => x !== option) : [...p, option]));
      return;
    }
    void send(option);
  }

  function justMakeIt() {
    const list: Msg[] = [...msgs, { role: "user", content: "Just make it — use sensible defaults." }];
    setMsgs(list);
    void compose(list, video);
  }

  const last = msgs[msgs.length - 1];
  const awaitingOptions = last?.role === "assistant" && last.options?.length && !busy;
  const empty = msgs.length === 0;

  return (
    <main className="app-h relative flex flex-col">
      <header className="safe-t z-10 flex items-center justify-between border-b border-line bg-paper/90 px-4 pb-3 backdrop-blur">
        <button onClick={() => router.back()} className="press grid h-10 w-10 place-items-center rounded-full border border-line-2" aria-label="Back">
          <ArrowLeft />
        </button>
        <div className="text-center">
          <p className="font-display text-[22px] leading-none">Recipe studio</p>
          <p className="eyebrow mt-1 text-ink-3">{video ? "From YouTube" : "Describe or paste"}</p>
        </div>
        {msgs.length ? (
          <button
            onClick={() => {
              setMsgs([]);
              setVideo(null);
              setRecipe(null);
            }}
            className="press rounded-full border border-line-2 px-3 py-2 text-[12px]"
          >
            New
          </button>
        ) : (
          <span className="w-10" />
        )}
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4">
        {empty && (
          <div className="pt-8 animate-rise">
            <p className="eyebrow text-ink-3">New recipe</p>
            <h1 className="font-display mt-2 text-[46px] leading-[0.95]">
              What are we <em className="text-chilli">cooking?</em>
            </h1>
            <p className="mt-3 max-w-[320px] text-[15px] leading-relaxed text-ink-2">
              Paste a YouTube recipe link, or just name a dish. I&rsquo;ll ask a couple of quick questions, then write every step with exact measures.
            </p>
            <button
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  if (t) void send(t);
                } catch {
                  document.getElementById("studio-input")?.focus();
                }
              }}
              className="press mt-6 flex w-full items-center gap-3 rounded-[22px] bg-ink p-4 text-left text-paper"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-chilli">
                <YouTube size={22} />
              </span>
              <span className="flex-1">
                <span className="block text-[16px] font-medium">Paste YouTube link</span>
                <span className="block text-[12px] text-paper/60">From your clipboard</span>
              </span>
              <ArrowRight />
            </button>
            <p className="eyebrow mt-8 text-ink-3">Or try</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {IDEAS.map((i) => (
                <button key={i} onClick={() => send(`I want to make ${i}`)} className="press rounded-full border border-line-2 px-3.5 py-2 text-[13px] text-ink-2">
                  {i}
                </button>
              ))}
            </div>
            {hydrated && !settings.openaiKey && (
              <Link href="/settings" className="press mt-8 flex items-center justify-between rounded-[20px] border border-dashed border-turmeric bg-turmeric-soft/40 p-4">
                <span>
                  <span className="block text-[14px] font-medium">Connect OpenAI to use the studio</span>
                  <span className="block text-[12px] text-ink-2">Your key stays on this phone.</span>
                </span>
                <ArrowRight size={18} />
              </Link>
            )}
          </div>
        )}

        <div className="space-y-3 pt-4">
          {msgs.map((m, i) => (
            <Bubble key={i} m={m} onOpen={(r) => router.push(`/recipe/${r.id}`)} onCook={(r) => {
              saveProgress({ recipeId: r.id, servings: r.servings, index: 0 });
              router.push(`/cook/${r.id}`);
            }} />
          ))}
        </div>

        {awaitingOptions && last.role === "assistant" && (
          <div className="mt-3 animate-rise">
            <div className="flex flex-wrap gap-2">
              {last.options!.map((o) => {
                const on = picked.includes(o);
                return (
                  <button
                    key={o}
                    onClick={() => choose(o, last.multiSelect)}
                    className={`press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] ${on ? "border-ink bg-ink text-paper" : "border-ink/30 bg-card text-ink"}`}
                  >
                    {on && <Check size={14} />}
                    {o}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-3">
              {last.multiSelect && (
                <button
                  disabled={!picked.length}
                  onClick={() => send(picked.join(", "))}
                  className="press rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-30"
                >
                  Done
                </button>
              )}
              <button onClick={justMakeIt} className="press text-[13px] text-ink-2 underline underline-offset-4">
                Skip questions, write it now
              </button>
            </div>
          </div>
        )}

        {busy === "video" && <TypingBubble label="Watching the video" />}
        {busy === "chat" && <TypingBubble label="Thinking" />}
        {busy === "compose" && (
          <div className="mt-3 rounded-[26px] border border-line bg-card">
            <CookingLoader
              inline
              title={recipe ? "Updating your recipe" : "Writing your recipe"}
              lines={["Reading the method", "Checking measurements against trusted recipes", "Converting everything to grams and spoons", "Splitting it into tiny steps", "Adding timers and cues"]}
            />
          </div>
        )}
        <div ref={bottom} className="h-2" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="safe-b border-t border-line bg-paper px-3 pt-3"
      >
        <div className="flex items-end gap-2 rounded-[22px] border border-line-2 bg-card p-1.5 pl-4 focus-within:border-ink/50">
          <LinkIcon size={18} className="mb-3 shrink-0 text-ink-3" />
          <textarea
            id="studio-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={1}
            placeholder={recipe ? "Tweak it: “less spicy”, “for 6 people”…" : "Paste a link or name a dish"}
            className="max-h-28 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] placeholder:text-ink-3 focus:outline-none"
          />
          <button type="submit" disabled={!text.trim() || !!busy} className="press grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-paper disabled:opacity-25" aria-label="Send">
            <Send size={18} />
          </button>
        </div>
      </form>
    </main>
  );
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="mt-3 flex w-fit items-center gap-2 rounded-[20px] rounded-bl-md bg-paper-2 px-4 py-3 text-[14px] text-ink-2 animate-fade">
      {label}
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((d) => (
          <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-3" style={{ animation: `dots 1.2s ${d * 0.2}s infinite` }} />
        ))}
      </span>
    </div>
  );
}

function Bubble({ m, onOpen, onCook }: { m: Msg; onOpen: (r: Recipe) => void; onCook: (r: Recipe) => void }) {
  if (m.role === "user") {
    const isLink = YT.test(m.content);
    return (
      <div className="flex justify-end animate-rise">
        <p className={`max-w-[85%] break-words rounded-[20px] rounded-br-md bg-ink px-4 py-2.5 text-[15px] text-paper ${isLink ? "font-mono text-[12px]" : ""}`}>{m.content}</p>
      </div>
    );
  }
  if (m.role === "assistant") {
    return (
      <div className="animate-rise">
        <p className="max-w-[88%] rounded-[20px] rounded-bl-md bg-paper-2 px-4 py-3 text-[15px] leading-snug text-ink">{m.content}</p>
      </div>
    );
  }
  if (m.role === "video") {
    const v = m.video;
    const signals = [v.linkedRecipe ? "written recipe" : null, v.transcript ? "transcript" : null, v.description ? "description" : null].filter(Boolean);
    return (
      <div className="overflow-hidden rounded-[22px] border border-line-2 bg-card animate-rise">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />
        <div className="p-3.5">
          <p className="eyebrow flex items-center gap-1.5 text-chilli">
            <YouTube size={14} /> {v.channel}
          </p>
          <p className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug">{v.title}</p>
          <p className="mt-2 text-[12px] text-ink-3">Read: {signals.join(" · ") || "title only"}</p>
        </div>
      </div>
    );
  }
  if (m.role === "recipe") {
    const r = m.recipe;
    const steps = r.prep.length + r.cook.length;
    return (
      <div className="overflow-hidden rounded-[26px] border border-ink bg-card animate-rise">
        <div className={`flex items-center gap-4 p-4 ${HUE_BG[r.hue]}`}>
          <DishArt recipe={r} className="h-20 w-20 shrink-0" />
          <div className="min-w-0">
            <p className="eyebrow text-ink/60">Saved to your recipes</p>
            <p className="font-display text-[28px] leading-[1]">{r.name}</p>
            <p className="mt-1 text-[12px] text-ink/70 tnum">
              {steps} steps · {totalMinutes(r)} min · serves {r.servings}
            </p>
          </div>
        </div>
        {m.notes && <p className="border-b border-line px-4 py-3 text-[13px] leading-snug text-ink-2">{m.notes}</p>}
        <div className="flex gap-2 p-3">
          <button onClick={() => onOpen(r)} className="press flex-1 rounded-2xl border border-line-2 py-3 text-[14px] font-medium">
            See recipe
          </button>
          <button onClick={() => onCook(r)} className="press flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-[14px] font-medium text-paper">
            Start cooking <ArrowRight size={16} />
          </button>
        </div>
        <p className="px-4 pb-3 text-[12px] text-ink-3">Want changes? Type them below, like &ldquo;less oil&rdquo; or &ldquo;for 5 people&rdquo;.</p>
      </div>
    );
  }
  return (
    <div className="rounded-[20px] border border-chilli/40 bg-chilli-soft/30 px-4 py-3 text-[14px] text-ink animate-rise">
      {m.content}
      {m.needsKey && (
        <Link href="/settings" className="press mt-2 flex w-fit items-center gap-1 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-paper">
          Add OpenAI key <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}
