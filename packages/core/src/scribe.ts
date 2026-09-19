import { prisma } from "@zuvigo/db";
import { NotFoundError, authz } from "@zuvigo/security";
import type { StorageService } from "@zuvigo/storage";
import type { UpdateScribeInput, UpdateScribeStepInput, ReorderStepsInput } from "@zuvigo/types";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { getMembership } from "./workspace.js";

export async function getScribeForUser(
  userId: string,
  scribeId: string,
  storage: StorageService,
) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: {
      document: true,
      steps: { orderBy: { position: "asc" }, include: { asset: true } },
    },
  });
  if (!scribe || scribe.document.deletedAt) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertCan(membership.role as Role, "document.read");

  const steps = await Promise.all(
    scribe.steps.map(async (s) => {
      const annotations = (s.annotations as unknown[]) ?? [];
      let destinationAssetUrl: string | null = null;
      for (const raw of annotations) {
        if (!raw || typeof raw !== "object") continue;
        const destId = (raw as { destinationAssetId?: string }).destinationAssetId;
        if (!destId) continue;
        const dest = await prisma.captureAsset.findUnique({ where: { id: destId } });
        if (dest) {
          destinationAssetUrl = await storage.getSignedUrl(dest.objectKey, "get", {
            expiresIn: 600,
          });
        }
        break;
      }
      return {
        id: s.id,
        position: s.position,
        title: s.title,
        description: s.description,
        callouts: (s.callouts as unknown[]) ?? [],
        annotations,
        assetId: s.assetId,
        assetUrl: s.asset
          ? await storage.getSignedUrl(s.asset.objectKey, "get", { expiresIn: 600 })
          : null,
        destinationAssetUrl,
      };
    }),
  );

  return {
    id: scribe.id,
    documentId: scribe.documentId,
    title: scribe.document.title,
    summary: scribe.document.summary,
    status: scribe.document.status,
    steps,
    membership,
    workspaceId: scribe.document.workspaceId,
    createdByUserId: scribe.document.createdByUserId,
  };
}

export async function updateScribe(userId: string, scribeId: string, input: UpdateScribeInput) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: { document: true },
  });
  if (!scribe || scribe.document.deletedAt) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    scribe.document.createdByUserId === userId,
  );

  await prisma.document.update({
    where: { id: scribe.documentId },
    data: {
      title: input.title,
      summary: input.summary,
    },
  });

  return { id: scribeId, documentId: scribe.documentId };
}

export async function updateScribeStep(
  userId: string,
  scribeId: string,
  stepId: string,
  input: UpdateScribeStepInput,
) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: { document: true },
  });
  if (!scribe) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    scribe.document.createdByUserId === userId,
  );

  const step = await prisma.scribeStep.findFirst({
    where: { id: stepId, scribeId },
  });
  if (!step) throw new NotFoundError("Step not found");

  await prisma.scribeStep.update({
    where: { id: stepId },
    data: {
      title: input.title,
      description: input.description,
      callouts: input.callouts as object | undefined,
      annotations: input.annotations as object | undefined,
      position: input.position,
    },
  });

  return { id: stepId };
}

export async function reorderScribeSteps(
  userId: string,
  scribeId: string,
  input: ReorderStepsInput,
) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: { document: true, steps: true },
  });
  if (!scribe) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    scribe.document.createdByUserId === userId,
  );

  const existingIds = new Set(scribe.steps.map((s) => s.id));
  if (input.stepIds.length !== existingIds.size || input.stepIds.some((id) => !existingIds.has(id))) {
    throw new NotFoundError("Invalid step order");
  }

  await prisma.$transaction(
    input.stepIds.map((id, position) =>
      prisma.scribeStep.update({ where: { id }, data: { position } }),
    ),
  );

  return { ok: true };
}

export async function deleteScribeStep(userId: string, scribeId: string, stepId: string) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: { document: true, steps: { orderBy: { position: "asc" } } },
  });
  if (!scribe) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    scribe.document.createdByUserId === userId,
  );

  await prisma.scribeStep.delete({ where: { id: stepId } });

  const remaining = scribe.steps.filter((s) => s.id !== stepId);
  await prisma.$transaction(
    remaining.map((s, position) =>
      prisma.scribeStep.update({ where: { id: s.id }, data: { position } }),
    ),
  );

  return { ok: true };
}

export async function duplicateScribeStep(userId: string, scribeId: string, stepId: string) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: { document: true, steps: { orderBy: { position: "asc" } } },
  });
  if (!scribe) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    scribe.document.createdByUserId === userId,
  );

  const step = scribe.steps.find((s) => s.id === stepId);
  if (!step) throw new NotFoundError("Step not found");

  const insertAt = step.position + 1;
  await prisma.$transaction([
    ...scribe.steps
      .filter((s) => s.position >= insertAt)
      .map((s) =>
        prisma.scribeStep.update({
          where: { id: s.id },
          data: { position: s.position + 1 },
        }),
      ),
    prisma.scribeStep.create({
      data: {
        scribeId,
        position: insertAt,
        title: `${step.title} (copy)`,
        description: step.description,
        callouts: step.callouts ?? undefined,
        annotations: step.annotations ?? undefined,
        assetId: step.assetId,
      },
    }),
  ]);

  return { ok: true };
}

export async function addManualStep(
  userId: string,
  scribeId: string,
  input: { title?: string; description?: string },
) {
  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: { document: true, steps: true },
  });
  if (!scribe) throw new NotFoundError("Scribe not found");

  const membership = await getMembership(userId, scribe.document.workspaceId);
  authz.assertMutateDocument(
    membership.role as Role,
    "document.edit",
    scribe.document.createdByUserId === userId,
  );

  const position = scribe.steps.length;
  const created = await prisma.scribeStep.create({
    data: {
      scribeId,
      position,
      title: input.title ?? "New step",
      description: input.description ?? "",
    },
  });

  return { id: created.id };
}
