import { requirePageSession } from "@/lib/session";
import { listWorkspacesForUser } from "@zuvigo/core";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Content } from "@/components/content";
import { ExtensionTokenPanel } from "@/components/extension-token-panel";
import { WorkspaceInvitePanel } from "@/components/workspace-invite-panel";
import { WorkspaceBrandingPanel } from "@/components/workspace-branding-panel";
import { ButtonLink } from "@/components/button-link";
import {
  getActiveWorkspaceIdFromCookie,
  resolveActiveWorkspace,
} from "@/lib/workspace";
import {
  UserIcon,
  UsersIcon,
  PaletteIcon,
  LaptopIcon,
  ChevronLeftIcon,
  ShieldCheckIcon,
} from "lucide-react";

export default async function SettingsPage() {
  const session = await requirePageSession();
  const workspaces = await listWorkspacesForUser(session.user.id);
  const cookieWorkspaceId = await getActiveWorkspaceIdFromCookie();
  const active = resolveActiveWorkspace(workspaces, cookieWorkspaceId);
  const initial = (session.user.email || "U").charAt(0).toUpperCase();

  return (
    <AppShell
      email={session.user.email}
      initialWorkspaces={workspaces}
      initialActiveWorkspaceId={active?.id ?? null}
    >
      <PageHeader
        title="Settings"
        description="Account preferences, workspaces, team members, and branding."
        actions={
          <ButtonLink href="/dashboard" variant="outline" size="sm" className="gap-1.5">
            <ChevronLeftIcon className="h-4 w-4" />
            <span>Dashboard</span>
          </ButtonLink>
        }
      />

      <Content className="max-w-4xl py-8 space-y-8">
        {/* Account & Profile Card */}
        <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Account Profile</h2>
              <p className="text-xs text-muted-foreground">Your authenticated account credentials</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-base font-bold text-primary shadow-2xs">
                {initial}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{session.user.email}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <ShieldCheckIcon className="h-3.5 w-3.5" /> Active Session
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workspaces & Team Members */}
        <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UsersIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Workspaces & Team</h2>
              <p className="text-xs text-muted-foreground">
                Manage team members, roles, and pending invitations
              </p>
            </div>
          </div>

          {workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No workspaces found.</p>
          ) : (
            <div className="space-y-6 pt-1">
              {workspaces.map((w) => (
                <WorkspaceInvitePanel
                  key={w.id}
                  workspaceId={w.id}
                  workspaceName={w.name}
                  canManage={w.role === "OWNER" || w.role === "ADMIN"}
                />
              ))}
            </div>
          )}
        </section>

        {/* Branding & Export Styling */}
        <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PaletteIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Branding & Appearance</h2>
              <p className="text-xs text-muted-foreground">
                Custom logo, click highlight color, and shared guide styling
              </p>
            </div>
          </div>

          {workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No workspaces found.</p>
          ) : (
            <div className="space-y-6 pt-1">
              {workspaces.map((w) => (
                <div key={w.id} className="space-y-3">
                  <span className="text-xs font-semibold text-foreground">{w.name}</span>
                  <WorkspaceBrandingPanel
                    workspaceId={w.id}
                    canManage={w.role === "OWNER" || w.role === "ADMIN"}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Chrome Extension Integration */}
        <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-border/50 pb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LaptopIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Chrome Extension</h2>
              <p className="text-xs text-muted-foreground">
                Pair your desktop browser extension with your cloud workspace
              </p>
            </div>
          </div>

          <div className="pt-1">
            <ExtensionTokenPanel />
          </div>
        </section>
      </Content>
    </AppShell>
  );
}
