import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { createWorkspace, listWorkspacesForUser } from "@zuvigo/core";
import { createWorkspaceSchema } from "@zuvigo/types";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const workspaces = await listWorkspacesForUser(session.user.id);
    return jsonOk({ items: workspaces });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const body = parseBody(createWorkspaceSchema, await req.json());
    const workspace = await createWorkspace(session.user.id, body);
    return jsonOk(workspace, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
