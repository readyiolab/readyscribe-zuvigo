import {
  CAPTURE_OPTIONS_CSS,
  mountCaptureOptions,
  sendExtMessage,
} from "./capture-options";
import type { ExtMessage } from "./shared";

const style = document.createElement("style");
style.textContent = CAPTURE_OPTIONS_CSS;
document.head.appendChild(style);

const root = document.getElementById("root")!;

async function main() {
  const stored = await chrome.storage.session.get(["captureStateMeta"]);
  const meta = stored.captureStateMeta as { apiBase?: string; workspaceId?: string } | undefined;
  const apiBase = meta?.apiBase || "https://readyscribe.zuvigo.com";

  await sendExtMessage({ type: "BOOTSTRAP", apiBase });
  const live = await sendExtMessage<ExtMessage>({ type: "GET_STATE" });
  const state = live?.type === "STATE" ? live.state : null;

  mountCaptureOptions({
    root,
    showClose: true,
    getApiBase: () => state?.apiBase || apiBase,
    getWorkspaceId: () => state?.workspaceId ?? meta?.workspaceId ?? null,
    onStarted: () => window.close(),
    onClose: () => window.close(),
  });
}

void main();
