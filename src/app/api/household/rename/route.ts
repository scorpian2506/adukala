import { assertSameOrigin, authErrorResponse, householdInfo, readJson, renameHousehold, requireUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const { name } = await readJson(req);
    await renameHousehold(user, name);
    return Response.json({ household: await householdInfo(user.householdId) });
  } catch (e) {
    return authErrorResponse(e);
  }
}
