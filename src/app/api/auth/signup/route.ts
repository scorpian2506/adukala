import { assertSameOrigin, authErrorResponse, createSession, householdInfo, readJson, sessionCookie, signUp } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJson(req);
    const user = await signUp({ username: body.username, password: body.password, displayName: body.displayName, inviteCode: body.inviteCode });
    const token = await createSession(user.id);
    return Response.json(
      { user: { username: user.username, displayName: user.displayName }, household: await householdInfo(user.householdId) },
      { status: 201, headers: { "set-cookie": sessionCookie(token, req) } },
    );
  } catch (e) {
    return authErrorResponse(e);
  }
}
