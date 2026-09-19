import { loadConfig } from "@zuvigo/config";
import { createRedisConnection, createQueue, createUpstashRedis, QUEUE_NAMES } from "@zuvigo/queue";
import { createStorageService } from "@zuvigo/storage";

const globalForInfra = globalThis as unknown as {
  redis?: ReturnType<typeof createRedisConnection>;
};

function getRedis() {
  const config = loadConfig();
  if (!globalForInfra.redis) {
    globalForInfra.redis = createRedisConnection(config.REDIS_URL);
  }
  return globalForInfra.redis;
}

export function getCaptureQueue() {
  return createQueue(QUEUE_NAMES.CAPTURE_PROCESSING, getRedis());
}

export function getUpstashRedis() {
  const config = loadConfig();
  return createUpstashRedis({
    url: config.UPSTASH_REDIS_REST_URL,
    token: config.UPSTASH_REDIS_REST_TOKEN,
  });
}

export function getStorage() {
  return createStorageService(loadConfig());
}

