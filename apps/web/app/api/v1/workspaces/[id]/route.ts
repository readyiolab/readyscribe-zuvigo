import { requireSession, jsonOk, handleApiError, getRequestId } from "@/lib/api";
import { getWorkspaceForUser } from "@zuvigo/core";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const workspace = await getWorkspaceForUser(session.user.id, id);
    return jsonOk(workspace);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
