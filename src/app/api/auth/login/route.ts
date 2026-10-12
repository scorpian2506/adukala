import { assertSameOrigin, authErrorResponse, createSession, currentUser, logIn, readJson, sessionCookie, householdInfo } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJson(req);
    const userId = await logIn({ username: body.username, password: body.password });
    const token = await createSession(userId);
    const cookie = sessionCookie(token, req);
    const user = await currentUser(new Request(req.url, { headers: { cookie: cookie.split(";")[0] } }));
    return Response.json(
      { user: { username: user!.username, displayName: user!.displayName }, household: await householdInfo(user!.householdId) },
      { headers: { "set-cookie": cookie } },
    );
  } catch (e) {
    return authErrorResponse(e);
  }
}
