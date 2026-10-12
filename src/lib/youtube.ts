import "server-only";
import {
  recipeFromDescription,
  recipeFromJsonLd,
  recipeFromWprm,
  recipeLinks,
  scrapedToText,
  decodeEntities,
  stripTags,
  type ScrapedRecipe,
} from "./scrape";
import { descriptionFromNextJson, extractJsonAfter, parseSearchResults, parseVideoId, rankResults, type SearchResult } from "./yt-parse";

// Pull everything useful out of a recipe video without an API key:
// title + description (often has the ingredient list), captions, and the
// creator's own recipe page (WP Recipe Maker or schema.org JSON-LD).
//
// YouTube shows datacenter IPs (Vercel) a bot check on the watch page and the
// player API, so every source has a fallback.

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
  /** Structured recipe: the creator's web page, else the description. */
  recipe?: ScrapedRecipe;
  /** Plain text of the creator's page when it had no recipe markup (AI only). */
  pageText?: { url: string; text: string };
}

export { parseVideoId };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const WEB_CLIENT = { clientName: "WEB", clientVersion: "2.20250312.04.00", hl: "en", gl: "IN" };

async function get(url: string, init: RequestInit = {}, ms = 9000) {
  return fetch(url, {
    ...init,
    headers: { "user-agent": UA, "accept-language": "en-IN,en;q=0.9", cookie: "CONSENT=YES+1; SOCS=CAI", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(ms),
    cache: "no-store",
  });
}

async function innertube(endpoint: "next" | "search" | "player", body: object, client: object = WEB_CLIENT, ua = UA) {
  const res = await get(
    `https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`,
    { method: "POST", headers: { "content-type": "application/json", "user-agent": ua }, body: JSON.stringify({ context: { client }, ...body }) },
    8000,
  );
  if (!res.ok) throw new Error(`YouTube ${endpoint} ${res.status}`);
  return res.json();
}

type Track = { baseUrl: string; languageCode: string; kind?: string };
type PlayerDetails = { title?: string; author?: string; shortDescription?: string; lengthSeconds?: string };

async function androidPlayer(id: string): Promise<{ tracks: Track[]; details?: PlayerDetails }> {
  // The Android client returns caption URLs that don't need a browser token (residential IPs only).
  const p = (await innertube(
    "player",
    { videoId: id },
    { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "en" },
    "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
  )) as { videoDetails?: PlayerDetails; captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } } };
  return { tracks: p.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [], details: p.videoDetails };
}

function pickTrack(tracks: Track[]): Track | undefined {
  const rank = (t: Track) => (t.languageCode.startsWith("en") ? 0 : 2) + (t.kind !== "asr" ? 0 : 1);
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
    for (const m of xml.matchAll(/<(p|text)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const t = decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (t && !/^\[(music|संगीत)\]$/i.test(t)) parts.push(t);
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    return text.length > 40 ? { text: text.slice(0, 24000), lang: track.languageCode } : null;
  } catch {
    return null;
  }
}

async function creatorPage(description: string): Promise<{ recipe?: ScrapedRecipe; pageText?: { url: string; text: string } }> {
  for (const url of recipeLinks(description)) {
    try {
      const res = await get(url, {}, 8000);
      if (!res.ok || !res.headers.get("content-type")?.includes("html")) continue;
      const html = await res.text();
      const recipe = recipeFromWprm(html) ?? recipeFromJsonLd(html);
      if (recipe) return { recipe: { ...recipe, url } };
      const body = stripTags(html.replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, " "));
      const at = body.search(/ingredients/i);
      if (at >= 0) return { pageText: { url, text: body.slice(at, at + 8000) } };
    } catch {
      // Try the next link.
    }
  }
  return {};
}

export async function fetchVideo(input: string): Promise<VideoSource> {
  const id = parseVideoId(input);
  if (!id) throw new Error("That doesn't look like a YouTube link.");
  const url = `https://www.youtube.com/watch?v=${id}`;

  let title = "";
  let channel = "";
  let description = "";
  let lengthSec: number | undefined;

  const [pageRes, player] = await Promise.all([
    get(url).catch(() => null),
    androidPlayer(id).catch(() => ({ tracks: [] as Track[], details: undefined })),
  ]);
  if (pageRes?.ok) {
    const p = extractJsonAfter(await pageRes.text(), "ytInitialPlayerResponse") as { videoDetails?: PlayerDetails } | null;
    const vd = p?.videoDetails;
    if (vd) {
      title = vd.title ?? "";
      channel = vd.author ?? "";
      description = vd.shortDescription ?? "";
      lengthSec = Number(vd.lengthSeconds) || undefined;
    }
  }
  const d = player.details;
  if (d) {
    title ||= d.title ?? "";
    channel ||= d.author ?? "";
    description ||= d.shortDescription ?? "";
    lengthSec ??= Number(d.lengthSeconds) || undefined;
  }
  if (!description) description = await innertube("next", { videoId: id }).then(descriptionFromNextJson).catch(() => "");
  if (!title) {
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

  const [captions, page] = await Promise.all([transcript(player.tracks), creatorPage(description)]);
  const recipe = page.recipe ?? recipeFromDescription(description) ?? undefined;

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
    recipe,
    pageText: page.pageText,
  };
}

/** Recipe videos for a dish name, trusted Indian cooking channels first. */
export async function searchVideos(dish: string): Promise<SearchResult[]> {
  const q = /recipe/i.test(dish) ? dish : `${dish} recipe`;
  const json = await innertube("search", { query: q, params: "EgIQAQ%3D%3D" /* videos only */ });
  return rankResults(parseSearchResults(json)).slice(0, 8);
}

/** A compact text block for prompts. */
export function sourceToPrompt(v: VideoSource, transcriptChars = 24000): string {
  return [
    `VIDEO: ${v.title} — by ${v.channel} (${v.url})`,
    v.recipe ? `CREATOR'S WRITTEN RECIPE${v.recipe.url ? ` (${v.recipe.url})` : " (from the description)"}:\n${scrapedToText(v.recipe)}` : "",
    v.pageText ? `CREATOR'S PAGE TEXT (${v.pageText.url}):\n${v.pageText.text}` : "",
    v.description && !v.recipe ? `DESCRIPTION:\n${v.description}` : "",
    v.transcript ? `TRANSCRIPT (${v.transcriptLang}, auto captions may contain errors):\n${v.transcript.slice(0, transcriptChars)}` : "TRANSCRIPT: not available",
  ]
    .filter(Boolean)
    .join("\n\n");
}
