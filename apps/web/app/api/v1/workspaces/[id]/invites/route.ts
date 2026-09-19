import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
  listWorkspaceMembers,
} from "@zuvigo/core";
import { createWorkspaceInviteSchema } from "@zuvigo/types";
import { loadConfig } from "@zuvigo/config";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id: workspaceId } = await ctx.params;
    const [members, invites] = await Promise.all([
      listWorkspaceMembers(session.user.id, workspaceId),
      listWorkspaceInvites(session.user.id, workspaceId).catch(() => []),
    ]);
    return jsonOk({ members, invites });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id: workspaceId } = await ctx.params;
    const body = parseBody(createWorkspaceInviteSchema, await req.json());
    const config = loadConfig();
    const invite = await createWorkspaceInvite(
      session.user.id,
      workspaceId,
      {
        email: body.email,
        role: body.role ?? "MEMBER",
      },
      {
        appOrigin: config.APP_URL,
        redisUrl: config.REDIS_URL,
      },
    );
    return jsonOk(invite, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
