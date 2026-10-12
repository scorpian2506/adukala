import { fetchVideo } from "@/lib/youtube";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return Response.json({ error: "Paste a YouTube link." }, { status: 400 });
  try {
    const video = await fetchVideo(url);
    return Response.json({ video });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read that video." }, { status: 422 });
  }
}
