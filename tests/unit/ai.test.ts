import { describe, expect, it } from "vitest";
import { AIError, clientFrom, normalizeRecipe, parseJsonReply } from "@/lib/ai";

const req = (h: Record<string, string>) => new Request("http://x/api", { method: "POST", headers: h });

describe("provider selection", () => {
  it("only accepts preset providers", () => {
    expect(() => clientFrom(req({ "x-ai-provider": "https://evil.example" }))).toThrow(AIError);
    expect(() => clientFrom(req({}))).toThrow(/Pick an AI provider/);
  });
  it("requires a key for hosted providers", () => {
    expect(() => clientFrom(req({ "x-ai-provider": "groq" }))).toThrow(/Groq key/);
  });
  it("uses the preset base URL and default model", () => {
    const ai = clientFrom(req({ "x-ai-provider": "gemini", "x-ai-key": "k" }));
    expect(ai.client.baseURL).toBe("https://generativelanguage.googleapis.com/v1beta/openai/");
    expect(ai.model).toBe("gemini-2.5-flash");
    expect(clientFrom(req({ "x-ai-provider": "groq", "x-ai-key": "k", "x-ai-model": "llama-3.3-70b-versatile" })).model).toBe("llama-3.3-70b-versatile");
  });
});

describe("parseJsonReply", () => {
  it("handles fenced and chatty replies", () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply('Sure! Here it is: {"a":{"b":2}} Enjoy.')).toEqual({ a: { b: 2 } });
    expect(() => parseJsonReply("no json")).toThrow(SyntaxError);
  });
});

describe("normalizeRecipe", () => {
  const raw = {
    name: "Test Upma",
    region: "south",
    course: "breakfast",
    servings: 2,
    level: 7,
    spice: 0,
    hue: "purple",
    equipment: ["kadai", "oven"],
    ingredients: [
      { id: "rava", name: "Rava", qty: 100, unit: "g", native: null, approx: null, group: "main", tag: "carb" },
      { id: "rava", name: "Rava again", qty: 10, unit: "furlongs" },
    ],
    prep: [],
    cook: [
      { kind: "add", title: "Add rava", items: [{ ingredient: "rava", qty: 100, unit: "g" }] },
      { kind: "add", title: "Add salt", items: [{ ingredient: "salt", qty: 0.5, unit: "tsp" }] },
      { kind: "add", title: "Add salt again", items: [{ ingredient: "salt", qty: 0.25, unit: "tsp" }] },
      { kind: "dance", title: "Do a dance", whistles: 3 },
      { kind: "stir", title: "" },
    ],
  };
  const r = normalizeRecipe(raw, { source: { kind: "ai" } });

  it("de-duplicates ids and fixes bad units", () => {
    expect(r.ingredients.map((i) => i.id)).toEqual(["rava", "rava-2", "salt"]);
    expect(r.ingredients[1].unit).toBe("g");
  });
  it("keeps measurements for an ingredient the model forgot to list", () => {
    const salt = r.ingredients.find((i) => i.id === "salt")!;
    expect(salt).toMatchObject({ unit: "tsp", qty: 0.75 });
    expect(r.cook[1].items).toEqual([{ ingredient: "salt", qty: 0.5, unit: "tsp" }]);
  });
  it("clamps and repairs metadata", () => {
    expect(r.level).toBe(3);
    expect(r.spice).toBe(1);
    expect(r.hue).toBe("turmeric");
    expect(r.equipment).toEqual(["kadai"]);
  });
  it("turns unknown step kinds into notes and drops empty steps", () => {
    expect(r.cook.map((s) => s.kind)).toEqual(["add", "add", "add", "note"]);
    expect(r.cook[3].whistles).toBeUndefined();
  });
});
