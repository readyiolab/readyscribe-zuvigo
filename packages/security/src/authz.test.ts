import { describe, expect, it } from "vitest";
import { WorkspaceRole } from "@zuvigo/types";
import { AuthzService } from "./authz.js";

const authz = new AuthzService();

describe("AuthzService", () => {
  it("gives OWNER all permissions including destroy", () => {
    expect(authz.can(WorkspaceRole.OWNER, "workspace.destroy")).toBe(true);
    expect(authz.can(WorkspaceRole.OWNER, "billing.transfer")).toBe(true);
    expect(authz.can(WorkspaceRole.OWNER, "capture.start")).toBe(true);
  });

  it("denies ADMIN destroy and billing transfer", () => {
    expect(authz.can(WorkspaceRole.ADMIN, "workspace.destroy")).toBe(false);
    expect(authz.can(WorkspaceRole.ADMIN, "billing.transfer")).toBe(false);
    expect(authz.can(WorkspaceRole.ADMIN, "member.manage")).toBe(true);
  });

  it("VIEWER is read-only", () => {
    expect(authz.can(WorkspaceRole.VIEWER, "document.read")).toBe(true);
    expect(authz.can(WorkspaceRole.VIEWER, "document.edit")).toBe(false);
    expect(authz.can(WorkspaceRole.VIEWER, "capture.start")).toBe(false);
  });

  it("MEMBER can edit own documents only", () => {
    expect(authz.canMutateDocument(WorkspaceRole.MEMBER, "document.edit", true)).toBe(true);
    expect(authz.canMutateDocument(WorkspaceRole.MEMBER, "document.edit", false)).toBe(false);
    expect(authz.canMutateDocument(WorkspaceRole.MEMBER, "document.share", true)).toBe(false);
  });

  it("EDITOR can edit any document", () => {
    expect(authz.canMutateDocument(WorkspaceRole.EDITOR, "document.edit", false)).toBe(true);
    expect(authz.canMutateDocument(WorkspaceRole.EDITOR, "document.share", false)).toBe(true);
  });
});
