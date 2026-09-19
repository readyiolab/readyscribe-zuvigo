"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  workspaceId: string;
};

export function NewPageButton({ workspaceId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function create() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/pages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, title: "Untitled page" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to create page");
      router.push(`/pages/${data.id}`);
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={() => void create()} disabled={loading}>
      {loading ? "Creating…" : "New page"}
    </Button>
  );
}
