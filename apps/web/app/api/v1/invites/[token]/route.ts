import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
} from "@/lib/api";
import { acceptWorkspaceInvite, getWorkspaceInviteByToken } from "@zuvigo/core";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const { token } = await ctx.params;
    const invite = await getWorkspaceInviteByToken(token);
    return jsonOk(invite);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { token } = await ctx.params;
    const result = await acceptWorkspaceInvite(session.user.id, token);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
