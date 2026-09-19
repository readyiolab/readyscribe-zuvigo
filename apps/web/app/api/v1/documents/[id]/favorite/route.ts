import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
} from "@/lib/api";
import { toggleDocumentFavorite } from "@zuvigo/core";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const result = await toggleDocumentFavorite(session.user.id, id);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
