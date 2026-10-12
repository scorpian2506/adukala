import { afterEach, describe, expect, it, vi } from "vitest";
import { clientFrom, geminiCall, geminiResearch, geminiWatch, readGenerateContent, readInteraction } from "@/lib/ai";

const ai = () => clientFrom(new Request("http://x", { headers: { "x-ai-provider": "gemini", "x-ai-key": "test-key" } }));

afterEach(() => vi.unstubAllGlobals());

describe("reading Gemini responses", () => {
  it("Interactions API: text and url citations", () => {
    const r = readInteraction({
      steps: [
        { type: "google_search_call", queries: ["avial recipe"] },
        { type: "model_output", content: [{ type: "text", text: "NAME: Avial", annotations: [{ type: "url_citation", url: "https://a.com/avial", title: "Avial" }, { type: "url_citation", url: "https://a.com/avial" }] }] },
      ],
    });
    expect(r.text).toBe("NAME: Avial");
    expect(r.sources).toEqual([{ url: "https://a.com/avial", title: "Avial" }]);
    expect(readInteraction({ output_text: "hello" }).text).toBe("hello");
  });
  it("generateContent: text and grounding chunks", () => {
    const r = readGenerateContent({ candidates: [{ content: { parts: [{ text: "NAME: " }, { text: "Olan" }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://b.com/olan", title: "Olan" } }] } }] });
    expect(r).toEqual({ text: "NAME: Olan", sources: [{ url: "https://b.com/olan", title: "Olan" }] });
  });
});

describe("geminiCall", () => {
  it("defaults to the current Gemini model", () => {
    expect(ai().model).toBe("gemini-3.8-flash");
  });
  it("uses the Interactions API with the key in a header, never the URL", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ steps: [{ type: "model_output", content: [{ text: "ok" }] }] });
    });
    const out = await geminiWatch(ai(), "https://www.youtube.com/watch?v=abcdefghijk");
    expect(out).toBe("ok");
    expect(calls[0].url).toMatch(/\/v1beta\/interactions$/);
    expect(calls[0].url).not.toMatch(/test-key/);
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input).toContainEqual({ type: "video", uri: "https://www.youtube.com/watch?v=abcdefghijk" });
    expect(body.store).toBe(false);
  });
  it("research turns on Google Search", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({ output_text: "NAME: Sambar" });
    });
    const r = await geminiResearch(ai(), "Sambar", "notes");
    expect(r?.text).toBe("NAME: Sambar");
    expect(body.tools).toEqual([{ type: "google_search" }]);
  });
  it("falls back to generateContent when the Interactions API isn't available", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      urls.push(url);
      if (url.endsWith("/interactions")) return new Response("not found", { status: 404 });
      const body = JSON.parse(String(init.body));
      expect(body.tools).toEqual([{ google_search: {} }]);
      return Response.json({ candidates: [{ content: { parts: [{ text: "fallback" }] } }] });
    });
    const r = await geminiCall(ai(), { parts: [{ type: "text", text: "hi" }], search: true });
    expect(r?.text).toBe("fallback");
    expect(urls[1]).toMatch(/models\/gemini-3\.8-flash:generateContent$/);
  });
  it("reports a rejected key clearly", async () => {
    vi.stubGlobal("fetch", async () => new Response("denied", { status: 403 }));
    await expect(geminiCall(ai(), { parts: [{ type: "text", text: "hi" }] })).rejects.toThrow(/rejected the Gemini key/);
  });
  it("does nothing for other providers", async () => {
    const groq = clientFrom(new Request("http://x", { headers: { "x-ai-provider": "groq", "x-ai-key": "k" } }));
    expect(await geminiWatch(groq, "https://youtu.be/x")).toBeNull();
  });
});
