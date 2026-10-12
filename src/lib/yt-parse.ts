// Pure parsers for YouTube responses. No network, so they're unit-tested.

export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1, 12);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}/.test(v)) return v.slice(0, 11);
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

export function isYouTubeUrl(s: string) {
  return /(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(s);
}

/** Extract a JSON object assigned in inline script, e.g. `ytInitialPlayerResponse = {...};` */
export function extractJsonAfter(html: string, marker: string): unknown | null {
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

export type AttributedText = {
  content: string;
  commandRuns?: {
    startIndex: number;
    length: number;
    onTap?: { innertubeCommand?: { commandMetadata?: { webCommandMetadata?: { url?: string } } } };
  }[];
};

/** Rebuild description text, swapping truncated link labels ("https://site.com/rec...") for the real URLs. */
export function expandAttributed(t: AttributedText): string {
  let text = t.content;
  const runs = [...(t.commandRuns ?? [])].sort((a, b) => b.startIndex - a.startIndex);
  for (const r of runs) {
    const url = r.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url ?? "";
    if (!url.includes("youtube.com/redirect")) continue;
    let real: string | null = null;
    try {
      real = new URL(url).searchParams.get("q");
    } catch {
      continue;
    }
    if (real) text = text.slice(0, r.startIndex) + real + text.slice(r.startIndex + r.length);
  }
  return text.replace(/[‪‬]/g, "");
}

/** The longest description found anywhere in a watch-next response. */
export function descriptionFromNextJson(json: unknown): string {
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
  walk(json);
  return best;
}

export interface SearchResult {
  id: string;
  title: string;
  channel: string;
  lengthSec?: number;
  thumbnail: string;
}

function clockToSec(s?: string) {
  if (!s) return undefined;
  const parts = s.split(":").map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

type Runs = { runs?: { text: string }[]; simpleText?: string };
const text = (r?: Runs) => r?.simpleText ?? r?.runs?.map((x) => x.text).join("") ?? "";

/** Video results from an innertube search response (Shorts and ads skipped). */
export function parseSearchResults(json: unknown): SearchResult[] {
  const out: SearchResult[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    const rec = o as Record<string, unknown>;
    const v = rec.videoRenderer as { videoId?: string; title?: Runs; ownerText?: Runs; longBylineText?: Runs; lengthText?: Runs } | undefined;
    if (v?.videoId) {
      const lengthSec = clockToSec(text(v.lengthText));
      out.push({
        id: v.videoId,
        title: text(v.title),
        channel: text(v.ownerText) || text(v.longBylineText),
        lengthSec,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      });
      return;
    }
    for (const [k, val] of Object.entries(rec)) if (k !== "reelShelfRenderer" && k !== "adSlotRenderer") walk(val);
  };
  walk(json);
  const seen = new Set<string>();
  return out.filter((r) => !seen.has(r.id) && seen.add(r.id) && (!r.lengthSec || r.lengthSec > 75));
}

/** Channels whose descriptions reliably link to a written recipe with measurements. */
export const TRUSTED_CHANNELS = [
  "hebbars kitchen",
  "dassana's veg recipes",
  "dassanas veg recipes",
  "archana's kitchen",
  "ranveer brar",
  "kabita's kitchen",
  "kabitaskitchen",
  "indian healthy recipes",
  "swasthi's recipes",
  "nisha madhulika",
  "cook with parul",
  "madhura's recipe",
  "yummy tummy",
  "home cooking show",
  "chef sanjyot keer",
  "your food lab",
  "vahrehvah",
];

export function rankResults(results: SearchResult[]): SearchResult[] {
  const score = (r: SearchResult) => {
    const ch = r.channel.toLowerCase();
    const trusted = TRUSTED_CHANNELS.findIndex((t) => ch.includes(t));
    return (trusted >= 0 ? 0 : 100) + (/recipe/i.test(r.title) ? 0 : 10);
  };
  return [...results].sort((a, b) => score(a) - score(b));
}
