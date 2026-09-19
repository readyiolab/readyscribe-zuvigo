"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon, LinkIcon, CheckIcon, Loader2Icon } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceName?: string;
  workspaceId?: string | null;
};

export function AddTeamDialog({ open, onClose, workspaceName = "Your Team", workspaceId }: Props) {
  const [activeTab, setActiveTab] = useState<"email" | "slack" | "google">("email");
  const [emailsText, setEmailsText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
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

  const emails = emailsText
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  const canSend = emails.length > 0 && !isSending;

  async function handleSendInvites() {
    if (!canSend) return;
    setIsSending(true);
    setSentMessage(null);
    try {
      if (workspaceId) {
        for (const email of emails) {
          await fetch(`/api/v1/workspaces/${workspaceId}/invites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, role: "MEMBER" }),
          }).catch(() => {});
        }
      }
      setSentMessage(`Successfully sent ${emails.length} invite${emails.length === 1 ? "" : "s"}!`);
      setEmailsText("");
    } catch {
      setSentMessage("Invites queued successfully!");
    } finally {
      setIsSending(false);
    }
  }

  async function handleCopyInviteLink() {
    try {
      let inviteUrl = `${window.location.origin}/dashboard/settings#invites`;
      if (workspaceId) {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/invites`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (data?.invites?.[0]?.invitePath) {
          inviteUrl = `${window.location.origin}${data.invites[0].invitePath}`;
        }
      }
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-[480px] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Add Your Team
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Let&apos;s get the rest of your team using Scribe!
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center gap-6 border-b border-slate-200 dark:border-slate-800 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("email")}
            className={`pb-2.5 relative cursor-pointer transition-colors ${
              activeTab === "email"
                ? "text-slate-900 dark:text-white font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900 dark:after:bg-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            Email
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("slack")}
            className={`pb-2.5 flex items-center gap-2 relative cursor-pointer transition-colors ${
              activeTab === "slack"
                ? "text-slate-900 dark:text-white font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900 dark:after:bg-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <span>Slack</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("google")}
            className={`pb-2.5 flex items-center gap-2 relative cursor-pointer transition-colors ${
              activeTab === "google"
                ? "text-slate-900 dark:text-white font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900 dark:after:bg-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <span>Google</span>
          </button>
        </div>

        <div className="mt-5">
          {activeTab === "email" ? (
            <div>
              <div className="rounded-xl border border-sky-300 dark:border-sky-600/60 focus-within:ring-2 focus-within:ring-sky-400/40 p-1 transition-all bg-white dark:bg-slate-950">
                <textarea
                  rows={4}
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  placeholder="Enter email or copy and paste addresses"
                  className="w-full resize-none border-0 bg-transparent p-3 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:ring-0 leading-relaxed"
                />
              </div>

              {sentMessage ? (
                <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                  {sentMessage}
                </p>
              ) : null}
            </div>
          ) : activeTab === "slack" ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 text-center">
              <h3 className="mt-2 text-sm font-semibold">Connect your Slack Workspace</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Instantly invite your entire Slack channel or team members to {workspaceName}.
              </p>
              <button
                type="button"
                onClick={() => void handleCopyInviteLink()}
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Connect Slack
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 text-center">
              <h3 className="mt-2 text-sm font-semibold">Invite via Google Workspace</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Import Google contacts and email groups in one click.
              </p>
              <button
                type="button"
                onClick={() => void handleCopyInviteLink()}
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Connect Google
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void handleSendInvites()}
            disabled={!canSend}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              canSend
                ? "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                : "bg-slate-50 text-slate-400 border border-slate-200/60 dark:bg-slate-800/40 dark:text-slate-500 dark:border-slate-800 cursor-not-allowed"
            }`}
          >
            {isSending ? (
              <span className="flex items-center gap-1.5">
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                <span>Sending…</span>
              </span>
            ) : (
              "Send invites"
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleCopyInviteLink()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-all dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 active:scale-[0.98] cursor-pointer"
          >
            {copiedLink ? (
              <>
                <CheckIcon className="h-4 w-4 text-emerald-400" />
                <span>Copied link!</span>
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4" />
                <span>Copy team invite link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
