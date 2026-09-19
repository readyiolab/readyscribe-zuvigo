"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  UserPlusIcon,
  CopyIcon,
  CheckIcon,
  ClockIcon,
  SendIcon,
  Loader2Icon,
} from "lucide-react";

type MemberRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  invitePath: string;
  expiresAt: string;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  canManage: boolean;
};

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  switch (role) {
    case "OWNER":
      return "default";
    case "ADMIN":
      return "secondary";
    default:
      return "outline";
  }
}

export function WorkspaceInvitePanel({ workspaceId, workspaceName, canManage }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EDITOR" | "VIEWER" | "ADMIN" | "MEMBER">("EDITOR");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/invites`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMembers(Array.isArray(data.members) ? data.members : []);
      setInvites(Array.isArray(data.invites) ? data.invites : []);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function invite() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/invites`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      }
      setLastInviteUrl(data.inviteUrl ?? (origin ? `${origin}${data.invitePath}` : data.invitePath));
      setEmail("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyInvite() {
    if (!lastInviteUrl) return;
    await navigator.clipboard.writeText(lastInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{workspaceName}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Workspace members, team roles, and pending invitations.
        </p>
      </div>

      {/* Members List */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Active Members ({members.length})
        </span>
        {members.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card divide-y divide-border/60 shadow-xs">
            {members.map((m) => {
              const initial = (m.name || m.email || "U").charAt(0).toUpperCase();
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shadow-2xs">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {m.name || m.email}
                      </p>
                      {m.name ? (
                        <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
                      ) : null}
                    </div>
                  </div>
                  <Badge
                    variant={getRoleBadgeVariant(m.role)}
                    className="text-[10px] uppercase tracking-wider font-semibold shrink-0"
                  >
                    {m.role}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No members found.</p>
        )}
      </div>

      {/* Invite Teammate Form */}
      {canManage ? (
        <div className="space-y-3.5 rounded-2xl border border-border/80 bg-surface/50 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Invite a Teammate
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_130px_auto]">
            <div className="space-y-1">
              <Label htmlFor={`invite-email-${workspaceId}`} className="text-xs font-medium">
                Email address
              </Label>
              <Input
                id={`invite-email-${workspaceId}`}
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`invite-role-${workspaceId}`} className="text-xs font-medium">
                Role
              </Label>
              <select
                id={`invite-role-${workspaceId}`}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="VIEWER">Viewer</option>
                <option value="MEMBER">Member</option>
                <option value="EDITOR">Editor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                disabled={loading || !email.trim()}
                onClick={() => void invite()}
                className="h-9 gap-1.5 px-4 text-xs font-medium shadow-xs w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    <span>Inviting…</span>
                  </>
                ) : (
                  <>
                    <SendIcon className="h-3.5 w-3.5" />
                    <span>Invite</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {lastInviteUrl ? (
            <div className="space-y-2 rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
              <p className="text-[11px] font-medium text-foreground">
                Direct invite link (share directly if email isn’t configured):
              </p>
              <div className="flex items-center gap-2">
                <span className="truncate rounded-md bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground flex-1 border border-border/50 select-all">
                  {lastInviteUrl}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void copyInvite()}
                  className="h-7 text-xs gap-1.5 shrink-0"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-3.5 w-3.5" />
                      <span>Copy link</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Pending Invites */}
      {invites.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ClockIcon className="h-3 w-3" />
            <span>Pending Invitations ({invites.length})</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card divide-y divide-border/60 shadow-xs">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{inv.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {inv.role}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
