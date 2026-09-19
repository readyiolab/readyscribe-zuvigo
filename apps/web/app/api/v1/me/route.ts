import { requireSession, jsonOk, handleApiError, getRequestId } from "@/lib/api";
import { listWorkspacesForUser } from "@zuvigo/core";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const workspaces = await listWorkspacesForUser(session.user.id);
    return jsonOk({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        emailVerified: session.user.emailVerified,
      },
      workspaces,
    });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
