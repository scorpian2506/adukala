import { assertSameOrigin, authErrorResponse, clearCookie, endSession } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await endSession(req);
    return Response.json({ ok: true }, { headers: { "set-cookie": clearCookie(req) } });
  } catch (e) {
    return authErrorResponse(e);
  }
}
