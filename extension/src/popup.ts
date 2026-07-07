const enabledNode = document.querySelector<HTMLInputElement>("#captureEnabled");
const endpointNode = document.querySelector<HTMLInputElement>("#captureEndpoint");
const queueNode = document.querySelector("#queueLength");
const successNode = document.querySelector("#lastSuccess");
const errorNode = document.querySelector("#lastError");
const statusNode = document.querySelector("#status");

void render();

enabledNode?.addEventListener("change", () => {
  void chrome.storage.local.set({ captureEnabled: enabledNode.checked }).then(render);
});

endpointNode?.addEventListener("change", () => {
  void chrome.storage.local.set({ captureEndpoint: endpointNode.value }).then(render);
});

async function render(): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled", "captureEndpoint", "eventQueue", "lastCaptureError", "lastSuccessfulCaptureAt"]);
  if (enabledNode) enabledNode.checked = state.captureEnabled !== false;
  if (endpointNode) endpointNode.value = typeof state.captureEndpoint === "string" ? state.captureEndpoint : "http://localhost:3000/api/capture/events";
  if (queueNode) queueNode.textContent = Array.isArray(state.eventQueue) ? String(state.eventQueue.length) : "0";
  if (successNode) successNode.textContent = typeof state.lastSuccessfulCaptureAt === "string" ? state.lastSuccessfulCaptureAt : "Never";
  if (errorNode) errorNode.textContent = typeof state.lastCaptureError === "string" ? state.lastCaptureError : "None";
  if (statusNode) statusNode.textContent = state.captureEnabled === false ? "Capture disabled" : "Capture enabled";
}
