import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
} from "@/lib/api";
import { revokeShareLink } from "@zuvigo/core";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const result = await revokeShareLink(session.user.id, id);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
