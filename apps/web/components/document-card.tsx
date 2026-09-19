"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { DocumentListItemDto } from "@zuvigo/types";
import { ShareDialog } from "@/components/share-dialog";
import {
  LinkIcon,
  BookmarkIcon,
  MoreHorizontalIcon,
  Share2Icon,
  UsersIcon,
  CopyIcon,
  Trash2Icon,
  CheckIcon,
  Loader2Icon,
  LayersIcon,
  FileTextIcon,
  EyeOffIcon,
  GlobeIcon,
  ClockIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type DocumentCardProps = {
  doc: DocumentListItemDto;
  defaultWorkspaceName?: string;
  onDeleted?: (id: string) => void;
  onDuplicated?: (newDoc: any) => void;
  onMoved?: (id: string) => void;
};

function formatRelativeTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    if (diffMins <= 1) return "Just now";
    return `${diffMins} minutes ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function DocumentCard({
  doc,
  defaultWorkspaceName = "Readyio Team",
  onDeleted,
  onDuplicated,
  onMoved,
}: DocumentCardProps) {
  const router = useRouter();
  const isScribe = doc.kind === "SCRIBE";
  const docUrl = isScribe ? `/scribes/${doc.id}` : `/documents/${doc.id}`;

  const [isSaved, setIsSaved] = useState(Boolean(doc.isSaved));
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Dialogs
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Workspaces for Move dialog
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Copy direct link to clipboard
  async function handleCopyLink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const fullUrl = `${window.location.origin}${docUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  // Toggle Saved / Unsaved status
  async function handleToggleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isSaving) return;

    const previous = isSaved;
    setIsSaved(!previous);
    setIsSaving(true);

    try {
      const res = await fetch(`/api/v1/documents/${doc.id}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (typeof data.isSaved === "boolean") {
          setIsSaved(data.isSaved);
        }
      } else {
        // Rollback
        setIsSaved(previous);
      }
    } catch {
      setIsSaved(previous);
    } finally {
      setIsSaving(false);
    }
  }

  // Duplicate document
  async function handleDuplicate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsDuplicating(true);

    try {
      const res = await fetch(`/api/v1/documents/${doc.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const newDoc = await res.json();
        onDuplicated?.(newDoc);
        router.refresh();
      }
    } finally {
      setIsDuplicating(false);
    }
  }

  // Fetch workspaces when Move dialog opens
  async function openMoveDialog(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsMoveOpen(true);
    setWorkspacesLoaded(false);
    setSelectedWorkspaceId("");
    try {
      const res = await fetch("/api/v1/workspaces", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setWorkspaces(data.items);
          const firstOther = data.items.find(
            (w: { id: string }) => w.id !== doc.workspaceId,
          );
          setSelectedWorkspaceId(firstOther?.id ?? "");
        }
      }
    } catch {
      setWorkspaces([]);
    } finally {
      setWorkspacesLoaded(true);
    }
  }

  // Execute Move to Team
  async function handleMoveTeam() {
    if (!selectedWorkspaceId || selectedWorkspaceId === doc.workspaceId) return;
    setIsMoving(true);
    try {
      const res = await fetch(`/api/v1/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetWorkspaceId: selectedWorkspaceId }),
      });
      if (res.ok) {
        setIsMoveOpen(false);
        setHidden(true);
        onMoved?.(doc.id);
        router.refresh();
      }
    } finally {
      setIsMoving(false);
    }
  }

  // Execute Delete
  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/documents/${doc.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setIsDeleteOpen(false);
        onDeleted?.(doc.id);
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  const teamName = doc.workspaceName || defaultWorkspaceName;
  const otherTeams = workspaces.filter((ws) => ws.id !== doc.workspaceId);

  if (hidden) return null;

  return (
    <>
      <li className="relative group list-none">
        {/* Main Clickable Card Container */}
        <div
          onClick={() => router.push(docUrl)}
          className={cn(
            "relative flex h-full flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 transition-all duration-200 cursor-pointer",
            "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md shadow-xs",
            (isMenuOpen || isShareOpen || isMoveOpen || isDeleteOpen) && "border-primary/40 shadow-md",
          )}
        >
          {/* Top Header Row: Icon/Domain on left, Action Toolbar on right */}
          <div className="flex items-start justify-between gap-2">
            {/* Left: Avatar / Logo + Workspace name + Visibility Icon */}
            <div className="flex items-center gap-2.5 min-w-0 pr-24">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {isScribe ? (
                  <LayersIcon className="h-4 w-4" />
                ) : (
                  <FileTextIcon className="h-4 w-4" />
                )}
              </div>

              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-xs font-semibold text-foreground/90">
                  {teamName}
                </span>
                <span title="Workspace visibility" className="text-muted-foreground/70 shrink-0">
                  <EyeOffIcon className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>

            {/* Top-Right Action Toolbar (Appears on Hover or when Menu is open) */}
            <div
              className={cn(
                "absolute top-3.5 right-3.5 z-20 flex items-center rounded-lg border border-border/70 bg-background/95 p-1 shadow-xs backdrop-blur-xs transition-opacity duration-150",
                isMenuOpen ? "opacity-100 ring-1 ring-primary/20" : "opacity-0 group-hover:opacity-100",
              )}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              {/* 1. Copy Link Button */}
              <button
                type="button"
                onClick={handleCopyLink}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer",
                  copied
                    ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={copied ? "Copied!" : "Copy Link"}
              >
                {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
              </button>

              {/* 2. Saved / Unsaved Bookmark Button */}
              <button
                type="button"
                onClick={handleToggleSave}
                disabled={isSaving}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer",
                  isSaved
                    ? "text-foreground hover:text-foreground/80"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={isSaved ? "Saved" : "Save guide"}
              >
                <BookmarkIcon
                  className={cn(
                    "h-3.5 w-3.5 transition-all",
                    isSaved ? "fill-foreground text-foreground" : "text-muted-foreground",
                  )}
                />
              </button>

              {/* 3. More (⋮) Menu Button */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-pointer",
                    isMenuOpen ? "bg-muted text-foreground" : "hover:bg-muted hover:text-foreground",
                  )}
                  title="More actions"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </button>

                {/* Dropdown Menu Popup */}
                {isMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Share option */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        setIsShareOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-left"
                    >
                      <Share2Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Share</span>
                    </button>

                    {/* Move to Team option */}
                    <button
                      type="button"
                      onClick={openMoveDialog}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-left"
                    >
                      <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Move to Team</span>
                    </button>

                    {/* Duplicate option */}
                    <button
                      type="button"
                      onClick={handleDuplicate}
                      disabled={isDuplicating}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-left"
                    >
                      {isDuplicating ? (
                        <Loader2Icon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <CopyIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>Duplicate</span>
                    </button>

                    <div className="my-1 border-t border-border/60" />

                    {/* Delete option */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        setIsDeleteOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left"
                    >
                      <Trash2Icon className="h-3.5 w-3.5 text-destructive" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Middle: Document Title (Matching screenshot typography) */}
          <div className="my-4 space-y-1">
            <h3 className="font-heading text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {doc.title || "Untitled Document"}
            </h3>
          </div>

          {/* Bottom: Team Badge & Relative Timestamp (Matching screenshot footer) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
            {/* Team pill badge */}
            <div className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
              <UsersIcon className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[130px]">{teamName}</span>
            </div>

            {/* Relative Timestamp */}
            <span className="text-[11.5px] text-muted-foreground shrink-0">
              {formatRelativeTime(doc.updatedAt)}
            </span>
          </div>
        </div>
      </li>

      {/* Share Modal Dialog */}
      <ShareDialog
        documentId={doc.id}
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        trigger={null}
      />

      {/* Move to Team Dialog */}
      {isMoveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0"
          onClick={() => setIsMoveOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UsersIcon className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-heading text-base font-semibold text-foreground">Move to Team</h4>
                <p className="text-xs text-muted-foreground">Select destination team or workspace</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Select Team</label>
              {!workspacesLoaded ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                  Loading workspaces…
                </div>
              ) : workspaces.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                  Create a team first
                </div>
              ) : otherTeams.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                  Create a team first — this document is already on your only team.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {workspaces.map((ws) => {
                    const isCurrent = ws.id === doc.workspaceId;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => {
                          if (!isCurrent) setSelectedWorkspaceId(ws.id);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors border",
                          isCurrent
                            ? "cursor-not-allowed border-border/50 bg-muted/40 text-muted-foreground opacity-70"
                            : selectedWorkspaceId === ws.id
                              ? "cursor-pointer border-primary bg-primary/10 text-primary font-semibold"
                              : "cursor-pointer border-border/70 hover:bg-accent text-foreground",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500 text-white font-bold text-[10px]">
                            {ws.name.charAt(0).toUpperCase()}
                          </span>
                          <span>{ws.name}</span>
                          {isCurrent ? (
                            <span className="text-[10px] font-normal text-muted-foreground">(current)</span>
                          ) : null}
                        </div>
                        {!isCurrent && selectedWorkspaceId === ws.id ? (
                          <CheckIcon className="h-3.5 w-3.5 text-primary" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMoveOpen(false)}
                disabled={isMoving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleMoveTeam}
                disabled={
                  isMoving ||
                  !selectedWorkspaceId ||
                  selectedWorkspaceId === doc.workspaceId ||
                  otherTeams.length === 0
                }
                className="gap-1.5"
              >
                {isMoving ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Move</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {isDeleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0"
          onClick={() => setIsDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangleIcon className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-heading text-base font-semibold text-foreground">Delete document?</h4>
                <p className="text-xs text-muted-foreground">This guide will be moved to trash.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Are you sure you want to delete <strong>“{doc.title || "Untitled Document"}”</strong>? This action can be undone by an administrator.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="gap-1.5"
              >
                {isDeleting ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <Trash2Icon className="h-3.5 w-3.5" />}
                <span>Delete</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
