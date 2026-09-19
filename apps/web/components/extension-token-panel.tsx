"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonLink } from "@/components/button-link";
import {
  LaptopIcon,
  ExternalLinkIcon,
  KeyIcon,
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  ShieldCheckIcon,
} from "lucide-react";

export function ExtensionTokenPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/v1/extension/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      if (!data.token) {
        throw new Error("Server returned no token");
      }
      setToken(data.token);
      setExpiresAt(data.expiresAt ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/20 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LaptopIcon className="h-4 w-4" />
        </div>
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-foreground">Browser Extension Integration</p>
          <p className="text-muted-foreground leading-relaxed">
            Connect the ReadyScribe Chrome extension to capture workflows with automated click detection and screenshots.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <ButtonLink href="/extension/connect" size="sm" className="gap-1.5 shadow-xs">
          <ExternalLinkIcon className="h-3.5 w-3.5" />
          <span>One-Click Connect</span>
        </ButtonLink>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={generate}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <>
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              <span>Generating…</span>
            </>
          ) : (
            <>
              <KeyIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Generate Manual Token</span>
            </>
          )}
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {token ? (
        <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheckIcon className="h-4 w-4 text-primary" />
              <span>Extension Pairing Token (single use)</span>
            </span>
            {expiresAt ? (
              <span className="text-[10px] text-muted-foreground">
                Expires {new Date(expiresAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Paste this token into the ReadyScribe Chrome Extension under <strong>Advanced Settings</strong>.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Input
              id="ext-token"
              readOnly
              value={token}
              className="h-8 font-mono text-xs bg-background select-all"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={copy}
              className="h-8 text-xs gap-1.5 shrink-0"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
