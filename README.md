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
4. **Offline tweaks.** Change servings, or make a recipe low oil, less spicy or kid friendly, without AI.

When a video has no written recipe, Adukala says so and offers videos from cooks who do publish one. It never invents amounts from a title. Any amount it has to estimate ("a few curry leaves", "salt to taste") is marked **est.** and listed in a warning.

## Meal planner, family and shopping

- **Family:** everyone you cook for, including kids without a login. Each person has age, sex, height, weight, activity, goal (lose, maintain, gain, build muscle) and diet.
- **Daily targets:** worked out per person (`src/lib/family.ts`). Adults use Mifflin–St Jeor, with safe floors for weight loss. Children use ICMR-NIN age guidance.
- **Plan:** Mon–Sun, four meals a day, built from the recipe library with starred dishes first. Each dish has a portion per person. It shows calories and protein per person for each day and the whole week.
- **Calories:** worked out from each recipe's measured ingredients (`src/lib/nutrition.ts` with IFCT/USDA data in `nutrition-data.ts`). Only about 12% of deep-frying oil is counted, since most isn't eaten. These are estimates.
- **Shopping list:** built from the week's plan and scaled to the portions. Items are merged across recipes and grouped by aisle. Ticks sync, and the list can be shared or copied.
- **Sync:** family members, plan slots (one item per meal slot) and shopping ticks sync with the household.

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
- recipes for videos that have no written recipe;
- AI-only customisations: high protein, low carb, Jain, vegan, diabetic friendly.

Do **not** set `OPENAI_API_KEY` on a public deployment. The server falls back to it, and anyone could spend it.

## YouTube from servers

From datacenter IPs such as Vercel's, YouTube blocks its watch page and player API with a bot check. `src/lib/youtube.ts` works around this:

- **Descriptions:** read from the innertube `next` endpoint.
- **Search:** uses the innertube `search` endpoint.
- **Captions:** only load from residential IPs, so they're skipped on Vercel.

## Tests

```bash
npm test            # 391 unit tests (Vitest): recipes, search, converter, accounts and sync against real Postgres
npm run test:e2e    # 47 browser tests (Playwright, iPhone viewport, production build, stubbed APIs)
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
