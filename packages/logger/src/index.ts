import pino, { type Logger, type LoggerOptions } from "pino";

export type { Logger };

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "accessKey",
  "secretKey",
  "creditCard",
  "cvv",
  "rawValue",
  "inputValue",
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key) || /password|secret|token|credential/i.test(key)) {
      out[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redact(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createLogger(options?: {
  name?: string;
  level?: string;
  base?: Record<string, unknown>;
}): Logger {
  const opts: LoggerOptions = {
    name: options?.name ?? "zuvigo",
    level: options?.level ?? process.env.LOG_LEVEL ?? "info",
    base: options?.base,
    redact: {
      paths: [
        "password",
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.token",
        "*.secret",
        "*.apiKey",
      ],
      censor: "[REDACTED]",
    },
  };

  return pino(opts);
}

export function withRequestContext(
  logger: Logger,
  ctx: {
    requestId: string;
    userId?: string;
    workspaceId?: string;
  },
): Logger {
  return logger.child(redact(ctx as Record<string, unknown>));
}

export function withJobContext(
  logger: Logger,
  ctx: {
    jobId: string;
    queue: string;
    attempt?: number;
  },
): Logger {
  return logger.child(ctx);
}

export const rootLogger = createLogger({ name: "zuvigo" });
