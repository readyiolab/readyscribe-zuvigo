import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { getScribeForUser, updateScribe } from "@zuvigo/core";
import { updateScribeSchema } from "@zuvigo/types";
import { getStorage } from "@/lib/infra";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const scribe = await getScribeForUser(session.user.id, id, getStorage());
    return jsonOk({
      id: scribe.id,
      documentId: scribe.documentId,
      title: scribe.title,
      summary: scribe.summary,
      status: scribe.status,
      steps: scribe.steps,
    });
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
    const body = parseBody(updateScribeSchema, await req.json());
    const result = await updateScribe(session.user.id, id, body);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
