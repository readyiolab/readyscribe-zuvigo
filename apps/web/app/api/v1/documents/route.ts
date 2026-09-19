import { requireSession, jsonOk, handleApiError, getRequestId } from "@/lib/api";
import { listDocuments } from "@zuvigo/core";
import { paginationSchema } from "@zuvigo/types";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      return jsonOk({ error: { code: "VALIDATION_ERROR", message: "workspaceId required" } }, { status: 400 });
    }
    const page = paginationSchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const kind = url.searchParams.get("kind") as "SCRIBE" | "PAGE" | null;
    const createdByMe = url.searchParams.get("createdByMe") === "true";

    const result = await listDocuments({
      userId: session.user.id,
      workspaceId,
      cursor: page.cursor,
      limit: page.limit,
      kind: kind ?? undefined,
      createdByMe,
    });
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
