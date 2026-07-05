chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCaptureMessage(message)) return;

  void fetch("http://localhost:3000/api/capture/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message.event),
  }).catch(() => {
    void chrome.storage.local.set({ lastCaptureError: new Date().toISOString() });
  });
});

type CaptureMessage = { type: "CAPTURE_EVENT"; event: unknown };

function isCaptureMessage(value: unknown): value is CaptureMessage {
  return typeof value === "object" && value !== null && "type" in value && (value as { type: unknown }).type === "CAPTURE_EVENT";
}
