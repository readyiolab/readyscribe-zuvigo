import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { prisma } from "@zuvigo/db";
import { ForbiddenError, NotFoundError, UnauthorizedError, authz } from "@zuvigo/security";
import type { CreateShareLinkInput } from "@zuvigo/types";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { getMembership } from "./workspace.js";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function createShareLink(userId: string, input: CreateShareLinkInput) {
  const doc = await prisma.document.findFirst({
    where: { id: input.documentId, deletedAt: null },
  });
  if (!doc) throw new NotFoundError("Document not found");

  const membership = await getMembership(userId, doc.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.share",
    doc.createdByUserId === userId,
  );

  const link = await prisma.shareLink.create({
    data: {
      documentId: doc.id,
      publicId: nanoid(12),
      visibility: input.visibility,
      passwordHash: input.password ? hashPassword(input.password) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      allowedEmails: input.allowedEmails ?? undefined,
      createdByUserId: userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: doc.workspaceId,
      actorUserId: userId,
      action: "DOCUMENT_SHARED",
      resourceType: "share_link",
      resourceId: link.id,
      metadata: { visibility: link.visibility, publicId: link.publicId },
    },
  });

  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      versionNumber:
        (await prisma.documentVersion.count({ where: { documentId: doc.id } })) + 1,
      snapshot: {
        title: doc.title,
        summary: doc.summary,
        kind: doc.kind,
        publishedAt: new Date().toISOString(),
      },
      createdByUserId: userId,
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      workspaceId: doc.workspaceId,
      name: "SHARE_CREATED",
      resourceId: link.id,
    },
  });

  return {
    id: link.id,
    publicId: link.publicId,
    visibility: link.visibility,
    hasPassword: Boolean(link.passwordHash),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    urlPath: `/s/${link.publicId}`,
  };
}

export async function listShareLinksForDocument(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
  });
  if (!doc) throw new NotFoundError("Document not found");

  await getMembership(userId, doc.workspaceId);

  const links = await prisma.shareLink.findMany({
    where: { documentId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return links.map((link) => ({
    id: link.id,
    publicId: link.publicId,
    visibility: link.visibility,
    hasPassword: Boolean(link.passwordHash),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    urlPath: `/s/${link.publicId}`,
  }));
}

export async function revokeShareLink(userId: string, shareLinkId: string) {
  const link = await prisma.shareLink.findUnique({
    where: { id: shareLinkId },
    include: { document: true },
  });
  if (!link || link.document.deletedAt) throw new NotFoundError("Share link not found");

  const membership = await getMembership(userId, link.document.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.share",
    link.document.createdByUserId === userId,
  );

  await prisma.shareLink.update({
    where: { id: shareLinkId },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: link.document.workspaceId,
      actorUserId: userId,
      action: "DOCUMENT_SHARE_REVOKED",
      resourceType: "share_link",
      resourceId: link.id,
      metadata: { publicId: link.publicId },
    },
  });

  return { ok: true };
}

export async function getPublicDocument(publicId: string, opts?: {
  password?: string;
  viewerEmail?: string;
  viewerUserId?: string;
}) {
  const link = await prisma.shareLink.findUnique({
    where: { publicId },
    include: {
      document: {
        include: {
          workspace: true,
          scribe: {
            include: {
              steps: { orderBy: { position: "asc" }, include: { asset: true } },
            },
          },
          page: {
            include: { blocks: { orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });

  if (!link || link.revokedAt || link.document.deletedAt) {
    throw new NotFoundError("Shared document not found");
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    throw new NotFoundError("Share link expired");
  }

  if (link.visibility === "PRIVATE") {
    throw new ForbiddenError("This share link is private");
  }

  if (link.visibility === "WORKSPACE") {
    if (!opts?.viewerUserId) throw new UnauthorizedError();
    await getMembership(opts.viewerUserId, link.document.workspaceId);
  }

  if (link.passwordHash) {
    if (!opts?.password || hashPassword(opts.password) !== link.passwordHash) {
      throw new UnauthorizedError("Password required");
    }
  }

  const allowed = link.allowedEmails as string[] | null;
  if (allowed && allowed.length > 0) {
    if (!opts?.viewerEmail || !allowed.includes(opts.viewerEmail.toLowerCase())) {
      throw new ForbiddenError("Email not allowed");
    }
  }

  await prisma.analyticsEvent.create({
    data: {
      workspaceId: link.document.workspaceId,
      name: "DOCUMENT_VIEWED",
      resourceId: link.documentId,
    },
  });

  return link;
}
