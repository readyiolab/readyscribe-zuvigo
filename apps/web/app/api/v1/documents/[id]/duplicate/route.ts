import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
} from "@/lib/api";
import { duplicateDocument } from "@zuvigo/core";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const duplicated = await duplicateDocument(session.user.id, id);
    return jsonOk(duplicated);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
