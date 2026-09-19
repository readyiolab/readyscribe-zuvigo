import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import {
  reorderScribeSteps,
  addManualStep,
} from "@zuvigo/core";
import { reorderStepsSchema } from "@zuvigo/types";
import { z } from "zod";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const raw = await req.json();

    if (raw?.action === "reorder") {
      const body = parseBody(reorderStepsSchema, raw);
      await reorderScribeSteps(session.user.id, id, body);
      return jsonOk({ ok: true });
    }

    if (raw?.action === "add") {
      const body = parseBody(
        z.object({
          action: z.literal("add"),
          title: z.string().optional(),
          description: z.string().optional(),
        }),
        raw,
      );
      const result = await addManualStep(session.user.id, id, body);
      return jsonOk(result, { status: 201 });
    }

    return jsonOk({ error: { code: "VALIDATION_ERROR", message: "Unknown action" } }, { status: 400 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
