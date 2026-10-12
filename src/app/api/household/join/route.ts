import { assertSameOrigin, authErrorResponse, householdInfo, joinHousehold, readJson, requireUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const { code } = await readJson(req);
    const householdId = await joinHousehold(user, code);
    return Response.json({ household: await householdInfo(householdId) });
  } catch (e) {
    return authErrorResponse(e);
  }
}
