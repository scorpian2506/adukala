/* Validates the built-in recipe library.
 *
 *   npx -y tsx scripts/validate-recipes.ts             # validate SEED_RECIPES
 *   npx -y tsx scripts/validate-recipes.ts a.ts b.ts   # validate recipes exported by given files
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { Recipe, Step, Unit } from "../src/lib/types";

const TOL = 0.01;
const COUNTED_KINDS = new Set(["add", "grind"]);
const TIMED_KINDS = new Set(["stir", "wait", "soak", "release", "pressure"]);
const FLAME_ONLY_KINDS = new Set(["heat", "flame", "stir", "wait", "pressure", "lid_close", "lid_open", "release"]);
const TRANSFER_TITLE = /^(pour|transfer|return|tip|spoon)\b/i;
const RELEASE_DETAIL = "Wait until all the pressure is gone; don't force the whistle.";
const BANNED = [/to taste/i, /pinch/i];

type Issue = { level: "error" | "warn"; msg: string };

function isRecipe(x: unknown): x is Recipe {
  return !!x && typeof x === "object" && "id" in x && "ingredients" in x && "cook" in x;
}

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function walkStrings(obj: unknown, path: string, out: [string, string][]) {
  if (typeof obj === "string") out.push([path, obj]);
  else if (Array.isArray(obj)) obj.forEach((v, i) => walkStrings(v, `${path}[${i}]`, out));
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) walkStrings(v, path ? `${path}.${k}` : k, out);
}

function validateRecipe(r: Recipe): Issue[] {
  const issues: Issue[] = [];
  const err = (msg: string) => issues.push({ level: "error", msg });
  const warn = (msg: string) => issues.push({ level: "warn", msg });

  // ingredients
  const ingById = new Map<string, { qty: number; unit: Unit }>();
  for (const ing of r.ingredients) {
    if (ingById.has(ing.id)) err(`duplicate ingredient id "${ing.id}"`);
    ingById.set(ing.id, { qty: ing.qty, unit: ing.unit });
    if (!(ing.qty > 0)) err(`ingredient "${ing.id}" qty must be > 0`);
  }

  // recipe-level metadata
  if (!r.blurb) err("missing blurb");
  if (!r.native) warn("missing native name");
  if (!r.serveWith) warn("missing serveWith");
  if (r.source?.kind !== "seed") err("source.kind must be 'seed'");
  if (!(r.servings > 0)) err("servings must be > 0");
  if (r.prep.length < 6 || r.prep.length > 14) warn(`prep has ${r.prep.length} steps (expected 6–14)`);
  if (r.cook.length < 15 || r.cook.length > 30) warn(`cook has ${r.cook.length} steps (expected 15–30)`);

  const equipment = new Set(r.equipment);
  const sums = new Map<string, number>();

  const checkStep = (s: Step, where: string) => {
    const words = wordCount(s.title);
    if (words > 7) err(`${where} title has ${words} words: "${s.title}"`);
    if (s.detail && s.detail.length > 140) err(`${where} detail is ${s.detail.length} chars: "${s.detail}"`);
    if (s.equipment && !equipment.has(s.equipment)) err(`${where} uses equipment "${s.equipment}" not in recipe.equipment`);
    if (s.kind === "pressure" && !(s.whistles && s.whistles > 0)) err(`${where} pressure step without whistles`);
    if (TIMED_KINDS.has(s.kind) && !(s.durationSec && s.durationSec > 0)) err(`${where} ${s.kind} step without durationSec`);
    // An add step must list items, unless it transfers something already cooked (e.g. "Pour the tadka over the dal").
    if (s.kind === "add" && !s.items?.length && !TRANSFER_TITLE.test(s.title)) err(`${where} add step without items`);
    if (s.kind === "measure" && !s.items?.length) err(`${where} measure step without items`);
    if (FLAME_ONLY_KINDS.has(s.kind) && s.items?.length) err(`${where} ${s.kind} step should not carry items`);
    if (s.kind === "flame" && !s.flame) err(`${where} flame step without flame level`);

    for (const it of s.items ?? []) {
      const ing = ingById.get(it.ingredient);
      if (!ing) {
        err(`${where} references unknown ingredient "${it.ingredient}"`);
        continue;
      }
      if (it.unit !== ing.unit) err(`${where} item "${it.ingredient}" unit ${it.unit} ≠ ingredient unit ${ing.unit}`);
      if (!(it.qty > 0)) err(`${where} item "${it.ingredient}" qty must be > 0`);
      if (COUNTED_KINDS.has(s.kind)) sums.set(it.ingredient, (sums.get(it.ingredient) ?? 0) + it.qty);
    }
  };

  r.prep.forEach((s, i) => {
    const where = `prep[${i}]`;
    if (["heat", "flame", "pressure", "lid_close", "lid_open", "release"].includes(s.kind))
      err(`${where} "${s.kind}" step belongs in cook, not prep`);
    if (s.flame && s.flame !== "off") err(`${where} prep step has a flame`);
    checkStep(s, where);
  });
  r.cook.forEach((s, i) => checkStep(s, `cook[${i}]`));

  // totals
  for (const ing of r.ingredients) {
    const total = sums.get(ing.id) ?? 0;
    if (Math.abs(total - ing.qty) > TOL)
      err(`ingredient "${ing.id}" total ${ing.qty} ${ing.unit} but add/grind steps sum to ${+total.toFixed(3)}`);
  }

  // last cook step is serve
  if (r.cook[r.cook.length - 1]?.kind !== "serve") err("last cook step must be 'serve'");

  // pressure sequence: lid_close → pressure → flame off → release → lid_open
  r.cook.forEach((s, i) => {
    if (s.kind !== "pressure") return;
    const prev = r.cook[i - 1];
    const n1 = r.cook[i + 1];
    const n2 = r.cook[i + 2];
    const n3 = r.cook[i + 3];
    if (prev?.kind !== "lid_close") err(`cook[${i}] pressure not preceded by lid_close`);
    if (!(n1?.kind === "flame" && n1.flame === "off")) err(`cook[${i}] pressure not followed by flame off`);
    if (n2?.kind !== "release") err(`cook[${i}] pressure sequence missing release`);
    if (n3?.kind !== "lid_open") err(`cook[${i}] pressure sequence missing lid_open`);
  });

  // flame must be off before serving
  {
    let flame: string = "off";
    for (const [i, s] of r.cook.entries()) {
      if (s.kind === "serve") {
        if (flame !== "off") err(`cook[${i}] serve while flame is still "${flame}" (add a flame-off step)`);
        break;
      }
      if (s.flame) flame = s.flame;
    }
  }

  // pressure-cooker wording and equipment
  const usesPressure = r.cook.some((s) => s.kind === "pressure");
  if (usesPressure && !equipment.has("pressure_cooker")) err("pressure step but pressure_cooker not in equipment");
  r.cook.forEach((s, i) => {
    if (s.kind === "pressure" && !s.flame) err(`cook[${i}] pressure step without flame`);
    if (s.kind === "release" && s.detail !== RELEASE_DETAIL) err(`cook[${i}] release detail must be "${RELEASE_DETAIL}"`);
    if (s.kind === "lid_close" && s.equipment === "pressure_cooker" && !/whistle|weight/i.test(s.detail ?? ""))
      err(`cook[${i}] lid_close detail should mention the whistle/weight`);
  });
  [...r.prep, ...r.cook].forEach((s, i) => {
    if (s.kind === "grind" && s.equipment !== "mixer") err(`step ${i} "${s.title}" grind step must use equipment mixer`);
  });

  // every ingredient except water is portioned out during prep
  const inPrep = new Set(r.prep.flatMap((s) => (s.items ?? []).map((it) => it.ingredient)));
  for (const ing of r.ingredients)
    if (ing.id !== "water" && !inPrep.has(ing.id)) err(`ingredient "${ing.id}" never appears in a prep step`);

  // ingredient tags
  for (const ing of r.ingredients) {
    const name = `${ing.id} ${ing.name}`.toLowerCase();
    const want = /\b(oil|ghee|butter)\b/.test(name)
      ? "oil"
      : /\bsalt\b/.test(name)
        ? "salt"
        : /chilli/.test(name)
          ? "chilli"
          : /\b(sugar|jaggery)\b/.test(name)
            ? "sugar"
            : undefined;
    if (want && ing.tag !== want) err(`ingredient "${ing.id}" should have tag "${want}" (has ${ing.tag ?? "none"})`);
  }

  // soak wording
  r.prep.forEach((s, i) => {
    if (s.kind === "soak" && (s.durationSec ?? 0) >= 28800 && !/next day/i.test(s.detail ?? ""))
      err(`prep[${i}] overnight soak detail should say the rest can be done the next day`);
  });

  // one sentence per detail
  [...r.prep, ...r.cook].forEach((s) => {
    if (s.detail && /[.!?]\s+[A-Z]/.test(s.detail)) warn(`detail has more than one sentence: "${s.detail}"`);
  });

  // banned phrases anywhere
  const strings: [string, string][] = [];
  walkStrings(r, "", strings);
  for (const [p, s] of strings) for (const re of BANNED) if (re.test(s)) err(`banned phrase ${re} at ${p}: "${s}"`);

  return issues;
}

async function loadRecipes(): Promise<Recipe[]> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const mod = await import("../src/data/recipes/index");
    return mod.SEED_RECIPES;
  }
  const out: Recipe[] = [];
  for (const p of args) {
    const mod = await import(pathToFileURL(resolve(p)).href);
    for (const v of Object.values(mod)) if (isRecipe(v)) out.push(v);
  }
  return out;
}

async function main() {
  const recipes = await loadRecipes();
  let errors = 0;
  let warns = 0;

  const ids = new Set<string>();
  for (const r of recipes) {
    if (ids.has(r.id)) {
      console.log(`✗ duplicate recipe id "${r.id}"`);
      errors++;
    }
    ids.add(r.id);
  }

  const rows: string[] = [];
  for (const r of recipes) {
    const issues = validateRecipe(r);
    for (const i of issues) {
      console.log(`${i.level === "error" ? "✗" : "!"} ${r.id}: ${i.msg}`);
      if (i.level === "error") errors++;
      else warns++;
    }
    rows.push(
      `${r.id.padEnd(22)} ${String(r.servings).padStart(8)} ${String(r.prep.length).padStart(5)} ${String(r.cook.length).padStart(5)} ${String(r.ingredients.length).padStart(5)}`,
    );
  }

  console.log("\nid                     servings  prep  cook  ingr");
  for (const row of rows) console.log(row);
  console.log(`\n${recipes.length} recipes, ${errors} errors, ${warns} warnings`);
  process.exit(errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
