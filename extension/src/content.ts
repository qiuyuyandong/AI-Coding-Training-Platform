import { detectProblemFromLocation } from "./platforms";

void run();

async function run(): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled"]);
  if (state.captureEnabled === false) return;

  const detected = detectProblemFromLocation(window.location, document.title);
  if (!detected) return;

  chrome.runtime.sendMessage({
    type: "CAPTURE_EVENT",
    event: {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: "PAGE_DETECTED",
      ...detected,
      occurredAt: new Date().toISOString(),
      payload: { source: "content_script" },
    },
  });
}
