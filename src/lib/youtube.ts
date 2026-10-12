import "server-only";

// Pull everything useful out of a recipe video without an API key:
// title + description (often has the ingredient list), captions, and the
// creator's own recipe page (usually carries schema.org Recipe JSON-LD).

export interface VideoSource {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  lengthSec?: number;
  description: string;
  transcript?: string;
  transcriptLang?: string;
  linkedRecipe?: { url: string; text: string };
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1, 12) || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

/** Extract a JSON object assigned in inline script, e.g. `ytInitialPlayerResponse = {...};` */
function extractJsonAfter(html: string, marker: string): unknown | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function get(url: string, init: RequestInit = {}, ms = 9000) {
  return fetch(url, {
    ...init,
    headers: { "user-agent": UA, "accept-language": "en-IN,en;q=0.9", cookie: "CONSENT=YES+1; SOCS=CAI", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(ms),
    cache: "no-store",
  });
}

type Track = { baseUrl: string; languageCode: string; kind?: string };

type PlayerDetails = { title?: string; author?: string; shortDescription?: string; lengthSeconds?: string };

async function androidPlayer(id: string): Promise<{ tracks: Track[]; details?: PlayerDetails }> {
  // The Android client returns caption URLs that don't need a browser token.
  const res = await get(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "en" } },
        videoId: id,
      }),
    },
    8000,
  );
  if (!res.ok) return { tracks: [] };
  const p = (await res.json()) as { videoDetails?: PlayerDetails; captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } } };
  return { tracks: p.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [], details: p.videoDetails };
}

type AttributedText = { content: string; commandRuns?: { startIndex: number; length: number; onTap?: { innertubeCommand?: { commandMetadata?: { webCommandMetadata?: { url?: string } } } } }[] };

/** Rebuild description text, swapping truncated link labels for the real URLs. */
function expandAttributed(t: AttributedText): string {
  let text = t.content;
  const runs = [...(t.commandRuns ?? [])].sort((a, b) => b.startIndex - a.startIndex);
  for (const r of runs) {
    const url = r.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url ?? "";
    if (!url.includes("youtube.com/redirect")) continue;
    const real = new URL(url).searchParams.get("q");
    if (real) text = text.slice(0, r.startIndex) + real + text.slice(r.startIndex + r.length);
  }
  return text;
}

/**
 * The watch-next endpoint still returns the description when YouTube shows
 * datacenter IPs (e.g. Vercel) a bot check on the player.
 */
async function descriptionFromNext(id: string): Promise<string> {
  try {
    const res = await get(
      "https://www.youtube.com/youtubei/v1/next?prettyPrint=false",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20250312.04.00", hl: "en" } }, videoId: id }),
      },
      8000,
    );
    if (!res.ok) return "";
    let best = "";
    const walk = (o: unknown) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      for (const [k, v] of Object.entries(o)) {
        if ((k === "attributedDescription" || k === "attributedDescriptionBodyText") && v && typeof (v as AttributedText).content === "string") {
          const text = expandAttributed(v as AttributedText);
          if (text.length > best.length) best = text;
        } else walk(v);
      }
    };
    walk(await res.json());
    return best.replace(/[\u202a\u202c]/g, "");
  } catch {
    return "";
  }
}

function pickTrack(tracks: Track[]): Track | undefined {
  const rank = (t: Track) => {
    const en = t.languageCode.startsWith("en");
    const manual = t.kind !== "asr";
    return (en ? 0 : 2) + (manual ? 0 : 1);
  };
  return [...tracks].sort((a, b) => rank(a) - rank(b))[0];
}

async function transcript(tracks: Track[]): Promise<{ text: string; lang: string } | null> {
  try {
    const track = pickTrack(tracks);
    if (!track) return null;
    const res = await get(track.baseUrl, {}, 8000);
    if (!res.ok) return null;
    const xml = await res.text();
    const parts: string[] = [];
    // Format 3: <p t="ms" ...>text or <s>words</s></p>; legacy: <text start="s">..</text>
    for (const m of xml.matchAll(/<(p|text)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const t = decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (t && t !== "[Music]" && t !== "[संगीत]") parts.push(t);
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    return text.length > 40 ? { text: text.slice(0, 24000), lang: track.languageCode } : null;
  } catch {
    return null;
  }
}

const SKIP_HOSTS = /(youtube|youtu\.be|instagram|facebook|fb\.me|twitter|x\.com|amazon|amzn|flipkart|whatsapp|t\.me|telegram|pinterest|spotify|hooksounds|bit\.ly|linktr\.ee|threads\.net|play\.google|apple\.com)/i;

function recipeLinks(description: string): string[] {
  const urls = description.match(/https?:\/\/[^\s)]+/g) ?? [];
  return [...new Set(urls)].filter((u) => !SKIP_HOSTS.test(u)).slice(0, 2);
}

type LdNode = Record<string, unknown>;

function findRecipeNode(node: unknown): LdNode | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipeNode(n);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as LdNode;
  const type = n["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return n;
  if (n["@graph"]) return findRecipeNode(n["@graph"]);
  return null;
}

function instructionsText(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(instructionsText);
  if (typeof v === "object") {
    const o = v as LdNode;
    if (o.itemListElement) return instructionsText(o.itemListElement);
    if (typeof o.text === "string") return [o.text];
    if (typeof o.name === "string") return [o.name];
  }
  return [];
}

function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/▢/g, "").replace(/\s+/g, " ").trim();
}

function recipeFromLd(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const r = findRecipeNode(data);
    if (!r) continue;
    return [
      `Name: ${r.name ?? ""}`,
      r.recipeYield ? `Yield: ${JSON.stringify(r.recipeYield)}` : "",
      `Ingredients:\n${((r.recipeIngredient as string[]) ?? []).map((i) => `- ${decodeEntities(String(i))}`).join("\n")}`,
      `Method:\n${instructionsText(r.recipeInstructions)
        .map((s, i) => `${i + 1}. ${stripTags(s)}`)
        .join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return null;
}

/** WP Recipe Maker markup, used by many Indian recipe blogs without JSON-LD. */
function recipeFromWprm(html: string): string | null {
  const grab = (cls: string) =>
    [...html.matchAll(new RegExp(`<(li|div)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, "g"))].map((m) => stripTags(m[2])).filter(Boolean);
  const ingredients = grab("wprm-recipe-ingredient");
  if (ingredients.length < 3) return null;
  const steps = grab("wprm-recipe-instruction-text");
  const servings = html.match(/wprm-recipe-servings[^>]*>(\d+)/)?.[1];
  return [servings ? `Serves: ${servings}` : "", `Ingredients:\n${ingredients.map((i) => `- ${i}`).join("\n")}`, `Method:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`]
    .filter(Boolean)
    .join("\n");
}

/** Last resort: the page text from the word "ingredients" onwards. */
function recipeFromText(html: string): string | null {
  const body = stripTags(html.replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, " "));
  const at = body.search(/ingredients/i);
  return at >= 0 ? body.slice(at, at + 8000) : null;
}

async function linkedRecipe(description: string): Promise<{ url: string; text: string } | undefined> {
  for (const url of recipeLinks(description)) {
    try {
      const res = await get(url, {}, 8000);
      if (!res.ok || !res.headers.get("content-type")?.includes("html")) continue;
      const html = await res.text();
      const text = recipeFromLd(html) ?? recipeFromWprm(html) ?? recipeFromText(html);
      if (text) return { url, text: text.slice(0, 12000) };
    } catch {
      // Try the next link.
    }
  }
  return undefined;
}

export async function fetchVideo(input: string): Promise<VideoSource> {
  const id = parseVideoId(input);
  if (!id) throw new Error("That doesn't look like a YouTube link.");
  const url = `https://www.youtube.com/watch?v=${id}`;

  let title = "";
  let channel = "";
  let description = "";
  let lengthSec: number | undefined;

  const [pageRes, player] = await Promise.all([get(url).catch(() => null), androidPlayer(id).catch(() => ({ tracks: [] as Track[], details: undefined }))]);
  const captions = await transcript(player.tracks);
  if (pageRes?.ok) {
    const html = await pageRes.text();
    const p = extractJsonAfter(html, "ytInitialPlayerResponse") as { videoDetails?: Record<string, string> } | null;
    const vd = p?.videoDetails;
    if (vd) {
      title = vd.title ?? "";
      channel = vd.author ?? "";
      description = vd.shortDescription ?? "";
      lengthSec = Number(vd.lengthSeconds) || undefined;
    }
  }
  // Datacenter IPs sometimes get a consent/bot page instead; the app API still answers.
  const d = player.details;
  if (d) {
    title ||= d.title ?? "";
    channel ||= d.author ?? "";
    description ||= d.shortDescription ?? "";
    lengthSec ??= Number(d.lengthSeconds) || undefined;
  }
  if (!description) description = await descriptionFromNext(id);
  if (!title) {
    // oEmbed is the most reliable fallback for the basics.
    try {
      const o = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {}, 6000);
      if (o.ok) {
        const j = (await o.json()) as { title?: string; author_name?: string };
        title = j.title ?? "";
        channel = j.author_name ?? "";
      }
    } catch {}
  }
  if (!title) throw new Error("Couldn't open that video. Is it public?");

  const linked = await linkedRecipe(description);

  return {
    id,
    url,
    title,
    channel,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    lengthSec,
    description: description.slice(0, 6000),
    transcript: captions?.text,
    transcriptLang: captions?.lang,
    linkedRecipe: linked,
  };
}

/** A compact text block for prompts. */
export function sourceToPrompt(v: VideoSource): string {
  return [
    `VIDEO: ${v.title} — by ${v.channel} (${v.url})`,
    v.description ? `DESCRIPTION:\n${v.description}` : "",
    v.linkedRecipe ? `CREATOR'S WRITTEN RECIPE (${v.linkedRecipe.url}):\n${v.linkedRecipe.text}` : "",
    v.transcript ? `TRANSCRIPT (${v.transcriptLang}, auto captions may contain errors):\n${v.transcript}` : "TRANSCRIPT: not available",
  ]
    .filter(Boolean)
    .join("\n\n");
}
