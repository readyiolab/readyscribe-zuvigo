import { Queue, type JobsOptions, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";

export { UpstashRedis, UpstashRedis as Redis };

export function createUpstashRedis(options?: { url?: string; token?: string }): UpstashRedis {
  const url =
    options?.url ||
    process.env.UPSTASH_REDIS_REST_URL ||
    "https://settling-emu-77774.upstash.io";
  const token =
    options?.token ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "gQAAAAAAAS_OAAIgcDE5ZDc0NmFlMjY3MGM0ZDBiOTNlMWU5N2M4Y2EwODcxMA";

  return new UpstashRedis({ url, token });
}

export const QUEUE_NAMES = {
  CAPTURE_PROCESSING: "capture-processing",
  SCREENSHOT_PROCESSING: "screenshot-processing",
  IMAGE_PROCESSING: "image-processing",
  AI_PROCESSING: "ai-processing",
  DOCUMENT_PROCESSING: "document-processing",
  EXPORT_PROCESSING: "export-processing",
  EMAIL: "email",
  ANALYTICS: "analytics",
  CLEANUP: "cleanup",
  HEALTH: "health",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface JobPayload {
  workspaceId: string;
  entityId: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export function createRedisConnection(redisUrl: string): IORedis {
  const isTls = redisUrl.startsWith("rediss://");
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

export function createQueue(
  name: QueueName,
  connection: ConnectionOptions,
  defaultJobOptions: JobsOptions = DEFAULT_JOB_OPTIONS,
): Queue<JobPayload> {
  return new Queue<JobPayload>(name, {
    connection,
    defaultJobOptions,
  });
}

/** BullMQ rejects custom job ids containing `:`. */
export function sanitizeJobId(jobId: string): string {
  return jobId.replace(/:/g, "-");
}

export async function enqueueJob(
  queue: Queue<JobPayload>,
  jobId: string,
  payload: JobPayload,
  opts?: JobsOptions,
) {
  const safeJobId = sanitizeJobId(jobId);
  return queue.add(queue.name, payload, {
    jobId: safeJobId,
    ...DEFAULT_JOB_OPTIONS,
    ...opts,
  });
}

export type { ConnectionOptions };
export type { Queue } from "bullmq";
