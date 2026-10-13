import { clientFrom, errorResponse, listModels } from "@/lib/ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const ai = clientFrom(req);
    const models = await listModels(ai);
    return Response.json({ models, current: ai.model, available: models.includes(ai.model) });
  } catch (e) {
    return errorResponse(e);
  }
}
