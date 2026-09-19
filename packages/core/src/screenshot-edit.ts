import { prisma } from "@zuvigo/db";
import { NotFoundError, ValidationError, authz } from "@zuvigo/security";
import type { StorageService } from "@zuvigo/storage";
import { buildAssetObjectKey } from "@zuvigo/storage";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { nanoid } from "nanoid";
import { getMembership } from "./workspace.js";

export type StepHighlight = { x: number; y: number; w: number; h: number };

export async function replaceScribeStepScreenshot(
  userId: string,
  scribeId: string,
  stepId: string,
  input: {
    imageBase64: string;
    mimeType?: string;
    width?: number;
    height?: number;
    highlight?: StepHighlight | null;
  },
  storage: StorageService,
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
    include: { asset: true },
  });
  if (!step) throw new NotFoundError("Step not found");

  const captureSessionId =
    scribe.captureSessionId ?? step.asset?.captureSessionId ?? null;
  if (!captureSessionId) {
    throw new ValidationError(
      "This step has no capture session to attach a screenshot to",
    );
  }

  const mimeType = input.mimeType ?? "image/png";
  const raw = input.imageBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");
  if (buffer.byteLength < 32) throw new ValidationError("Invalid image data");
  if (buffer.byteLength > 12_000_000) throw new ValidationError("Image too large");

  const assetId = nanoid();
  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
  const objectKey = buildAssetObjectKey(
    scribe.document.workspaceId,
    captureSessionId,
    assetId,
    ext,
  );

  await storage.upload(objectKey, buffer, mimeType);

  const asset = await prisma.captureAsset.create({
    data: {
      id: assetId,
      workspaceId: scribe.document.workspaceId,
      captureSessionId,
      clientAssetId: `edit-${assetId}`,
      kind: "SCREENSHOT",
      objectKey,
      bucket: storage.bucket,
      mimeType,
      width: input.width ?? null,
      height: input.height ?? null,
      byteSize: buffer.byteLength,
      status: "READY",
    },
  });

  const prevAnnotations = Array.isArray(step.annotations)
    ? ([...step.annotations] as Record<string, unknown>[])
    : [];
  let replaced = false;
  const nextAnnotations = prevAnnotations.map((a) => {
    if (!a || typeof a !== "object") return a;
    if (a.highlight || a.kind === "click" || a.kind === "CLICK") {
      replaced = true;
      if (input.highlight === null) {
        const { highlight: _h, ...rest } = a;
        return rest;
      }
      if (input.highlight) {
        return { ...a, highlight: input.highlight };
      }
    }
    return a;
  });
  if (input.highlight && !replaced) {
    nextAnnotations.push({ kind: "click", highlight: input.highlight });
  }

  await prisma.scribeStep.update({
    where: { id: stepId },
    data: {
      assetId: asset.id,
      annotations: nextAnnotations as object[],
    },
  });

  const assetUrl = await storage.getSignedUrl(objectKey, "get", { expiresIn: 600 });

  return {
    assetId: asset.id,
    assetUrl,
    annotations: nextAnnotations,
  };
}
