import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recipeFromDescription, recipeFromJsonLd, recipeFromWprm, recipeLinks, scrapedToText, stripTags } from "@/lib/scrape";

const fixture = (f: string) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8");

describe("WP Recipe Maker pages", () => {
  const r = recipeFromWprm(fixture("wprm.html"))!;
  it("reads each ingredient separately, not whole groups", () => {
    expect(r.ingredients).toHaveLength(10);
    expect(r.ingredients[0]).toEqual({ amount: "3", unit: undefined, name: "potato", notes: ", peeled and cubed", group: "for boiling" });
    expect(r.ingredients.find((i) => i.name === "turmeric")?.amount).toBe("½");
    expect(r.ingredients.find((i) => i.name === "hing")?.unit).toBe("pinch");
  });
  it("tags ingredients with their group", () => {
    expect(r.ingredients.filter((i) => i.group === "for tempering")).toHaveLength(8);
  });
  it("reads every instruction including the first in each group", () => {
    expect(r.steps).toHaveLength(6);
    expect(r.steps[0]).toMatch(/^firstly, in a pressure cooker/);
  });
  it("reads name and servings", () => {
    expect(r.servings).toBe(3);
    expect(r.name).toMatch(/jeera aloo/);
  });
  it("returns null for pages without recipe markup", () => {
    expect(recipeFromWprm("<html><li class='wprm-recipe-ingredient-group'>x</li></html>")).toBeNull();
  });
});

describe("schema.org JSON-LD", () => {
  it("finds a Recipe inside @graph", () => {
    const r = recipeFromJsonLd(fixture("jsonld.html"))!;
    expect(r.name).toBe("Lemon Rice");
    expect(r.servings).toBe(2);
    expect(r.ingredients.map((i) => i.name)).toContain("1/2 tsp mustard seeds");
    expect(r.steps).toHaveLength(4);
  });
  it("ignores broken JSON blocks", () => {
    expect(recipeFromJsonLd('<script type="application/ld+json">{oops</script>')).toBeNull();
  });
});

describe("YouTube descriptions", () => {
  it("pulls the ingredient list and method", () => {
    const r = recipeFromDescription(fixture("description.txt"))!;
    expect(r.ingredients.map((i) => i.name)).toEqual(["2 tomatoes, chopped", "1 tsp rasam powder", "1/2 tsp turmeric", "1 tsp salt", "2 cups water", "1 tbsp ghee", "1 tsp mustard seeds"]);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0]).toMatch(/^Boil tomatoes/);
  });
  it("returns null when there's no ingredient list", () => {
    expect(recipeFromDescription("Today we make sambar! Subscribe for more.")).toBeNull();
  });
});

describe("helpers", () => {
  it("strips tags, entities and checkbox glyphs", () => {
    expect(stripTags("<b>1&nbsp;cup</b> ▢ rice &amp; dal ,")).toBe("1 cup rice & dal,");
  });
  it("keeps only plausible recipe links", () => {
    const links = recipeLinks("full recipe: https://hebbarskitchen.com/x/ \n insta https://instagram.com/y amazon https://amzn.to/z https://blog.example.com/rasam.");
    expect(links).toEqual(["https://hebbarskitchen.com/x/", "https://blog.example.com/rasam"]);
  });
  it("renders a compact text block for AI prompts", () => {
    const t = scrapedToText(recipeFromWprm(fixture("wprm.html"))!);
    expect(t).toContain("- 2 tbsp oil (for tempering)");
    expect(t).toContain("Method:\n1. firstly");
  });
});
