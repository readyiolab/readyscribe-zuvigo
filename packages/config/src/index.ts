import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

function autoLoadEnv() {
  if (typeof process === "undefined" || !process.env) return;
  try {
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../../.env"),
      path.resolve(process.cwd(), "../.env"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

autoLoadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("ZuvigoScribe"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  SPACES_ENDPOINT: z.string().url().optional(),
  SPACES_REGION: z.string().default("nyc3"),
  SPACES_BUCKET: z.string().optional(),
  SPACES_ACCESS_KEY: z.string().optional(),
  SPACES_SECRET_KEY: z.string().optional(),
  SPACES_CDN_ENDPOINT: z.string().url().optional(),
  SPACES_KEY_PREFIX: z.string().default("zuvigo"),

  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().default("gpt-4o-mini"),

  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@zuvigo.com"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema> & {
  isProd: boolean;
  isDev: boolean;
  storageEnabled: boolean;
  googleOAuthEnabled: boolean;
  aiEnabled: boolean;
  smtpEnabled: boolean;
  upstashEnabled: boolean;
};

let cached: AppConfig | null = null;

/** Map DO_SPACES_*, DB_*, and UPSTASH_* aliases onto schema keys before Zod parse. */
export function normalizeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const nextEnv = { ...env };

  // Construct DATABASE_URL from DB_* if DATABASE_URL is not directly provided
  if (!nextEnv.DATABASE_URL && nextEnv.DB_HOST && nextEnv.DB_USER && nextEnv.DB_NAME) {
    const port = nextEnv.DB_PORT || "3306";
    const pass = nextEnv.DB_PASS ? `:${encodeURIComponent(nextEnv.DB_PASS)}` : "";
    const user = encodeURIComponent(nextEnv.DB_USER);
    const host = nextEnv.DB_HOST;
    const dbName = nextEnv.DB_NAME;
    nextEnv.DATABASE_URL = `mysql://${user}${pass}@${host}:${port}/${dbName}`;
  }

  // Construct REDIS_URL from Upstash REST URL and token ONLY if standard REDIS_URL is not explicitly set
  if (
    !nextEnv.REDIS_URL &&
    nextEnv.UPSTASH_REDIS_REST_URL &&
    nextEnv.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const parsedUrl = new URL(nextEnv.UPSTASH_REDIS_REST_URL);
      const host = parsedUrl.hostname;
      nextEnv.REDIS_URL = `rediss://default:${nextEnv.UPSTASH_REDIS_REST_TOKEN}@${host}:6379`;
    } catch {
      // ignore parse error, fallback to REDIS_URL
    }
  }

  return {
    ...nextEnv,
    SPACES_ENDPOINT: nextEnv.SPACES_ENDPOINT || nextEnv.DO_SPACES_ENDPOINT,
    SPACES_REGION: nextEnv.SPACES_REGION || nextEnv.DO_SPACES_REGION,
    SPACES_BUCKET: nextEnv.SPACES_BUCKET || nextEnv.DO_SPACES_BUCKET,
    SPACES_ACCESS_KEY: nextEnv.SPACES_ACCESS_KEY || nextEnv.DO_SPACES_KEY,
    SPACES_SECRET_KEY: nextEnv.SPACES_SECRET_KEY || nextEnv.DO_SPACES_SECRET,
    SPACES_CDN_ENDPOINT: nextEnv.SPACES_CDN_ENDPOINT || nextEnv.DO_SPACES_CDN_ENDPOINT,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) {
    return cached;
  }

  const normalized = normalizeEnv(env);
  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const data = parsed.data;
  const config: AppConfig = {
    ...data,
    isProd: data.NODE_ENV === "production",
    isDev: data.NODE_ENV === "development",
    storageEnabled: Boolean(
      data.SPACES_ENDPOINT &&
        data.SPACES_BUCKET &&
        data.SPACES_ACCESS_KEY &&
        data.SPACES_SECRET_KEY,
    ),
    googleOAuthEnabled: Boolean(data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET),
    aiEnabled: Boolean(data.AI_API_KEY && !data.AI_API_KEY.includes("your_openai")),
    smtpEnabled: Boolean(data.SMTP_HOST && data.SMTP_USER && data.SMTP_PASS),
    upstashEnabled: Boolean(data.UPSTASH_REDIS_REST_URL && data.UPSTASH_REDIS_REST_TOKEN),
  };

  if (env === process.env) {
    cached = config;
  }
  return config;
}

export function resetConfigCache(): void {
  cached = null;
}

export { envSchema };
