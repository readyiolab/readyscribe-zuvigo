"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CheckIcon, ChevronDownIcon, PlusIcon, SettingsIcon, UserPlusIcon } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { AddTeamDialog } from "@/components/add-team-dialog";
import { CreateTeamDialog } from "@/components/create-team-dialog";
import { cn } from "@/lib/utils";

type Props = {
  collapsed?: boolean;
  fallbackInitial?: string;
};

export function TeamSwitcher({ collapsed = false, fallbackInitial = "T" }: Props) {
  const { workspaces, active, setActive, loading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const teamName = active?.name ?? "No team";
  const initial = (active?.name?.charAt(0) || fallbackInitial).toUpperCase();

  useEffect(() => {
    setMounted(true);
  }, []);

  function updateMenuPosition() {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = collapsed ? 224 : Math.max(rect.width, 200);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({
      top: rect.bottom + 4,
      left,
      width,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    function onScrollOrResize() {
      updateMenuPosition();
    }
    window.addEventListener("resize", onScrollOrResize);
    // capture scroll from sidebar overflow containers
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, collapsed]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu =
    open && mounted && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 200,
            }}
            className="overflow-hidden rounded-xl border border-border/80 bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="border-b border-border/60 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Change Team
              </p>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {loading && workspaces.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading teams…</p>
              ) : workspaces.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No teams yet</p>
              ) : (
                workspaces.map((ws) => {
                  const isActive = active?.id === ws.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => {
                        setActive(ws.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-[10px] font-bold text-white">
                          {ws.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{ws.name}</span>
                      </div>
                      {isActive ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-border/60 py-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setInviteOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent cursor-pointer"
              >
                <UserPlusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Invite teammates
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent cursor-pointer"
              >
                <PlusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Create New Team
              </button>
              <Link
                href="/dashboard/settings"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Settings
              </Link>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn("relative mb-1", collapsed && "flex justify-center")} ref={rootRef}>
      {collapsed ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={teamName}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500 font-bold text-white text-xs cursor-pointer"
          aria-expanded={open}
        >
          {initial}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500 font-bold text-white text-[11px] shadow-2xs">
              {initial}
            </span>
            <span className="truncate">{loading && !active ? "Loading…" : teamName}</span>
          </div>
          <ChevronDownIcon
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      )}

      {menu}

      <AddTeamDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceId={active?.id}
        workspaceName={active?.name ?? "Your Team"}
      />
      <CreateTeamDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
