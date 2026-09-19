import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { createCaptureSession } from "@zuvigo/core";
import { createCaptureSchema } from "@zuvigo/types";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const body = parseBody(createCaptureSchema, await req.json());
    const capture = await createCaptureSession(session.user.id, {
      ...body,
      sourceUrl: body.sourceUrl ?? undefined,
    });
    return jsonOk(capture, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
