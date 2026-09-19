import {
  requireSession,
  jsonOk,
  handleApiError,
  getRequestId,
} from "@/lib/api";
import { prisma } from "@zuvigo/db";
import { NotFoundError, authz } from "@zuvigo/security";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { getMembership } from "@zuvigo/core";
import { createQueue, createRedisConnection, enqueueJob, QUEUE_NAMES } from "@zuvigo/queue";
import { loadConfig } from "@zuvigo/config";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const { id: scribeId } = await ctx.params;

    const scribe = await prisma.scribe.findUnique({
      where: { id: scribeId },
      include: { document: true },
    });
    if (!scribe) throw new NotFoundError("Scribe not found");

    const membership = await getMembership(session.user.id, scribe.document.workspaceId);
    authz.assertMutateDocument(
      membership.role as Role,
      "document.edit",
      scribe.document.createdByUserId === session.user.id,
    );

    await prisma.document.update({
      where: { id: scribe.documentId },
      data: { status: "PROCESSING", processingStage: "WRITING", processingError: null },
    });

    const config = loadConfig();
    const connection = createRedisConnection(config.REDIS_URL);
    const queue = createQueue(QUEUE_NAMES.AI_PROCESSING, connection);
    const jobId = `ai-processing-${scribeId}-retry-${Date.now()}`;
    await enqueueJob(queue, jobId, {
      workspaceId: scribe.document.workspaceId,
      entityId: scribeId,
      requestId,
      metadata: { documentId: scribe.documentId },
    });
    await connection.quit();

    return jsonOk({ ok: true, jobId });
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
