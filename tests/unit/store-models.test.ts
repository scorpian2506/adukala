import { describe, expect, it } from "vitest";
import { modelFor } from "@/lib/store";

describe("modelFor", () => {
  const s = (models: Record<string, string>) => ({ provider: "groq" as const, keys: {}, models, voice: false, listen: false });
  it("uses the saved model unless it's been retired", () => {
    expect(modelFor(s({ groq: "openai/gpt-oss-20b" }), "groq")).toBe("openai/gpt-oss-20b");
    expect(modelFor(s({ groq: "llama-3.3-70b-versatile" }), "groq")).toBe("openai/gpt-oss-120b");
    expect(modelFor(s({}), "openrouter")).toBe("nvidia/nemotron-3-super-120b-a12b:free");
  });
});
