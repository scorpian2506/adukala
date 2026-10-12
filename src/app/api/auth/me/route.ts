import { authErrorResponse, currentUser, householdInfo } from "@/lib/auth";

export async function GET(req: Request) {
  // Reading the request marks this route dynamic. Do it outside the try so Next's
  // "can't prerender" signal isn't swallowed by our error handling.
  void req.headers.get("cookie");
  try {
    const user = await currentUser(req);
    if (!user) return Response.json({ user: null }, { headers: { "cache-control": "no-store" } });
    return Response.json(
      { user: { username: user.username, displayName: user.displayName }, household: await householdInfo(user.householdId) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return authErrorResponse(e);
  }
}
