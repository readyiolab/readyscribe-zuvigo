import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { listComments, createComment, countCommentsByStep } from "@zuvigo/core";
import { createCommentSchema } from "@zuvigo/types";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id: documentId } = await ctx.params;
    const stepId = new URL(req.url).searchParams.get("stepId");
    const countsOnly = new URL(req.url).searchParams.get("counts") === "1";

    if (countsOnly) {
      const counts = await countCommentsByStep(session.user.id, documentId);
      return jsonOk({ counts });
    }

    const comments = await listComments(session.user.id, documentId, {
      stepId: stepId || undefined,
    });
    return jsonOk({ comments });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id: documentId } = await ctx.params;
    const body = parseBody(createCommentSchema, await req.json());
    const comment = await createComment(session.user.id, documentId, body);
    return jsonOk(comment, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
