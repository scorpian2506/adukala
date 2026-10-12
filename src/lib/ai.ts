import "server-only";
import OpenAI from "openai";
import type { Recipe, Step, StepItem, Ingredient, Unit } from "./types";
import { PROVIDERS, isProviderId, type Provider } from "./providers";

export class AIError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export interface AIContext {
  client: OpenAI;
  model: string;
  provider: Provider;
  key: string;
}

/** The user's provider, key and model arrive per request from their browser. Base URLs come only from our presets. */
export function clientFrom(req: Request): AIContext {
  const id = req.headers.get("x-ai-provider") ?? "";
  if (!isProviderId(id)) throw new AIError("Pick an AI provider in Settings, or use the free converter.", 401);
  const provider = PROVIDERS[id];
  if (provider.localOnly && process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_AI) {
    throw new AIError("Ollama only works when you run Adukala on your own computer.", 400);
  }
  const key = req.headers.get("x-ai-key")?.trim() || (id === "openai" ? process.env.OPENAI_API_KEY : "") || "";
  if (provider.needsKey && !key) throw new AIError(`Add your ${provider.name} key in Settings.`, 401);
  const model = req.headers.get("x-ai-model")?.trim().slice(0, 100) || provider.defaultModel;
  const client = new OpenAI({ apiKey: key || "ollama", baseURL: provider.baseURL, timeout: 280_000, maxRetries: 1 });
  return { client, model, provider, key };
}

export function errorResponse(e: unknown) {
  if (e instanceof AIError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof OpenAI.APIError) {
    const msg =
      e.status === 401 || e.status === 403
        ? "The AI provider rejected the key. Check it in Settings."
        : e.status === 404
          ? "That model isn't available for your key. Pick another model in Settings."
          : e.status === 429
            ? "Rate limit reached on your AI plan. Wait a minute and try again."
            : e.message;
    return Response.json({ error: msg }, { status: e.status && e.status < 600 ? e.status : 500 });
  }
  if (e instanceof SyntaxError) return Response.json({ error: "The AI replied with something we couldn't read. Try again, or try another model." }, { status: 502 });
  console.error(e);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

const UNITS: Unit[] = ["g", "kg", "ml", "L", "tsp", "tbsp", "cup", "pc"];
const EQUIPMENT = ["pressure_cooker", "kadai", "pan", "tawa", "saucepan", "tadka_pan", "mixer", "chopper", "knife", "bowl", "sieve", "ladle"];
const KINDS = ["measure", "chop", "grind", "rinse", "soak", "heat", "flame", "add", "stir", "wait", "lid_close", "lid_open", "pressure", "release", "serve", "note"];

const nullable = (t: object) => ({ anyOf: [t, { type: "null" }] });

const itemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ingredient", "qty", "unit"],
  properties: {
    ingredient: { type: "string", description: "Ingredient id" },
    qty: { type: "number" },
    unit: { type: "string", enum: UNITS },
  },
};

const stepSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title", "detail", "items", "durationSec", "flame", "whistles", "equipment", "cue", "tip"],
  properties: {
    kind: { type: "string", enum: KINDS },
    title: { type: "string", description: "Imperative, at most 7 words" },
    detail: nullable({ type: "string", description: "One short plain sentence for a total beginner" }),
    items: { type: "array", items: itemSchema, description: "Exact measured quantities used in this step; empty if none" },
    durationSec: nullable({ type: "integer" }),
    flame: nullable({ type: "string", enum: ["off", "low", "medium", "high"] }),
    whistles: nullable({ type: "integer" }),
    equipment: nullable({ type: "string", enum: EQUIPMENT }),
    cue: nullable({ type: "string", description: "What done looks/smells/sounds like" }),
    tip: nullable({ type: "string" }),
  },
};

export const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "native", "region", "course", "blurb", "servings", "prepMin", "cookMin", "level", "spice", "diet", "hue", "equipment", "ingredients", "prep", "cook", "serveWith", "notes"],
  properties: {
    name: { type: "string" },
    native: nullable({ type: "string" }),
    region: { type: "string", enum: ["north", "south"] },
    course: { type: "string", enum: ["main", "dal", "rice", "breakfast", "side", "drink"] },
    blurb: { type: "string", description: "One plain line describing the dish" },
    servings: { type: "integer" },
    prepMin: { type: "integer" },
    cookMin: { type: "integer" },
    level: { type: "integer", enum: [1, 2, 3] },
    spice: { type: "integer", enum: [1, 2, 3] },
    diet: { type: "array", items: { type: "string", enum: ["veg", "vegan", "jain", "gluten_free", "egg", "non_veg"] } },
    hue: { type: "string", enum: ["turmeric", "chilli", "leaf", "tamarind", "coconut"] },
    equipment: { type: "array", items: { type: "string", enum: EQUIPMENT } },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "native", "qty", "unit", "approx", "group", "tag"],
        properties: {
          id: { type: "string", description: "kebab-case, unique" },
          name: { type: "string" },
          native: nullable({ type: "string" }),
          qty: { type: "number" },
          unit: { type: "string", enum: UNITS },
          approx: nullable({ type: "string", description: "e.g. 'about 1 medium onion'" }),
          group: nullable({ type: "string", enum: ["main", "spice", "tempering", "garnish", "liquid"] }),
          tag: nullable({ type: "string", enum: ["oil", "salt", "chilli", "sugar", "carb", "protein"] }),
        },
      },
    },
    prep: { type: "array", items: stepSchema },
    cook: { type: "array", items: stepSchema },
    serveWith: nullable({ type: "string" }),
    notes: { type: "string", description: "One or two sentences on what you changed from the source and why. Not shown as steps." },
  },
};

export const RECIPE_RULES = `You write recipes for Adukala, an app that guides someone with ZERO cooking experience through Indian home cooking one tiny step at a time. They tap Next after every step.

Scope: North Indian and South Indian home cooking only. Equipment the user has: Indian pressure cooker (3 L), kadai, pan, tawa, saucepan, tadka pan, mixer grinder, chopper, knife, bowls, sieve, ladle. No oven, no air fryer, no stand mixer — adapt to these.

Hard rules:
1. EVERY quantity is measured in g, kg, ml, L, tsp, tbsp, cup, or pc (pc only for whole items like bay leaf, cloves, green chilli; add grams in approx when useful). Salt is measured in tsp. Water in ml. Vegetables in grams with approx ("about 1 medium onion"). Never "to taste", never "a pinch" (use 0.125 tsp), never "as needed".
2. Split into prep (rinse, soak, chop, measure everything into small bowls; no flame) and cook (flame on onwards). One chop or measure action per prep step. Dry powdered spices may be measured into one bowl in one step.
3. One action per step. title: imperative, at most 7 words. detail: one short sentence at most, plain English; briefly explain jargon like "tempering". Never a paragraph.
4. Every add or grind step lists items with exact qty + unit referencing ingredient ids. The add+grind items for each ingredient must sum to that ingredient's total. measure/chop/rinse steps may list items too but do not count toward the sum. "Pour the tadka over the dal" style steps have empty items.
5. Anything that takes time has durationSec: sautéing, stirring, simmering, soaking, resting. Stir steps say how long. Set flame on heat/flame/add/stir/wait steps. Turn the flame off explicitly with a kind "flame" step, flame "off".
6. Pressure cooker sequence: lid_close (equipment pressure_cooker; detail mentions putting the whistle on) → pressure (whistles N, flame, durationSec rough expected time) → flame off → release (durationSec e.g. 600, detail "Wait until all the pressure is gone; don't force the whistle") → lid_open.
7. Add sensory cues on key steps ("Seeds crackle and darken", "Onions turn golden brown", "Oil separates at the edges").
8. Typical length: 6–14 prep steps, 12–30 cook steps. End with a serve step.
9. Ingredient tags: oil/ghee/butter → oil; salt → salt; chillies and chilli powder → chilli; sugar/jaggery → sugar; rice/potato/rava/flour → carb; dal/paneer/chana/rajma/tofu/egg/meat → protein.
10. Quantities must be realistic and trustworthy for the stated servings. Prefer well-tested home-style proportions (Hebbar's Kitchen, Swasthi's Recipes, Archana's Kitchen, Ranveer Brar, Dassana's). If the source video is vague ("some oil", "little salt"), convert to an exact standard amount.
11. If a soak is needed, the first prep step is kind soak with durationSec and a detail saying they can carry on later.`;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Clean model output into a valid Recipe: drop nulls, fix references, clamp numbers. */
export function normalizeRecipe(raw: Record<string, unknown>, extra: Partial<Recipe>): Recipe {
  const ingredients: Ingredient[] = [];
  const seen = new Set<string>();
  for (const i of (raw.ingredients as Record<string, unknown>[]) ?? []) {
    let id = (str(i.id) ?? str(i.name) ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    while (seen.has(id)) id += "-2";
    seen.add(id);
    const unit = UNITS.includes(i.unit as Unit) ? (i.unit as Unit) : "g";
    ingredients.push({
      id,
      name: str(i.name) ?? id,
      native: str(i.native),
      qty: num(i.qty) ?? 1,
      unit,
      approx: str(i.approx),
      group: (str(i.group) as Ingredient["group"]) ?? undefined,
      tag: (str(i.tag) as Ingredient["tag"]) ?? undefined,
    });
  }
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const byName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i]));
  const invented = new Set<string>();

  const steps = (list: unknown): Step[] =>
    ((list as Record<string, unknown>[]) ?? [])
      .filter((s) => str(s.title))
      .map((s) => {
        const items: StepItem[] = ((s.items as Record<string, unknown>[]) ?? [])
          .map((it) => {
            const ref = str(it.ingredient)?.toLowerCase() ?? "";
            if (!ref || !num(it.qty)) return null;
            let ing = byId.get(ref) ?? byId.get(ref.replace(/[^a-z0-9]+/g, "-")) ?? byName.get(ref);
            if (!ing) {
              // The model used an ingredient it forgot to list. Keep the measurement rather than drop it.
              const id = ref.replace(/[^a-z0-9]+/g, "-");
              const unit = UNITS.includes(it.unit as Unit) ? (it.unit as Unit) : "g";
              ing = { id, name: ref.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()), qty: 0, unit };
              ingredients.push(ing);
              byId.set(id, ing);
              invented.add(id);
            }
            if (invented.has(ing.id) && ["add", "grind"].includes(s.kind as string)) ing.qty += it.qty as number;
            return { ingredient: ing.id, qty: it.qty as number, unit: UNITS.includes(it.unit as Unit) ? (it.unit as Unit) : ing.unit };
          })
          .filter((x): x is StepItem => !!x);
        const kind = KINDS.includes(s.kind as string) ? (s.kind as Step["kind"]) : "note";
        return {
          kind,
          title: str(s.title)!,
          detail: str(s.detail),
          items: items.length ? items : undefined,
          durationSec: num(s.durationSec) ? Math.round(s.durationSec as number) : undefined,
          flame: (str(s.flame) as Step["flame"]) ?? undefined,
          whistles: kind === "pressure" ? (num(s.whistles) ? Math.round(s.whistles as number) : undefined) : undefined,
          equipment: EQUIPMENT.includes(s.equipment as string) ? (s.equipment as Step["equipment"]) : undefined,
          cue: str(s.cue),
          tip: str(s.tip),
        };
      });

  const prep = steps(raw.prep);
  const cook = steps(raw.cook);
  for (const i of ingredients) if (i.qty <= 0) i.qty = 1;

  const name = str(raw.name) ?? "Your recipe";
  const clampLevel = (v: unknown) => (Math.min(3, Math.max(1, Math.round(Number(v) || 1))) as 1 | 2 | 3);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  return {
    id: `${slug}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    native: str(raw.native),
    region: raw.region === "south" ? "south" : "north",
    course: (["main", "dal", "rice", "breakfast", "side", "drink"].includes(raw.course as string) ? raw.course : "main") as Recipe["course"],
    blurb: str(raw.blurb) ?? "",
    servings: Math.max(1, Math.round(Number(raw.servings) || 2)),
    prepMin: Math.max(1, Math.round(Number(raw.prepMin) || 10)),
    cookMin: Math.max(1, Math.round(Number(raw.cookMin) || 20)),
    level: clampLevel(raw.level),
    spice: clampLevel(raw.spice),
    diet: Array.isArray(raw.diet) ? (raw.diet as Recipe["diet"]) : ["veg"],
    hue: (["turmeric", "chilli", "leaf", "tamarind", "coconut"].includes(raw.hue as string) ? raw.hue : "turmeric") as Recipe["hue"],
    equipment: Array.isArray(raw.equipment) ? (raw.equipment as Recipe["equipment"]).filter((e) => EQUIPMENT.includes(e)) : [],
    ingredients,
    prep,
    cook,
    serveWith: str(raw.serveWith),
    createdAt: Date.now(),
    ...extra,
  };
}

/** Pull a JSON object out of a reply that may be wrapped in prose or ``` fences. */
export function parseJsonReply<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t) as T;
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1)) as T;
    throw new SyntaxError("No JSON in reply");
  }
}

/**
 * Structured-output call. OpenAI uses the Responses API (with optional web search);
 * free providers use Chat Completions with json_schema, falling back to JSON mode.
 */
export async function structured<T>(opts: {
  ai: AIContext;
  instructions: string;
  input: string;
  schema: object;
  name: string;
  search?: boolean;
  effort?: "low" | "medium" | "high";
}): Promise<T> {
  const { client, model, provider } = opts.ai;
  if (provider.api === "chat") return chatStructured<T>(opts);

  const run = async (search: boolean, reasoning: boolean) => {
    const res = await client.responses.create({
      model,
      instructions: opts.instructions,
      input: opts.input,
      ...(reasoning ? { reasoning: { effort: opts.effort ?? "low" } } : {}),
      ...(search ? { tools: [{ type: "web_search" as const }] } : {}),
      text: { format: { type: "json_schema", name: opts.name, schema: opts.schema as Record<string, unknown>, strict: true } },
    });
    const text = res.output_text;
    if (!text) throw new AIError("The model returned nothing. Try again.");
    return parseJsonReply<T>(text);
  };
  let search = !!opts.search;
  let reasoning = true;
  // Retry once per unsupported feature: non-reasoning models reject `reasoning`,
  // some models reject web search alongside structured output.
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(search, reasoning);
    } catch (e) {
      if (attempt >= 2 || !(e instanceof OpenAI.APIError) || e.status !== 400) throw e;
      if (reasoning && /reasoning/i.test(e.message)) reasoning = false;
      else if (search) search = false;
      else throw e;
    }
  }
}

async function chatStructured<T>(opts: { ai: AIContext; instructions: string; input: string; schema: object; name: string }): Promise<T> {
  const { client, model } = opts.ai;
  const messages = [
    { role: "system" as const, content: opts.instructions },
    { role: "user" as const, content: opts.input },
  ];
  try {
    const res = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: "json_schema", json_schema: { name: opts.name, schema: opts.schema as Record<string, unknown>, strict: true } },
    });
    return parseJsonReply<T>(res.choices[0]?.message?.content ?? "");
  } catch (e) {
    // Many open models don't support strict schemas: describe the schema and use JSON mode.
    if (!(e instanceof OpenAI.APIError) || (e.status !== 400 && e.status !== 422)) throw e;
  }
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: `${opts.instructions}\n\nReply with ONE JSON object only, no prose, matching this JSON Schema exactly (use null for unknown optional fields):\n${JSON.stringify(opts.schema)}` },
      { role: "user", content: opts.input },
    ],
    response_format: { type: "json_object" },
  });
  return parseJsonReply<T>(res.choices[0]?.message?.content ?? "");
}

/** Tiny request to check a key/model works. */
export async function ping(ai: AIContext) {
  if (ai.provider.api === "responses") {
    await ai.client.models.retrieve(ai.model);
    return;
  }
  await ai.client.chat.completions.create({ model: ai.model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 5 });
}

// ---------- Gemini: watch the video, then research published recipes ----------

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiReply {
  text: string;
  sources: { url: string; title?: string }[];
}

type Part = { type: "text"; text: string } | { type: "video"; uri: string };

/** Pull text + web citations out of an Interactions API response. */
export function readInteraction(j: Record<string, unknown>): GeminiReply {
  const sources: GeminiReply["sources"] = [];
  let text = typeof j.output_text === "string" ? j.output_text : "";
  const steps = Array.isArray(j.steps) ? (j.steps as Record<string, unknown>[]) : [];
  const parts: string[] = [];
  for (const st of steps) {
    if (st.type !== "model_output" || !Array.isArray(st.content)) continue;
    for (const c of st.content as Record<string, unknown>[]) {
      if (typeof c.text === "string") parts.push(c.text);
      for (const a of (Array.isArray(c.annotations) ? c.annotations : []) as Record<string, unknown>[]) {
        if (a.type === "url_citation" && typeof a.url === "string") sources.push({ url: a.url, title: typeof a.title === "string" ? a.title : undefined });
      }
    }
  }
  if (!text) text = parts.join("\n");
  return { text: text.trim(), sources: dedupeSources(sources) };
}

/** Same, for the older generateContent response. */
export function readGenerateContent(j: Record<string, unknown>): GeminiReply {
  const cand = (j.candidates as Record<string, unknown>[] | undefined)?.[0] ?? {};
  const parts = ((cand.content as { parts?: { text?: string }[] } | undefined)?.parts ?? []).map((p) => p.text ?? "");
  const chunks = ((cand.groundingMetadata as { groundingChunks?: { web?: { uri?: string; title?: string } }[] } | undefined)?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => !!w?.uri);
  return { text: parts.join("").trim(), sources: dedupeSources(chunks.map((w) => ({ url: w.uri, title: w.title }))) };
}

function dedupeSources(s: GeminiReply["sources"]) {
  const seen = new Set<string>();
  return s.filter((x) => !seen.has(x.url) && seen.add(x.url)).slice(0, 8);
}

/** One Gemini call: the Interactions API first, falling back to generateContent. */
export async function geminiCall(ai: AIContext, opts: { parts: Part[]; search?: boolean; system?: string; timeoutMs?: number }): Promise<GeminiReply | null> {
  const headers = { "content-type": "application/json", "x-goog-api-key": ai.key };
  const signal = () => AbortSignal.timeout(opts.timeoutMs ?? 150_000);
  try {
    const res = await fetch(`${GEMINI}/interactions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: ai.model,
        input: opts.parts,
        store: false,
        ...(opts.system ? { system_instruction: opts.system } : {}),
        ...(opts.search ? { tools: [{ type: "google_search" }] } : {}),
      }),
      signal: signal(),
    });
    if (res.ok) {
      const out = readInteraction(await res.json());
      if (out.text) return out;
    } else if (res.status === 401 || res.status === 403) {
      throw new AIError("Google rejected the Gemini key. Check it in Settings.", 401);
    }
  } catch (e) {
    if (e instanceof AIError) throw e;
  }
  // Older endpoint, same request in its shape.
  try {
    const res = await fetch(`${GEMINI}/models/${encodeURIComponent(ai.model)}:generateContent`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        contents: [{ parts: opts.parts.map((p) => (p.type === "video" ? { file_data: { file_uri: p.uri } } : { text: p.text })) }],
        ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: signal(),
    });
    if (!res.ok) return null;
    const out = readGenerateContent(await res.json());
    return out.text ? out : null;
  } catch {
    return null;
  }
}

/**
 * Gemini can watch a public YouTube video. When a video has no written recipe,
 * ask it to write down what the cook shows and says — effectively a transcript.
 */
export async function geminiWatch(ai: AIContext, videoUrl: string): Promise<string | null> {
  if (ai.provider.id !== "gemini") return null;
  const out = await geminiCall(ai, {
    parts: [
      {
        type: "text",
        text: "Watch this cooking video. Write down every ingredient with the exact quantity shown on screen or said (write 'not stated' if not), then every step in order with times, flame levels, pressure cooker whistles and visual cues. Plain text, no commentary.",
      },
      { type: "video", uri: videoUrl },
    ],
  });
  return out ? out.text.slice(0, 16000) : null;
}

/**
 * Search the web (Google) for published recipes of this dish, compare them with
 * what the video does, and write the best one out with exact measurements.
 */
export async function geminiResearch(ai: AIContext, dish: string, notes: string | null): Promise<GeminiReply | null> {
  if (ai.provider.id !== "gemini") return null;
  const prompt = [
    `Dish: ${dish}`,
    notes ? `What the cook does in the video:\n${notes.slice(0, 8000)}` : "",
    `Search the web for several well-rated, published home recipes of this exact dish and style (prefer Indian recipe sites such as Hebbar's Kitchen, Swasthi's Recipes, Archana's Kitchen, Jeyashri's Kitchen, Mariam's Kitchen, Veena's Curryworld, Ranveer Brar). Pick the one that best matches the video's method and region, and use it (with measurements cross-checked against the others) to write ONE recipe.`,
    `Write it exactly in this plain-text format:
NAME: <dish name>
SERVES: <number>
INGREDIENTS:
<one per line: quantity unit ingredient, notes>  (use g, ml, tsp, tbsp, cup; never "to taste")
METHOD:
1. <one short instruction per line, with times and flame levels>
SOURCES:
<urls you used, best match first>`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return geminiCall(ai, { parts: [{ type: "text", text: prompt }], search: true });
}
