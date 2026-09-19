import { prisma } from "@zuvigo/db";
import { NotFoundError, authz } from "@zuvigo/security";
import { WorkspaceRole as Role } from "@zuvigo/types";
import type { DocumentListItemDto, CursorPage } from "@zuvigo/types";
import { assertPermission, getMembership } from "./workspace.js";

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!iso || !id) return null;
    return { updatedAt: new Date(iso), id };
  } catch {
    return null;
  }
}

export async function listDocuments(opts: {
  userId: string;
  workspaceId: string;
  cursor?: string;
  limit?: number;
  kind?: "SCRIBE" | "PAGE";
  createdByMe?: boolean;
  savedOnly?: boolean;
}): Promise<CursorPage<DocumentListItemDto>> {
  await assertPermission(opts.userId, opts.workspaceId, "document.read");
  const limit = Math.min(opts.limit ?? 20, 100);
  const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;

  const items = await prisma.document.findMany({
    where: {
      workspaceId: opts.workspaceId,
      deletedAt: null,
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.createdByMe ? { createdByUserId: opts.userId } : {}),
      ...(opts.savedOnly ? { favorites: { some: { userId: opts.userId } } } : {}),
      ...(decoded
        ? {
            OR: [
              { updatedAt: { lt: decoded.updatedAt } },
              { updatedAt: decoded.updatedAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      updatedAt: true,
      createdAt: true,
      createdByUserId: true,
      workspaceId: true,
      workspace: {
        select: {
          name: true,
        },
      },
      favorites: {
        where: { userId: opts.userId },
        select: { id: true },
      },
    },
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page[page.length - 1];

  return {
    items: page.map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind as DocumentListItemDto["kind"],
      status: d.status as DocumentListItemDto["status"],
      updatedAt: d.updatedAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
      createdByUserId: d.createdByUserId,
      isSaved: Boolean(d.favorites && d.favorites.length > 0),
      workspaceName: d.workspace?.name,
      workspaceId: d.workspaceId,
    })),
    nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
  };
}

export async function getDocumentForUser(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: {
      scribe: { include: { steps: { orderBy: { position: "asc" } } } },
      page: { include: { blocks: { orderBy: { position: "asc" } } } },
    },
  });
  if (!doc) throw new NotFoundError("Document not found");

  const membership = await getMembership(userId, doc.workspaceId);
  authz.assertCan(membership.role as Role, "document.read");
  return { doc, membership };
}

export async function softDeleteDocument(userId: string, documentId: string) {
  const { doc, membership } = await getDocumentForUser(userId, documentId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.delete",
    doc.createdByUserId === userId,
  );

  await prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: doc.workspaceId,
      actorUserId: userId,
      action: "DOCUMENT_DELETED",
      resourceType: "document",
      resourceId: documentId,
    },
  });
}

export async function duplicateDocument(userId: string, documentId: string) {
  const { doc, membership } = await getDocumentForUser(userId, documentId);
  authz.assertCan(membership.role as Role, "document.create");

  const newTitle = `${doc.title || "Untitled Document"} (Copy)`;

  const duplicated = await prisma.document.create({
    data: {
      workspaceId: doc.workspaceId,
      createdByUserId: userId,
      kind: doc.kind,
      title: newTitle,
      summary: doc.summary,
      status: doc.status,
    },
  });

  if (doc.kind === "SCRIBE" && doc.scribe) {
    const newScribe = await prisma.scribe.create({
      data: {
        documentId: duplicated.id,
      },
    });

    if (doc.scribe.steps.length > 0) {
      await prisma.scribeStep.createMany({
        data: doc.scribe.steps.map((step) => ({
          scribeId: newScribe.id,
          position: step.position,
          title: step.title,
          description: step.description,
          callouts: step.callouts as object[],
          annotations: step.annotations as object[],
          assetId: step.assetId,
        })),
      });
    }
  } else if (doc.kind === "PAGE" && doc.page) {
    const newPage = await prisma.page.create({
      data: {
        documentId: duplicated.id,
      },
    });

    if (doc.page.blocks.length > 0) {
      await prisma.pageBlock.createMany({
        data: doc.page.blocks.map((block) => ({
          pageId: newPage.id,
          position: block.position,
          type: block.type,
          data: (block.data ?? {}) as object,
        })),
      });
    }
  }

  return duplicated;
}

export async function moveDocument(userId: string, documentId: string, targetWorkspaceId: string) {
  const { doc, membership } = await getDocumentForUser(userId, documentId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    doc.createdByUserId === userId,
  );

  await assertPermission(userId, targetWorkspaceId, "document.create");

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: { workspaceId: targetWorkspaceId },
  });

  return updated;
}

export async function toggleDocumentFavorite(userId: string, documentId: string) {
  await getDocumentForUser(userId, documentId);

  const existing = await prisma.documentFavorite.findUnique({
    where: {
      documentId_userId: {
        documentId,
        userId,
      },
    },
  });

  if (existing) {
    await prisma.documentFavorite.delete({
      where: { id: existing.id },
    });
    return { isSaved: false };
  }

  await prisma.documentFavorite.create({
    data: {
      documentId,
      userId,
    },
  });
  return { isSaved: true };
}
