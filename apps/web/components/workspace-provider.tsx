"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_STORAGE_KEY,
  type WorkspaceOption,
} from "@/lib/workspace";

export type { WorkspaceOption };
export { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_STORAGE_KEY };

type WorkspaceContextValue = {
  workspaces: WorkspaceOption[];
  active: WorkspaceOption | null;
  loading: boolean;
  setActive: (workspaceId: string) => void;
  refresh: () => Promise<void>;
  /** Merge a newly created workspace into the list and make it active. */
  registerAndActivate: (workspace: WorkspaceOption) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function writeActiveCookie(workspaceId: string) {
  try {
    document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // ignore
  }
}

function readActiveFromStorage(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistActive(workspaceId: string) {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  } catch {}
  writeActiveCookie(workspaceId);
}

function workspaceKey(list: WorkspaceOption[]) {
  return list.map((w) => w.id).join("|");
}

type ProviderProps = {
  children: React.ReactNode;
  initialActiveId?: string | null;
  initialWorkspaces?: WorkspaceOption[];
};

export function WorkspaceProvider({
  children,
  initialActiveId = null,
  initialWorkspaces = [],
}: ProviderProps) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>(initialWorkspaces);
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveId || initialWorkspaces[0]?.id || null,
  );
  const [loading, setLoading] = useState(initialWorkspaces.length === 0);
  const bootstrapped = useRef(false);
  const lastServerKey = useRef(workspaceKey(initialWorkspaces));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/workspaces", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      const items: WorkspaceOption[] = Array.isArray(data.items) ? data.items : [];
      setWorkspaces(items);
      lastServerKey.current = workspaceKey(items);

      setActiveId((prev) => {
        const stored = readActiveFromStorage();
        const preferred = prev || stored || initialActiveId;
        if (preferred && items.some((w) => w.id === preferred)) return preferred;
        return items[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [initialActiveId]);

  // Keep client list in sync when server props change (e.g. after router.refresh)
  useEffect(() => {
    const key = workspaceKey(initialWorkspaces);
    if (initialWorkspaces.length === 0) {
      if (!bootstrapped.current) {
        bootstrapped.current = true;
        void refresh();
      }
      return;
    }

    if (key !== lastServerKey.current || !bootstrapped.current) {
      lastServerKey.current = key;
      bootstrapped.current = true;
      setWorkspaces((prev) => {
        // Prefer server list, but keep any client-only entries (just created) until server catches up
        const serverIds = new Set(initialWorkspaces.map((w) => w.id));
        const extras = prev.filter((w) => !serverIds.has(w.id));
        return extras.length ? [...initialWorkspaces, ...extras] : initialWorkspaces;
      });
    }

    const stored = readActiveFromStorage();
    if (stored && initialWorkspaces.some((w) => w.id === stored)) {
      setActiveId(stored);
      writeActiveCookie(stored);
    } else if (initialActiveId) {
      setActiveId((prev) => prev || initialActiveId);
      persistActive(initialActiveId);
    }
  }, [initialWorkspaces, initialActiveId, refresh]);

  const setActive = useCallback(
    (workspaceId: string) => {
      setActiveId(workspaceId);
      persistActive(workspaceId);
      router.push(`/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`);
      router.refresh();
    },
    [router],
  );

  const registerAndActivate = useCallback(
    (workspace: WorkspaceOption) => {
      setWorkspaces((prev) => {
        if (prev.some((w) => w.id === workspace.id)) {
          return prev.map((w) => (w.id === workspace.id ? workspace : w));
        }
        return [...prev, workspace];
      });
      setActiveId(workspace.id);
      persistActive(workspace.id);
      router.push(`/dashboard?workspaceId=${encodeURIComponent(workspace.id)}`);
      router.refresh();
    },
    [router],
  );

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null,
    [workspaces, activeId],
  );

  const value = useMemo(
    () => ({ workspaces, active, loading, setActive, refresh, registerAndActivate }),
    [workspaces, active, loading, setActive, refresh, registerAndActivate],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}

export function useWorkspaceOptional() {
  return useContext(WorkspaceContext);
}
