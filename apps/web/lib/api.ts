import { NextResponse } from "next/server";
import { AppError, ValidationError } from "@zuvigo/security";
import { getSessionFromHeaders } from "@zuvigo/auth";
import { resolveExtensionBearerToken } from "@zuvigo/core";
import { createLogger, withRequestContext } from "@zuvigo/logger";
import { ZodError, type ZodSchema } from "zod";

const baseLogger = createLogger({ name: "api" });

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function handleApiError(err: unknown, requestId: string) {
  const log = withRequestContext(baseLogger, { requestId });

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: err.flatten(),
        },
      },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      log.error({ err }, err.message);
    } else {
      log.warn({ code: err.code, details: err.details }, err.safeMessage);
    }
    return NextResponse.json(err.toJSON(), {
      status: err.statusCode,
      headers: { "x-request-id": requestId },
    });
  }

  log.error({ err }, "Unhandled API error");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

export async function requireSession(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const ext = await resolveExtensionBearerToken(token);
    if (ext) {
      return {
        user: ext.user,
        session: { id: `ext:${token.slice(0, 12)}` },
      };
    }
  }

  const session = await getSessionFromHeaders(req.headers);
  if (!session?.user) {
    throw new AppError({
      code: "UNAUTHORIZED",
      statusCode: 401,
      message: "Unauthorized",
    });
  }
  return session;
}

export function parseBody<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.flatten());
  }
  return result.data;
}

export { baseLogger };
