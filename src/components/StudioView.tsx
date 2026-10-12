"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { aiHeaders, aiReady, handoff, saveProgress, saveRecipe, useSavedRecipes, useSettings } from "@/lib/store";
import { useHydrated } from "@/lib/useRecipe";
import { totalMinutes } from "@/lib/format";
import { SEED_RECIPES, applyOfflineTweaks, findInLibrary, parseOfflineTweak, scaleRecipe, type CustomisationId } from "@/lib/recipes";
import { convertRecipe, cleanName, conversionQuality } from "@/lib/convert";
import { PROVIDERS } from "@/lib/providers";
import { isYouTubeUrl, TRUSTED_CHANNELS, type SearchResult } from "@/lib/yt-parse";
import type { ScrapedRecipe } from "@/lib/scrape";
import type { Recipe } from "@/lib/types";
import { ArrowRight, Check, LinkIcon, Send, YouTube } from "./Icons";
import { TopBar } from "./Nav";
import { CookingLoader } from "./CookingLoader";
import { DishArt } from "./DishArt";
import { HUE_BG } from "./RecipeCard";

export interface Video {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  lengthSec?: number;
  description: string;
  transcript?: string;
  recipe?: ScrapedRecipe;
  pageText?: { url: string; text: string };
}

/** Local (no-AI) questions the studio asks with tap chips. */
type LocalAction = "servings" | "tweaks";

type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; options?: string[]; multiSelect?: boolean; action?: LocalAction }
  | { role: "video"; video: Video }
  | { role: "results"; results: SearchResult[] }
  | { role: "library"; recipe: Recipe }
  | { role: "recipe"; recipe: Recipe; notes?: string }
  | { role: "error"; content: string; needsKey?: boolean };

const IDEAS = ["Palak paneer", "Kerala avial", "Veg pulao", "Bisi bele bath", "Kadai paneer", "Rava kesari"];
const TWEAK_OPTIONS: { label: string; id: CustomisationId }[] = [
  { label: "Low oil", id: "low_oil" },
  { label: "Less spicy", id: "less_spicy" },
  { label: "Kid friendly", id: "kid_friendly" },
];

export function StudioView() {
  const router = useRouter();
  const settings = useSettings();
  const saved = useSavedRecipes();
  const hydrated = useHydrated();
  const ai = aiReady(settings);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "video" | "search" | "chat" | "compose" | "convert">(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number | null>(null);
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
    const data = await res.json().catch(() => ({ error: "Unexpected response from the server." }));
    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong") as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return data as T;
  }

  function fail(list: Msg[], e: unknown) {
    const status = (e as { status?: number }).status;
    setMsgs([...list, { role: "error", content: e instanceof Error ? e.message : "Something went wrong", needsKey: status === 401 }]);
    setBusy(null);
  }

  function finish(list: Msg[], r: Recipe, notes?: string) {
    saveRecipe(r);
    setRecipe(r);
    setMsgs([...list, { role: "recipe", recipe: r, notes }]);
    setBusy(null);
  }

  // ---------- AI path ----------

  async function ask(list: Msg[], v: Video | null) {
    setBusy("chat");
    try {
      const out = await post<{ message: string; options: string[]; multiSelect: boolean; ready: boolean }>("/api/chat", { messages: conversation(list), video: v });
      const next: Msg[] = [...list, { role: "assistant", content: out.message, options: out.ready ? [] : out.options, multiSelect: out.multiSelect }];
      setMsgs(next);
      setPicked([]);
      setBusy(null);
      if (out.ready) await compose(next, v);
    } catch (e) {
      fail(list, e);
    }
  }

  async function compose(list: Msg[], v: Video | null, tweak?: string) {
    setBusy("compose");
    try {
      const body = tweak && recipe ? { recipe, instruction: tweak } : { video: v, conversation: conversation(list) };
      const out = await post<{ recipe: Recipe; notes: string }>("/api/compose", body);
      finish(list, out.recipe, out.notes);
    } catch (e) {
      fail(list, e);
    }
  }

  // ---------- free path ----------

  function convertFree(list: Msg[], v: Video, people: number | null, tweaks: CustomisationId[]) {
    if (!v.recipe) return;
    setBusy("convert");
    try {
      let r = convertRecipe(v.recipe, { title: v.title, channel: v.channel, url: v.url });
      const quality = conversionQuality(v.recipe, r);
      if (!quality.ok) {
        // Don't save a recipe nobody could follow; offer better sources instead.
        const note: Msg = {
          role: "assistant",
          content: `I found a written recipe, but ${quality.reason}, so I can't turn it into exact steps without AI. Here are other videos for this dish — or connect a free AI in Settings.`,
        };
        setBusy(null);
        void searchDish([...list, note], cleanName(v.title), v.id);
        return;
      }
      if (people) r = scaleRecipe(r, people);
      if (tweaks.length) r = { ...applyOfflineTweaks(r, tweaks), name: r.name };
      finish(list, r, r.warnings?.join(" "));
    } catch (e) {
      fail(list, e);
    }
  }

  function askServings(list: Msg[], v: Video) {
    const n = v.recipe?.servings;
    setMsgs([
      ...list,
      {
        role: "assistant",
        content: `Found ${v.channel ? `${v.channel}’s` : "the"} written recipe: ${v.recipe!.ingredients.length} ingredients, ${v.recipe!.steps.length || "a few"} steps. How many are you cooking for?`,
        options: [...(n ? [`As written (${n})`] : []), "1", "2", "3", "4", "6"],
        action: "servings",
      },
    ]);
  }

  async function searchDish(list: Msg[], dish: string, excludeId?: string) {
    setBusy("search");
    try {
      const { results } = await post<{ results: SearchResult[] }>("/api/search", { q: dish });
      const shown = results.filter((r) => r.id !== excludeId).slice(0, 4);
      if (!shown.length) throw new Error("No recipe videos found. Try another name, or paste a link.");
      setMsgs([...list, { role: "results", results: shown }]);
      setBusy(null);
    } catch (e) {
      fail(list, e);
    }
  }

  async function loadVideo(list: Msg[], url: string) {
    setBusy("video");
    try {
      const { video: v } = await post<{ video: Video }>("/api/youtube", { url });
      setVideo(v);
      setRecipe(null);
      setServings(null);
      const withVideo: Msg[] = [...list, { role: "video", video: v }];
      setMsgs(withVideo);
      setBusy(null);
      if (ai) return ask(withVideo, v);
      if (v.recipe) return askServings(withVideo, v);
      const note: Msg = {
        role: "assistant",
        content:
          "This video doesn’t link a written recipe, so I can’t measure it exactly on my own. Here are videos for the same dish from cooks who publish their measurements — or add a free Gemini key in Settings: it watches this video and finds the best matching recipe online.",
      };
      await searchDish([...withVideo, note], cleanName(v.title), v.id);
    } catch (e) {
      fail(list, e);
    }
  }

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || busy) return;
    setText("");
    const list: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(list);

    if (isYouTubeUrl(content)) return loadVideo(list, content);

    // A finished recipe in the chat: further messages are tweaks to it.
    if (recipe) {
      if (ai) return compose(list, video, content);
      const { servings: n, tweaks } = parseOfflineTweak(content);
      if (!n && !tweaks.length) {
        setMsgs([...list, { role: "assistant", content: "Without AI I can change the number of people, and make it low oil, less spicy or kid friendly. Try “for 5 people” or “less spicy”. For anything else, connect a free AI in Settings." }]);
        return;
      }
      let r = n ? scaleRecipe(recipe, n) : recipe;
      if (tweaks.length) r = { ...applyOfflineTweaks(r, tweaks), name: r.name };
      return finish(list, r);
    }

    const local = findInLibrary(content, [...saved, ...SEED_RECIPES]);
    const withLib: Msg[] = local ? [...list, { role: "library", recipe: local }] : list;
    if (local) setMsgs(withLib);
    if (ai) return ask(withLib, video);
    return searchDish(withLib, content);
  }

  function choose(m: Extract<Msg, { role: "assistant" }>, option: string) {
    if (m.multiSelect) {
      setPicked((p) => (p.includes(option) ? p.filter((x) => x !== option) : [...p, option]));
      return;
    }
    if (m.action === "servings" && video) {
      const n = parseInt(option.replace(/\D+/g, ""), 10) || null;
      setServings(n);
      const list: Msg[] = [...msgs, { role: "user", content: option }];
      setMsgs([...list, { role: "assistant", content: "Any changes? Pick any, or tap Done.", options: TWEAK_OPTIONS.map((t) => t.label), multiSelect: true, action: "tweaks" }]);
      setPicked([]);
      return;
    }
    void send(option);
  }

  function confirmMulti(m: Extract<Msg, { role: "assistant" }>) {
    const label = picked.length ? picked.join(", ") : "As written";
    const list: Msg[] = [...msgs, { role: "user", content: label }];
    if (m.action === "tweaks" && video) {
      setMsgs(list);
      const ids = TWEAK_OPTIONS.filter((t) => picked.includes(t.label)).map((t) => t.id);
      setPicked([]);
      return convertFree(list, video, servings, ids);
    }
    setPicked([]);
    void send(label);
  }

  function justMakeIt() {
    const list: Msg[] = [...msgs, { role: "user", content: "Just make it — use sensible defaults." }];
    setMsgs(list);
    if (!ai && video?.recipe) return convertFree(list, video, servings, []);
    void compose(list, video);
  }

  const last = msgs[msgs.length - 1];
  const awaitingOptions = last?.role === "assistant" && !!last.options?.length && !busy;
  const empty = msgs.length === 0;

  return (
    <main className="app-h relative flex flex-col">
      <header className="z-10 border-b border-line bg-paper/90 px-4 pb-3 backdrop-blur">
        <TopBar
          title={
            <>
              <p className="font-display text-[22px] leading-none">Recipe studio</p>
              <p className="eyebrow mt-1 text-ink-3">{hydrated ? (ai && settings.provider !== "none" ? `AI · ${PROVIDERS[settings.provider].name}` : "Free converter") : "\u00a0"}</p>
            </>
          }
          right={
            msgs.length ? (
              <button
                onClick={() => {
                  setMsgs([]);
                  setVideo(null);
                  setRecipe(null);
                  setServings(null);
                }}
                className="press rounded-full border border-line-2 px-3 py-2 text-[12px]"
              >
                New
              </button>
            ) : null
          }
        />
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4">
        {empty && (
          <div className="animate-rise pt-8">
            <p className="eyebrow text-ink-3">New recipe</p>
            <h1 className="font-display mt-2 text-[46px] leading-[0.95]">
              What are we <em className="text-chilli">cooking?</em>
            </h1>
            <p className="mt-3 max-w-[330px] text-[15px] leading-relaxed text-ink-2">
              Paste a YouTube recipe link, or name a dish. I&rsquo;ll find the cook&rsquo;s written recipe and turn it into measured, timed steps.
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
                <button key={i} onClick={() => send(i)} className="press rounded-full border border-line-2 px-3.5 py-2 text-[13px] text-ink-2">
                  {i}
                </button>
              ))}
            </div>
            {hydrated && !ai && (
              <Link href="/settings" className="press mt-8 flex items-center justify-between rounded-[20px] border border-dashed border-line-2 p-4">
                <span>
                  <span className="block text-[14px] font-medium">Using the free converter</span>
                  <span className="block text-[12px] text-ink-2">No AI needed. Connect a free AI (Gemini, Groq) for chat and more.</span>
                </span>
                <ArrowRight size={18} />
              </Link>
            )}
          </div>
        )}

        <div className="space-y-3 pt-4">
          {msgs.map((m, i) => (
            <Bubble
              key={i}
              m={m}
              ai={ai}
              onPick={(r) => send(`https://www.youtube.com/watch?v=${r.id}`)}
              onConvertFree={(v) => {
                const list: Msg[] = [...msgs, { role: "user", content: "Convert it without AI" }];
                setMsgs(list);
                askServings(list, v);
              }}
              onOpen={(r) => router.push(`/recipe/${r.id}`)}
              onCook={(r) => {
                saveProgress({ recipeId: r.id, servings: r.servings, index: 0 });
                router.push(`/cook/${r.id}`);
              }}
            />
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
                    onClick={() => choose(last, o)}
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
                <button onClick={() => confirmMulti(last)} className="press rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper">
                  {picked.length ? "Done" : "Done — as written"}
                </button>
              )}
              {(ai || video?.recipe) && (
                <button onClick={justMakeIt} className="press text-[13px] text-ink-2 underline underline-offset-4">
                  Skip questions, write it now
                </button>
              )}
            </div>
          </div>
        )}

        {busy === "video" && <TypingBubble label="Reading the video and the cook’s written recipe" />}
        {busy === "search" && <TypingBubble label="Searching YouTube" />}
        {busy === "chat" && <TypingBubble label="Thinking" />}
        {(busy === "compose" || busy === "convert") && (
          <div className="mt-3 rounded-[26px] border border-line bg-card">
            <CookingLoader
              inline
              title={recipe ? "Updating your recipe" : "Writing your recipe"}
              lines={
                busy === "convert"
                  ? ["Measuring every ingredient", "Splitting into small steps"]
                  : settings.provider === "gemini" && !video?.recipe
                    ? ["Watching the video with Gemini", "Searching published recipes online", "Picking the best match", "Converting everything to grams and spoons", "Splitting it into tiny steps"]
                    : ["Reading the method", "Checking measurements", "Converting everything to grams and spoons", "Splitting it into tiny steps", "Adding timers and cues"]
              }
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
            aria-label="Message"
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
    <div className="animate-fade mt-3 flex w-fit items-center gap-2 rounded-[20px] rounded-bl-md bg-paper-2 px-4 py-3 text-[14px] text-ink-2" role="status">
      {label}
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((d) => (
          <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-3" style={{ animation: `dots 1.2s ${d * 0.2}s infinite` }} />
        ))}
      </span>
    </div>
  );
}

function isTrusted(channel: string) {
  const c = channel.toLowerCase();
  return TRUSTED_CHANNELS.some((t) => c.includes(t));
}

function Bubble({
  m,
  ai,
  onPick,
  onConvertFree,
  onOpen,
  onCook,
}: {
  m: Msg;
  ai: boolean;
  onPick: (r: SearchResult) => void;
  onConvertFree: (v: Video) => void;
  onOpen: (r: Recipe) => void;
  onCook: (r: Recipe) => void;
}) {
  if (m.role === "user") {
    const isLink = isYouTubeUrl(m.content);
    return (
      <div className="animate-rise flex justify-end">
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
    const signals = [v.recipe ? (v.recipe.url ? "written recipe" : "ingredients in description") : null, v.transcript ? "transcript" : null, v.description ? "description" : null].filter(Boolean);
    return (
      <div className="animate-rise overflow-hidden rounded-[22px] border border-line-2 bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />
        <div className="p-3.5">
          <p className="eyebrow flex items-center gap-1.5 text-chilli">
            <YouTube size={14} /> {v.channel}
          </p>
          <p className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug">{v.title}</p>
          <p className="mt-2 text-[12px] text-ink-3">Read: {signals.join(" · ") || "title only"}</p>
          {ai && v.recipe && (
            <button onClick={() => onConvertFree(v)} className="press mt-3 rounded-full border border-line-2 px-3 py-1.5 text-[12px]">
              Convert free instead (no AI)
            </button>
          )}
        </div>
      </div>
    );
  }
  if (m.role === "results") {
    return (
      <div className="animate-rise space-y-2">
        <p className="eyebrow px-1 text-ink-3">Pick a video</p>
        {m.results.map((r) => (
          <button key={r.id} onClick={() => onPick(r)} className="press flex w-full items-center gap-3 rounded-[18px] border border-line-2 bg-card p-2 pr-3 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.thumbnail} alt="" className="h-[62px] w-[110px] shrink-0 rounded-xl object-cover" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[13px] font-medium leading-snug">{r.title}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                {r.channel}
                {isTrusted(r.channel) && <span className="rounded bg-leaf-soft px-1.5 py-0.5 text-[10px] font-medium text-leaf">Measured recipe</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }
  if (m.role === "library") {
    const r = m.recipe;
    return (
      <button onClick={() => onOpen(r)} className="press animate-rise flex w-full items-center gap-3 rounded-[22px] border border-ink bg-card p-3 text-left">
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${HUE_BG[r.hue]}`}>
          <DishArt recipe={r} className="h-11 w-11" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-leaf">Already in your kitchen</span>
          <span className="font-display block text-[22px] leading-tight">{r.name}</span>
          <span className="block text-[12px] text-ink-3">Tested, measured · {totalMinutes(r)} min</span>
        </span>
        <ArrowRight size={18} />
      </button>
    );
  }
  if (m.role === "recipe") {
    const r = m.recipe;
    const steps = r.prep.length + r.cook.length;
    return (
      <div className="animate-rise overflow-hidden rounded-[26px] border border-ink bg-card">
        <div className={`flex items-center gap-4 p-4 ${HUE_BG[r.hue]}`}>
          <DishArt recipe={r} className="h-20 w-20 shrink-0" />
          <div className="min-w-0">
            <p className="eyebrow text-ink/60">{r.method === "rules" ? "Converted free · saved" : "Saved to your recipes"}</p>
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
        <p className="px-4 pb-3 text-[12px] text-ink-3">Want changes? Type them below, like &ldquo;less spicy&rdquo; or &ldquo;for 5 people&rdquo;.</p>
      </div>
    );
  }
  return (
    <div className="animate-rise rounded-[20px] border border-chilli/40 bg-chilli-soft/30 px-4 py-3 text-[14px] text-ink" role="alert">
      {m.content}
      {m.needsKey && (
        <Link href="/settings" className="press mt-2 flex w-fit items-center gap-1 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-paper">
          Open settings <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

