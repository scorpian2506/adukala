import { clientFrom, errorResponse } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const { client, model } = clientFrom(req);
    await client.models.retrieve(model);
    return Response.json({ ok: true, model });
  } catch (e) {
    return errorResponse(e);
  }
}
