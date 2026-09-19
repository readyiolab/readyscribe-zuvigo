import type { ExtMessage } from "./shared";

export type TabRow = {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
};

export function truncateLabel(s: string, max = 52) {
  const t = s.trim() || "Untitled";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function listRecordableTabs(): Promise<TabRow[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.id != null && typeof t.url === "string" && /^https?:\/\//i.test(t.url))
    .map((t) => ({
      id: t.id!,
      title: t.title?.trim() || "Untitled",
      url: t.url!,
      favIconUrl: t.favIconUrl,
    }));
}

export function filterTabs(tabs: TabRow[], query: string): TabRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter(
    (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q),
  );
}

export function sendExtMessage<T = ExtMessage>(msg: ExtMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(res as T);
    });
  });
}

export type CaptureOptionsMount = {
  root: HTMLElement;
  getApiBase: () => string;
  getWorkspaceId: () => string | null;
  /** Called after capture successfully starts (e.g. close popup). */
  onStarted?: () => void;
  /** Called when user closes the panel (side panel back). */
  onClose?: () => void;
  showClose?: boolean;
};

function extractDomain(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Mount Scribe-style Capture Options into `root`.
 * Returns a dispose function.
 */
export function mountCaptureOptions(opts: CaptureOptionsMount): () => void {
  const { root, getApiBase, getWorkspaceId, onStarted, onClose, showClose = true } = opts;

  let allTabs: TabRow[] = [];
  let search = "";
  let busy = false;
  let statusLine = "";

  root.innerHTML = `
    <div class="co-panel">
      <div class="co-header">
        <div class="co-header-text">
          <h2 class="co-title">Capture Options</h2>
          <p class="co-desc">Select a tab and Scribe will automatically open it to start capturing steps.</p>
        </div>
        ${showClose ? `<button type="button" class="co-close" aria-label="Close" data-co="close">✕</button>` : ""}
      </div>
      <div class="co-status" data-co="status" hidden></div>
      
      <button type="button" class="co-newtab" data-co="newtab">
        <span class="co-plus">+</span>
        <span>New Tab</span>
      </button>

      <div class="co-section-label">OPEN TABS</div>

      <div class="co-search-wrap">
        <span class="co-search-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <input type="search" class="co-search" placeholder="Search tabs" data-co="search" autocomplete="off" />
      </div>

      <ul class="co-list" data-co="list"></ul>
      <p class="co-empty" data-co="empty" hidden>No matching tabs</p>
      <p class="co-gate" data-co="gate" hidden></p>
    </div>
  `;

  const listEl = root.querySelector('[data-co="list"]') as HTMLUListElement;
  const emptyEl = root.querySelector('[data-co="empty"]') as HTMLElement;
  const statusEl = root.querySelector('[data-co="status"]') as HTMLElement;
  const gateEl = root.querySelector('[data-co="gate"]') as HTMLElement;
  const searchEl = root.querySelector('[data-co="search"]') as HTMLInputElement;
  const newTabBtn = root.querySelector('[data-co="newtab"]') as HTMLButtonElement;
  const closeBtn = root.querySelector('[data-co="close"]') as HTMLButtonElement | null;

  function setStatus(msg: string) {
    statusLine = msg;
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  function setBusy(next: boolean) {
    busy = next;
    newTabBtn.disabled = next;
    searchEl.disabled = next;
    listEl.querySelectorAll("button").forEach((b) => {
      (b as HTMLButtonElement).disabled = next;
    });
  }

  function renderList() {
    const filtered = filterTabs(allTabs, search);
    listEl.innerHTML = "";
    emptyEl.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      emptyEl.textContent = search.trim()
        ? "No matching tabs"
        : "No open tabs found. Open a site in Chrome or click '+ New Tab'.";
    }
    for (const tab of filtered) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "co-tab";
      btn.disabled = busy;

      if (tab.favIconUrl) {
        const img = document.createElement("img");
        img.className = "co-fav";
        img.alt = "";
        img.width = 18;
        img.height = 18;
        img.src = tab.favIconUrl;
        img.onerror = () => {
          img.replaceWith(
            Object.assign(document.createElement("span"), {
              className: "co-fav-fallback",
              textContent: "●",
            }),
          );
        };
        btn.appendChild(img);
      } else {
        btn.appendChild(
          Object.assign(document.createElement("span"), {
            className: "co-fav-fallback",
            textContent: "●",
          }),
        );
      }

      const title = document.createElement("span");
      title.className = "co-tab-title";
      title.textContent = truncateLabel(tab.title, 48);
      title.title = `${tab.title}\n${tab.url}`;
      btn.appendChild(title);

      btn.onclick = () => void beginOnTab(tab.id, false);
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  async function refreshTabs() {
    allTabs = await listRecordableTabs();
    renderList();
  }

  async function beginOnTab(tabId: number | null, createNewTab: boolean) {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      gateEl.hidden = false;
      gateEl.textContent =
        "Connect the extension and select a workspace in the side panel first.";
      return;
    }
    gateEl.hidden = true;
    setBusy(true);
    setStatus(createNewTab ? "Opening tab…" : "Opening tab…");
    try {
      const res = await sendExtMessage<ExtMessage>({
        type: "BEGIN_CAPTURE_ON_TAB",
        tabId: tabId ?? 0,
        workspaceId,
        apiBase: getApiBase(),
        createNewTab,
      });
      if (res?.type === "STATE") {
        if (res.state.status === "failed" || res.state.lastError) {
          setStatus(res.state.lastError || "Could not start capture");
          setBusy(false);
          return;
        }
        if (res.state.status === "capturing" || res.state.status === "starting") {
          setStatus("Capture started");
          onStarted?.();
          return;
        }
      }
      setStatus("Capture started");
      onStarted?.();
    } catch (err) {
      setStatus((err as Error).message || "Failed to start capture");
      setBusy(false);
    }
  }

  searchEl.oninput = () => {
    search = searchEl.value;
    renderList();
  };

  newTabBtn.onclick = () => void beginOnTab(null, true);

  closeBtn?.addEventListener("click", () => {
    onClose?.();
  });

  void refreshTabs();
  const interval = setInterval(() => {
    if (!busy) void refreshTabs();
  }, 2000);

  return () => {
    clearInterval(interval);
    root.innerHTML = "";
  };
}

/** Shared CSS for Capture Options (inject once). */
export const CAPTURE_OPTIONS_CSS = `
.co-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}
.co-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  min-height: 0;
  padding-bottom: 2px;
}
.co-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
  color: #0f172a;
}
.co-desc {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: #64748b;
}
.co-close {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.co-close:hover { color: #0f172a; background: #f1f5f9; border-color: #cbd5e1; }
.co-status {
  font-size: 11.5px;
  font-weight: 550;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
}
.co-newtab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 40px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  border-radius: 9px;
  padding: 0 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.co-newtab:hover:not(:disabled) {
  background: #eef2ff;
  border-color: #818cf8;
  color: #4338ca;
}
.co-newtab:disabled { opacity: 0.5; cursor: default; }
.co-newtab-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.co-plus {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}
.co-newtab-arrow {
  font-size: 12px;
  color: #94a3b8;
}
.co-section-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  flex-shrink: 0;
  margin: 2px 0 -4px;
}
.co-search-wrap {
  position: relative;
  flex-shrink: 0;
}
.co-search-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 13px;
  pointer-events: none;
}
.co-search {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 10px 0 32px;
  font-size: 12.5px;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.co-search:focus {
  background: #ffffff;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}
.co-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  padding-right: 2px;
}
.co-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 9px;
  padding: 8px 12px;
  cursor: pointer;
  color: #0f172a;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: all 0.15s ease;
}
.co-tab:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
}
.co-tab:disabled { opacity: 0.5; cursor: default; }
.co-tab-main {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
}
.co-fav, .co-fav-fallback {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
}
.co-fav-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
.co-tab-text {
  min-width: 0;
  flex: 1;
}
.co-tab-title {
  font-size: 12.5px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.co-tab-domain {
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
}
.co-tab-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: #eef2ff;
  color: #4f46e5;
  border: 1px solid rgba(79, 70, 229, 0.2);
  white-space: nowrap;
  flex-shrink: 0;
}
.co-empty, .co-gate {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
  padding: 16px 10px;
  flex-shrink: 0;
}
.co-gate {
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
}
`;
