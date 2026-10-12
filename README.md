# Adukala

Measured Indian cooking, one step at a time. Adukala is a mobile-first web app that walks someone with zero cooking experience through North and South Indian dishes.

- Every quantity is in g, ml, tsp, tbsp or cup.
- Each screen shows one action.
- Timers, a pressure-cooker whistle counter, and a big **Next** button.

**Live:** https://adukala-nine.vercel.app · **License:** MIT

## Works without AI

The core app needs no AI and no API key.

1. **Library.** 14 hand-written, validated recipes: dal tadka, sambar, rajma, chole, upma, pongal and more.
2. **YouTube converter (free, rule-based).** Paste a recipe video link. Adukala finds the cook's own written recipe, then converts it into measured, timed steps with deterministic rules (`src/lib/convert.ts`). The recipe comes from either:
   - the cook's website, linked in the video description (WP Recipe Maker markup or schema.org JSON-LD);
   - the ingredient list pasted into the description.
3. **Dish search.** Type a dish name. Adukala checks the library first, then searches YouTube and ranks channels that publish measured recipes first.
4. **Offline tweaks.** Change servings, or make a recipe low oil, less spicy or kid friendly, without AI.

When a video has no written recipe, Adukala says so and offers videos from cooks who do publish one. It never invents amounts from a title. Any amount it has to estimate ("a few curry leaves", "salt to taste") is marked **est.** and listed in a warning.

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
npm test            # 107 unit tests (Vitest): quantities, scaling, scraping, converter, AI output cleanup
npm run test:e2e    # 25 browser tests (Playwright, iPhone viewport, production build, stubbed APIs)
npm run test:live   # opt-in: real YouTube calls (E2E_BASE_URL=https://… to hit a deployment)
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
