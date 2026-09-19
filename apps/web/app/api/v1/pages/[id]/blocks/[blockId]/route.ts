import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { updatePageBlock, deletePageBlock } from "@zuvigo/core";
import { updatePageBlockSchema } from "@zuvigo/types";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; blockId: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id, blockId } = await ctx.params;
    const body = parseBody(updatePageBlockSchema, await req.json());
    const block = await updatePageBlock(session.user.id, id, blockId, body);
    return jsonOk(block);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; blockId: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id, blockId } = await ctx.params;
    const result = await deletePageBlock(session.user.id, id, blockId);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
