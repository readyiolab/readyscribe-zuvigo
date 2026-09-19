import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { appendCaptureEvents } from "@zuvigo/core";
import { batchCaptureEventsSchema } from "@zuvigo/types";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const body = parseBody(batchCaptureEventsSchema, await req.json());
    const result = await appendCaptureEvents(session.user.id, id, body.events as any);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
