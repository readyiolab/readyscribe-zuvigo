import { Worker, type Job } from "bullmq";
import { loadConfig } from "@zuvigo/config";
import { createLogger, withJobContext } from "@zuvigo/logger";
import {
  QUEUE_NAMES,
  createRedisConnection,
  createQueue,
  enqueueJob,
  type JobPayload,
} from "@zuvigo/queue";
import { prisma, CaptureSessionStatus, CaptureAssetStatus, DocumentStatus } from "@zuvigo/db";
import { groupEventsIntoSteps, normalizeEvents, type NormalizedEvent } from "@zuvigo/capture";
import { createAIService } from "@zuvigo/ai";
import { createStorageService } from "@zuvigo/storage";
import { createEmailService } from "@zuvigo/email";
import { CaptureEventType } from "@zuvigo/types";

const config = loadConfig();
const log = createLogger({ name: "worker", level: config.LOG_LEVEL });
const connection = createRedisConnection(config.REDIS_URL);
const storage = createStorageService(config);
const ai = createAIService(config);
const email = createEmailService();

const screenshotQueue = createQueue(QUEUE_NAMES.SCREENSHOT_PROCESSING, connection);
const aiQueue = createQueue(QUEUE_NAMES.AI_PROCESSING, connection);

async function markJob(jobId: string, status: "ACTIVE" | "COMPLETED" | "FAILED", lastError?: string) {
  await prisma.jobRun.updateMany({
    where: { jobId },
    data: {
      status,
      lastError,
      attempts: { increment: status === "ACTIVE" ? 1 : 0 },
    },
  });
}

async function processCapture(job: Job<JobPayload>) {
  const jlog = withJobContext(log, {
    jobId: job.id ?? "unknown",
    queue: QUEUE_NAMES.CAPTURE_PROCESSING,
    attempt: job.attemptsMade + 1,
  });
  const captureId = job.data.entityId;
  await markJob(job.id!, "ACTIVE");

  const session = await prisma.captureSession.findUnique({ where: { id: captureId } });
  if (!session) throw new Error("Capture session not found");

  // Idempotent: if already has document + scribe with steps, skip recreate
  let documentId = session.documentId;
  let scribeId: string | null = null;

  if (documentId) {
    const existing = await prisma.scribe.findUnique({ where: { documentId } });
    scribeId = existing?.id ?? null;
  }

  const rawEvents = await prisma.captureEvent.findMany({
    where: { captureSessionId: captureId },
    orderBy: { sequence: "asc" },
    include: { asset: true },
  });

  const assets = await prisma.captureAsset.findMany({
    where: { captureSessionId: captureId },
  });
  const assetByClient = new Map(assets.map((a) => [a.clientAssetId ?? "", a.id]));

  const normalized: NormalizedEvent[] = normalizeEvents(
    rawEvents.map((e) => {
      const meta = (e.metadata as Record<string, unknown> | null) ?? undefined;
      const fromMeta =
        typeof meta?.assetClientId === "string" ? meta.assetClientId : undefined;
      const fromConvention = `asset-${e.clientEventId}`;
      const resolved =
        e.asset?.clientAssetId ??
        fromMeta ??
        (assetByClient.has(fromConvention) ? fromConvention : undefined);
      return {
        clientEventId: e.clientEventId,
        sequence: e.sequence,
        type: e.type as CaptureEventType,
        timestamp: Number(e.timestamp),
        url: e.url ?? undefined,
        element: (e.element as Record<string, unknown>) ?? undefined,
        metadata: meta,
        assetClientId: resolved,
      };
    }),
  );

  const heuristicSteps = groupEventsIntoSteps(normalized);

  if (!documentId) {
    const doc = await prisma.document.create({
      data: {
        workspaceId: session.workspaceId,
        createdByUserId: session.userId,
        kind: "SCRIBE",
        status: DocumentStatus.PROCESSING,
        title: heuristicSteps[0]?.title
          ? `Guide: ${heuristicSteps[0].title}`
          : "Untitled capture",
        summary: `Captured workflow with ${heuristicSteps.length} steps.`,
        processingStage: "ANALYZING",
      },
    });
    documentId = doc.id;

    await prisma.captureSession.update({
      where: { id: captureId },
      data: { documentId },
    });

    const scribe = await prisma.scribe.create({
      data: {
        documentId,
        captureSessionId: captureId,
        metadata: { heuristic: true },
      },
    });
    scribeId = scribe.id;
  }

  if (!scribeId) {
    const scribe = await prisma.scribe.findUniqueOrThrow({ where: { documentId } });
    scribeId = scribe.id;
  }

  // Replace draft steps transactionally (idempotent retries)
  await prisma.$transaction(async (tx) => {
    await tx.scribeStep.deleteMany({ where: { scribeId: scribeId! } });
    for (let i = 0; i < heuristicSteps.length; i++) {
      const step = heuristicSteps[i]!;
      const assetId = step.assetClientId
        ? assetByClient.get(step.assetClientId)
        : undefined;
      const destinationAssetId = step.destinationAssetClientId
        ? assetByClient.get(step.destinationAssetClientId)
        : undefined;
      const annotations = (step.annotations ?? []).map((a) => ({
        kind: a.kind,
        ...(a.highlight ? { highlight: a.highlight } : {}),
        ...(a.resultText ? { resultText: a.resultText } : {}),
        ...(a.navigated ? { navigated: true } : {}),
        ...(destinationAssetId ? { destinationAssetId } : {}),
      }));
      await tx.scribeStep.create({
        data: {
          scribeId: scribeId!,
          position: i,
          title: step.title,
          description: step.description,
          assetId,
          annotations: annotations.length
            ? (annotations as unknown as object)
            : undefined,
        },
      });
    }
    await tx.document.update({
      where: { id: documentId! },
      data: { processingStage: "SCREENSHOTS" },
    });
  });

  // Enqueue screenshot processing for uploaded assets
  for (const asset of assets.filter((a) => a.status === CaptureAssetStatus.UPLOADED || a.status === CaptureAssetStatus.PENDING_UPLOAD)) {
    const shotJobId = `screenshot-processing-${asset.id}`;
    await enqueueJob(screenshotQueue, shotJobId, {
      workspaceId: session.workspaceId,
      entityId: asset.id,
      requestId: job.data.requestId,
      metadata: { captureSessionId: captureId, scribeId },
    });
  }

  // Enqueue AI even if no assets — heuristic already saved
  const aiJobId = `ai-processing-${scribeId}`;
  await enqueueJob(aiQueue, aiJobId, {
    workspaceId: session.workspaceId,
    entityId: scribeId,
    requestId: job.data.requestId,
    metadata: { captureSessionId: captureId, documentId },
  });

  jlog.info({ captureId, documentId, scribeId, steps: heuristicSteps.length }, "Capture processed");
  await markJob(job.id!, "COMPLETED");
}

async function processScreenshot(job: Job<JobPayload>) {
  const assetId = job.data.entityId;
  await markJob(job.id!, "ACTIVE");

  const asset = await prisma.captureAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error("Asset not found");

  if (asset.status === CaptureAssetStatus.READY) {
    await markJob(job.id!, "COMPLETED");
    return;
  }

  await prisma.captureAsset.update({
    where: { id: assetId },
    data: { status: CaptureAssetStatus.PROCESSING },
  });

  const exists = await storage.exists(asset.objectKey);
  if (!exists && storage.bucket !== "memory") {
    // Allow memory/dev without real upload
    await prisma.captureAsset.update({
      where: { id: assetId },
      data: { status: CaptureAssetStatus.FAILED },
    });
    throw new Error("Asset object missing in storage");
  }

  // MVP: mark READY before usage accounting so a usage race never leaves the asset stuck
  await prisma.captureAsset.update({
    where: { id: assetId },
    data: { status: CaptureAssetStatus.READY },
  });

  // Usage: storage bytes (best-effort; concurrent upserts can hit P2002)
  if (asset.byteSize) {
    const period = new Date().toISOString().slice(0, 7);
    try {
      await prisma.usageCounter.upsert({
        where: {
          workspaceId_period_metric: {
            workspaceId: asset.workspaceId,
            period,
            metric: "storageBytes",
          },
        },
        create: {
          workspaceId: asset.workspaceId,
          period,
          metric: "storageBytes",
          value: BigInt(asset.byteSize),
        },
        update: { value: { increment: BigInt(asset.byteSize) } },
      });
    } catch (err) {
      // Retry once on unique race; never fail the screenshot job for usage accounting
      try {
        await prisma.usageCounter.update({
          where: {
            workspaceId_period_metric: {
              workspaceId: asset.workspaceId,
              period,
              metric: "storageBytes",
            },
          },
          data: { value: { increment: BigInt(asset.byteSize) } },
        });
      } catch {
        // ignore — asset already READY
      }
    }
  }

  await markJob(job.id!, "COMPLETED");
}

async function processAI(job: Job<JobPayload>) {
  const scribeId = job.data.entityId;
  await markJob(job.id!, "ACTIVE");

  const scribe = await prisma.scribe.findUnique({
    where: { id: scribeId },
    include: {
      document: true,
      steps: { orderBy: { position: "asc" } },
      captureSession: true,
    },
  });
  if (!scribe) throw new Error("Scribe not found");

  // If AI is disabled or no valid key, complete immediately with heuristic steps
  if (!config.aiEnabled) {
    await prisma.document.update({
      where: { id: scribe.documentId },
      data: {
        status: DocumentStatus.READY,
        processingStage: null,
      },
    });
    if (scribe.captureSessionId) {
      await prisma.captureSession.update({
        where: { id: scribe.captureSessionId },
        data: { status: CaptureSessionStatus.COMPLETED },
      });
    }
    await markJob(job.id!, "COMPLETED");
    return;
  }

  // Idempotent: skip if aiRevision already applied for this job attempt path
  await prisma.document.update({
    where: { id: scribe.documentId },
    data: { processingStage: "WRITING", status: DocumentStatus.PROCESSING },
  });

  const stepInputs = scribe.steps.map((s) => ({
    title: s.title,
    description: s.description,
  }));

  try {
    const guide = await ai.generateGuide(stepInputs, {
      sourceUrl: scribe.captureSession?.sourceUrl ?? undefined,
    });

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: scribe.documentId },
        data: {
          title: guide.title.slice(0, 200),
          summary: guide.summary,
          status: DocumentStatus.READY,
          processingStage: "FINALIZING",
          processingError: null,
        },
      });

      const count = Math.min(guide.steps.length, scribe.steps.length);
      for (let i = 0; i < count; i++) {
        const g = guide.steps[i]!;
        const existing = scribe.steps[i]!;
        await tx.scribeStep.update({
          where: { id: existing.id },
          data: {
            title: g.title.slice(0, 200),
            description: g.description,
          },
        });
      }

      await tx.scribe.update({
        where: { id: scribeId },
        data: { aiRevision: { increment: 1 }, metadata: { tips: guide.tips ?? [] } },
      });

      if (scribe.captureSessionId) {
        await tx.captureSession.update({
          where: { id: scribe.captureSessionId },
          data: { status: CaptureSessionStatus.COMPLETED },
        });
      }
    });

    const period = new Date().toISOString().slice(0, 7);
    await prisma.usageCounter.upsert({
      where: {
        workspaceId_period_metric: {
          workspaceId: scribe.document.workspaceId,
          period,
          metric: "aiRequests",
        },
      },
      create: {
        workspaceId: scribe.document.workspaceId,
        period,
        metric: "aiRequests",
        value: BigInt(1),
      },
      update: { value: { increment: BigInt(1) } },
    });

    await email.send({
      to: "user@placeholder.local",
      subject: "Your guide is ready",
      text: `Document ${scribe.documentId} is ready.`,
    });

    await prisma.document.update({
      where: { id: scribe.documentId },
      data: { processingStage: null },
    });

    await markJob(job.id!, "COMPLETED");
  } catch (err) {
    // AI failure must leave heuristic steps usable
    await prisma.document.update({
      where: { id: scribe.documentId },
      data: {
        status: DocumentStatus.READY,
        processingStage: null,
        processingError: (err as Error).message,
      },
    });
    if (scribe.captureSessionId) {
      await prisma.captureSession.update({
        where: { id: scribe.captureSessionId },
        data: { status: CaptureSessionStatus.COMPLETED },
      });
    }
    log.warn({ err, scribeId }, "AI failed; leaving heuristic steps");
    await markJob(job.id!, "COMPLETED");
  }
}

async function processEmail(job: Job<JobPayload>) {
  await markJob(job.id!, "ACTIVE");
  const meta = job.data.metadata ?? {};
  await email.send({
    to: String(meta.to ?? "unknown"),
    subject: String(meta.subject ?? "Zuvigo notification"),
    text: String(meta.text ?? ""),
  });
  await markJob(job.id!, "COMPLETED");
}

async function processHealth(job: Job<JobPayload>) {
  log.info({ jobId: job.id, entityId: job.data.entityId }, "Health check OK");
}

function wrap(
  name: string,
  fn: (job: Job<JobPayload>) => Promise<void>,
) {
  return async (job: Job<JobPayload>) => {
    const started = Date.now();
    try {
      await fn(job);
      log.info(
        { queue: name, jobId: job.id, durationMs: Date.now() - started },
        "Job completed",
      );
    } catch (err) {
      await markJob(job.id!, "FAILED", (err as Error).message);
      log.error(
        { queue: name, jobId: job.id, err, durationMs: Date.now() - started },
        "Job failed",
      );
      throw err;
    }
  };
}

const workers = [
  new Worker(QUEUE_NAMES.CAPTURE_PROCESSING, wrap(QUEUE_NAMES.CAPTURE_PROCESSING, processCapture), {
    connection: createRedisConnection(config.REDIS_URL),
    concurrency: 2,
  }),
  new Worker(QUEUE_NAMES.SCREENSHOT_PROCESSING, wrap(QUEUE_NAMES.SCREENSHOT_PROCESSING, processScreenshot), {
    connection: createRedisConnection(config.REDIS_URL),
    concurrency: 4,
  }),
  new Worker(QUEUE_NAMES.AI_PROCESSING, wrap(QUEUE_NAMES.AI_PROCESSING, processAI), {
    connection: createRedisConnection(config.REDIS_URL),
    concurrency: 2,
  }),
  new Worker(QUEUE_NAMES.EMAIL, wrap(QUEUE_NAMES.EMAIL, processEmail), {
    connection: createRedisConnection(config.REDIS_URL),
    concurrency: 2,
  }),
  new Worker(QUEUE_NAMES.HEALTH, wrap(QUEUE_NAMES.HEALTH, processHealth), {
    connection: createRedisConnection(config.REDIS_URL),
    concurrency: 1,
  }),
];

log.info(
  { queues: workers.map((w) => w.name), storage: storage.bucket, ai: config.aiEnabled },
  "Zuvigo worker started",
);

async function shutdown() {
  log.info("Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
