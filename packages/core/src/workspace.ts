import { prisma, type WorkspaceRole } from "@zuvigo/db";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  authz,
} from "@zuvigo/security";
import type { CreateWorkspaceInput, CreateWorkspaceInviteInput, Permission } from "@zuvigo/types";
import { WorkspaceRole as Role } from "@zuvigo/types";
import { nanoid } from "nanoid";
import {
  createQueue,
  createRedisConnection,
  enqueueJob,
  QUEUE_NAMES,
} from "@zuvigo/queue";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export async function requireUser(userId: string | null | undefined) {
  if (!userId) throw new UnauthorizedError();
  return userId;
}

export async function getMembership(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
  if (!membership || membership.workspace.deletedAt) {
    throw new ForbiddenError("Not a member of this workspace");
  }
  return membership;
}

export async function assertPermission(
  userId: string,
  workspaceId: string,
  permission: Permission,
) {
  const membership = await getMembership(userId, workspaceId);
  authz.assertCan(membership.role as Role, permission);
  return membership;
}

export async function listWorkspacesForUser(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role as Role,
    createdAt: m.workspace.createdAt.toISOString(),
  }));
}

export async function createWorkspace(userId: string, input: CreateWorkspaceInput) {
  const base = input.slug ?? slugify(input.name);
  let slug = base;
  let i = 0;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${base}-${i}`;
  }

  const freePlan = await prisma.plan.findFirst({ where: { code: "FREE" } });
  if (!freePlan) throw new ValidationError("FREE plan not seeded");

  const workspace = await prisma.workspace.create({
    data: {
      name: input.name,
      slug,
      ownerUserId: userId,
      members: {
        create: { userId, role: "OWNER" },
      },
      subscription: {
        create: { planId: freePlan.id, status: "ACTIVE" },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      actorUserId: userId,
      action: "WORKSPACE_CREATED",
      resourceType: "workspace",
      resourceId: workspace.id,
    },
  });

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role: Role.OWNER,
    createdAt: workspace.createdAt.toISOString(),
  };
}

export async function getWorkspaceForUser(userId: string, workspaceId: string) {
  const membership = await getMembership(userId, workspaceId);
  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    role: membership.role as WorkspaceRole,
    createdAt: membership.workspace.createdAt.toISOString(),
  };
}

export async function listWorkspaceMembers(userId: string, workspaceId: string) {
  await assertPermission(userId, workspaceId, "member.read");
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    email: m.user.email,
    name: m.user.name,
    role: m.role as Role,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function listWorkspaceInvites(userId: string, workspaceId: string) {
  await assertPermission(userId, workspaceId, "member.manage");
  const invites = await prisma.workspaceInvite.findMany({
    where: {
      workspaceId,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  return invites.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role as Role,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    invitePath: `/invite/${inv.token}`,
  }));
}

export async function createWorkspaceInvite(
  userId: string,
  workspaceId: string,
  input: CreateWorkspaceInviteInput,
  opts?: { appOrigin?: string; redisUrl?: string },
) {
  await assertPermission(userId, workspaceId, "member.manage");

  const email = input.email.trim().toLowerCase();
  const role = input.role as WorkspaceRole;

  if (role === "OWNER") {
    throw new ValidationError("Cannot invite as OWNER");
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
    });
    if (existingMember) {
      throw new ValidationError("User is already a workspace member");
    }
  }

  await prisma.workspaceInvite.updateMany({
    where: {
      workspaceId,
      email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const token = nanoid(32);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId,
      email,
      role,
      token,
      invitedByUserId: userId,
      expiresAt,
    },
    include: { workspace: true },
  });

  const invitePath = `/invite/${token}`;
  const inviteUrl = opts?.appOrigin ? `${opts.appOrigin}${invitePath}` : invitePath;

  if (opts?.redisUrl) {
    try {
      const connection = createRedisConnection(opts.redisUrl);
      const queue = createQueue(QUEUE_NAMES.EMAIL, connection);
      await enqueueJob(queue, `workspace-invite-${invite.id}`, {
        workspaceId,
        entityId: invite.id,
        requestId: invite.id,
        metadata: {
          to: email,
          subject: `Join ${invite.workspace.name} on Zuvigo`,
          text: `You've been invited to ${invite.workspace.name} as ${role}.\n\nAccept: ${inviteUrl}\n\nThis link expires in 14 days.`,
        },
      });
      await connection.quit();
    } catch {
      // Email is best-effort; invite link still returned for copy
    }
  }

  await prisma.auditLog.create({
    data: {
      workspaceId,
      actorUserId: userId,
      action: "MEMBER_INVITED",
      resourceType: "workspace_invite",
      resourceId: invite.id,
      metadata: { email, role },
    },
  });

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role as Role,
    expiresAt: invite.expiresAt.toISOString(),
    invitePath,
    inviteUrl,
  };
}

export async function getWorkspaceInviteByToken(token: string) {
  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: { workspace: true },
  });
  if (!invite || invite.revokedAt || invite.acceptedAt) {
    throw new NotFoundError("Invite not found");
  }
  if (invite.expiresAt < new Date()) {
    throw new NotFoundError("Invite expired");
  }
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role as Role,
    workspaceId: invite.workspaceId,
    workspaceName: invite.workspace.name,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function acceptWorkspaceInvite(userId: string, token: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: { workspace: true },
  });
  if (!invite || invite.revokedAt || invite.acceptedAt) {
    throw new NotFoundError("Invite not found");
  }
  if (invite.expiresAt < new Date()) {
    throw new NotFoundError("Invite expired");
  }

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new ForbiddenError(`Sign in as ${invite.email} to accept this invite`);
  }

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
  });
  if (!existing) {
    await prisma.workspaceMember.create({
      data: {
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
      },
    });
  }

  await prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: invite.workspaceId,
      actorUserId: userId,
      action: "MEMBER_JOINED",
      resourceType: "workspace",
      resourceId: invite.workspaceId,
      metadata: { inviteId: invite.id, role: invite.role },
    },
  });

  return {
    workspaceId: invite.workspaceId,
    workspaceName: invite.workspace.name,
    role: invite.role as Role,
  };
}

export type WorkspaceBrandSettings = {
  logoUrl: string | null;
  clickColor: string;
  showBranding: boolean;
};

const DEFAULT_BRAND: WorkspaceBrandSettings = {
  logoUrl: null,
  clickColor: "#f43f5e",
  showBranding: true,
};

export function parseWorkspaceBrand(settings: unknown): WorkspaceBrandSettings {
  if (!settings || typeof settings !== "object") return { ...DEFAULT_BRAND };
  const s = settings as Record<string, unknown>;
  return {
    logoUrl: typeof s.logoUrl === "string" && s.logoUrl ? s.logoUrl : null,
    clickColor:
      typeof s.clickColor === "string" && /^#[0-9a-fA-F]{6}$/.test(s.clickColor)
        ? s.clickColor
        : DEFAULT_BRAND.clickColor,
    showBranding: s.showBranding !== false,
  };
}

export async function getWorkspaceBrand(userId: string, workspaceId: string) {
  const membership = await getMembership(userId, workspaceId);
  return parseWorkspaceBrand(membership.workspace.settings);
}

export async function updateWorkspaceBrand(
  userId: string,
  workspaceId: string,
  input: Partial<WorkspaceBrandSettings>,
) {
  await assertPermission(userId, workspaceId, "workspace.manage");

  const membership = await getMembership(userId, workspaceId);
  const current = parseWorkspaceBrand(membership.workspace.settings);
  const next: WorkspaceBrandSettings = {
    logoUrl: input.logoUrl !== undefined ? input.logoUrl : current.logoUrl,
    clickColor: input.clickColor ?? current.clickColor,
    showBranding:
      input.showBranding !== undefined ? input.showBranding : current.showBranding,
  };

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      settings: {
        ...((membership.workspace.settings as object) ?? {}),
        ...next,
      },
    },
  });

  return next;
}
