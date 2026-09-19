import { prisma } from "@zuvigo/db";
import { ForbiddenError, NotFoundError, ValidationError, authz } from "@zuvigo/security";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { getMembership } from "./workspace.js";

export async function listComments(
  userId: string,
  documentId: string,
  opts?: { stepId?: string | null },
) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
  });
  if (!doc) throw new NotFoundError("Document not found");

  const membership = await getMembership(userId, doc.workspaceId);
  authz.assertCan(membership.role as Role, "document.read");

  const comments = await prisma.comment.findMany({
    where: {
      documentId,
      deletedAt: null,
      ...(opts?.stepId ? { stepId: opts.stepId } : {}),
    },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return comments.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    stepId: c.stepId,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    author: {
      id: c.author.id,
      name: c.author.name,
      email: c.author.email,
    },
  }));
}

export async function createComment(
  userId: string,
  documentId: string,
  input: { body: string; stepId?: string | null },
) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
  });
  if (!doc) throw new NotFoundError("Document not found");

  await getMembership(userId, doc.workspaceId);

  const body = input.body.trim();
  if (!body) throw new ValidationError("Comment cannot be empty");
  if (body.length > 5000) throw new ValidationError("Comment too long");

  if (input.stepId) {
    const step = await prisma.scribeStep.findFirst({
      where: {
        id: input.stepId,
        scribe: { documentId },
      },
    });
    if (!step) throw new NotFoundError("Step not found");
  }

  const comment = await prisma.comment.create({
    data: {
      documentId,
      stepId: input.stepId ?? null,
      authorUserId: userId,
      body,
    },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  return {
    id: comment.id,
    documentId: comment.documentId,
    stepId: comment.stepId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: {
      id: comment.author.id,
      name: comment.author.name,
      email: comment.author.email,
    },
  };
}

export async function softDeleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { document: true },
  });
  if (!comment || comment.deletedAt || comment.document.deletedAt) {
    throw new NotFoundError("Comment not found");
  }

  const membership = await getMembership(userId, comment.document.workspaceId);
  const isAuthor = comment.authorUserId === userId;
  const canModerate =
    membership.role === "OWNER" || membership.role === "ADMIN";

  if (!isAuthor && !canModerate) {
    throw new ForbiddenError("Cannot delete this comment");
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  return { ok: true };
}

export async function countCommentsByStep(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
  });
  if (!doc) throw new NotFoundError("Document not found");
  await getMembership(userId, doc.workspaceId);

  const grouped = await prisma.comment.groupBy({
    by: ["stepId"],
    where: { documentId, deletedAt: null, stepId: { not: null } },
    _count: { _all: true },
  });

  const map: Record<string, number> = {};
  for (const row of grouped) {
    if (row.stepId) map[row.stepId] = row._count._all;
  }
  return map;
}
