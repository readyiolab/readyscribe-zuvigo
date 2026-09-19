import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
} from "@/lib/api";
import { softDeleteDocument, moveDocument, getDocumentForUser } from "@zuvigo/core";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const { doc } = await getDocumentForUser(session.user.id, id);
    return jsonOk(doc);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    await softDeleteDocument(session.user.id, id);
    return jsonOk({ success: true });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    if (body.targetWorkspaceId || body.workspaceId) {
      const targetWorkspaceId = body.targetWorkspaceId || body.workspaceId;
      const updated = await moveDocument(session.user.id, id, targetWorkspaceId);
      return jsonOk(updated);
    }
    return jsonOk({ success: true });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
