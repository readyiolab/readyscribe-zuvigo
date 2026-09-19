import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { addPageBlock } from "@zuvigo/core";
import { addPageBlockSchema } from "@zuvigo/types";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const body = parseBody(addPageBlockSchema, await req.json());
    const block = await addPageBlock(session.user.id, id, {
      ...body,
      data: body.data ?? {},
    });
    return jsonOk(block, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
