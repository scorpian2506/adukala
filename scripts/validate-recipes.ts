/* Validates the built-in recipe library.
 *
 *   npx -y tsx scripts/validate-recipes.ts             # validate SEED_RECIPES
 *   npx -y tsx scripts/validate-recipes.ts a.ts b.ts   # validate recipes exported by given files
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { Recipe } from "../src/lib/types";
import { isRecipe, validateRecipe } from "../src/lib/validate";

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
    const issues = validateRecipe(r, { seed: true });
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
