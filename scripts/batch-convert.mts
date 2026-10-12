/* Quality harness: search real dishes, fetch real videos, convert without AI, check the rules.
 *
 *   npx tsx scripts/batch-convert.mts                       # against http://localhost:3000
 *   BASE=https://adukala-nine.vercel.app npx tsx scripts/batch-convert.mts
 */
import { convertRecipe, conversionQuality } from "../src/lib/convert";
import { validateRecipe } from "../src/lib/validate";

const BASE = process.env.BASE ?? "http://localhost:3000";
const dishes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["aloo paratha", "chana masala", "poha", "matar paneer", "vegetable biryani", "medu vada", "coconut chutney", "khichdi", "malai kofta", "masala dosa", "gajar halwa", "tomato rice"];

const post = async (p: string, b: object) => (await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();

const tally = { converted: 0, rejected: 0, noRecipe: 0, invalid: 0, crashed: 0 };
for (const dish of dishes) {
  const { results = [] } = await post("/api/search", { q: dish });
  for (const r of results.slice(0, 2)) {
    const { video } = await post("/api/youtube", { url: `https://youtu.be/${r.id}` });
    const label = `${dish.padEnd(18)} ${(video?.channel ?? r.channel).slice(0, 22).padEnd(22)}`;
    if (!video?.recipe) {
      tally.noRecipe++;
      console.log(label, "no written recipe");
      continue;
    }
    try {
      const rec = convertRecipe(video.recipe, { title: video.title, channel: video.channel, url: video.url });
      const q = conversionQuality(video.recipe, rec);
      const errs = validateRecipe(rec).filter((i) => i.level === "error").map((i) => i.msg);
      if (!q.ok) tally.rejected++;
      else if (errs.length) tally.invalid++;
      else tally.converted++;
      console.log(label, video.recipe.source.padEnd(11), `${rec.prep.length + rec.cook.length} steps`.padEnd(9), q.ok ? (errs.length ? `INVALID: ${errs.slice(0, 2).join(" | ")}` : "ok") : `rejected: ${q.reason}`);
    } catch (e) {
      tally.crashed++;
      console.log(label, "CRASHED", e);
    }
  }
}
console.log("\n", tally);
process.exit(tally.invalid || tally.crashed ? 1 : 0);
