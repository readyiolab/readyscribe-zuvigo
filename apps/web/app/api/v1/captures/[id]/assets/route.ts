import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { registerCaptureAsset } from "@zuvigo/core";
import { registerAssetSchema } from "@zuvigo/types";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const body = parseBody(registerAssetSchema, await req.json());
    const result = await registerCaptureAsset(session.user.id, id, body);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
