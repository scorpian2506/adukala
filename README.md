# Adukala

Measured Indian cooking, one step at a time. A mobile-first web app that walks someone with zero cooking experience through North and South Indian dishes: every quantity in g / ml / tsp / tbsp / cup, one action per screen, timers, whistle counting, and a Next button.

Live: https://adukala-nine.vercel.app

## What's in it

- **Library**: 14 hand-written recipes (`src/data/recipes/`), checked by `npx tsx scripts/validate-recipes.ts`.
- **Cook mode** (`src/components/CookMode.tsx`):
  - Prep and cook phases, with tap-to-start timers.
  - Timers keep running in the background when you move on.
  - Pressure-cooker whistle counter.
  - Servings scaling.
  - Read-aloud and "next" voice commands.
  - Screen kept awake, and progress saved in the browser.
- **Recipe studio** (`/create`): paste a YouTube link or name a dish. The AI asks up to 3 questions, then writes a recipe in the same structure.
- **Make it yours**: low oil, high protein, low carb, kid friendly, less spicy, Jain, vegan, diabetic friendly.
  - Low oil, less spicy and kid friendly work offline.
  - The rest need AI.
- **Step animations**: SVG and CSS, one scene per step type (`src/components/StepArt.tsx`).

## AI

- Each user adds their own OpenAI key in **Settings**. It's stored in their browser and sent with each request. It's never stored on the server.
- The default model is `gpt-5.5`, and you can change it in Settings.
- **Do not set `OPENAI_API_KEY` on Vercel.** The server falls back to it, and on a public URL anyone could use it.

## YouTube extraction

`src/lib/youtube.ts` combines several sources:

- Title and description, from the watch page, or from the `next` endpoint when YouTube shows a bot check.
- Captions, which only work from residential IPs; YouTube blocks them from Vercel.
- The creator's written recipe page, linked from the description. It's read from JSON-LD or WP Recipe Maker markup.

When captions are missing, the recipe writer uses web search on the video title.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000, or open the Network URL on your phone
npm run build
vercel deploy --prod
```
