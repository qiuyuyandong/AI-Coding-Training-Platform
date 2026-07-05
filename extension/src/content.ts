import { detectProblemFromLocation } from "./platforms";

const detected = detectProblemFromLocation(window.location, document.title);

if (detected) {
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
