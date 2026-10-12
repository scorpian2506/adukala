// Opt-in smoke test against the real network: `npm run test:live`
// (optionally E2E_BASE_URL=https://adukala-nine.vercel.app npm run test:live)
import { test, expect } from "@playwright/test";

test("YouTube link → creator's written recipe", async ({ request }) => {
  const res = await request.post("/api/youtube", { data: { url: "https://youtu.be/3duuGV-D3Wo" }, timeout: 60_000 });
  expect(res.ok()).toBe(true);
  const { video } = await res.json();
  expect(video.title).toMatch(/sambar/i);
  expect(video.description.length).toBeGreaterThan(100);
  expect(video.recipe?.ingredients.length).toBeGreaterThan(10);
});

test("dish name → recipe videos", async ({ request }) => {
  const res = await request.post("/api/search", { data: { q: "rava upma" }, timeout: 30_000 });
  expect(res.ok()).toBe(true);
  const { results } = await res.json();
  expect(results.length).toBeGreaterThan(2);
});
