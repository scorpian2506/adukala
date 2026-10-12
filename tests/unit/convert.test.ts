import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanName, conversionQuality, convertRecipe, ingredientKey, parseIngredientEntry } from "@/lib/convert";
import { recipeFromDescription, recipeFromJsonLd, recipeFromWprm } from "@/lib/scrape";
import { buildScreens } from "@/lib/recipes";
import { validateRecipe } from "@/lib/validate";
import type { Recipe } from "@/lib/types";

const fixture = (f: string) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8");
const errors = (r: Recipe) => validateRecipe(r).filter((i) => i.level === "error").map((i) => i.msg);

describe("ingredient lines", () => {
  const p = (name: string, amount?: string, unit?: string, servings = 3) => parseIngredientEntry({ name, amount, unit }, servings, 0);

  it("reads spoon and cup amounts", () => {
    expect(p("chana dal", "1", "tbsp")).toMatchObject({ qty: 1, unit: "tbsp", name: "Chana dal" });
    expect(p("water", "1½", "cup")).toMatchObject({ qty: 1.5, unit: "cup" });
    expect(p("1/2 tsp mustard seeds")).toMatchObject({ qty: 0.5, unit: "tsp", name: "Mustard seeds" });
  });
  it("turns produce counts into grams", () => {
    expect(p("onions, finely chopped", "2")).toMatchObject({ qty: 300, unit: "g", notes: "finely chopped", approx: "about 2 medium onions" });
    expect(p("tomato", "½")).toMatchObject({ qty: 60, unit: "g" });
  });
  it("keeps countable spices as pieces", () => {
    expect(p("green chillies", "2")).toMatchObject({ qty: 2, unit: "pc" });
    expect(p("cloves", "4")).toMatchObject({ qty: 4, unit: "pc" });
  });
  it("converts pinch, inch, sprig and bunch", () => {
    expect(p("hing", "1", "pinch")).toMatchObject({ qty: 0.125, unit: "tsp" });
    expect(p("ginger", "1", "inch")).toMatchObject({ qty: 5, unit: "g", approx: "1 inch piece" });
    expect(p("palak", "1", "bunch")).toMatchObject({ qty: 250, unit: "g" });
  });
  it("estimates vague amounts and says so", () => {
    expect(p("few curry leaves")).toMatchObject({ qty: 10, unit: "pc", estimated: true, name: "Curry leaves" });
    expect(p("salt to taste", undefined, undefined, 4)).toMatchObject({ qty: 1.25, unit: "tsp", estimated: true, name: "Salt" });
    expect(p("salt to taste").approx).toMatch(/estimate/);
  });
  it("averages ranges", () => {
    expect(p("1-2 green chillies")).toMatchObject({ qty: 1.5, unit: "pc" });
  });
  it("normalises names for matching", () => {
    expect(ingredientKey("Green Chillies (optional)")).toBe("green chilli");
    expect(ingredientKey("finely chopped Onions")).toBe("onion");
  });
});

describe("converting a WP Recipe Maker recipe", () => {
  const r = convertRecipe(recipeFromWprm(fixture("wprm.html"))!, { title: "Jeera Aloo", channel: "Test Kitchen", url: "https://youtu.be/aaaaaaaaaaa" });

  it("passes the same quality rules as the hand-written library", () => {
    expect(errors(r)).toEqual([]);
  });
  it("keeps the source, servings and sections", () => {
    expect(r.source).toEqual({ kind: "youtube", url: "https://youtu.be/aaaaaaaaaaa", title: "Jeera Aloo", channel: "Test Kitchen" });
    expect(r.method).toBe("rules");
    expect(r.servings).toBe(3);
    expect(r.name).toBe("Jeera Aloo");
    expect(r.ingredients[0].section).toBe("For boiling");
  });
  it("builds the full pressure cooker sequence", () => {
    const kinds = r.cook.map((s) => s.kind);
    const at = kinds.indexOf("pressure");
    expect(kinds.slice(at - 1, at + 4)).toEqual(["lid_close", "pressure", "flame", "release", "lid_open"]);
    expect(r.cook[at].whistles).toBe(2);
    // "once the pressure releases" must not add a second lid_open
    expect(kinds.filter((k) => k === "lid_open")).toHaveLength(1);
  });
  it("adds every ingredient exactly once, with its measure", () => {
    const added = r.cook.flatMap((s) => (s.kind === "add" || s.kind === "grind" || s.kind === "heat" ? (s.items ?? []) : []));
    for (const ing of r.ingredients) expect(added.filter((a) => a.ingredient === ing.id).length, ing.name).toBe(1);
  });
  it("picks up flame levels, durations and cues", () => {
    const saute = r.cook.find((s) => /30 seconds/.test(s.detail ?? "") && s.kind === "stir");
    expect(saute).toMatchObject({ flame: "low", durationSec: 30 });
    const fry = r.cook.find((s) => s.kind === "stir" && s.durationSec === 300);
    expect(fry?.flame).toBe("medium");
    expect(fry?.cue).toBe("Crisp");
    expect(r.cook.find((s) => s.title === "Let the seeds splutter")).toBeTruthy();
  });
  it("turns the flame off before serving", () => {
    const serve = r.cook.findIndex((s) => s.kind === "serve");
    expect(serve).toBe(r.cook.length - 1);
    expect(r.cook.slice(0, serve).some((s) => s.kind === "flame" && s.flame === "off")).toBe(true);
  });
  it("writes prep: chopping and measuring per section", () => {
    expect(r.prep.map((s) => s.title)).toEqual(expect.arrayContaining(["Peel and cube the potato", "Finely chop the coriander leaves", "Measure for the tempering"]));
  });
  it("warns about estimated amounts", () => {
    expect(r.warnings?.[0]).toMatch(/hing|curry leaves|salt/);
  });
  it("gives a valid cook-mode sequence", () => {
    const screens = buildScreens(r);
    expect(screens.at(-1)).toEqual({ type: "done" });
  });
  it("is deterministic", () => {
    const again = convertRecipe(recipeFromWprm(fixture("wprm.html"))!, { title: "Jeera Aloo", channel: "Test Kitchen", url: "https://youtu.be/aaaaaaaaaaa" });
    expect({ ...again, createdAt: 0 }).toEqual({ ...r, createdAt: 0 });
  });
});

describe("converting other sources", () => {
  it("JSON-LD recipes", () => {
    const r = convertRecipe(recipeFromJsonLd(fixture("jsonld.html"))!);
    expect(errors(r)).toEqual([]);
    expect(r.region).toBe("south");
    expect(r.course).toBe("rice");
    expect(r.servings).toBe(2);
  });
  it("ingredient lists pasted in a video description", () => {
    const r = convertRecipe(recipeFromDescription(fixture("description.txt"))!, { title: "Tomato Rasam for beginners | quick" });
    expect(errors(r)).toEqual([]);
    expect(r.name).toBe("Tomato Rasam For Beginners");
    expect(r.cook.some((s) => s.kind === "wait" && s.durationSec === 600)).toBe(true);
  });
  it("a recipe whose method never mentions an ingredient still uses it", () => {
    const r = convertRecipe({ source: "description", ingredients: [{ name: "1 cup rice" }, { name: "2 cups water" }, { name: "1 tsp saffron" }], steps: ["Boil the rice in water for 15 minutes.", "Serve."] });
    expect(errors(r)).toEqual([]);
    expect(r.warnings?.join(" ")).toMatch(/saffron/);
  });
});

describe("cleanName", () => {
  it("strips YouTube title noise", () => {
    expect(cleanName("Canteen Style Tiffin Sambar Recipe for Idli | Hebbars Kitchen")).toBe("Canteen Style Tiffin Sambar For Idli");
    expect(cleanName("palak paneer recipe | restaurant style")).toBe("Palak Paneer");
    expect(cleanName("Recipe")).toBe("Recipe");
  });
});

describe("messy description recipes (real-world shape)", () => {
  const src = recipeFromDescription(fixture("description-messy.txt"))!;
  const r = convertRecipe(src, { title: "Methi Paneer | home style" });
  const ing = (name: string) => r.ingredients.find((i) => i.name.toLowerCase() === name.toLowerCase());

  it("reads servings, headings and groups", () => {
    expect(src.servings).toBe(2);
    expect(src.ingredients.find((i) => i.name.startsWith("1 tbsp Ghee"))?.group).toBe("For Methi Paneer");
    expect(src.ingredients.some((i) => /^(process|garnish)$/i.test(i.name))).toBe(false);
  });
  it("joins wrapped method lines and stops at the footer", () => {
    expect(src.steps).toHaveLength(5);
    expect(src.steps[0]).toBe("Heat ghee in a kadai and add cumin seeds. Stir for a minute until fragrant.");
    expect(src.steps.join(" ")).not.toMatch(/http|Follow|App/);
  });
  it("understands gm, ltr, inches and small/medium produce", () => {
    expect(ing("Paneer")).toMatchObject({ qty: 275, unit: "g" });
    expect(ing("Milk")).toMatchObject({ qty: 0.5, unit: "L" });
    expect(ing("Ginger")).toMatchObject({ qty: 5, unit: "g" });
    expect(ing("Onion")).toMatchObject({ unit: "g", qty: 265 });
    expect(r.ingredients.every((i) => !/^[,;:]/.test(i.name))).toBe(true);
    expect(ing("Methi leaves")).toMatchObject({ qty: 250, unit: "g" });
  });
  it("reads 'for a minute' as 60 seconds", () => {
    expect(r.cook.some((s) => s.kind === "stir" && s.durationSec === 60 && /fragrant/i.test(s.cue ?? ""))).toBe(true);
  });
  it("still passes the quality rules", () => {
    expect(errors(r)).toEqual([]);
    expect(r.cook.some((s) => s.kind === "note" && /http/.test(s.title))).toBe(false);
  });
});

describe("matching method words to ingredients", () => {
  const conv = (ingredients: string[], steps: string[]) =>
    convertRecipe({ source: "description", ingredients: ingredients.map((name) => ({ name })), steps }, { title: "Test" });
  const itemsOf = (r: Recipe, i: number) => (r.cook[i].items ?? []).map((it) => r.ingredients.find((x) => x.id === it.ingredient)!.name);

  it("matches without 'powder', in another word order, and Hindi names", () => {
    const r = conv(["1 tsp red chilli powder", "3 leaves of spinach", "200 g aloo"], ["Add red chilli, spinach leaves and potato and mix for 2 minutes."]);
    expect(itemsOf(r, 0).sort()).toEqual(["Aloo", "Leaves of spinach", "Red chilli powder"]);
  });
  it("doesn't treat a leading dish name as an ingredient", () => {
    const r = conv(["1 tbsp ghee", "1 tsp cumin seeds", "200 gm paneer"], ["For palak paneer heat ghee in a pan and add cumin seeds.", "Add paneer and cook for 2 minutes."]);
    const firstAdd = r.cook.findIndex((s) => s.items?.some((i) => i.ingredient === "cumin-seeds"));
    expect(itemsOf(r, firstAdd)).toEqual(["Cumin seeds"]);
    expect(r.cook.some((s) => s.title === "Add the paneer")).toBe(true);
  });
  it("names the prepared thing when the step adds an intermediate", () => {
    const r = conv(["1 tsp oil", "1 tsp salt", "2 cups water"], ["Heat oil in a pan.", "Add the masala paste and salt.", "Transfer the cooked dal and boil for 5 minutes."]);
    expect(r.cook.map((s) => s.title)).toEqual(expect.arrayContaining(["Add the masala paste and salt", "Add the cooked dal"]));
    expect(errors(r)).toEqual([]);
  });
});

it("lists each estimated ingredient once in the warning", () => {
  const r = convertRecipe(recipeFromWprm(fixture("wprm.html").replace("few curry leaves", "few curry leaves</span></li><li class=\"wprm-recipe-ingredient\"><span class=\"wprm-recipe-ingredient-name\">few curry leaves"))!);
  expect(r.warnings?.[0].match(/curry leaves/g)).toHaveLength(1);
});

describe("bilingual ingredient lists (NAME | नाम AMOUNT)", () => {
  const src = recipeFromDescription(fixture("description-bilingual.txt"))!;
  const r = convertRecipe(src, { title: "Moong Dal Khichdi | one pot" });
  const ing = (n: string) => r.ingredients.find((i) => i.name.toLowerCase() === n);

  it("reads the amount after the name and drops the translation", () => {
    expect(src.ingredients[0]).toEqual({ name: "1 cup basmati rice", notes: undefined, group: "Soaking" });
    expect(ing("basmati rice")).toMatchObject({ qty: 1, unit: "cup" });
    expect(ing("onion")).toMatchObject({ unit: "g", qty: 210 });
    expect(ing("french beans")).toMatchObject({ unit: "g" });
    expect(ing("bay leaf")).toMatchObject({ qty: 2, unit: "pc" });
    expect(r.ingredients.every((i) => /^[A-Z][a-z]/.test(i.name))).toBe(true);
  });
  it("uses the short headings as groups", () => {
    expect(ing("ghee")?.section).toBe("Tempering & final cooking");
  });
  it("turns 'do not…' into advice, not an action", () => {
    expect(r.cook.find((s) => /^Do not open/.test(s.title))?.kind).toBe("note");
  });
  it("passes the quality rules and the confidence check", () => {
    expect(errors(r)).toEqual([]);
  });
});

describe("real-world method quirks", () => {
  const conv = (ingredients: string[], steps: string[]) =>
    convertRecipe({ source: "description", ingredients: ingredients.map((name) => ({ name })), steps }, { title: "Test" });

  it("'prepared tomato puree' doesn't use up the raw tomato", () => {
    const r = conv(["2 tomatoes", "1 tsp salt", "1 tbsp oil"], ["Heat oil in a kadai.", "Add in prepared tomato puree and cook well.", "Add tomato, salt and mix well."]);
    const step = r.cook.find((s) => s.items?.some((i) => i.ingredient === "tomatoes"));
    expect(step?.detail).toMatch(/^Add tomato, salt/);
  });
  it("never writes a vague 'Add the rest'", () => {
    const r = conv(["1 tsp oil", "1 tsp salt"], ["Heat oil in a pan and add salt.", "Remove the lid after 3 minutes and sprinkle love on top."]);
    expect(r.cook.some((s) => /the rest/i.test(s.title))).toBe(false);
  });
  it("rejoins a sentence split at '&'", () => {
    const r = conv(["1 cup rice", "2 cups water", "1 tsp salt"], ["Add rice, water and salt to a pot. & mix gently, then cook for 15 minutes."]);
    expect(r.cook.some((s) => /^& /.test(s.detail ?? ""))).toBe(false);
  });
  it("caps step text at 140 characters", () => {
    const long = `Add the rice and ${"stir it slowly and patiently ".repeat(10)}until done.`;
    const r = conv(["1 cup rice", "1 tsp salt"], [long, "Add salt."]);
    expect(Math.max(...r.cook.map((s) => (s.detail ?? "").length))).toBeLessThanOrEqual(140);
  });
});

describe("confidence check", () => {
  it("rejects a recipe with no method", () => {
    const src = { source: "description" as const, ingredients: [{ name: "1 cup rice" }, { name: "1 tsp salt" }, { name: "2 cups water" }], steps: [] };
    expect(conversionQuality(src, convertRecipe(src)).ok).toBe(false);
  });
  it("rejects ingredients that aren't in English", () => {
    const src = { source: "description" as const, ingredients: [{ name: "1 कप चावल" }, { name: "2 कप पानी" }, { name: "1 चम्मच नमक" }], steps: ["चावल धोएं", "पकाएं"] };
    expect(conversionQuality(src, convertRecipe(src)).reason).toMatch(/English/);
  });
  it("accepts a normal written recipe", () => {
    const src = recipeFromWprm(fixture("wprm.html"))!;
    expect(conversionQuality(src, convertRecipe(src)).ok).toBe(true);
  });
});

describe("pinch, and steps after serving", () => {
  const p = (name: string) => parseIngredientEntry({ name }, 3, 0);
  it("reads 'a pinch' wherever it appears", () => {
    expect(p("Salt a pinch")).toMatchObject({ name: "Salt", qty: 0.125, unit: "tsp" });
    expect(p("A pinch of Baking Soda")).toMatchObject({ name: "Baking Soda", qty: 0.125, unit: "tsp" });
    expect(p("salt a large pinch")).toMatchObject({ name: "Salt", unit: "tsp" });
  });
  it("leaves the verb 'pinch' alone", () => {
    const r = convertRecipe({ source: "description", ingredients: [{ name: "2 cups wheat flour" }, { name: "1 tsp oil" }, { name: "1 tsp salt" }], steps: ["Add wheat flour, oil and salt and knead for 5 minutes.", "Pinch a ball sized dough and roll it."] }, { title: "Roti" });
    expect(r.cook.some((s) => /^Pinch a ball/.test(s.title))).toBe(true);
    expect(errors(r)).toEqual([]);
  });
  it("keeps 'serve' as the last step", () => {
    const r = convertRecipe({ source: "description", ingredients: [{ name: "1 cup rice" }, { name: "2 cups water" }, { name: "1 tsp ghee" }], steps: ["Boil rice in water for 15 minutes on medium flame.", "Serve hot.", "You can also add ghee on top."] }, { title: "Rice" });
    expect(r.cook.at(-1)?.kind).toBe("serve");
    expect(errors(r)).toEqual([]);
  });
});

it("turns the flame off before serving even after switching pans", () => {
  const r = convertRecipe(
    { source: "description", ingredients: [{ name: "1 tbsp oil" }, { name: "1 cup batter" }, { name: "1 tsp ghee" }], steps: ["Heat a tawa on medium flame and add oil.", "Pour batter and cook for 2 minutes.", "In a small pan add ghee.", "Serve hot."] },
    { title: "Dosa" },
  );
  expect(errors(r)).toEqual([]);
  expect(r.cook.at(-2)).toMatchObject({ kind: "flame", flame: "off" });
});
