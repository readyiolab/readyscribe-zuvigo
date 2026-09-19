"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LinkIcon,
  Loader2Icon,
  LockIcon,
  CalendarIcon,
  Share2Icon,
  Trash2Icon,
  CodeIcon,
} from "lucide-react";

type ShareLinkRow = {
  id: string;
  publicId: string;
  visibility: string;
  hasPassword: boolean;
  expiresAt: string | null;
  urlPath: string;
};

type Props = {
  documentId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
};

export function ShareDialog({
  documentId,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === "boolean";
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (setControlledOpen ?? (() => {})) : setInternalOpen;
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [visibility, setVisibility] = useState<"ANYONE_WITH_LINK" | "WORKSPACE">(
    "ANYONE_WITH_LINK",
  );
  const [password, setPassword] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/v1/share-links?documentId=${encodeURIComponent(documentId)}`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.links)) {
      setLinks(data.links);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  function fullUrl(path: string) {
    return origin ? `${origin}${path}` : path;
  }

  async function createLink() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        documentId,
        visibility,
      };
      if (password.trim().length >= 4) body.password = password.trim();
      const days = Number(expiresInDays);
      if (Number.isFinite(days) && days > 0) {
        const expires = new Date();
        expires.setDate(expires.getDate() + days);
        body.expiresAt = expires.toISOString();
      }
      const res = await fetch("/api/v1/share-links", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      setPassword("");
      setExpiresInDays("");
      await refresh();
      if (data.urlPath) {
        await navigator.clipboard.writeText(fullUrl(data.urlPath));
        setCopiedId(data.id ?? "new");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyLink(link: ShareLinkRow) {
    await navigator.clipboard.writeText(fullUrl(link.urlPath));
    setCopiedId(link.id);
    setCopiedEmbed(false);
  }

  async function copyEmbed(link: ShareLinkRow) {
    const src = fullUrl(`/s/${link.publicId}/embed`);
    const snippet = `<iframe src="${src}" width="100%" height="800" style="border:0;border-radius:8px;" allowfullscreen></iframe>`;
    await navigator.clipboard.writeText(snippet);
    setCopiedEmbed(true);
    setCopiedId(null);
  }

  async function revoke(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/share-links/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const active = links[0] ?? null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger !== undefined ? (
        trigger ? (
          <SheetTrigger render={trigger as any} />
        ) : null
      ) : (
        <SheetTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Share2Icon className="h-3.5 w-3.5" />
              <span>Share</span>
            </Button>
          }
        />
      )}
      <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border/80 px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Share2Icon className="h-4 w-4" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold text-foreground">Share guide</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
                Create a link others can open. Copy in one click.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          {active ? (
            <div className="space-y-3.5 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Active link
                  </span>
                </div>
                <Badge variant="secondary" className="px-2 py-0.5 text-[11px] font-normal">
                  {active.visibility === "WORKSPACE" ? "Workspace only" : "Public"}
                </Badge>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 p-1.5 pl-3">
                <GlobeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 select-all truncate font-mono text-xs text-foreground">
                  {fullUrl(active.urlPath)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyLink(active)}
                  className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                >
                  {copiedId === active.id ? (
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

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {active.hasPassword ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                    <LockIcon className="h-3 w-3" /> Password protected
                  </span>
                ) : null}
                {active.expiresAt ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                    <CalendarIcon className="h-3 w-3" /> Expires{" "}
                    {new Date(active.expiresAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-[11px]">Never expires</span>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border/60 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  nativeButton={false}
                  render={<a href={active.urlPath} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                  Open preview
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={loading}
                  onClick={() => revoke(active.id)}
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                  Revoke
                </Button>
              </div>

              {active.visibility === "ANYONE_WITH_LINK" && !active.hasPassword ? (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <CodeIcon className="h-3.5 w-3.5" /> Embed in website
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => void copyEmbed(active)}
                    >
                      {copiedEmbed ? (
                        <>
                          <CheckIcon className="h-3 w-3 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon className="h-3 w-3" />
                          <span>Copy embed</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="break-all rounded-md border border-border/40 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {`<iframe src="${fullUrl(`/s/${active.publicId}/embed`)}" …>`}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Embed requires “Anyone with the link” and no password.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/30 p-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GlobeIcon className="h-4 w-4" />
              </div>
              <div className="text-xs">
                <p className="font-medium text-foreground">No active share link</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Configure the access options below to generate a shareable link.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {active ? "Generate new link" : "Link settings"}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="share-visibility" className="text-xs font-medium text-foreground">
                Who can view
              </Label>
              <select
                id="share-visibility"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as "ANYONE_WITH_LINK" | "WORKSPACE")
                }
              >
                <option value="ANYONE_WITH_LINK">Anyone with the link</option>
                <option value="WORKSPACE">Workspace members only</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="share-password" className="text-xs font-medium text-foreground">
                  Password <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="share-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min 4 characters"
                  className="h-9 text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="share-expires" className="text-xs font-medium text-foreground">
                  Expires in days <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="share-expires"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="Never"
                  className="h-9 text-sm"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                />
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <SheetFooter className="mt-auto shrink-0 border-t border-border/80 bg-muted/10 px-6 py-4">
          <Button
            onClick={createLink}
            disabled={loading}
            className="h-9 w-full gap-2 text-sm font-medium shadow-xs"
          >
            {loading ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin" />
                <span>Creating link…</span>
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4" />
                <span>{active ? "Create & copy new link" : "Create & copy link"}</span>
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
