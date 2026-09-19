"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CommentRow = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
};

type Props = {
  documentId: string;
  stepId: string;
};

export function StepComments({ documentId, stepId }: Props) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/v1/documents/${documentId}/comments?stepId=${encodeURIComponent(stepId)}`,
      { credentials: "include" },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.comments)) setComments(data.comments);
  }, [documentId, stepId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function post() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, stepId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      setBody("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/v1/comments/${id}`, { method: "DELETE", credentials: "include" });
    await refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-caption font-semibold uppercase tracking-wide">Comments</p>
      {comments.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No comments on this step yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium">
                    {c.author.name || c.author.email}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{c.body}</p>
                </div>
                <Button size="xs" variant="ghost" onClick={() => void remove(c.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Textarea
        className="min-h-16 text-sm"
        placeholder="Add a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      <Button
        size="sm"
        disabled={loading || !body.trim()}
        onClick={(e) => {
          e.stopPropagation();
          void post();
        }}
      >
        {loading ? "Posting…" : "Post comment"}
      </Button>
    </div>
  );
}
