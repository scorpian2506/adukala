import { describe, expect, it } from "vitest";
import { matchesFacet, normalize, searchRecipes } from "@/lib/search";
import { SEED_RECIPES } from "@/lib/recipes";

const ids = (q: string, f: Parameters<typeof searchRecipes>[2] = []) => searchRecipes(SEED_RECIPES, q, f).map((r) => r.id);

describe("normalize", () => {
  it("folds common spelling variants", () => {
    expect(normalize("Chicken Biriyani")).toBe("chicken biryani");
    expect(normalize("vatha kulambu")).toBe("vatha kuzhambu");
    expect(normalize("Panneer butter masala")).toBe("paneer butter masala");
    expect(normalize("meen curry")).toBe("fish curry");
  });
});

describe("searchRecipes", () => {
  it("finds dishes by name, with typos", () => {
    expect(ids("sambar")[0]).toBe("sambar");
    expect(ids("sambhar")[0]).toBe("sambar");
    expect(ids("panner butter")[0]).toBe("paneer-butter-masala");
    expect(ids("rasm")).toContain("tomato-rasam");
  });
  it("matches native names and tags", () => {
    expect(ids("thakkali")).toContain("tomato-rasam");
  });
  it("matches by ingredient", () => {
    const r = ids("paneer");
    expect(r).toContain("paneer-butter-masala");
    expect(r.length).toBeGreaterThan(1);
  });
  it("needs every word to match", () => {
    expect(ids("sambar chocolate")).toEqual([]);
  });
  it("empty query returns everything (filtered)", () => {
    expect(ids("")).toHaveLength(SEED_RECIPES.length);
  });
  it("facets narrow results", () => {
    const south = searchRecipes(SEED_RECIPES, "", ["tamil"]);
    expect(south.length).toBeGreaterThan(0);
    expect(south.every((r) => r.region === "south")).toBe(true);
    const quick = searchRecipes(SEED_RECIPES, "", ["quick"]);
    expect(quick.every((r) => r.prepMin + r.cookMin <= 30)).toBe(true);
    const veg = searchRecipes(SEED_RECIPES, "", ["veg"]);
    expect(veg.some((r) => r.diet.includes("non_veg"))).toBe(false);
  });
  it("matchesFacet handles kids and biryani", () => {
    expect(SEED_RECIPES.filter((r) => matchesFacet(r, "kids")).every((r) => r.kidFriendly)).toBe(true);
  });
});
