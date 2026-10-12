import { clientFrom, errorResponse, ping } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const ai = clientFrom(req);
    await ping(ai);
    return Response.json({ ok: true, model: ai.model, provider: ai.provider.name });
  } catch (e) {
    return errorResponse(e);
  }
}
