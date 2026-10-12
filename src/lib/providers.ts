// AI providers. Base URLs are fixed here and chosen by id, so the server never
// fetches a URL a browser made up.

export type ProviderId = "gemini" | "groq" | "openrouter" | "openai" | "ollama";

export interface Provider {
  id: ProviderId;
  name: string;
  tagline: string;
  baseURL: string;
  defaultModel: string;
  models: string[];
  keyUrl?: string;
  free: boolean;
  /** OpenAI's Responses API (with web search); everyone else gets Chat Completions. */
  api: "responses" | "chat";
  /** Only usable when the app runs on your own machine. */
  localOnly?: boolean;
  needsKey: boolean;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    tagline: "Can watch the YouTube video itself when there's no written recipe.",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    keyUrl: "https://aistudio.google.com/apikey",
    free: true,
    api: "chat",
    needsKey: true,
  },
  groq: {
    id: "groq",
    name: "Groq",
    tagline: "Runs open-source models (gpt-oss, Llama), very fast.",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    keyUrl: "https://console.groq.com/keys",
    free: true,
    api: "chat",
    needsKey: true,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "Many free open-source models. They change often, so the model name is editable.",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-oss-120b:free",
    models: ["openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free"],
    keyUrl: "https://openrouter.ai/keys",
    free: true,
    api: "chat",
    needsKey: true,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    tagline: "Best results, and double-checks measurements with web search.",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-5.5",
    models: ["gpt-5.5", "gpt-5.4", "gpt-5-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
    free: false,
    api: "responses",
    needsKey: true,
  },
  ollama: {
    id: "ollama",
    name: "Ollama (local)",
    tagline: "Fully open source, on your own computer. Only works when you run Adukala locally.",
    baseURL: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    models: ["llama3.1", "qwen2.5", "gpt-oss:20b"],
    free: true,
    api: "chat",
    localOnly: true,
    needsKey: false,
  },
};

export const PROVIDER_ORDER: ProviderId[] = ["gemini", "groq", "openrouter", "openai", "ollama"];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && v in PROVIDERS;
}
