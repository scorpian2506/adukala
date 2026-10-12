import { searchVideos } from "@/lib/youtube";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { q } = (await req.json().catch(() => ({}))) as { q?: string };
  const dish = q?.trim().slice(0, 120);
  if (!dish) return Response.json({ error: "Type a dish name." }, { status: 400 });
  try {
    return Response.json({ results: await searchVideos(dish) });
  } catch {
    return Response.json({ error: "YouTube search isn't responding. Paste a video link instead." }, { status: 502 });
  }
}
