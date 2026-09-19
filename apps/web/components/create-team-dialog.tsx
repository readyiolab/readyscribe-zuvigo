"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceOptional, type WorkspaceOption } from "@/components/workspace-provider";
import { XIcon, Loader2Icon } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateTeamDialog({ open, onClose }: Props) {
  const workspaceCtx = useWorkspaceOptional();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a team name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/workspaces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }

      const created: WorkspaceOption = {
        id: data.id,
        name: data.name ?? trimmed,
        slug: data.slug ?? "",
        role: data.role ?? "OWNER",
        createdAt: data.createdAt ?? new Date().toISOString(),
      };

      if (!created.id) {
        throw new Error("Workspace created but no id returned");
      }

      workspaceCtx?.registerAndActivate(created);
      setName("");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-team-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="create-team-title" className="font-heading text-base font-semibold">
            Create New Team
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              placeholder="e.g. Product, Support, Client A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
              autoFocus
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void create()} disabled={loading}>
              {loading ? <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Create team
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
