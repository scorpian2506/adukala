# Adukala

Measured Indian cooking, one step at a time. Adukala is a mobile-first web app that walks someone with zero cooking experience through North and South Indian dishes.

- Every quantity is in g, ml, tsp, tbsp or cup.
- Each screen shows one action.
- Timers, a pressure-cooker whistle counter, and a big **Next** button.

**Live:** https://adukala-nine.vercel.app · **License:** MIT

## Works without AI

The core app needs no AI and no API key.

1. **Library.** 216 validated recipes: Tamil and Kerala home cooking, North Indian curries and breads, biryanis, Indo-Chinese and kids' meals. Add a file to `src/data/recipes/` and run `npm run gen:recipes`.
   - **Search** forgives spelling (biriyani/biryani, kulambu/kuzhambu, meen = fish) and filters by cuisine, kids, veg, sweets, under 30 minutes.
   - **Star** favourites and **pin** weekly dishes to the top of Home.
2. **YouTube converter (free, rule-based).** Paste a recipe video link. Adukala finds the cook's own written recipe, then converts it into measured, timed steps with deterministic rules (`src/lib/convert.ts`). The recipe comes from either:
   - the cook's website, linked in the video description (WP Recipe Maker markup or schema.org JSON-LD);
   - the ingredient list pasted into the description.
3. **Dish search.** Type a dish name. Adukala checks the library first, then searches YouTube and ranks channels that publish measured recipes first.
4. **Rule-based tweaks** (`src/lib/tweaks.ts`). Change servings, or make a recipe low oil, high protein, low carb, less spicy or kid friendly, without AI.
   - **Low oil** halves oil and ghee. Deep-frying oil and the ghee in sweets stay, with a note.
   - **High protein** uses 1.5× the dal, paneer, egg or meat.
   - **Low carb** uses 0.6× the rice, flour or potato and half the sugar, and adds vegetables (or lean protein) back so the pot still feeds everyone.
   - Water cooked with the rice or dal moves with it. Salt follows the amount of food. Step items always add up to the ingredient totals.
   - Batters, doughs, sweets and plain rice keep their ratios. The app says why and suggests a smaller portion instead.
   - Versions have stable ids like `sambar--low_oil-high_protein` and are re-derived from the base recipe, never stored.
   - Each signed-in person can set **usual tweaks** (suggested from their goal). They're pre-ticked on every recipe and in the planner, and can be unticked.
   - Jain, vegan and diabetic friendly still need AI.
5. **Ingredient swaps** (`src/lib/swaps.ts`, also without AI). Tap **Swap** next to any ingredient:
   - **Leave it out:** it's removed from every step, and the step text is tidied. Fat that something is fried in can't simply go (the app offers oil instead). A main ingredient comes with a warning.
   - **Use an alternative**, same amount: oil for ghee or butter, ghee for butter, any oil for coconut oil, jaggery and sugar either way, milk for cream.
   - **Ginger & garlic:** ready ginger garlic paste instead of fresh (about 5 g per tsp, offered in 35 recipes where both always go in together; the chopping steps become one measure), or fresh instead of paste (we add the grate and crush steps).
   - Each person can set kitchen preferences in their profile, e.g. "Ghee: oil instead" and "Ginger & garlic: ready paste". These apply to every recipe and every planned dish. Ghee drizzled on top is left out; sweets keep their ghee.
   - Swaps are part of the version id (`aloo-matar--low_oil~ggp~oil_ghee`), so cooking, the plan and the shopping list all use the swapped recipe.

When a video has no written recipe, Adukala says so and offers videos from cooks who do publish one. It never invents amounts from a title. Any amount it has to estimate ("a few curry leaves", "salt to taste") is marked **est.** and listed in a warning.

## Meal planner, family and shopping

- **Family:** everyone you cook for, including kids without a login. Each person has age, sex, height, weight, activity, goal (lose, maintain, gain, build muscle) and diet.
- **Daily targets:** worked out per person (`src/lib/family.ts`).
  - Adults need height and weight, and get a calculator table: calories to stay the same, lose ¼, ½ or 1 kg a week, gain, or build muscle (7,700 kcal per kg). Safe floors are 1,200 kcal for women and 1,500 for men. BMI uses Asian-Indian cut-offs.
  - Children use ICMR-NIN age guidance for calories and protein. Children don't diet: their goals are **Growing normally**, **Keep weight steady** (about 10% less, so they grow into their weight) or **Catch up** (about 10% more). Protein is never cut, and children under 2 always get the full amount. A child's BMI is shown as a number only, because it has to be read on an age chart.
  - Everyone gets a protein minimum plus carb and fat ranges (45–65% of calories from carbs; 20–35% from fat for adults, 25–35% for children).
- **Protein, carb and fat checks (rules, no AI):** once at least 70% of a person's day is planned, the plan flags low protein, high or low carbs and high fat (and low fat for children only, since adults may be cutting oil on purpose). Each flag comes with a plain fix suited to the person's diet, e.g. "add dal, paneer, curd or sprouts". Before that, the plan just says to plan more of the day, so a half-planned day never raises a false alarm.
- **One pot, different plates:** you can't cook for one person, so each dish is cooked once for the family. "Fit to goals" sizes each person's portions so their day adds up to their target (25% breakfast, 35% lunch, 10% snack, 30% dinner; quarter servings). Each dish shows how many servings to cook and how much to serve each person. The tweaks apply to the whole dish.
- **Plan:** Mon–Sun, four meals a day, built from the recipe library with starred dishes first. Each dish has a portion per person. It shows calories and protein per person for each day and the whole week.
- **Calories:** worked out from each recipe's measured ingredients (`src/lib/nutrition.ts` with IFCT/USDA data in `nutrition-data.ts`). Only about 12% of deep-frying oil is counted, since most isn't eaten. These are estimates.
- **Shopping list:** for the whole week, one day, or one meal (every meal on the plan has a **Shop** link). It covers only the dishes planned in that scope that someone is eating, at the same servings as each dish's "cook N", using the tweaked version when there is one. Nothing else is added. Items are merged across recipes and grouped by aisle. Water is left out and salt is hidden. Each list keeps its own ticks, which sync, and it can be shared or copied.
- **Sync:** family members (children included), the plan (one item per planned dish, so two people adding to the same meal both keep their dishes) and shopping ticks sync with the household. Changes go up within about a second. An open app pulls everyone else's changes every 10 seconds, and again when you come back to it. The plan and family pages say who they're shared with and when they last synced, or show the error with a Retry button. A phone that opens before its first sync never resets anyone's profile.

## Accounts and households

Username + password (no email). Sign-in keeps your stars, pins and saved recipes on every phone. Share a household code so your family sees the same list.

- **Passwords:** scrypt hashes.
- **Sessions:** httpOnly SameSite cookies.
- **Login protection:** lockout after 8 failed tries, and requests from other sites are rejected.
- **Sync:** two-way, and the newest change per item wins (`src/lib/sync-merge.ts`).
- **Database:** Postgres. Production uses Neon via `DATABASE_URL`. Local dev and tests use PGlite, Postgres in WebAssembly, so `npm test` needs no setup.

## Optional AI (free options available)

Choose a provider in **Settings**. The key is stored in your browser and sent per request, and never saved on the server. Base URLs are fixed presets (`src/lib/providers.ts`).

| Provider | Cost | Notes |
| --- | --- | --- |
| Google Gemini | Free key | Can watch the YouTube video itself when there's no written recipe |
| Groq | Free key | Open-source `gpt-oss-120b` / Llama |
| OpenRouter | Free key | Rotating `:free` open models; model name is editable |
| OpenAI | Paid | Responses API with web search |
| Ollama | Free, local | Only when you run Adukala on your own machine |

AI adds three things:
- a chat interview before the recipe is written;
- recipes for videos that have no written recipe. With Gemini:
  1. Gemini watches the video and writes down what the cook says and shows (in effect, a transcript).
  2. It searches the web for published recipes of the same dish and picks the closest match, cross-checking the measurements.
  3. The result is saved to the household's recipes. If the dish is already in the library, you can **replace** the library version (stars, pins and plans carry over, and the original can be restored) or keep both.
- AI-only customisations: Jain, vegan, diabetic friendly.

Do **not** set `OPENAI_API_KEY` on a public deployment. The server falls back to it, and anyone could spend it.

## YouTube from servers

From datacenter IPs such as Vercel's, YouTube blocks its watch page and player API with a bot check. `src/lib/youtube.ts` works around this:

- **Descriptions:** read from the innertube `next` endpoint.
- **Search:** uses the innertube `search` endpoint.
- **Captions:** only load from residential IPs, so they're skipped on Vercel.

## Tests

```bash
npm test            # 428 unit tests (Vitest): recipes, search, converter, accounts and sync against real Postgres
npm run test:e2e    # 55 browser tests (Playwright, iPhone viewport, production build, stubbed APIs)
npm run test:live   # opt-in: real YouTube calls (E2E_BASE_URL=https://… to hit a deployment)
npm run test:batch  # real dishes → real videos → converter → quality rules (BASE=https://…)
npm run validate    # quality rules for the recipe library
npm run check       # types + lint + unit tests + validator
```

Each converted recipe in the tests must pass the same quality rules as the hand-written library (`src/lib/validate.ts`). Any E2E test that logs a console error fails.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000, or open the Network URL on your phone
vercel deploy --prod
```
