import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export {
  PrismaClient,
  Prisma,
  WorkspaceRole,
  DocumentKind,
  DocumentStatus,
  PageBlockType,
  CaptureSessionStatus,
  CaptureClientType,
  CaptureEventType,
  CaptureAssetKind,
  CaptureAssetStatus,
  ShareVisibility,
  PlanCode,
  SubscriptionStatus,
  JobRunStatus,
} from "@prisma/client";

export type {
  User,
  Session,
  Account,
  Workspace,
  WorkspaceMember,
  Document,
  CaptureSession,
  ExtensionToken,
  ExtensionHandoff,
} from "@prisma/client";

export default prisma;
