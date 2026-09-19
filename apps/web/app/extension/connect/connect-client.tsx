"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/button-link";

export function ExtensionConnectClient() {
  const params = useSearchParams();
  const handoffId = params.get("handoff");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!handoffId) return;
    let cancelled = false;

    (async () => {
      setStatus("working");
      try {
        const res = await fetch("/api/v1/extension/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ handoffId, action: "complete" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error?.message ?? `Failed (${res.status})`);
        }
        if (!cancelled) {
          setStatus("done");
          setMessage("Extension connected. You can close this tab and return to the side panel.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage((err as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handoffId]);

  if (!handoffId) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Open the Zuvigo Capture side panel and click{" "}
          <strong className="font-medium text-foreground">Connect extension</strong>. That opens
          this page automatically with a secure one-time link.
        </p>
        <ButtonLink href="/dashboard/settings" variant="outline">
          Generate token instead
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status === "working" && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Connecting your Chrome extension…
        </div>
      )}
      {status === "done" && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}
      {status === "error" && (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p>{message}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/login" size="sm" variant="outline">
              Sign in
            </ButtonLink>
            <ButtonLink href="/dashboard/settings" size="sm" variant="outline">
              Token fallback
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
