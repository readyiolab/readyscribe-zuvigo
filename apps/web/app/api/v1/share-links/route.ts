import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
  parseBody,
} from "@/lib/api";
import { createShareLink, listShareLinksForDocument } from "@zuvigo/core";
import { createShareLinkSchema } from "@zuvigo/types";
import { ValidationError } from "@zuvigo/security";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const documentId = new URL(req.url).searchParams.get("documentId");
    if (!documentId) throw new ValidationError("documentId is required");
    const links = await listShareLinksForDocument(session.user.id, documentId);
    return jsonOk({ links });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const body = parseBody(createShareLinkSchema, await req.json());
    const link = await createShareLink(session.user.id, body);
    return jsonOk(link, { status: 201 });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
