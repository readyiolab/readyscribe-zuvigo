import { requireSession, jsonOk, handleApiError, getRequestId } from "@/lib/api";
import { prisma } from "@zuvigo/db";
import { AppError } from "@zuvigo/security";
import { randomBytes } from "node:crypto";

const TOKEN_TTL_DAYS = 90;

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await requireSession(req);
    const userId = session.user?.id;
    if (!userId) {
      throw new AppError({
        code: "UNAUTHORIZED",
        statusCode: 401,
        message: "Missing user id on session",
      });
    }

    if (!prisma.extensionToken) {
      throw new AppError({
        code: "INTERNAL_ERROR",
        statusCode: 500,
        message: "prisma.extensionToken missing",
        safeMessage:
          "Prisma client is outdated. Stop the web app, run `pnpm --filter @zuvigo/db generate`, then restart.",
      });
    }

    const token = `zvext_${randomBytes(24).toString("hex")}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL_DAYS);

    try {
      const row = await prisma.extensionToken.create({
        data: {
          token,
          userId,
          label: "Manual settings token",
          expiresAt,
        },
      });

      return jsonOk({
        token: row.token,
        expiresAt: row.expiresAt.toISOString(),
        label: row.label,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        typeof err === "object" && err && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;

      if (code === "P2021" || /does not exist/i.test(message)) {
        throw new AppError({
          code: "INTERNAL_ERROR",
          statusCode: 500,
          message,
          safeMessage:
            "Extension token table is missing. Run `pnpm --filter @zuvigo/db run migrate:deploy`, then restart.",
        });
      }

      if (code === "P2003") {
        throw new AppError({
          code: "INTERNAL_ERROR",
          statusCode: 500,
          message,
          safeMessage: "Your user record could not be linked. Sign out and sign in again.",
        });
      }

      throw new AppError({
        code: "INTERNAL_ERROR",
        statusCode: 500,
        message,
        safeMessage: message.slice(0, 280) || "Could not generate extension token",
      });
    }
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
