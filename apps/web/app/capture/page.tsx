import { getOptionalPageSession } from "@/lib/session";
import { listWorkspacesForUser } from "@zuvigo/core";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Content } from "@/components/content";
import { ButtonLink } from "@/components/button-link";
import { ImportDocumentButton } from "@/components/import-document-button";
import {
  getActiveWorkspaceIdFromCookie,
  resolveActiveWorkspace,
} from "@/lib/workspace";

export default async function CapturePage() {
  const session = await getOptionalPageSession();
  const workspaces = session ? await listWorkspacesForUser(session.user.id) : [];
  const cookieWorkspaceId = session ? await getActiveWorkspaceIdFromCookie() : null;
  const workspace = resolveActiveWorkspace(workspaces, cookieWorkspaceId);

  const body = (
    <>
      <PageHeader
        title="New capture"
        description="Choose a browser tab in the extension, then Zuvigo records your clicks as a guide"
        actions={
          session ? (
            <div className="flex flex-wrap gap-2">
              {workspace ? <ImportDocumentButton workspaceId={workspace.id} /> : null}
              <ButtonLink href="/dashboard" variant="outline">
                Dashboard
              </ButtonLink>
            </div>
          ) : (
            <ButtonLink href="/login">Sign in</ButtonLink>
          )
        }
      />

      <Content narrow className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold tracking-tight">How capture starts</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Capture Options lives in the Chrome extension (real open tabs). Clicking{" "}
            <strong className="font-medium text-foreground">New capture</strong> here does not
            start recording — open the extension first.
          </p>
          <ol className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted-foreground">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                1
              </span>
              <span>
                Click the <strong className="font-medium text-foreground">ZuvigoScribe</strong>{" "}
                extension icon in Chrome
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                2
              </span>
              <span>
                In <strong className="font-medium text-foreground">Capture Options</strong>, search
                open tabs or click <strong className="font-medium text-foreground">+ New Tab</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                3
              </span>
              <span>
                Zuvigo opens that tab, waits for it to load, then starts recording — Complete in the
                side panel when done
              </span>
            </li>
          </ol>
        </section>

        {session && workspaces.length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold tracking-tight">Your workspaces</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Connect the extension once, then pick a workspace in the side panel before New
              Capture.
            </p>
            <ul className="mt-3 space-y-2">
              {workspaces.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="text-sm font-medium">{w.name}</span>
                  <span className="text-caption">{w.role}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold tracking-tight">First-time setup</h2>
          <ol className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted-foreground">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                1
              </span>
              <span>
                Load the unpacked extension from{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  apps/extension/dist
                </code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                2
              </span>
              <span>
                Open the side panel and click{" "}
                <strong className="font-medium text-foreground">Connect extension</strong> while
                signed in here
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
                3
              </span>
              <span>
                Select a workspace, then use the toolbar icon (or side panel{" "}
                <strong className="font-medium text-foreground">New Capture</strong>) for Capture
                Options
              </span>
            </li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/extension/connect">Open connect page</ButtonLink>
            <ButtonLink href="/dashboard/settings" variant="outline">
              Extension token (fallback)
            </ButtonLink>
          </div>
        </section>
      </Content>
    </>
  );

  if (session) {
    return (
      <AppShell
        email={session.user.email}
        initialWorkspaces={workspaces}
        initialActiveWorkspaceId={workspace?.id ?? null}
      >
        {body}
      </AppShell>
    );
  }

  return <div className="flex min-h-full flex-col bg-canvas">{body}</div>;
}
