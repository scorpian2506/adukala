import { describe, expect, it } from "vitest";
import { SEED_RECIPES } from "@/data/recipes";
import { DEFAULT_TOOLS, fills, fillsText, flameLabel, forKitchen, hobText, measureHint, normaliseTools, ovenLabel, SPOONS, CUPS, type KitchenTools } from "@/lib/kitchen-tools";

const induction: KitchenTools = { ...DEFAULT_TOOLS, hob: "induction", hobMax: 14 };

describe("induction hob wording", () => {
  it("turns flame words into hob levels", () => {
    expect(hobText("Turn the flame to low", induction)).toBe("Turn the hob to level 4");
    expect(hobText("Turn off the flame", induction)).toBe("Turn off the hob");
    expect(hobText("Heat the kadai on medium", induction)).toBe("Heat the kadai on level 8");
    expect(hobText("Cook on low flame for 5 minutes", induction)).toBe("Cook on level 4 for 5 minutes");
    expect(hobText("Keep the flame low so it doesn't burn.", induction)).toBe("Keep the hob at level 4 so it doesn't burn.");
    expect(hobText("Medium-high heat works best.", induction)).toBe("Level 10 works best.");
    expect(hobText("Turn the flame down one notch.", induction)).toBe("Turn the hob down one level.");
    expect(hobText("Grind on low speed", induction)).toBe("Grind on low speed");
    expect(hobText("Heat on low for 2 minutes", induction)).toBe("Heat on level 4 for 2 minutes");
  });

  it("uses 1–9 levels on older hobs and leaves gas alone", () => {
    expect(hobText("Turn the flame to high", { ...induction, hobMax: 9 })).toBe("Turn the hob to level 8");
    expect(hobText("Turn the flame to high", DEFAULT_TOOLS)).toBe("Turn the flame to high");
    expect(flameLabel("medium", induction)).toBe("Level 8 of 14");
    expect(flameLabel("off", induction)).toBe("Hob off");
    expect(flameLabel("medium", DEFAULT_TOOLS)).toBe("Medium flame");
  });

  it("leaves no flame or gas wording anywhere in the library", () => {
    const left: string[] = [];
    for (const r of SEED_RECIPES) {
      const k = forKitchen(r, induction);
      for (const s of [...k.prep, ...k.cook]) for (const t of [s.title, s.detail, s.cue, s.tip]) if (t && /\bflames?\b|\bgas\b/i.test(t)) left.push(`${r.id}: ${t}`);
    }
    expect(left).toEqual([]);
  });

  it("shows fan oven temperatures 20 °C lower", () => {
    expect(ovenLabel(180, DEFAULT_TOOLS)).toBe("Oven 160 °C fan");
    expect(ovenLabel(180, { ...DEFAULT_TOOLS, oven: "conventional" })).toBe("Oven 180 °C");
  });
});

describe("measuring with the spoons and cups you have", () => {
  const spoons = (ids: string[]) => SPOONS.filter((s) => ids.includes(s.id));
  it("uses the fewest fills", () => {
    expect(fillsText(fills(1.5, spoons(["1/4tsp", "1/2tsp", "1tsp", "1tbsp"]))!)).toBe("1 tsp + ½ tsp");
    expect(fillsText(fills(1, spoons(["1/4tsp", "1/2tsp"]))!)).toBe("2 × ½ tsp");
    expect(fillsText(fills(0.75, spoons(["1/4tsp", "1/2tsp", "1tsp"]))!)).toBe("½ tsp + ¼ tsp");
    expect(fillsText(fills(12, [...spoons(["1tbsp"]), ...CUPS.filter((c) => c.id === "1/4")])!)).toBe("¼ cup");
    expect(fillsText(fills(64, CUPS.filter((c) => ["1", "1/3"].includes(c.id)))!)).toBe("1 cup + ⅓ cup");
  });

  it("shows a hint only when it helps", () => {
    expect(measureHint(1, "tsp", "Cumin seeds", DEFAULT_TOOLS)).toBeNull();
    expect(measureHint(2, "tsp", "Cumin seeds", DEFAULT_TOOLS)).toBe("2 × 1 tsp");
    expect(measureHint(1.5, "tbsp", "Oil", DEFAULT_TOOLS)).toBe("1 tbsp + 1 tsp + ½ tsp");
    expect(measureHint(1, "tsp", "Cumin seeds", { ...DEFAULT_TOOLS, spoons: ["1/2tsp"] })).toBe("2 × ½ tsp");
    expect(measureHint(320, "ml", "Water", DEFAULT_TOOLS)).toBe("1 cup + ⅓ cup");
    expect(measureHint(150, "g", "Onion", DEFAULT_TOOLS)).toBeNull();
  });

  it("turns grams of flour or rice into cups without a scale, and adds grams with one", () => {
    expect(measureHint(190, "g", "Rice", DEFAULT_TOOLS)).toBe("≈ 1 cup");
    expect(measureHint(190, "g", "Rice", { ...DEFAULT_TOOLS, scale: true })).toBeNull();
    expect(measureHint(1, "cup", "Rice", { ...DEFAULT_TOOLS, scale: true })).toBe("or weigh 190 g");
  });

  it("ignores bad saved settings", () => {
    expect(normaliseTools({ hob: "plasma", spoons: ["1tsp", "huge"], cups: "x" })).toEqual({ ...DEFAULT_TOOLS, spoons: ["1tsp"] });
  });
});
