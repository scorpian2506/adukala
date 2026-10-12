// Pure HTML/text → structured recipe extraction. No network, no AI, so it's
// easy to test. Used by the YouTube pipeline and the rule-based converter.

export interface ScrapedIngredient {
  amount?: string; // "1½", "2-3", "" when vague
  unit?: string; // "tbsp", "cup", "" …
  name: string; // "chana dal"
  notes?: string; // "finely chopped"
  group?: string; // "for tempering"
}

export interface ScrapedRecipe {
  url?: string;
  name?: string;
  servings?: number;
  ingredients: ScrapedIngredient[];
  steps: string[];
  source: "jsonld" | "wprm" | "description";
}

export function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&frac12;/g, "½")
    .replace(/&frac14;/g, "¼")
    .replace(/&frac34;/g, "¾")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

export function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/▢/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

type LdNode = Record<string, unknown>;

function findRecipeNode(node: unknown): LdNode | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipeNode(n);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as LdNode;
  const type = n["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return n;
  if (n["@graph"]) return findRecipeNode(n["@graph"]);
  return null;
}

function instructionsText(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(instructionsText);
  if (typeof v === "object") {
    const o = v as LdNode;
    if (o.itemListElement) return instructionsText(o.itemListElement);
    if (typeof o.text === "string") return [o.text];
    if (typeof o.name === "string") return [o.name];
  }
  return [];
}

function servingsFrom(v: unknown): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const n = parseInt(String(s ?? ""), 10);
  return n > 0 && n < 50 ? n : undefined;
}

/** schema.org Recipe JSON-LD. Ingredient lines come back unparsed in `name`. */
export function recipeFromJsonLd(html: string): ScrapedRecipe | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const r = findRecipeNode(data);
    if (!r) continue;
    const lines = ((r.recipeIngredient as unknown[]) ?? []).map((i) => stripTags(String(i))).filter(Boolean);
    if (lines.length < 2) continue;
    return {
      name: typeof r.name === "string" ? stripTags(r.name) : undefined,
      servings: servingsFrom(r.recipeYield),
      ingredients: lines.map((name) => ({ name })),
      steps: instructionsText(r.recipeInstructions).map(stripTags).filter(Boolean),
      source: "jsonld",
    };
  }
  return null;
}

function hasClass(attrs: string, cls: string) {
  const m = attrs.match(/class\s*=\s*"([^"]*)"/);
  return !!m && m[1].split(/\s+/).includes(cls);
}

function spanText(html: string, cls: string): string | undefined {
  for (const m of html.matchAll(/<span([^>]*)>([\s\S]*?)<\/span>/g)) {
    if (hasClass(m[1], cls)) return stripTags(m[2]) || undefined;
  }
  return undefined;
}

/** WP Recipe Maker markup — used by many Indian recipe blogs (Hebbar's Kitchen, etc.). */
export function recipeFromWprm(html: string): ScrapedRecipe | null {
  const ingredients: ScrapedIngredient[] = [];
  // Walk group headers and ingredient <li>s in document order.
  const re = /<(h[2-6]|li|div|span)([^>]*)>/g;
  let group: string | undefined;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const [, tag, attrs] = m;
    if (hasClass(attrs, "wprm-recipe-group-name") || hasClass(attrs, "wprm-recipe-ingredient-group-name")) {
      const close = html.indexOf(`</${tag}>`, re.lastIndex);
      group = stripTags(html.slice(re.lastIndex, close)).replace(/:$/, "") || undefined;
    } else if (tag === "li" && hasClass(attrs, "wprm-recipe-ingredient")) {
      const close = html.indexOf("</li>", re.lastIndex);
      const body = html.slice(re.lastIndex, close);
      const name = spanText(body, "wprm-recipe-ingredient-name");
      if (name) {
        ingredients.push({
          amount: spanText(body, "wprm-recipe-ingredient-amount"),
          unit: spanText(body, "wprm-recipe-ingredient-unit"),
          name,
          notes: spanText(body, "wprm-recipe-ingredient-notes"),
          group,
        });
      }
    }
  }
  if (ingredients.length < 3) return null;

  const steps: string[] = [];
  // Scan opening tags one by one; a lazy <div>…</div> match would swallow the
  // first instruction inside its parent group's div.
  for (const m of html.matchAll(/<div([^>]*)>/g)) {
    if (!hasClass(m[1], "wprm-recipe-instruction-text")) continue;
    const from = m.index! + m[0].length;
    const t = stripTags(html.slice(from, html.indexOf("</div>", from)));
    if (t) steps.push(t);
  }
  const servings = html.match(/wprm-recipe-servings[^>]*>\s*(\d+)/)?.[1];
  const name = html.match(/<h2[^>]*wprm-recipe-name[^>]*>([\s\S]*?)<\/h2>/)?.[1];
  return {
    name: name ? stripTags(name) : undefined,
    servings: servings ? Number(servings) : undefined,
    ingredients,
    steps,
    source: "wprm",
  };
}

const QTY_START = /^\s*(?:[-•*▪️✓·]\s*)?(\d|½|¼|¾|⅓|⅔|⅛|a\s|an\s|one\s|two\s|few\s|pinch|handful|salt|water|oil|ghee)/i;
const METHOD_HEADER = /^(method|instructions?|directions?|preparation( method)?|procedure|process|steps|how to (make|cook|prepare)( it)?|recipe( method)?)\s*[:\-–]?\s*$/i;
const GROUP_HEADER = /^(for\b.{0,40}|garnish(ing)?|to garnish|for garnish|tempering|tadka|seasoning|marinade|marination|to serve|masala paste|gravy|dough|batter)\s*:?\s*$/i;
const FOOTER = /(https?:\/\/|www\.|^[*=_~\-]{4,}|^#|^(follow|subscribe|music|instagram|facebook|website|for business|timestamps?|chapters?)\b|^\d{1,2}:\d{2}\b)/i;

/**
 * Many Indian cooking channels paste the recipe into the video description
 * ("Ingredients: 1 cup rice …  Method: …"). Pull it out when there's no web page.
 */
export function recipeFromDescription(description: string): ScrapedRecipe | null {
  const lines = description.split(/\r?\n/).map((l) => l.trim());
  const start = lines.findIndex((l) => /^[^a-z]{0,6}ingredients?\b/i.test(l) || /\bingredients?\s*[:\-–]/i.test(l));
  if (start < 0) return null;

  const servings = Number(description.slice(0, description.indexOf(lines[start]) + 1).match(/\bserves?\s*:?\s*(\d{1,2})\b/i)?.[1]) || undefined;
  const ingredients: ScrapedIngredient[] = [];
  const steps: string[] = [];
  let group: string | undefined;
  let mode: "ing" | "steps" = "ing";
  // Inline "Ingredients: a, b, c" on one line.
  const inline = lines[start].split(/ingredients?\s*[:\-–]/i)[1]?.trim();
  if (inline) inline.split(/,|;/).forEach((p) => p.trim() && ingredients.push({ name: p.trim() }));

  for (const line of lines.slice(start + 1)) {
    if (!line) continue;
    if (FOOTER.test(line)) {
      if (mode === "steps" && steps.length) break;
      if (ingredients.length && mode === "ing" && /^[*=_~\-]{4,}/.test(line)) break;
      continue;
    }
    if (METHOD_HEADER.test(line)) {
      mode = "steps";
      continue;
    }
    if (mode === "ing") {
      if (GROUP_HEADER.test(line) && !/\d/.test(line)) {
        group = line.replace(/:$/, "").trim();
        continue;
      }
      if (/:$/.test(line) && line.length < 40) {
        group = line.replace(/:$/, "").trim();
        continue;
      }
      if (QTY_START.test(line) || line.length < 45) {
        ingredients.push({ name: line.replace(/^[-•*▪️✓·]\s*/, ""), group });
        continue;
      }
      mode = "steps";
    }
    // Method lines: a new bullet/number starts a step; anything else continues the last one
    // (descriptions wrap long sentences onto the next line).
    const bullet = /^(\d+[.)]|step\s*\d+[:.]?|[-•*▪️➡️👉])\s*/i;
    const text = line.replace(bullet, "").trim();
    if (!text) continue;
    if (bullet.test(line) || !steps.length || /[.!?]$/.test(steps[steps.length - 1])) steps.push(text);
    else steps[steps.length - 1] = `${steps[steps.length - 1]} ${text}`;
  }
  if (ingredients.length < 3) return null;
  return { servings, ingredients, steps: steps.filter((s) => s.length > 8), source: "description" };
}

/** Plain-text block for AI prompts. */
export function scrapedToText(r: ScrapedRecipe): string {
  const ing = r.ingredients.map((i) => `- ${[i.amount, i.unit, i.name].filter(Boolean).join(" ")}${i.notes ? `, ${i.notes}` : ""}${i.group ? ` (${i.group})` : ""}`);
  return [r.name ? `Name: ${r.name}` : "", r.servings ? `Serves: ${r.servings}` : "", `Ingredients:\n${ing.join("\n")}`, r.steps.length ? `Method:\n${r.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
}

/** URLs in a video description worth trying as the written recipe. */
const SKIP_HOSTS = /(youtube|youtu\.be|instagram|facebook|fb\.me|twitter|x\.com|amazon|amzn|flipkart|whatsapp|t\.me|telegram|pinterest|spotify|hooksounds|bit\.ly|linktr\.ee|threads\.net|play\.google|apple\.com|meesho|myntra|wa\.me)/i;

export function recipeLinks(description: string): string[] {
  const urls = description.match(/https?:\/\/[^\s)"'<>]+/g) ?? [];
  return [...new Set(urls.map((u) => u.replace(/[.,]+$/, "")))].filter((u) => !SKIP_HOSTS.test(u)).slice(0, 3);
}
