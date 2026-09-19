export const ACTIVE_WORKSPACE_STORAGE_KEY = "zuvigo_active_workspace_id";
export const ACTIVE_WORKSPACE_COOKIE = "zuvigo_active_workspace_id";

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
};

export function resolveActiveWorkspace(
  workspaces: Array<{ id: string; name: string; slug: string; role: string; createdAt: string }>,
  preferredId?: string | null,
): (typeof workspaces)[number] | null {
  if (workspaces.length === 0) return null;
  if (preferredId) {
    const match = workspaces.find((w) => w.id === preferredId);
    if (match) return match;
  }
  return workspaces[0] ?? null;
}

export async function getActiveWorkspaceIdFromCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}
