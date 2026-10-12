import type { Recipe } from "./types";

// Recipe search that forgives spelling. Indian dish names have many English
// spellings (biryani / biriyani / briyani, kuzhambu / kulambu), and people type
// Tamil, Malayalam or Hindi words in English letters (meen, kozhi, keerai).

const VARIANTS: [RegExp, string][] = [
  [/\b(biriyani|briyani|biriani|beriyani|biryani)\b/g, "biryani"],
  [/\b(kulambu|kozhambu|kuzhambu|kolambu)\b/g, "kuzhambu"],
  [/\b(sambhar|saambar)\b/g, "sambar"],
  [/\b(dosai|dosha|thosai)\b/g, "dosa"],
  [/\b(iddli|idly|idlee)\b/g, "idli"],
  [/\b(channa|chole|chhole|cholay|chickpeas?|kadala)\b/g, "chana"],
  [/\b(panneer|panner|cottage cheese)\b/g, "paneer"],
  [/\b(kheer|payesh)\b/g, "payasam"],
  [/\b(chowmein|chow mein|hakka)\b/g, "noodles"],
  [/\b(manchoorian|manchurian)\b/g, "manchurian"],
  [/\b(szechuan|sichuan|schezuan)\b/g, "schezwan"],
  [/\b(cauliflower|phool gobi)\b/g, "gobi"],
  [/\b(potato|potatoes|urulai|urulaikizhangu)\b/g, "aloo"],
  [/\b(spinach|saag|cheera)\b/g, "palak"],
  [/\b(greens)\b/g, "keerai"],
  [/\b(kozhi|murgh|murg|kodi)\b/g, "chicken"],
  [/\b(muttai|mutta|anda|egg)\b/g, "egg"],
  [/\b(meen|machli|fish)\b/g, "fish"],
  [/\b(thayir|dahi|yogurt|yoghurt|curd)\b/g, "curd"],
  [/\b(rasam|saaru|chaaru)\b/g, "rasam"],
  [/\b(dal|daal|dhal|paruppu|parippu)\b/g, "dal"],
  [/\b(chapathi|chappati|roti|phulka)\b/g, "chapati"],
  [/\b(brinjal|eggplant|kathirikai|vankaya|baingan)\b/g, "brinjal"],
  [/\b(okra|bhindi|vendakkai|ladies finger)\b/g, "bhindi"],
  [/\b(sooji|semolina|rawa)\b/g, "rava"],
  [/\b(vermicelli|semiya|seviyan)\b/g, "semiya"],
  [/\b(lentil|lentils)\b/g, "dal"],
  [/\b(kids?|children|child|toddler|lunchbox)\b/g, "kids"],
  [/\b(veggie|vegetarian)\b/g, "veg"],
  [/\b(non veg|nonveg|non-veg|meat)\b/g, "nonveg"],
  [/\b(chinese|indo chinese|indochinese)\b/g, "indochinese"],
  [/\b(kerala|malayali|nadan)\b/g, "kerala"],
  [/\b(tamil|chettinad|madras)\b/g, "tamil"],
  [/\b(sweet|sweets|dessert)\b/g, "dessert"],
  [/\b(tiffin)\b/g, "breakfast"],
  [/\b(gravy|curry|kari)\b/g, "curry"],
];

export function normalize(s: string): string {
  let t = ` ${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")} `;
  for (const [re, to] of VARIANTS) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
}

/** Levenshtein distance, capped (we only care about 0, 1, 2). */
function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

const CUISINE_WORDS: Record<string, string> = {
  tamil: "tamil south",
  kerala: "kerala south",
  karnataka: "karnataka south",
  andhra: "andhra south",
  hyderabadi: "hyderabadi",
  punjabi: "punjabi north",
  north: "north",
  indo_chinese: "indochinese",
};

interface Indexed {
  recipe: Recipe;
  fields: { words: string[]; weight: number }[];
}

function indexRecipe(r: Recipe): Indexed {
  const facets = [
    r.cuisine ? CUISINE_WORDS[r.cuisine] : "",
    r.region === "indo_chinese" ? "indochinese" : r.region,
    r.course === "main" ? "curry main" : r.course,
    r.kidFriendly ? "kids" : "",
    r.diet.includes("non_veg") ? "nonveg" : r.diet.includes("egg") ? "egg" : "veg",
    r.diet.includes("vegan") ? "vegan" : "",
  ].join(" ");
  return {
    recipe: r,
    fields: [
      { words: tokens(r.name), weight: 3 },
      { words: tokens(`${r.native ?? ""} ${(r.tags ?? []).join(" ")}`), weight: 2 },
      { words: tokens(facets), weight: 1.5 },
      { words: tokens(r.ingredients.map((i) => i.name).join(" ")), weight: 1 },
      { words: tokens(r.blurb), weight: 0.5 },
    ],
  };
}

function scoreToken(q: string, idx: Indexed): number {
  let best = 0;
  for (const f of idx.fields) {
    for (const w of f.words) {
      let s = 0;
      if (w === q) s = 3;
      else if (w.startsWith(q) && q.length >= 2) s = 2;
      else if (q.length >= 4 && w.includes(q)) s = 1.5;
      else if (q.length >= 4 && editDistance(q, w, q.length >= 7 ? 2 : 1) <= (q.length >= 7 ? 2 : 1)) s = 1;
      if (s * f.weight > best) best = s * f.weight;
    }
  }
  return best;
}

export type Facet = "tamil" | "kerala" | "north" | "indochinese" | "kids" | "veg" | "nonveg" | "quick" | "biryani" | "breakfast" | "dessert";

export const FACETS: { id: Facet; label: string }[] = [
  { id: "tamil", label: "Tamil" },
  { id: "kerala", label: "Kerala" },
  { id: "north", label: "North Indian" },
  { id: "indochinese", label: "Indo-Chinese" },
  { id: "biryani", label: "Biryani" },
  { id: "kids", label: "Kids" },
  { id: "breakfast", label: "Breakfast" },
  { id: "dessert", label: "Sweets" },
  { id: "quick", label: "Under 30 min" },
  { id: "veg", label: "Veg" },
  { id: "nonveg", label: "Non-veg" },
];

export function matchesFacet(r: Recipe, f: Facet): boolean {
  switch (f) {
    case "tamil":
      return r.cuisine === "tamil" || (!r.cuisine && r.region === "south" && !/kerala/i.test((r.tags ?? []).join(" ")));
    case "kerala":
      return r.cuisine === "kerala";
    case "north":
      return r.region === "north" && r.cuisine !== "indo_chinese";
    case "indochinese":
      return r.region === "indo_chinese" || r.cuisine === "indo_chinese";
    case "kids":
      return !!r.kidFriendly;
    case "veg":
      return !r.diet.includes("non_veg") && !r.diet.includes("egg");
    case "nonveg":
      return r.diet.includes("non_veg") || r.diet.includes("egg");
    case "quick":
      return r.prepMin + r.cookMin <= 30;
    case "biryani":
      return /biryani/.test(normalize(`${r.name} ${(r.tags ?? []).join(" ")}`));
    case "breakfast":
      return r.course === "breakfast";
    case "dessert":
      return r.course === "dessert";
  }
}

const cache = new WeakMap<Recipe, Indexed>();
function indexed(r: Recipe) {
  let i = cache.get(r);
  if (!i) cache.set(r, (i = indexRecipe(r)));
  return i;
}

/** Recipes matching every query word (allowing typos) and every facet, best first. */
export function searchRecipes(recipes: Recipe[], query: string, facets: Facet[] = []): Recipe[] {
  const pool = recipes.filter((r) => facets.every((f) => matchesFacet(r, f)));
  const qs = tokens(query);
  if (!qs.length) return pool;
  const scored: [Recipe, number][] = [];
  for (const r of pool) {
    const idx = indexed(r);
    let total = 0;
    let ok = true;
    for (const q of qs) {
      const s = scoreToken(q, idx);
      if (!s) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) scored.push([r, total]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([r]) => r);
}
