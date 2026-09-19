import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { createPage } from "@zuvigo/core";
import { createPageSchema } from "@zuvigo/types";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const body = parseBody(createPageSchema, await req.json());
    const page = await createPage(session.user.id, {
      ...body,
      title: body.title || "Untitled Page",
    });
    return jsonOk(page, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
