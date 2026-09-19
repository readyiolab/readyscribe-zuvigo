import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { getPageForUser, updatePageMeta } from "@zuvigo/core";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(5000).nullable().optional(),
});

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const page = await getPageForUser(session.user.id, id);
    return jsonOk(page);
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
    const body = parseBody(patchSchema, await req.json());
    const result = await updatePageMeta(session.user.id, id, body);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
