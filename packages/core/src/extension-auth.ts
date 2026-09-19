import { randomBytes } from "node:crypto";
import { prisma } from "@zuvigo/db";

const TOKEN_TTL_DAYS = 90;
const HANDOFF_TTL_MS = 10 * 60 * 1000;

export function generateExtensionTokenValue(): string {
  return `zvext_${randomBytes(24).toString("hex")}`;
}

export async function createExtensionToken(userId: string, label = "Chrome extension") {
  if (!prisma.extensionToken) {
    throw new Error(
      "prisma.extensionToken is missing — regenerate the Prisma client and restart the server",
    );
  }

  const token = generateExtensionTokenValue();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL_DAYS);

  return prisma.extensionToken.create({
    data: { token, userId, label, expiresAt },
  });
}

export async function createHandoff(handoffId: string) {
  return prisma.extensionHandoff.upsert({
    where: { id: handoffId },
    create: {
      id: handoffId,
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    },
    update: {
      expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
      userId: null,
      token: null,
    },
  });
}

export async function completeHandoff(handoffId: string, userId: string) {
  const handoff = await prisma.extensionHandoff.findUnique({ where: { id: handoffId } });
  if (!handoff || handoff.expiresAt < new Date()) {
    return null;
  }
  if (handoff.token) {
    return handoff;
  }

  const ext = await createExtensionToken(userId, "Chrome extension handoff");
  return prisma.extensionHandoff.update({
    where: { id: handoffId },
    data: { userId, token: ext.token },
  });
}

export async function getHandoffToken(handoffId: string) {
  const handoff = await prisma.extensionHandoff.findUnique({ where: { id: handoffId } });
  if (!handoff || handoff.expiresAt < new Date() || !handoff.token) {
    return null;
  }
  return handoff.token;
}

export async function resolveExtensionBearerToken(token: string) {
  const row = await prisma.extensionToken.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!row || row.revokedAt || row.expiresAt < new Date() || row.user.deletedAt) {
    return null;
  }
  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      image: row.user.image,
      emailVerified: row.user.emailVerified,
    },
  };
}
