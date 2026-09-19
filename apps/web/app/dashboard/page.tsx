import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { listWorkspacesForUser, listDocuments } from "@zuvigo/core";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Content } from "@/components/content";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/button-link";
import { Badge } from "@/components/ui/badge";
import { NewPageButton } from "@/components/new-page-button";
import { ImportDocumentButton } from "@/components/import-document-button";
import { DocumentCard } from "@/components/document-card";
import {
  getActiveWorkspaceIdFromCookie,
  resolveActiveWorkspace,
} from "@/lib/workspace";
import {
  FileTextIcon,
  LayersIcon,
  VideoIcon,
  SettingsIcon,
  ArrowUpRightIcon,
  SparklesIcon,
  ClockIcon,
} from "lucide-react";

type Props = {
  searchParams?: Promise<{ view?: string; kind?: string; workspaceId?: string }>;
};

export default async function DashboardPage(props: Props) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const session = await requirePageSession();
  const workspaces = await listWorkspacesForUser(session.user.id);
  const cookieWorkspaceId = await getActiveWorkspaceIdFromCookie();
  const workspace = resolveActiveWorkspace(
    workspaces,
    searchParams.workspaceId || cookieWorkspaceId,
  );

  const isHome = !searchParams.view && !searchParams.kind;
  const isSaved = searchParams.view === "saved";
  const isCreatedByMe = searchParams.view === "me";

  const docs = workspace
    ? await listDocuments({
        userId: session.user.id,
        workspaceId: workspace.id,
        limit: 30,
        kind: searchParams.kind === "SCRIBE" ? "SCRIBE" : undefined,
        savedOnly: isSaved,
        createdByMe: isCreatedByMe,
      })
    : { items: [], nextCursor: null };

  const pageTitle = isSaved
    ? "Saved Guides"
    : isCreatedByMe
      ? "Created by Me"
      : searchParams.kind === "SCRIBE"
        ? "Scribes"
        : isHome
          ? "Home"
          : "All Documents";

  return (
    <AppShell
      email={session.user.email}
      initialWorkspaces={workspaces}
      initialActiveWorkspaceId={workspace?.id ?? null}
    >
      <PageHeader
        title={pageTitle}
        description={workspace ? `${workspace.name} · ${docs.items.length} ${docs.items.length === 1 ? "document" : "documents"}` : "No workspace yet"}
        actions={
          <>
            <ButtonLink href="/dashboard/settings" variant="outline" size="sm" className="gap-1.5">
              <SettingsIcon className="h-3.5 w-3.5" />
              <span>Settings</span>
            </ButtonLink>
            {workspace ? <ImportDocumentButton workspaceId={workspace.id} /> : null}
            {workspace ? <NewPageButton workspaceId={workspace.id} /> : null}
            <ButtonLink href="/capture" size="sm" className="gap-1.5 shadow-xs">
              <VideoIcon className="h-3.5 w-3.5" />
              <span>New capture</span>
            </ButtonLink>
          </>
        }
      />

      <Content className="py-6 space-y-8">
        {/* IMAGE 1: "Get started with Scribe" 3-step onboarding cards */}
        {isHome && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Get started with Scribe
            </h2>

            <div className="grid gap-5 md:grid-cols-3">
              {/* Step 1: Get extension */}
              <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-border">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                      1
                    </span>
                  </div>

                  {/* Browser Mockup */}
                  <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2 text-muted-foreground">
                      <div className="flex items-center gap-1 text-[11px]">
                        <span>←</span>
                        <span>→</span>
                        <span>↻</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-slate-900 text-white font-bold text-[10px]">
                          S
                        </div>
                        <span className="text-xs">🧩</span>
                      </div>
                    </div>
                    <div className="mt-4 h-12 flex items-center justify-center rounded-lg bg-background/60 border border-border/40 text-[11px] text-muted-foreground">
                      chrome-extension://zuvigo
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <ButtonLink
                    href="/dashboard/settings#extension"
                    variant="outline"
                    className="w-full justify-center gap-2 rounded-xl text-xs font-semibold"
                  >
                    <span>🌐</span>
                    <span>Get extension</span>
                  </ButtonLink>

                  <div className="text-center">
                    <Link
                      href="/capture"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Need desktop capabilities?
                    </Link>
                    <p className="mt-1 text-[11.5px] text-muted-foreground/80">
                      You&apos;ll need the extension to use Scribe.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 2: Create your first Scribe */}
              <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-border">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                      2
                    </span>
                  </div>

                  {/* Guide Process Mockup */}
                  <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3 shadow-2xs">
                    <div className="font-semibold text-xs text-foreground">How to do anything</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Created by you</div>

                    <div className="mt-3 relative rounded-lg border border-border/60 bg-background p-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">1</span>
                        <span>Click here to...</span>
                      </div>
                      {/* Scribe Orange Click Circle Indicator */}
                      <div className="absolute right-4 top-2 h-7 w-7 rounded-full bg-orange-500/25 border-2 border-orange-500 flex items-center justify-center animate-pulse">
                        <span className="text-xs">👆</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <ButtonLink
                    href="/capture"
                    variant="outline"
                    className="w-full justify-center gap-2 rounded-xl text-xs font-semibold"
                  >
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-foreground/50">
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                    </span>
                    <span>Create your first Scribe</span>
                  </ButtonLink>

                  <p className="text-center text-[11.5px] text-muted-foreground/80">
                    Capture a process from start to finish
                  </p>
                </div>
              </div>

              {/* Step 3: Share your Scribe */}
              <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-border">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 dark:bg-white text-xs font-bold text-white dark:text-slate-900">
                      3
                    </span>
                  </div>

                  {/* Share Popover Mockup */}
                  <div className="mt-4 relative rounded-xl border border-border/70 bg-muted/20 p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🚀</span>
                        <div className="text-xs font-semibold">Your Scribe</div>
                      </div>
                      <div className="text-[10px] text-muted-foreground">12 Steps</div>
                    </div>

                    {/* Dark floating share menu */}
                    <div className="mt-2.5 rounded-lg bg-slate-900 text-white p-2 text-[11px] shadow-lg">
                      <div className="font-semibold text-sky-400">Share</div>
                      <div className="text-[10px] text-slate-400">Move to team</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <ButtonLink
                    href="/dashboard"
                    className="w-full justify-center gap-2 rounded-xl text-xs font-semibold bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <span>🔗</span>
                    <span>Share your Scribe</span>
                  </ButtonLink>

                  <p className="text-center text-[11px] text-muted-foreground/80 leading-relaxed">
                    Finally, try sharing a Scribe! With <u>copy link</u>, <u>embed</u>, and <u>exports</u>, Scribe offers many ways to collaborate.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
        {/* Documents Section */}
        {docs.items.length === 0 && isSaved ? (
          <EmptyState
            title="No saved guides"
            description="Guides you bookmark will appear here for quick access."
            action={
              <ButtonLink href="/dashboard" size="sm" className="gap-2 shadow-xs">
                <span>Browse guides</span>
              </ButtonLink>
            }
          />
        ) : docs.items.length === 0 && !isHome ? (
          <EmptyState
            title="No guides yet"
            description="Capture a browser workflow and ReadyScribe will turn it into an editable step-by-step guide."
            action={
              <ButtonLink href="/capture" size="lg" className="gap-2 shadow-xs">
                <SparklesIcon className="h-4 w-4" />
                <span>Capture a Scribe</span>
              </ButtonLink>
            }
          />
        ) : docs.items.length > 0 ? (
          <div className="space-y-4">
            {isHome && (
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                Recent Documents
              </h3>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.items.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  defaultWorkspaceName={workspace?.name || "Readyio Team"}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </Content>
    </AppShell>
  );
}
