import { RECIPE_RULES, RECIPE_SCHEMA, clientFrom, errorResponse, geminiResearch, geminiWatch, normalizeRecipe, structured, type GeminiReply } from "@/lib/ai";
import { conversionQuality, convertRecipe } from "@/lib/convert";
import { sourceToPrompt, type VideoSource } from "@/lib/youtube";
import type { Recipe } from "@/lib/types";

// Recipe writing with web research can take a couple of minutes.
export const maxDuration = 300;

interface Body {
  // Either a fresh recipe from a conversation (optionally about a video)…
  video?: VideoSource | null;
  conversation?: { role: "user" | "assistant"; content: string }[];
  // …or a rewrite of an existing recipe.
  recipe?: Recipe;
  customisations?: string[];
  instruction?: string;
  servings?: number;
}

export async function POST(req: Request) {
  try {
    const ai = clientFrom(req);
    const body = (await req.json()) as Body;

    let input: string;
    let instructions = RECIPE_RULES;
    const extra: Partial<Recipe> = {};

    if (body.recipe) {
      const base = body.recipe;
      const asks = [...(body.customisations ?? []), body.instruction].filter(Boolean);
      instructions += `\n\nYou are rewriting an existing Adukala recipe. Keep its character and structure; change only what the customisations require, and make every quantity and step consistent with the change (e.g. high protein may add paneer or extra dal with its own measured steps; Jain removes onion, garlic, ginger and root vegetables and adjusts spices; vegan swaps ghee for oil and curd for a plant alternative). Keep the same name unless the dish fundamentally changes.`;
      input = [
        `CUSTOMISATIONS: ${asks.join("; ")}`,
        body.servings ? `SERVINGS: write it for ${body.servings}.` : "",
        `ORIGINAL RECIPE JSON:\n${JSON.stringify({ ...base, id: undefined, source: undefined, createdAt: undefined })}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      extra.source = base.source?.kind === "youtube" ? base.source : { kind: "ai" };
      extra.variant = [...new Set([...(base.variant ?? []), ...(body.customisations ?? []).map((c) => c.split(" (")[0]), ...(body.instruction ? ["Tweaked"] : [])])];
    } else {
      const convo = (body.conversation ?? []).map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`).join("\n");
      instructions += ai.provider.api === "responses" ? `\n\nUse web search to cross-check quantities against well-known Indian recipe sites when the source is vague or missing amounts. If the transcript is not available, search for the video title and channel to find the creator's own written recipe and follow it. Follow the source video's method and flavour where it is clear, but every amount must end up exact and realistic. Apply all preferences from the conversation.` : `\n\nFollow the creator's written recipe or the video notes closely. Where amounts are vague, use standard home-style Indian proportions. Apply all preferences from the conversation.`;
      let video = body.video ?? null;
      let research: GeminiReply | null = null;
      // Gemini: when the video has no usable written recipe, watch the video, then
      // research published recipes for the same dish and use the best match.
      const written = video?.recipe;
      const usable = written ? conversionQuality(written, convertRecipe(written)).ok : false;
      if (ai.provider.id === "gemini" && !usable) {
        const watched = video ? await geminiWatch(ai, video.url).catch(() => null) : null;
        if (video && watched) video = { ...video, transcript: watched, transcriptLang: "notes from watching the video" };
        const dish = video?.title ?? (body.conversation ?? []).filter((m) => m.role === "user").map((m) => m.content).join(" ").slice(0, 300);
        research = await geminiResearch(ai, dish, watched ?? video?.transcript ?? null).catch(() => null);
      }
      // Free tiers have small token budgets: send less transcript.
      const budget = ai.provider.free ? 8000 : 24000;
      input = [
        video ? `SOURCE\n${sourceToPrompt(video, budget)}` : "SOURCE: no video; the user described the dish in the conversation.",
        research ? `BEST MATCHING PUBLISHED RECIPE (researched on the web; use its measurements, follow the video's method where they differ):\n${research.text.slice(0, 10000)}` : "",
        `CONVERSATION WITH THE USER:\n${convo || "(none)"}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const refs = research?.sources.length ? research.sources : undefined;
      if (body.video) {
        extra.source = { kind: "youtube", url: body.video.url, title: body.video.title, channel: body.video.channel, refs };
      } else {
        extra.source = { kind: "ai", refs };
      }
    }

    const raw = await structured<Record<string, unknown>>({
      ai,
      instructions,
      input,
      schema: RECIPE_SCHEMA,
      name: "adukala_recipe",
      search: !body.recipe,
      effort: "medium",
    });
    const recipe = normalizeRecipe(raw, extra);
    if (!recipe.cook.length) throw new Error("The recipe came back empty. Try again.");
    recipe.method = "ai";
    return Response.json({ recipe, notes: typeof raw.notes === "string" ? raw.notes : "" });
  } catch (e) {
    return errorResponse(e);
  }
}
