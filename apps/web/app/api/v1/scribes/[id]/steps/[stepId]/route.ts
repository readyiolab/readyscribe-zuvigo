import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import {
  updateScribeStep,
  deleteScribeStep,
  duplicateScribeStep,
} from "@zuvigo/core";
import { updateScribeStepSchema } from "@zuvigo/types";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id, stepId } = await ctx.params;
    const body = parseBody(updateScribeStepSchema, await req.json());
    const result = await updateScribeStep(session.user.id, id, stepId, body);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id, stepId } = await ctx.params;
    await deleteScribeStep(session.user.id, id, stepId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id, stepId } = await ctx.params;
    const raw = await req.json().catch(() => ({}));
    if (raw?.action === "duplicate") {
      await duplicateScribeStep(session.user.id, id, stepId);
      return jsonOk({ ok: true });
    }
    return jsonOk({ error: { code: "VALIDATION_ERROR", message: "Unknown action" } }, { status: 400 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
