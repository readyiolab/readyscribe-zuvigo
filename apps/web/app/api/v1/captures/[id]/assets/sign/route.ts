import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { signCaptureAsset } from "@zuvigo/core";
import { signAssetSchema } from "@zuvigo/types";
import { getStorage } from "@/lib/infra";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const body = parseBody(signAssetSchema, await req.json());
    const result = await signCaptureAsset(session.user.id, id, body, getStorage());
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
