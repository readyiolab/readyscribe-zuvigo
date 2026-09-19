import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { getWorkspaceBrand, updateWorkspaceBrand } from "@zuvigo/core";
import { updateWorkspaceBrandSchema } from "@zuvigo/types";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id } = await ctx.params;
    const brand = await getWorkspaceBrand(session.user.id, id);
    return jsonOk(brand);
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
    const body = parseBody(updateWorkspaceBrandSchema, await req.json());
    const brand = await updateWorkspaceBrand(session.user.id, id, body);
    return jsonOk(brand);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
