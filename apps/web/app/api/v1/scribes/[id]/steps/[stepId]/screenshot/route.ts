import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { replaceScribeStepScreenshot } from "@zuvigo/core";
import { getStorage } from "@/lib/infra";
import { z } from "zod";

const bodySchema = z.object({
  imageBase64: z.string().min(32),
  mimeType: z.string().max(100).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  highlight: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    })
    .nullable()
    .optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id, stepId } = await ctx.params;
    const body = parseBody(bodySchema, await req.json());
    const result = await replaceScribeStepScreenshot(
      session.user.id,
      id,
      stepId,
      body,
      getStorage(),
    );
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
