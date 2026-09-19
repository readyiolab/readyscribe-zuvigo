import { requireSession, jsonOk, handleApiError, getRequestId } from "@/lib/api";
import { completeCaptureSession } from "@zuvigo/core";
import { getCaptureQueue } from "@/lib/infra";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const result = await completeCaptureSession(
      session.user.id,
      id,
      getCaptureQueue(),
      requestId,
    );
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
