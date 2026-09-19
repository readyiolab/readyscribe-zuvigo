import { prisma } from "@zuvigo/db";
import { NotFoundError, authz } from "@zuvigo/security";
import type { AddPageBlockInput, CreatePageInput, UpdatePageBlockInput } from "@zuvigo/types";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { assertPermission, getMembership } from "./workspace.js";

export async function createPage(userId: string, input: CreatePageInput) {
  await assertPermission(userId, input.workspaceId, "document.create");

  const doc = await prisma.document.create({
    data: {
      workspaceId: input.workspaceId,
      kind: "PAGE",
      title: input.title,
      status: "READY",
      createdByUserId: userId,
      page: {
        create: {
          blocks: {
            create: [
              {
                type: "HEADING",
                position: 0,
                data: { text: input.title },
              },
              {
                type: "TEXT",
                position: 1,
                data: { text: "Start writing your page…" },
              },
            ],
          },
        },
      },
    },
    include: { page: { include: { blocks: { orderBy: { position: "asc" } } } } },
  });

  return {
    id: doc.page!.id,
    documentId: doc.id,
    title: doc.title,
    blocks: doc.page!.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      position: b.position,
      data: b.data as Record<string, unknown>,
    })),
  };
}

export async function getPageForUser(userId: string, pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      document: true,
      blocks: { orderBy: { position: "asc" } },
    },
  });
  if (!page || page.document.deletedAt) throw new NotFoundError("Page not found");

  const membership = await getMembership(userId, page.document.workspaceId);
  authz.assertCan(membership.role as Role, "document.read");

  return {
    id: page.id,
    documentId: page.documentId,
    workspaceId: page.document.workspaceId,
    title: page.document.title,
    summary: page.document.summary,
    status: page.document.status,
    createdByUserId: page.document.createdByUserId,
    blocks: page.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      position: b.position,
      data: (b.data ?? {}) as Record<string, unknown>,
    })),
  };
}

export async function updatePageMeta(
  userId: string,
  pageId: string,
  input: { title?: string; summary?: string | null },
) {
  const page = await getPageForUser(userId, pageId);
  const membership = await getMembership(userId, page.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    page.createdByUserId === userId,
  );

  await prisma.document.update({
    where: { id: page.documentId },
    data: {
      title: input.title,
      summary: input.summary === undefined ? undefined : input.summary,
    },
  });

  return { id: pageId, documentId: page.documentId };
}

export async function addPageBlock(userId: string, pageId: string, input: AddPageBlockInput) {
  const page = await getPageForUser(userId, pageId);
  const membership = await getMembership(userId, page.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    page.createdByUserId === userId,
  );

  const position = input.position ?? page.blocks.length;
  const block = await prisma.pageBlock.create({
    data: {
      pageId,
      type: input.type,
      position,
      data: input.data as object,
    },
  });

  return {
    id: block.id,
    type: block.type,
    position: block.position,
    data: block.data as Record<string, unknown>,
  };
}

export async function updatePageBlock(
  userId: string,
  pageId: string,
  blockId: string,
  input: UpdatePageBlockInput,
) {
  const page = await getPageForUser(userId, pageId);
  const membership = await getMembership(userId, page.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    page.createdByUserId === userId,
  );

  const existing = await prisma.pageBlock.findFirst({ where: { id: blockId, pageId } });
  if (!existing) throw new NotFoundError("Block not found");

  const block = await prisma.pageBlock.update({
    where: { id: blockId },
    data: {
      type: input.type,
      data: input.data as object | undefined,
      position: input.position,
    },
  });

  return {
    id: block.id,
    type: block.type,
    position: block.position,
    data: block.data as Record<string, unknown>,
  };
}

export async function deletePageBlock(userId: string, pageId: string, blockId: string) {
  const page = await getPageForUser(userId, pageId);
  const membership = await getMembership(userId, page.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    page.createdByUserId === userId,
  );

  const existing = await prisma.pageBlock.findFirst({ where: { id: blockId, pageId } });
  if (!existing) throw new NotFoundError("Block not found");

  await prisma.pageBlock.delete({ where: { id: blockId } });
  return { ok: true };
}
