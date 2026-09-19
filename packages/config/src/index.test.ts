import { describe, expect, it, afterEach } from "vitest";
import { loadConfig, resetConfigCache } from "./index.js";

describe("loadConfig", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("fails fast when required secrets are missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid environment configuration/);
  });

  it("loads a valid config", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "mysql://user:pass@localhost:3306/zuvigo",
      AUTH_SECRET: "a".repeat(32),
      REDIS_URL: "redis://localhost:6379",
    } as NodeJS.ProcessEnv);

    expect(config.DATABASE_URL).toContain("mysql://");
    expect(config.storageEnabled).toBe(false);
    expect(config.aiEnabled).toBe(false);
  });

  it("accepts DO_SPACES_* aliases", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "mysql://user:pass@localhost:3306/zuvigo",
      AUTH_SECRET: "a".repeat(32),
      DO_SPACES_ENDPOINT: "https://blr1.digitaloceanspaces.com",
      DO_SPACES_REGION: "blr1",
      DO_SPACES_BUCKET: "igrowbig",
      DO_SPACES_KEY: "key",
      DO_SPACES_SECRET: "secret",
    } as NodeJS.ProcessEnv);

    expect(config.storageEnabled).toBe(true);
    expect(config.SPACES_BUCKET).toBe("igrowbig");
    expect(config.SPACES_ACCESS_KEY).toBe("key");
    expect(config.SPACES_REGION).toBe("blr1");
  });
});
