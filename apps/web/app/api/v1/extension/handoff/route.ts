import { requireSession, jsonOk, handleApiError, getRequestId, parseBody } from "@/lib/api";
import { createHandoff, completeHandoff, getHandoffToken } from "@zuvigo/core";
import { z } from "zod";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = parseBody(
      z.object({
        handoffId: z.string().min(8).max(64),
        action: z.enum(["create", "complete"]),
      }),
      await req.json(),
    );

    if (body.action === "create") {
      // Extension creates the handoff (no auth yet)
      await createHandoff(body.handoffId);
      return jsonOk({ ok: true, handoffId: body.handoffId });
    }

    // Web page completes handoff while signed in
    const session = await requireSession(req);
    const result = await completeHandoff(body.handoffId, session.user.id);
    if (!result?.token) {
      return jsonOk(
        { error: { code: "NOT_FOUND", message: "Handoff expired or missing" } },
        { status: 404 },
      );
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const url = new URL(req.url);
    const handoffId = url.searchParams.get("handoffId");
    if (!handoffId) {
      return jsonOk(
        { error: { code: "VALIDATION_ERROR", message: "handoffId required" } },
        { status: 400 },
      );
    }
    const token = await getHandoffToken(handoffId);
    if (!token) {
      return jsonOk({ ready: false });
    }
    return jsonOk({ ready: true, token });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
