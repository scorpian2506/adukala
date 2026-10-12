import { parseIngredient } from "parse-ingredient";
import type { ScrapedIngredient, ScrapedRecipe } from "./scrape";
import type { Equipment, Flame, Ingredient, Recipe, Step, StepItem, Unit } from "./types";

// Rule-based converter: a creator's written recipe → Adukala's measured steps.
// No AI. Deterministic, so the same input always gives the same recipe.

export interface ConvertMeta {
  title?: string;
  channel?: string;
  url?: string;
  servings?: number;
}

// ---------- ingredients ----------

const UNIT_MAP: Record<string, Unit> = {
  teaspoon: "tsp",
  tsp: "tsp",
  tablespoon: "tbsp",
  tbsp: "tbsp",
  cup: "cup",
  gram: "g",
  g: "g",
  kilogram: "kg",
  kg: "kg",
  milliliter: "ml",
  ml: "ml",
  liter: "L",
  l: "L",
};

// Average weights so produce is given in grams, as the rules require.
const PRODUCE_G: [RegExp, number, string][] = [
  [/\bonions?\b/, 150, "medium onion"],
  [/\btomato(es)?\b/, 120, "medium tomato"],
  [/\bpotato(es)?\b/, 150, "medium potato"],
  [/\bcarrots?\b/, 70, "medium carrot"],
  [/\b(capsicum|bell pepper)s?\b/, 120, "medium capsicum"],
  [/\b(brinjal|eggplant)s?\b/, 80, "small brinjal"],
  [/\bcucumbers?\b/, 200, "cucumber"],
  [/\bshallots?\b/, 12, "shallot"],
  [/\bbeans\b/, 6, "bean"],
  [/\blemons?\b/, 50, "lemon"],
  [/\bpaneer\b/, 200, "block"],
];

const COUNTABLE = /(green chill|red chill|dried chill|kashmiri chill|clove|cardamom|elaichi|bay lea|tej patta|curry lea|star anise|cinnamon|peppercorn|egg|drumstick|marathi moggu|kalpasi)/;

interface Default {
  re: RegExp;
  qty: number;
  unit: Unit;
  perServing?: boolean;
}

// What we use when the recipe says "few", "pinch", "to taste" or nothing at all.
const VAGUE_DEFAULTS: Default[] = [
  { re: /\bsalt\b/, qty: 0.33, unit: "tsp", perServing: true },
  { re: /curry lea/, qty: 10, unit: "pc" },
  { re: /(hing|asafoetida)/, qty: 0.125, unit: "tsp" },
  { re: /\bwater\b/, qty: 250, unit: "ml" },
  { re: /(coriander|cilantro|mint)( leaves)?/, qty: 2, unit: "tbsp" },
  { re: /ginger/, qty: 5, unit: "g" },
  { re: /cream/, qty: 1, unit: "tbsp" },
  { re: /garam masala/, qty: 0.25, unit: "tsp" },
  { re: /\b(oil|ghee|butter)\b/, qty: 1, unit: "tbsp" },
  { re: /(sugar|jaggery)/, qty: 0.5, unit: "tsp" },
  { re: /lemon juice/, qty: 1, unit: "tbsp" },
  { re: /(powder|masala|seeds?)\b/, qty: 0.5, unit: "tsp" },
];

function singular(s: string) {
  return s
    .replace(/\bchillies\b/g, "chilli")
    .replace(/\bchilies\b/g, "chilli")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\bpotatoes\b/g, "potato")
    .replace(/\b(onion|carrot|shallot|clove|pod|seed|lemon|egg|capsicum|stick)s\b/g, "$1");
}

/** Core name used to spot an ingredient in a method sentence. */
export function ingredientKey(name: string) {
  return singular(
    name
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/\b(fresh|finely|roughly|chopped|sliced|grated|small|medium|large|big|whole|optional|to taste|as required|as needed|few|some|a|of|homemade|store[- ]bought)\b/g, " ")
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

const SYNONYMS: [RegExp, string][] = [
  [/\bjeera\b/, "cumin"],
  [/\bmethi\b/, "fenugreek"],
  [/\bhaldi\b/, "turmeric"],
  [/\b(hing|asafoetida)\b/, "hing"],
  [/\brai\b/, "mustard"],
  [/\bmustard seed\b/, "mustard"],
  [/\bcumin seed\b/, "cumin"],
  [/\bdhania\b/, "coriander"],
  [/\bpalak\b/, "spinach"],
  [/\bchili\b/, "chilli"],
  [/\b(aloo|batata)\b/, "potato"],
  [/\b(pyaz|pyaaz|kanda)\b/, "onion"],
  [/\b(tamatar)\b/, "tomato"],
  [/\b(adrak)\b/, "ginger"],
  [/\b(lehsun|lahsun)\b/, "garlic"],
];

function canonical(s: string) {
  let out = ` ${s} `;
  for (const [re, to] of SYNONYMS) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

function titleCase(s: string) {
  return s.replace(/^\w/, (c) => c.toUpperCase());
}

function tagFor(name: string): Ingredient["tag"] {
  const n = name.toLowerCase();
  if (/\b(oil|ghee|butter)\b/.test(n)) return "oil";
  if (/\bsalt\b/.test(n)) return "salt";
  if (/chill|chilli powder|cayenne/.test(n)) return "chilli";
  if (/(sugar|jaggery|honey)/.test(n)) return "sugar";
  if (/\b(dal|paneer|chana|rajma|tofu|egg|chicken|mutton|fish|prawn|soya|moong|toor|urad)\b/.test(n) && !/powder/.test(n)) return "protein";
  if (/\b(rice|rava|sooji|semolina|potato|flour|atta|maida|poha|vermicelli|bread)\b/.test(n)) return "carb";
  return undefined;
}

function groupFor(name: string, section?: string): Ingredient["group"] {
  const n = name.toLowerCase();
  if (/\b(water|milk|stock|extract)\b/.test(n)) return "liquid";
  if (/(powder|masala)\b/.test(n)) return "spice";
  if (section && /(temper|tadka|seasoning)/i.test(section)) return "tempering";
  if (/(coriander leaves|cilantro|garnish)/.test(n)) return "garnish";
  return "main";
}

interface ParsedIng extends Ingredient {
  key: string;
  notes?: string;
  vague?: string;
}

/** Indian recipe shorthand the parser doesn't know: "250 gm", "1 ltr", "2 nos", "1 tbsp." */
export function normaliseLine(line: string) {
  const n = "(\\d|½|¼|¾|⅓|⅔|⅛)";
  return line
    // "Salt a pinch", "A pinch of baking soda", "a large pinch of hing" → "1 pinch …"
    .replace(/^(.+?)\s+a\s+(?:large\s+|small\s+)?pinch$/i, "1 pinch $1")
    .replace(/^a\s+(?:large\s+|small\s+)?pinch\s+(?:of\s+)?/i, "1 pinch ")
    .replace(new RegExp(`${n}\\s*(gms?|grms?|grams?)\\b\\.?`, "gi"), "$1 g")
    .replace(new RegExp(`${n}\\s*kgs\\b`, "gi"), "$1 kg")
    .replace(new RegExp(`${n}\\s*(ltrs?|litres?|liters?)\\b`, "gi"), "$1 l")
    .replace(new RegExp(`${n}\\s*mls\\b`, "gi"), "$1 ml")
    .replace(/\b(tbsp|tsp|tbs)\./gi, "$1")
    .replace(new RegExp(`${n}\\s*(nos?\\.?|pcs?)\\s+`, "gi"), "$1 ")
    .replace(new RegExp(`^(\\d+(?:\\.\\d+)?|½|¼|¾)\\s+inches\\b`, "i"), "$1 inch")
    .replace(/\s+/g, " ")
    .trim();
}

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, few: 2, couple: 2 };

export function parseIngredientEntry(src: ScrapedIngredient, servings: number, index: number): ParsedIng {
  const line = normaliseLine([src.amount, src.unit, src.name].filter(Boolean).join(" "));
  const p = parseIngredient(line)[0];
  let rawName = (p?.description ?? src.name).trim().replace(/^[,;:.\-\s]+/, "");
  let notes = src.notes;
  // "onions, finely chopped" → name + notes
  const comma = rawName.indexOf(",");
  if (comma > 0) {
    notes = [rawName.slice(comma + 1).trim(), notes].filter(Boolean).join(", ");
    rawName = rawName.slice(0, comma).trim();
  }
  const vagueWord = rawName.match(/\b(few|to taste|as required|as needed|some|handful|a little)\b/i)?.[1] ?? (p?.unitOfMeasureID === "pinch" ? "pinch" : undefined);
  const name = titleCase(
    rawName
      .replace(/\b(few|to taste|as required|as needed|some|a little|handful of|handful)\b/gi, "")
      .replace(/^\s*of\s+/i, "")
      .replace(/\s+/g, " ")
      .trim() || src.name,
  );
  const lower = name.toLowerCase();

  let qty = p?.quantity ?? NaN;
  if (p?.quantity2) qty = (qty + p.quantity2) / 2;
  const uom = (p?.unitOfMeasureID ?? "").toLowerCase();
  let unit: Unit | undefined = UNIT_MAP[uom];
  let approx: string | undefined;
  let estimated = false;

  if (uom === "pinch") {
    qty = 0.125 * (Number.isFinite(qty) ? qty : 1);
    unit = "tsp";
  } else if (uom === "inch" && /ginger|turmeric root/.test(lower)) {
    approx = `${qty || 1} inch piece`;
    qty = 5 * (qty || 1);
    unit = "g";
  } else if (uom === "sprig" || (uom === "" && /sprig/.test(src.unit ?? ""))) {
    qty = 10 * (qty || 1);
    unit = "pc";
  } else if (uom === "bunch") {
    approx = `${qty || 1} bunch`;
    qty = (/spinach|palak|methi|fenugreek/.test(lower) ? 250 : 50) * (qty || 1);
    unit = "g";
  } else if (["piece", "clove", "pod", "stick", "leaf", "each", "whole", "pcs", "no"].includes(uom)) {
    unit = "pc";
  }

  if (!unit && Number.isFinite(qty)) {
    const produce = PRODUCE_G.find(([re]) => re.test(lower));
    if (produce && !COUNTABLE.test(lower)) {
      const size = /\bsmall\b/i.test(line) ? 0.7 : /\b(large|big)\b/i.test(line) ? 1.4 : 1;
      const label = size === 1 ? produce[2] : produce[2].replace(/^(medium|small)\s+/, "").replace(/^/, size < 1 ? "small " : "large ");
      approx = `about ${formatCount(qty)} ${label}${qty > 1 && !/s$/.test(label) ? "s" : ""}`;
      qty = Math.round((qty * produce[1] * size) / 5) * 5 || produce[1];
      unit = "g";
    } else unit = "pc";
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    const d = VAGUE_DEFAULTS.find((x) => x.re.test(lower));
    if (d) {
      qty = d.perServing ? Math.max(0.25, Math.round(d.qty * servings * 4) / 4) : d.qty;
      unit = d.unit;
    } else {
      qty = 1;
      unit = unit ?? "pc";
    }
    estimated = true;
  }
  if (vagueWord) estimated = true;
  if (estimated) approx = [approx, "our estimate — the recipe gave no exact amount"].filter(Boolean).join(" · ");

  return {
    id: `ing-${index}`,
    key: canonical(ingredientKey(name)),
    name,
    qty,
    unit: unit ?? "pc",
    approx,
    group: groupFor(name, src.group),
    section: src.group ? titleCase(src.group.replace(/:$/, "")) : undefined,
    estimated: estimated || undefined,
    tag: tagFor(name),
    notes,
    vague: vagueWord,
  };
}

function formatCount(n: number) {
  return n === 0.5 ? "½" : n === 0.25 ? "¼" : String(Math.round(n * 10) / 10);
}

// ---------- method ----------

const VESSEL_WORDS: [RegExp, Equipment][] = [
  [/pressure cooker|cooker/, "pressure_cooker"],
  [/tadka pan|tempering pan/, "tadka_pan"],
  [/kadai|kadhai|wok/, "kadai"],
  [/tawa|griddle/, "tawa"],
  [/saucepan|sauce pan|pot|vessel/, "saucepan"],
  [/\bpan\b/, "pan"],
];

function sentencesOf(steps: string[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    for (const part of s.split(/(?<=[.!])\s+(?=[a-zA-Z])/)) {
      const t = part
        .trim()
        .replace(/^(firstly|first|now|then|further|furthermore|additionally|also|next|finally|lastly|meanwhile|after that|once done)\s*,?\s*/i, "")
        .replace(/\s+/g, " ");
      if (/^(keep|set) (it )?aside\.?$/i.test(t)) continue;
      // "& mix gently…" is the tail of the previous sentence.
      if (/^[&,+]/.test(t) && out.length) {
        out[out.length - 1] = `${out[out.length - 1].replace(/\.$/, "")} ${t}`;
        continue;
      }
      // A one-word fragment ("crisp.") is a typo split in the source; glue it back.
      if (t.split(/\s+/).length < 2 && out.length) out[out.length - 1] = `${out[out.length - 1].replace(/\.$/, "")} ${t}`;
      else if (t.length > 3) out.push(t);
    }
  }
  return out;
}

function durationIn(s: string): number | undefined {
  const w = s.match(/\b(a|an|one|two|three|four|five|ten|a few|a couple of|half a)\s+(hours?|minutes?|mins?|seconds?)\b/i);
  if (w && !/\d/.test(s.slice(0, w.index))) {
    const word = w[1].toLowerCase();
    const n = word === "half a" ? 0.5 : word === "a few" ? 3 : word === "a couple of" ? 2 : (WORD_NUM[word] ?? 1);
    const mult = /^h/i.test(w[2]) ? 3600 : /^m/i.test(w[2]) ? 60 : 1;
    if (!/\d+\s*(-|to)?\s*\d*\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i.test(s)) return Math.round(n * mult);
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|to)\s*(\d+(?:\.\d+)?)\s*)?(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i);
  if (!m) return undefined;
  const n = m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
  const unit = m[3].toLowerCase();
  const mult = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
  return Math.round(n * mult);
}

function flameIn(s: string): Flame | undefined {
  if (/(turn|switch)\s+off|flame off|off the (flame|heat|stove)/i.test(s)) return "off";
  const m = s.match(/\b(low|medium|high|medium[- ]low|medium[- ]high)\s*(flame|heat)/i);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  if (v.startsWith("medium-low") || v.startsWith("medium low")) return "low";
  if (v.startsWith("medium-high") || v.startsWith("medium high")) return "high";
  return v as Flame;
}

function cueIn(s: string): string | undefined {
  const m = s.match(/\b(?:until|till|or until)\s+(.+?)(?:[.;]|$)/i);
  if (!m) return undefined;
  const c = m[1].replace(/\bor\b.*$/, "").trim();
  return c.length > 3 ? titleCase(c) : undefined;
}

function defaultDuration(s: string, kind: Step["kind"]): number | undefined {
  const l = s.toLowerCase();
  if (/(splutter|crackle|pop)/.test(l)) return 20;
  if (/onion/.test(l) && /(golden|brown|translucent|soft)/.test(l)) return /golden|brown/.test(l) ? 300 : 180;
  if (/(golden|brown)/.test(l)) return 180;
  if (/(raw smell|aromatic|fragrant)/.test(l)) return 60;
  if (/(slightly|briefly|a few seconds)/.test(l)) return 30;
  if (/oil (separates|leaves)/.test(l)) return 300;
  if (/cool/.test(l)) return 600;
  if (kind === "stir") return 60;
  if (kind === "wait") return 300;
  return undefined;
}

function shorten(words: string, max = 7) {
  const w = words.split(/\s+/).filter(Boolean);
  return w.length <= max ? w.join(" ") : w.slice(0, max).join(" ");
}

/** "chana dal, urad dal and more", trimmed so the whole title stays within 7 words. */
function listNames(items: StepItem[], byId: Map<string, ParsedIng>, budget = 5) {
  const names = [...new Set(items.map((i) => byId.get(i.ingredient)!.name.toLowerCase()))];
  const words = (s: string) => s.split(/\s+/).length;
  if (names.length === 1) return names[0];
  if (names.length === 2 && words(`${names[0]} and ${names[1]}`) <= budget) return `${names[0]} and ${names[1]}`;
  let out = names[0];
  for (const n of names.slice(1)) {
    if (words(`${out}, ${n} and more`) > budget) break;
    out = `${out}, ${n}`;
  }
  return out === names[0] && words(`${out} and more`) > budget ? out : `${out} and more`;
}

function detailOf(s: string) {
  // Our steps always show the measured amount, so drop the source's vague wording.
  const cleaned = s
    .replace(/\s*[●•▪️]\s*/g, " ")
    .replace(/\b(a\s+)?pinch\s+of\b|\ba\s+pinch\b/gi, "⅛ tsp")
    .replace(/\s*\b(to taste|as required|as needed)\b/gi, "")
    .replace(/\s+([,.])/g, "$1");
  const t = titleCase(cleaned);
  return t.length > 140 ? `${t.slice(0, 137).replace(/[\s,;:&]+\S*$/, "")}…` : t;
}

export function convertRecipe(src: ScrapedRecipe, meta: ConvertMeta = {}): Recipe {
  const servings = meta.servings ?? src.servings ?? 3;
  // Description recipes repeat headings as ingredients sometimes ("Garnish"); drop lines with no real name.
  src = { ...src, ingredients: src.ingredients.filter((i) => /[a-z]{2}/i.test(i.name) && !/^(ingredients?|method|process|garnish|notes?)$/i.test(i.name.trim())) };
  const ings = src.ingredients.map((i, n) => parseIngredientEntry(i, servings, n));
  // Readable, unique ids ("oil", "oil-2") so a recipe is easy to inspect.
  const taken = new Set<string>();
  for (const i of ings) {
    const base = slug(i.name) || "item";
    let id = base;
    for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
    taken.add(id);
    i.id = id;
  }
  const byId = new Map(ings.map((i) => [i.id, i]));
  const used = new Set<string>();
  const warnings: string[] = [];

  // Longest keys first so "coriander seeds" wins over "coriander".
  const byKeyLength = [...ings].sort((a, b) => b.key.length - a.key.length);

  function itemsIn(sentence: string): StepItem[] {
    let text = ` ${canonical(singular(sentence.toLowerCase().replace(/[^a-z0-9½¼¾\s]/g, " ")))} `;
    // "prepared tomato puree", "cooked dal" were made earlier: they mustn't use up a raw ingredient,
    // unless the recipe lists exactly that ("1 cup cooked rice").
    text = text.replace(/ (prepared|cooked|boiled|fried|roasted|ground|blanched) ([a-z]+(?: (?:puree|paste|mixture|masala|stuffing))?)(?= )/g, (m, _adj, rest) =>
      byKeyLength.some((i) => !used.has(i.id) && (i.key === `${_adj} ${rest}` || i.key === m.trim())) ? m : " ",
    );
    text = text.replace(/ [a-z]+ (puree|stuffing|mixture)(?= )/g, (m) => (byKeyLength.some((i) => !used.has(i.id) && m.includes(` ${i.key} `.trim())) ? m : " "));
    const found: ParsedIng[] = [];
    for (const ing of byKeyLength) {
      if (used.has(ing.id) || !ing.key) continue;
      const words = ing.key.split(" ");
      const key = ` ${ing.key} `;
      // Also accept the first word of a multi-word key ("tamarind extract" → "tamarind").
      const short = words.length > 1 ? ` ${words[0]} ` : null;
      let hit: string | null = text.includes(key) ? key : null;
      if (!hit && words.length > 1) {
        // Same words in another order, close together ("leaves of spinach" ~ "spinach leaves").
        const tokens = text.trim().split(" ");
        const pos = words.map((w) => tokens.indexOf(w));
        if (pos.every((p) => p >= 0) && Math.max(...pos) - Math.min(...pos) <= words.length) {
          hit = ` ${tokens.slice(Math.min(...pos), Math.max(...pos) + 1).join(" ")} `;
        }
      }
      // Methods often drop "powder" ("add turmeric, red chilli…").
      const bare = ing.key.replace(/ powder$/, "");
      if (!hit && bare !== ing.key && bare.length > 3 && text.includes(` ${bare} `)) hit = ` ${bare} `;
      if (!hit && short && short.length > 4 && text.includes(short) && !/ (powder|seed|leaves|whole|dried|fresh|green|red) /.test(short)) hit = short;
      if (!hit) continue;
      // Same name in two sections (oil for the masala, oil for the tadka): take the first unused.
      found.push(ing);
      used.add(ing.id);
      text = text.replace(hit, " ");
    }
    return found
      .sort((a, b) => ings.indexOf(a) - ings.indexOf(b))
      .map((i) => ({ ingredient: i.id, qty: i.qty, unit: i.unit }));
  }

  const cook: Step[] = [];
  let flame: Flame = "off";
  let vessel: Equipment | undefined;
  let pressureDone = false;

  const push = (s: Step) => cook.push(s);
  // Is any burner still on, judging by the steps written so far?
  const flameIsOn = () => {
    for (let i = cook.length - 1; i >= 0; i--) if (cook[i].flame) return cook[i].flame !== "off";
    return false;
  };

  for (const raw of sentencesOf(src.steps)) {
    // "For palak paneer heat ghee…" — the leading dish name isn't an ingredient.
    let sentence = raw
      .replace(/^for (the )?[a-z\s]{3,40}?,?\s+(?=(heat|add|in|take|put|now|pour|place|boil|cook|mix)\b)/i, "")
      .replace(/^to (make|prepare|cook) [^,]{3,40},\s*/i, "")
      .replace(/^[●•▪️]\s*/, "");
    // "Do not soak the poha" is advice, not an action.
    if (/\b(do not|don't|dont|never|avoid)\b/i.test(sentence)) {
      push({ kind: "note", title: shorten(titleCase(sentence.replace(/[.,;:]+$/, ""))), detail: detailOf(sentence) });
      continue;
    }
    const l = sentence.toLowerCase();
    const f = flameIn(sentence);
    const v = VESSEL_WORDS.find(([re]) => re.test(l))?.[1];
    // A new vessel starts cold: don't carry the last pan's flame into it.
    if (v && v !== vessel) flame = "off";
    if (v) vessel = v;

    // "once the pressure releases, whisk the dal" → the release is already a step.
    if (/(once|after|when) (the )?pressure (releases|is released|goes|drops)|open the (lid|cooker)/.test(l)) {
      if (!pressureDone) push({ kind: "lid_open", title: "Open the lid", equipment: vessel });
      sentence = sentence.replace(/^.*?(releases|released|goes|drops|lid|cooker)\s*,?\s*/i, "");
      if (sentence.length < 4) continue;
    }
    const s = sentence.toLowerCase();
    const items = itemsIn(sentence);
    const duration = durationIn(sentence);
    const cue = cueIn(sentence);
    if (f && f !== "off") flame = f;

    if (/pressure[- ]cook(?!er)|whistle/.test(s)) {
      if (items.length) push({ kind: "add", title: shorten(`Add the ${listNames(items, byId)}`), items, equipment: "pressure_cooker", detail: detailOf(sentence) });
      const whistles = Number(s.match(/(\d+)\s*whistles?/)?.[1] ?? 3);
      push({ kind: "lid_close", title: "Close the cooker lid", detail: "Lock the lid and put the whistle (weight) on top.", equipment: "pressure_cooker" });
      flame = f && f !== "off" ? f : "medium";
      push({ kind: "pressure", title: `Cook for ${whistles} whistle${whistles > 1 ? "s" : ""}`, whistles, flame, durationSec: whistles * 150, equipment: "pressure_cooker", detail: "Count each loud hiss of the whistle." });
      push({ kind: "flame", title: "Turn off the flame", flame: "off", equipment: "pressure_cooker" });
      push({ kind: "release", title: "Let the pressure drop", durationSec: 600, equipment: "pressure_cooker", detail: "Wait until all the pressure is gone; don't force the whistle." });
      push({ kind: "lid_open", title: "Open the lid", equipment: "pressure_cooker" });
      flame = "off";
      pressureDone = true;
      vessel = "pressure_cooker";
      continue;
    }
    pressureDone = false;

    if (/(grind|blend|blitz|mixer)/.test(s)) {
      if (/(cool|transfer)/.test(s) && !/grind|blend/.test(s)) {
        push({ kind: "wait", title: "Let it cool", durationSec: 600, detail: detailOf(sentence), flame: "off" });
        continue;
      }
      push({ kind: "grind", title: /smooth/.test(s) ? "Grind to a smooth paste" : /coarse/.test(s) ? "Grind coarsely" : "Grind in the mixer", items: items.length ? items : undefined, equipment: "mixer", detail: detailOf(sentence) });
      continue;
    }
    if (/^(cool|allow .* to cool|let .* cool)/.test(s)) {
      push({ kind: "wait", title: "Let it cool", durationSec: duration ?? 600, detail: detailOf(sentence), flame: "off" });
      continue;
    }
    if (/^soak|\bsoak\b/.test(s) && !items.length) {
      push({ kind: "soak", title: shorten(`Soak ${duration ? `for ${Math.round(duration / 60)} minutes` : "as described"}`), durationSec: duration, detail: detailOf(sentence) });
      continue;
    }
    if (/\bheat\b/.test(s) && (/\b(oil|ghee|butter)\b/.test(s) || v)) {
      // "heat 2 tbsp oil and add cumin, hing…" → heat the pan, add the oil, then add the rest.
      flame = f && f !== "off" ? f : "medium";
      vessel ??= "kadai";
      const fat = items.filter((i) => byId.get(i.ingredient)?.tag === "oil");
      const rest = items.filter((i) => byId.get(i.ingredient)?.tag !== "oil");
      push({ kind: "heat", title: `Heat the ${vessel === "pressure_cooker" ? "cooker" : vessel.replace("_", " ")}`, equipment: vessel, flame, durationSec: 30 });
      if (fat.length) {
        push({ kind: "add", title: shorten(`Add the ${listNames(fat, byId)}`), items: fat, equipment: vessel, flame, durationSec: 60, cue: "The oil shimmers and moves easily", detail: rest.length ? undefined : detailOf(sentence) });
      }
      if (rest.length) {
        push({ kind: "add", title: shorten(`Add the ${listNames(rest, byId)}`), items: rest, equipment: vessel, flame, detail: detailOf(sentence) });
        if (/(splutter|crackle)/.test(s)) push({ kind: "stir", title: "Let the seeds splutter", durationSec: 20, flame, equipment: vessel, cue: "The seeds pop and crackle" });
      }
      continue;
    }
    if (f === "off" && !items.length) {
      push({ kind: "flame", title: "Turn off the flame", flame: "off", equipment: vessel });
      flame = "off";
      continue;
    }
    if (/^(cover|close)|\bcover (and|with)|close the lid/.test(s)) {
      push({
        kind: "lid_close",
        title: "Cover with a lid",
        equipment: vessel,
        flame,
        detail: vessel === "pressure_cooker" ? "Put the lid on loosely, without the whistle — this isn't pressure cooking." : undefined,
      });
      push({ kind: "wait", title: duration ? `Cook covered for ${Math.round(duration / 60) || 1} min` : "Let it cook covered", durationSec: duration ?? defaultDuration(s, "wait"), flame, equipment: vessel, cue, detail: detailOf(sentence) });
      continue;
    }
    if (/(serve|enjoy)\b/.test(s) && !items.length) {
      if (flameIsOn()) push({ kind: "flame", title: "Turn off the flame", flame: "off", equipment: vessel });
      flame = "off";
      push({ kind: "serve", title: "Serve hot", detail: detailOf(sentence) });
      continue;
    }

    // "Transfer the cooked dal" adds something; "transfer it to a bowl" doesn't.
    const isAdd = /\b(add|put|throw|pour|drop|take|place|sprinkle|garnish|mix in|stir in|toss in|tip in)\b/.test(s) || /\btransfer\b(?!\s+(it|everything|this)?\s*(to|into)\b)/.test(s) || items.length > 0;
    const isStir = /\b(saute|sauté|fry|roast|stir|mix|toss|whisk|cook (till|until|on|for)|mash|splutter|crackle)\b/.test(s);
    const isWait = /\b(boil|simmer|cook (for|covered|till)|let it cook|rest)\b/.test(s);

    if (isAdd) {
      const what = items.length
        ? listNames(items, byId)
        : (s.match(/\b(?:add|put|pour|transfer|tip|sprinkle|top with|garnish with)\s+(?:in\s+)?(?:the\s+)?(?:some\s+|prepared\s+)?([a-z\s]+?)(?:\s+and|\s+to|\s+into|\s+in|,|\.|$)/)?.[1]?.trim() || "the rest");
      // Something made earlier in the recipe ("the masala paste", "the cooked dal") goes in the title too.
      const made = items.length ? s.match(/\b((?:cooked|prepared|ground|boiled|roasted|fried)\s+[a-z]+|[a-z]+\s+(?:paste|puree|purée|mixture))\b/)?.[1] : undefined;
      const label = made && !items.some((i) => made.includes(byId.get(i.ingredient)!.key)) ? `${made.replace(/^prepared\s+/, "")} and ${listNames(items, byId, 3)}` : what;
      // Couldn't tell what goes in: show the instruction as a note rather than a vague "Add the rest".
      if (label === "the rest") {
        push({ kind: "note", title: shorten(titleCase(sentence.replace(/[.,;:]+$/, ""))), detail: detailOf(sentence) });
        continue;
      }
      push({
        kind: "add",
        title: shorten(/garnish/.test(s) ? `Garnish with ${label}` : `Add ${label.startsWith("the ") ? label : `the ${label}`}`),
        items: items.length ? items : undefined,
        flame: flame === "off" ? undefined : flame,
        equipment: vessel,
        detail: detailOf(sentence),
      });
      if (isStir || isWait) {
        const kind = isWait && !isStir ? "wait" : "stir";
        const d = duration ?? defaultDuration(s, kind);
        push({
          kind,
          title: kind === "stir" ? (cue ? shorten(`Stir until ${cue.toLowerCase()}`) : d ? `Stir for ${d >= 60 ? `${Math.round(d / 60)} min` : `${d} seconds`}` : "Stir well") : `Simmer for ${Math.round((d ?? 300) / 60)} min`,
          durationSec: d,
          flame: flame === "off" ? undefined : flame,
          equipment: vessel,
          cue,
        });
      }
      continue;
    }
    if (isStir || isWait) {
      const kind = isWait && !isStir ? "wait" : "stir";
      const d = duration ?? defaultDuration(s, kind);
      if (/(splutter|crackle)/.test(s) && !cue) {
        push({ kind: "stir", title: "Let the seeds splutter", durationSec: duration ?? 20, flame: flame === "off" ? undefined : flame, equipment: vessel, cue: "Mustard seeds pop and crackle", detail: detailOf(sentence) });
        continue;
      }
      const verb = /saute|sauté/.test(s) ? "Sauté" : /roast/.test(s) ? "Roast" : /fry/.test(s) ? "Fry" : /boil/.test(s) ? "Boil" : /simmer/.test(s) ? "Simmer" : /whisk|mash/.test(s) ? "Whisk" : kind === "wait" ? "Cook" : "Stir";
      push({
        kind,
        title: shorten(cue ? `${verb} until ${cue.toLowerCase()}` : d ? `${verb} for ${d >= 60 ? `${Math.round(d / 60)} min` : `${d} seconds`}` : `${verb} well`),
        durationSec: d,
        flame: flame === "off" ? undefined : flame,
        equipment: vessel,
        cue,
        detail: detailOf(sentence),
      });
      continue;
    }
    push({ kind: "note", title: shorten(titleCase(sentence.replace(/[.,;:]+$/, ""))), detail: detailOf(sentence) });
  }

  // Anything the method never mentioned still has to go in somewhere.
  const leftovers = ings.filter((i) => !used.has(i.id) && !/^water$/i.test(i.name));
  if (leftovers.length) {
    const serveAt = cook.findIndex((s) => s.kind === "serve");
    const at = serveAt >= 0 ? serveAt : cook.length;
    const items = leftovers.map((i) => ({ ingredient: i.id, qty: i.qty, unit: i.unit }));
    leftovers.forEach((i) => used.add(i.id));
    cook.splice(at, 0, { kind: "add", title: shorten(`Add the ${listNames(items, byId)}`), items, detail: "The source recipe didn't say exactly when — adding these near the end is safe." });
    warnings.push(`The recipe didn't say when to add: ${[...new Set(leftovers.map((i) => i.name.toLowerCase()))].join(", ")}.`);
  }
  // Water never mentioned is dropped rather than guessed into a step.
  const dropped = new Set(ings.filter((i) => !used.has(i.id)).map((i) => i.id));

  // Text after "serve" in the source (tips, variations) shouldn't come after serving.
  const serveIdx = cook.findIndex((s) => s.kind === "serve");
  if (serveIdx >= 0 && serveIdx < cook.length - 1) {
    const [serve] = cook.splice(serveIdx, 1);
    if (flameIsOn()) cook.push({ kind: "flame", title: "Turn off the flame", flame: "off", equipment: vessel });
    cook.push(serve);
  }
  if (!cook.some((s) => s.kind === "serve")) {
    if (flameIsOn()) cook.push({ kind: "flame", title: "Turn off the flame", flame: "off", equipment: vessel });
    cook.push({ kind: "serve", title: "Serve hot" });
  }

  const finalIngs = ings.filter((i) => !dropped.has(i.id));

  // ---------- prep ----------
  const prep: Step[] = [];
  for (const i of finalIngs) {
    const n = i.name.toLowerCase();
    if (/\b(dal|rice|chana|rajma|moong|toor|urad|lentil)\b/.test(n) && !/(powder|flour|flakes|poha)/.test(n) && i.group !== "tempering" && i.qty >= 20 && ["g", "cup"].includes(i.unit)) {
      prep.push({ kind: "rinse", title: shorten(`Rinse the ${n}`), items: [{ ingredient: i.id, qty: i.qty, unit: i.unit }], equipment: "sieve", detail: "Wash in a bowl of water 2–3 times until the water runs almost clear." });
    }
  }
  const chopped = new Set<string>();
  for (const i of finalIngs) {
    const n = i.name.toLowerCase();
    const notes = i.notes?.toLowerCase() ?? "";
    const verb = notes.match(/(finely chopped|chopped|sliced|diced|cubed|grated|minced|crushed|julienned|slit)/)?.[1];
    const isProduce = /(onion|tomato|ginger|garlic|green chilli|coriander leaves|carrot|potato|capsicum|beans|cabbage|spinach|palak|brinjal|shallot|drumstick|cauliflower|gobi|mint)/.test(n);
    if (!verb && !(isProduce && i.unit === "g")) continue;
    const action = verb ? verb.replace(/ed$|d$/, "").replace("chopp", "chop").replace("slic", "slice").replace("dic", "dice").replace("cub", "cube").replace("grat", "grate").replace("minc", "mince").replace("crush", "crush").replace("julienn", "julienne") : "chop";
    const peel = /peel/.test(notes) ? "Peel and " : "";
    prep.push({
      kind: "chop",
      title: shorten(`${peel}${peel ? action : titleCase(action)} the ${n}`),
      items: [{ ingredient: i.id, qty: i.qty, unit: i.unit }],
      equipment: /grate/.test(action) ? "knife" : "knife",
      detail: verb ? `${titleCase(verb)}, as the recipe asks.` : undefined,
    });
    chopped.add(i.id);
  }
  const sections = new Map<string, ParsedIng[]>();
  for (const i of finalIngs) {
    if (chopped.has(i.id) || /^water$/i.test(i.name)) continue;
    const k = i.section ?? (i.group === "spice" ? "the spices" : "the rest");
    if (!sections.has(k)) sections.set(k, []);
    sections.get(k)!.push(i);
  }
  for (const [section, list] of sections) {
    const label = section.replace(/^for\s+(the\s+)?/i, "");
    prep.push({
      kind: "measure",
      title: shorten(`Measure ${/^the /.test(label) ? label : `for the ${label.toLowerCase()}`}`),
      items: list.map((i) => ({ ingredient: i.id, qty: i.qty, unit: i.unit })),
      equipment: "bowl",
      detail: "Put each into a small bowl so it's ready to tip in.",
    });
  }

  // ---------- metadata ----------
  const all = `${meta.title ?? ""} ${src.name ?? ""} ${finalIngs.map((i) => i.name).join(" ")}`.toLowerCase();
  const name = cleanName(src.name || meta.title || "Your recipe");
  const southWords = /(sambar|rasam|dosa|idli|upma|uppittu|pongal|avial|aviyal|poriyal|kootu|bisi bele|chutney|appam|puttu|thoran|kuzhambu|kurma|pesarattu|lemon rice|curd rice|coconut)/;
  const region: Recipe["region"] = southWords.test(all) || (/curry leaves/.test(all) && /mustard/.test(all)) ? "south" : "north";
  const n = name.toLowerCase();
  const course: Recipe["course"] = /(chai|tea|lassi|coffee|buttermilk|chaas)/.test(n)
    ? "drink"
    : /(rice|pulao|biryani|bath|pongal|khichdi)/.test(n)
      ? "rice"
      : /(upma|poha|dosa|idli|paratha|uttapam|pesarattu|chilla)/.test(n)
        ? "breakfast"
        : /(chutney|raita|rasam|pickle)/.test(n)
          ? "side"
          : /\bdal\b/.test(n)
            ? "dal"
            : "main";
  const hue = hueFor(n, finalIngs.map((i) => i.name.toLowerCase()), course);
  const chilliCount = finalIngs.filter((i) => i.tag === "chilli").length;
  const steps = [...prep, ...cook];
  const equipment = [...new Set([...steps.map((s) => s.equipment).filter((e): e is Equipment => !!e), "bowl" as Equipment])];
  const cookSec = cook.reduce((t, s) => t + (s.durationSec ?? 30), 0);
  const nonVeg = /(chicken|mutton|fish|prawn|egg|meat|lamb)/.test(all);
  const dairy = /(ghee|butter|milk|curd|yogurt|yoghurt|paneer|cream|khoya)/.test(all);
  const rootOrAllium = /(onion|shallot|garlic|potato|carrot|ginger|beetroot|radish)/.test(all);
  const estimates = [...new Set(finalIngs.filter((i) => i.estimated).map((i) => i.name.toLowerCase()))];
  if (estimates.length) warnings.unshift(`We estimated amounts for: ${estimates.join(", ")}. Adjust them next time if needed.`);

  return {
    id: `${slug(name)}-${hash(JSON.stringify(src)).slice(0, 5)}`,
    name,
    region,
    course,
    blurb: meta.channel ? `Converted from ${meta.channel}'s written recipe — measured and split into small steps.` : "Converted from a written recipe — measured and split into small steps.",
    servings,
    prepMin: Math.max(5, Math.round((5 + prep.length * 2) / 5) * 5),
    cookMin: Math.max(5, Math.round(cookSec / 60 / 5) * 5),
    level: steps.length > 35 ? 3 : steps.length > 22 ? 2 : 1,
    spice: chilliCount >= 3 ? 3 : chilliCount >= 1 ? 2 : 1,
    diet: nonVeg ? ["non_veg"] : [...(["veg"] as const), ...(!dairy ? (["vegan"] as const) : []), ...(!rootOrAllium ? (["jain"] as const) : [])],
    hue,
    equipment,
    ingredients: finalIngs.map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      unit: i.unit,
      approx: i.approx,
      group: i.group,
      section: i.section,
      estimated: i.estimated,
      tag: i.tag,
    })),
    prep,
    cook,
    source: meta.url ? { kind: "youtube", url: meta.url, title: meta.title, channel: meta.channel } : { kind: "ai" },
    method: "rules",
    warnings: warnings.length ? warnings : undefined,
    createdAt: Date.now(),
  };
}

function hueFor(name: string, ingredients: string[], course: Recipe["course"]): Recipe["hue"] {
  if (/(palak|spinach|saag|methi (leaves|malai)|hariyali|green|mint|pudina|coriander chutney)/.test(name)) return "leaf";
  if (/(sambar|rasam|tamarind|puli|kuzhambu|chole|rajma)/.test(name)) return "tamarind";
  if (/(makhani|butter masala|tikka|kadai|vindaloo|tomato|chilli|masala)/.test(name)) return "chilli";
  if (/(coconut|korma|kurma|avial|aviyal|stew|curd|chutney)/.test(name)) return "coconut";
  if (/(dal|khichdi|pongal|upma|lemon rice|pulao|rice|kadhi|bath)/.test(name)) return "turmeric";
  const main = ingredients.slice(0, 6).join(" ");
  if (/(spinach|palak)/.test(main)) return "leaf";
  if (/coconut/.test(main) && course !== "dal") return "coconut";
  if (/tomato/.test(main) && course === "main") return "chilli";
  return "turmeric";
}

/**
 * Is a rule-based conversion good enough to cook from? If most ingredients were
 * never placed in a step, or there was no method at all, it's guesswork.
 */
export function conversionQuality(src: ScrapedRecipe, r: Recipe): { ok: boolean; reason?: string } {
  if (src.steps.length < 2) return { ok: false, reason: "the written recipe has no method steps" };
  const nonLatin = src.ingredients.filter((i) => !/[a-z]{2}/i.test(i.name)).length;
  if (nonLatin > src.ingredients.length / 2) return { ok: false, reason: "the ingredients aren't written in English" };
  const leftover = r.cook.find((s) => /didn't say exactly when/.test(s.detail ?? ""))?.items?.length ?? 0;
  if (leftover > r.ingredients.length / 2) return { ok: false, reason: "the method doesn't say when to add most ingredients" };
  return { ok: true };
}

export function cleanName(s: string) {
  const first = s.split(/[|\-–—:]/)[0];
  const t = first
    .replace(/\b(recipe|recipes|how to make|easy|quick|best|restaurant style|hotel style|homemade|simple|perfect|authentic)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return (t || s.trim())
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "recipe"
  );
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
