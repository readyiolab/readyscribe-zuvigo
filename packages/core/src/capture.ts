import { prisma, CaptureSessionStatus, CaptureAssetStatus } from "@zuvigo/db";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  entitlements,
} from "@zuvigo/security";
import { buildAssetObjectKey, type StorageService } from "@zuvigo/storage";
import {
  QUEUE_NAMES,
  enqueueJob,
  type JobPayload,
} from "@zuvigo/queue";
import type { Queue } from "bullmq";
import type {
  CreateCaptureInput,
  CaptureEventInput,
  SignAssetInput,
  RegisterAssetInput,
  UpdateCaptureInput,
} from "@zuvigo/types";
import { normalizeEvents } from "@zuvigo/capture";
import { assertPermission, getMembership } from "./workspace.js";

async function getCaptureOwned(userId: string, captureId: string) {
  const session = await prisma.captureSession.findUnique({
    where: { id: captureId },
  });
  if (!session) throw new NotFoundError("Capture session not found");
  await getMembership(userId, session.workspaceId);
  if (session.userId !== userId) {
    // Editors/admins of workspace can view; only owner can mutate mid-capture
    const membership = await getMembership(userId, session.workspaceId);
    if (membership.role === "VIEWER") {
      throw new ForbiddenError();
    }
  }
  return session;
}

export async function createCaptureSession(
  userId: string,
  input: {
    workspaceId: string;
    clientType?: CreateCaptureInput["clientType"];
    browser?: string;
    browserVersion?: string;
    sourceUrl?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await assertPermission(userId, input.workspaceId, "capture.start");

  const sub = await prisma.subscription.findUnique({
    where: { workspaceId: input.workspaceId },
    include: { plan: true },
  });
  const planEntitlements = (sub?.plan.entitlements ?? {}) as Record<string, boolean>;
  entitlements.assertCan(planEntitlements, "CAPTURE");

  const session = await prisma.captureSession.create({
    data: {
      workspaceId: input.workspaceId,
      userId,
      status: CaptureSessionStatus.CAPTURING,
      clientType: input.clientType ?? "BROWSER_EXTENSION",
      browser: input.browser,
      browserVersion: input.browserVersion,
      sourceUrl: input.sourceUrl,
      metadata: (input.metadata as object | undefined) ?? undefined,
      startedAt: new Date(),
    },
  });

  await prisma.analyticsEvent.create({
    data: {
      workspaceId: input.workspaceId,
      name: "CAPTURE_STARTED",
      resourceId: session.id,
    },
  });

  return {
    id: session.id,
    workspaceId: session.workspaceId,
    status: session.status,
    documentId: session.documentId,
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: null,
  };
}

export async function updateCaptureSession(
  userId: string,
  captureId: string,
  input: UpdateCaptureInput,
) {
  const session = await getCaptureOwned(userId, captureId);
  if (session.userId !== userId) throw new ForbiddenError();

  const allowed: Record<string, CaptureSessionStatus[]> = {
    PAUSED: [CaptureSessionStatus.CAPTURING],
    CAPTURING: [CaptureSessionStatus.PAUSED, CaptureSessionStatus.STARTING],
    CANCELLED: [
      CaptureSessionStatus.CAPTURING,
      CaptureSessionStatus.PAUSED,
      CaptureSessionStatus.STARTING,
    ],
  };

  const from = allowed[input.status];
  if (!from?.includes(session.status)) {
    throw new ConflictError(`Cannot transition from ${session.status} to ${input.status}`);
  }

  const updated = await prisma.captureSession.update({
    where: { id: captureId },
    data: { status: input.status as CaptureSessionStatus },
  });

  return {
    id: updated.id,
    workspaceId: updated.workspaceId,
    status: updated.status,
    documentId: updated.documentId,
    startedAt: updated.startedAt?.toISOString() ?? null,
    completedAt: updated.completedAt?.toISOString() ?? null,
  };
}

export async function appendCaptureEvents(
  userId: string,
  captureId: string,
  events: CaptureEventInput[],
) {
  const session = await getCaptureOwned(userId, captureId);
  if (session.userId !== userId) throw new ForbiddenError();
  if (
    session.status !== CaptureSessionStatus.CAPTURING &&
    session.status !== CaptureSessionStatus.PAUSED
  ) {
    throw new ConflictError("Capture is not accepting events");
  }

  const normalized = normalizeEvents(events);
  let inserted = 0;

  for (const ev of normalized) {
    let assetId: string | undefined;
    if (ev.assetClientId) {
      const asset = await prisma.captureAsset.findUnique({
        where: {
          captureSessionId_clientAssetId: {
            captureSessionId: captureId,
            clientAssetId: ev.assetClientId,
          },
        },
      });
      assetId = asset?.id;
    }

    const existing = await prisma.captureEvent.findUnique({
      where: {
        captureSessionId_clientEventId: {
          captureSessionId: captureId,
          clientEventId: ev.clientEventId,
        },
      },
    });
    if (existing) continue;

    // Persist assetClientId in metadata as a durable fallback when FK is missing
    const metadata: Record<string, unknown> = {
      ...((ev.metadata as Record<string, unknown> | undefined) ?? {}),
    };
    if (ev.assetClientId && metadata.assetClientId == null) {
      metadata.assetClientId = ev.assetClientId;
    }

    await prisma.captureEvent.create({
      data: {
        captureSessionId: captureId,
        clientEventId: ev.clientEventId,
        sequence: ev.sequence,
        type: ev.type,
        timestamp: BigInt(ev.timestamp),
        url: ev.url,
        element: (ev.element as object | undefined) ?? undefined,
        metadata: Object.keys(metadata).length > 0 ? (metadata as object) : undefined,
        assetId,
      },
    });
    inserted += 1;
  }

  return { accepted: inserted, received: events.length };
}

export async function signCaptureAsset(
  userId: string,
  captureId: string,
  input: SignAssetInput,
  storage: StorageService,
) {
  const session = await getCaptureOwned(userId, captureId);
  if (session.userId !== userId) throw new ForbiddenError();

  const existing = await prisma.captureAsset.findUnique({
    where: {
      captureSessionId_clientAssetId: {
        captureSessionId: captureId,
        clientAssetId: input.clientAssetId,
      },
    },
  });
  if (existing) {
    const uploadUrl = await storage.getSignedUrl(existing.objectKey, "put", {
      expiresIn: 600,
      contentType: input.mimeType,
    });
    return { assetId: existing.id, objectKey: existing.objectKey, uploadUrl };
  }

  const assetId = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/jpeg" ? "jpg" : "webp";
  const objectKey = buildAssetObjectKey(session.workspaceId, captureId, assetId, ext);

  const asset = await prisma.captureAsset.create({
    data: {
      id: assetId,
      workspaceId: session.workspaceId,
      captureSessionId: captureId,
      clientAssetId: input.clientAssetId,
      objectKey,
      bucket: storage.bucket,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      checksum: input.checksum,
      status: CaptureAssetStatus.PENDING_UPLOAD,
    },
  });

  const uploadUrl = await storage.getSignedUrl(objectKey, "put", {
    expiresIn: 600,
    contentType: input.mimeType,
  });

  return { assetId: asset.id, objectKey, uploadUrl };
}

export async function registerCaptureAsset(
  userId: string,
  captureId: string,
  input: RegisterAssetInput,
) {
  const session = await getCaptureOwned(userId, captureId);
  if (session.userId !== userId) throw new ForbiddenError();

  const asset = await prisma.captureAsset.findFirst({
    where: { id: input.assetId, captureSessionId: captureId },
  });
  if (!asset) throw new NotFoundError("Asset not found");

  const updated = await prisma.captureAsset.update({
    where: { id: asset.id },
    data: {
      status: CaptureAssetStatus.UPLOADED,
      checksum: input.checksum ?? asset.checksum,
      width: input.width ?? asset.width,
      height: input.height ?? asset.height,
      byteSize: input.byteSize ?? asset.byteSize,
    },
  });

  // Backfill CaptureEvent.assetId when events were posted before the asset existed.
  // Extension convention: clientAssetId === `asset-${clientEventId}`
  const clientAssetId = updated.clientAssetId ?? input.clientAssetId;
  if (clientAssetId?.startsWith("asset-")) {
    const clientEventId = clientAssetId.slice("asset-".length);
    if (clientEventId) {
      await prisma.captureEvent.updateMany({
        where: {
          captureSessionId: captureId,
          clientEventId,
          assetId: null,
        },
        data: { assetId: updated.id },
      });
    }
  }

  return { assetId: updated.id, status: updated.status };
}

export async function completeCaptureSession(
  userId: string,
  captureId: string,
  captureQueue: Queue<JobPayload>,
  requestId: string,
) {
  const session = await getCaptureOwned(userId, captureId);
  if (session.userId !== userId) throw new ForbiddenError();

  if (
    session.status !== CaptureSessionStatus.CAPTURING &&
    session.status !== CaptureSessionStatus.PAUSED
  ) {
    if (session.status === CaptureSessionStatus.PROCESSING || session.status === CaptureSessionStatus.COMPLETED) {
      return {
        id: session.id,
        workspaceId: session.workspaceId,
        status: session.status,
        documentId: session.documentId,
        startedAt: session.startedAt?.toISOString() ?? null,
        completedAt: session.completedAt?.toISOString() ?? null,
      };
    }
    throw new ConflictError(`Cannot complete capture in status ${session.status}`);
  }

  const eventCount = await prisma.captureEvent.count({ where: { captureSessionId: captureId } });
  if (eventCount === 0) {
    throw new ValidationError("Capture has no events");
  }

  const updated = await prisma.captureSession.update({
    where: { id: captureId },
    data: {
      status: CaptureSessionStatus.PROCESSING,
      completedAt: new Date(),
    },
  });

  const jobId = `capture-processing-${captureId}`;
  await prisma.jobRun.upsert({
    where: { jobId },
    create: {
      queue: QUEUE_NAMES.CAPTURE_PROCESSING,
      jobId,
      entityType: "capture_session",
      entityId: captureId,
      status: "QUEUED",
    },
    update: { status: "QUEUED", attempts: { increment: 0 } },
  });

  await enqueueJob(captureQueue, jobId, {
    workspaceId: session.workspaceId,
    entityId: captureId,
    requestId,
  });

  await prisma.analyticsEvent.create({
    data: {
      workspaceId: session.workspaceId,
      name: "CAPTURE_COMPLETED",
      resourceId: captureId,
    },
  });

  return {
    id: updated.id,
    workspaceId: updated.workspaceId,
    status: updated.status,
    documentId: updated.documentId,
    startedAt: updated.startedAt?.toISOString() ?? null,
    completedAt: updated.completedAt?.toISOString() ?? null,
  };
}

export async function getCaptureSession(userId: string, captureId: string) {
  const session = await getCaptureOwned(userId, captureId);
  const doc = session.documentId
    ? await prisma.document.findUnique({ where: { id: session.documentId } })
    : null;

  return {
    id: session.id,
    workspaceId: session.workspaceId,
    status: session.status,
    documentId: session.documentId,
    progress: doc?.processingStage
      ? { stage: doc.processingStage as never, message: doc.processingStage }
      : null,
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
  };
}
