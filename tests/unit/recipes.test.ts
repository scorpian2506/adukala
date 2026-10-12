import { describe, expect, it } from "vitest";
import {
  SEED_RECIPES,
  applyOfflineTweaks,
  buildScreens,
  findInLibrary,
  findSeed,
  flattenSteps,
  parseOfflineTweak,
  scaleRecipe,
  stepNumberAt,
} from "@/lib/recipes";
import { validateRecipe } from "@/lib/validate";
import type { Recipe } from "@/lib/types";

const dal = findSeed("dal-tadka")!;
const sambar = findSeed("sambar")!;

function addedTotal(r: Recipe, id: string) {
  return [...r.prep, ...r.cook].filter((s) => s.kind === "add" || s.kind === "grind").flatMap((s) => s.items ?? []).filter((i) => i.ingredient === id).reduce((t, i) => t + i.qty, 0);
}

describe("seed library", () => {
  it("has a large library with unique ids across every cuisine", () => {
    expect(SEED_RECIPES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(SEED_RECIPES.map((r) => r.id)).size).toBe(SEED_RECIPES.length);
    for (const c of ["tamil", "kerala", "indo_chinese"] as const) expect(SEED_RECIPES.filter((r) => r.cuisine === c).length, c).toBeGreaterThan(8);
    expect(SEED_RECIPES.filter((r) => r.region === "north").length).toBeGreaterThan(20);
    expect(SEED_RECIPES.filter((r) => /biryani/.test(r.id)).length).toBeGreaterThanOrEqual(4);
    expect(SEED_RECIPES.filter((r) => r.kidFriendly).length).toBeGreaterThan(20);
  });
  it.each(SEED_RECIPES.map((r) => [r.id, r] as const))("%s passes every quality rule", (_, r) => {
    expect(validateRecipe(r, { seed: true }).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("cook screens", () => {
  it("wraps prep and cook with intros and a finish screen", () => {
    const screens = buildScreens(dal);
    expect(screens[0]).toEqual({ type: "intro", phase: "prep" });
    expect(screens[dal.prep.length + 1]).toEqual({ type: "intro", phase: "cook" });
    expect(screens.at(-1)).toEqual({ type: "done" });
    expect(screens.filter((s) => s.type === "step")).toHaveLength(dal.prep.length + dal.cook.length);
  });
  it("maps a saved screen index back to a step number", () => {
    expect(stepNumberAt(dal, 0)).toBe(1);
    expect(stepNumberAt(dal, 1)).toBe(1);
    expect(stepNumberAt(dal, dal.prep.length + 1)).toBe(dal.prep.length); // cook intro → last prep step
    expect(stepNumberAt(dal, 9999)).toBe(dal.prep.length + dal.cook.length);
  });
  it("carries the vessel forward so 'turn off the flame' after pressure cooking draws the cooker", () => {
    const flat = flattenSteps(sambar);
    const pressure = flat.findIndex((s) => s.kind === "pressure");
    const flameOff = flat.slice(pressure).find((s) => s.kind === "flame");
    expect(flameOff?.equipment).toBe("pressure_cooker");
  });
});

describe("scaling", () => {
  it("rescales every ingredient and step item", () => {
    const big = scaleRecipe(dal, dal.servings * 2);
    expect(big.servings).toBe(dal.servings * 2);
    expect(big.ingredients.find((i) => i.id === "toor-dal")!.qty).toBe(200);
    expect(addedTotal(big, "toor-dal")).toBeCloseTo(200);
    expect(validateRecipe(big).filter((i) => i.level === "error")).toEqual([]);
  });
  it("is a no-op for the same servings", () => {
    expect(scaleRecipe(dal, dal.servings)).toBe(dal);
  });
});

describe("offline customisations", () => {
  it("low oil halves oil and ghee, everywhere", () => {
    const v = applyOfflineTweaks(dal, ["low_oil"]);
    expect(v.ingredients.find((i) => i.id === "ghee")!.qty).toBe(1);
    expect(addedTotal(v, "ghee")).toBeCloseTo(1);
    expect(v.variant).toEqual(["Low oil"]);
    expect(v.id).not.toBe(dal.id);
  });
  it("kid friendly removes a whole green chilli and its prep step", () => {
    const v = applyOfflineTweaks(dal, ["kid_friendly"]);
    expect(v.ingredients.find((i) => i.id === "green-chilli")).toBeUndefined();
    expect([...v.prep, ...v.cook].some((s) => /green chilli/i.test(s.title))).toBe(false);
    expect(v.ingredients.find((i) => i.id === "chilli-powder")!.qty).toBeCloseTo(0.75 * 0.25);
  });
  it("keeps the YouTube source on a converted recipe", () => {
    const yt: Recipe = { ...dal, source: { kind: "youtube", url: "https://youtu.be/abc", channel: "X" } };
    expect(applyOfflineTweaks(yt, ["low_oil"]).source).toEqual(yt.source);
  });
  it("stacks variants without duplicates", () => {
    const once = applyOfflineTweaks(dal, ["low_oil"]);
    const twice = applyOfflineTweaks(once, ["low_oil", "less_spicy"]);
    expect(twice.variant).toEqual(["Low oil", "Less spicy"]);
  });
});

describe("studio helpers", () => {
  it("finds a dish already in the library", () => {
    expect(findInLibrary("I want to make sambar")?.id).toBe("sambar");
    expect(findInLibrary("Dal tadka recipe")?.id).toBe("dal-tadka");
    expect(findInLibrary("thakkali rasam")?.id).toBe("tomato-rasam");
    expect(findInLibrary("palak paneer")?.id).toBe("palak-paneer");
    expect(findInLibrary("margherita pizza")).toBeUndefined();
    expect(findInLibrary("a")).toBeUndefined();
  });
  it("understands simple typed tweaks", () => {
    expect(parseOfflineTweak("for 5 people")).toEqual({ servings: 5, tweaks: [] });
    expect(parseOfflineTweak("6")).toEqual({ servings: 6, tweaks: [] });
    expect(parseOfflineTweak("less spicy please")).toEqual({ servings: undefined, tweaks: ["less_spicy"] });
    expect(parseOfflineTweak("low oil and kid friendly for 4 servings").tweaks).toEqual(["low_oil", "kid_friendly"]);
    expect(parseOfflineTweak("add 2 tomatoes")).toEqual({ servings: undefined, tweaks: [] });
  });
});
