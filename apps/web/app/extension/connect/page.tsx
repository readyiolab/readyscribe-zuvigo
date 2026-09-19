import { Suspense } from "react";
import Link from "next/link";
import { ExtensionConnectClient } from "./connect-client";
import { ButtonLink } from "@/components/button-link";

export default function ExtensionConnectPage() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(800px 420px at 50% -15%, oklch(0.94 0.02 85 / 0.75), transparent 55%), oklch(0.985 0.004 95)",
        }}
      />
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-6">
        <Link href="/dashboard" className="font-heading text-lg font-semibold tracking-tight">
          Zuvigo
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-16">
        <div className="space-y-6 rounded-xl border border-border bg-card p-6">
          <div className="space-y-2">
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Connect Chrome extension
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Links your signed-in account to the capture side panel. Browser cookies cannot cross
              from the extension origin to localhost.
            </p>
          </div>
          <Suspense
            fallback={<p className="text-sm text-muted-foreground">Preparing connection…</p>}
          >
            <ExtensionConnectClient />
          </Suspense>
        </div>
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/dashboard" variant="ghost" size="sm">
            Back to dashboard
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
