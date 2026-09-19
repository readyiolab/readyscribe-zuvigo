import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import {
  getCaptureSession,
  updateCaptureSession,
} from "@zuvigo/core";
import { updateCaptureSchema } from "@zuvigo/types";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const capture = await getCaptureSession(session.user.id, id);
    return jsonOk(capture);
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
    const body = parseBody(updateCaptureSchema, await req.json());
    const capture = await updateCaptureSession(session.user.id, id, body);
    return jsonOk(capture);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
