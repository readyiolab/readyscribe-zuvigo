import type { Permission } from "@zuvigo/types";
import { WorkspaceRole } from "@zuvigo/types";
import { ForbiddenError } from "./errors.js";

const ALL: Permission[] = [
  "workspace.manage",
  "workspace.invite",
  "workspace.destroy",
  "billing.manage",
  "billing.transfer",
  "document.create",
  "document.read",
  "document.edit",
  "document.delete",
  "document.share",
  "capture.start",
  "member.read",
  "member.manage",
];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  [WorkspaceRole.OWNER]: ALL,
  [WorkspaceRole.ADMIN]: ALL.filter(
    (p) => p !== "workspace.destroy" && p !== "billing.transfer",
  ),
  [WorkspaceRole.EDITOR]: [
    "document.create",
    "document.read",
    "document.edit",
    "document.delete",
    "document.share",
    "capture.start",
    "member.read",
  ],
  [WorkspaceRole.MEMBER]: [
    "document.create",
    "document.read",
    "document.edit",
    "document.delete",
    "capture.start",
    "member.read",
  ],
  [WorkspaceRole.VIEWER]: ["document.read", "member.read"],
};

export class AuthzService {
  getPermissions(role: WorkspaceRole): readonly Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  can(role: WorkspaceRole, permission: Permission): boolean {
    return this.getPermissions(role).includes(permission);
  }

  assertCan(role: WorkspaceRole, permission: Permission): void {
    if (!this.can(role, permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
  }

  /**
   * MEMBER may only edit/delete documents they created.
   * Higher roles can edit any document in the workspace.
   */
  canMutateDocument(
    role: WorkspaceRole,
    permission: Extract<Permission, "document.edit" | "document.delete" | "document.share">,
    isCreator: boolean,
  ): boolean {
    if (!this.can(role, permission)) return false;
    if (role === WorkspaceRole.MEMBER && !isCreator) return false;
    if (permission === "document.share" && role === WorkspaceRole.MEMBER) return false;
    return true;
  }

  assertMutateDocument(
    role: WorkspaceRole,
    permission: Extract<Permission, "document.edit" | "document.delete" | "document.share">,
    isCreator: boolean,
  ): void {
    if (!this.canMutateDocument(role, permission, isCreator)) {
      throw new ForbiddenError(`Cannot ${permission} this document`);
    }
  }

  assertWorkspaceAccess(role: WorkspaceRole, permission: Permission): void {
    this.assertCan(role, permission);
  }
}

export const authz = new AuthzService();
