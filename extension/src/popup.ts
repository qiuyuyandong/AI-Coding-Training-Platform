const enabledNode = document.querySelector<HTMLInputElement>("#captureEnabled");
const endpointNode = document.querySelector<HTMLInputElement>("#captureEndpoint");
const queueNode = document.querySelector("#queueLength");
const successNode = document.querySelector("#lastSuccess");
const errorNode = document.querySelector("#lastError");
const statusNode = document.querySelector("#status");
const pairingForm = document.querySelector<HTMLFormElement>("#pairingForm");
const pairingCodeNode = document.querySelector<HTMLInputElement>("#pairingCode");
const pairButtonNode = document.querySelector<HTMLButtonElement>("#pairButton");
const pairingStateNode = document.querySelector("#pairingState");
const pairingResultNode = document.querySelector("#pairingResult");

void render();

enabledNode?.addEventListener("change", () => {
  void chrome.storage.local.set({ captureEnabled: enabledNode.checked }).then(render);
});

endpointNode?.addEventListener("change", () => {
  void chrome.storage.local.set({ captureEndpoint: endpointNode.value }).then(render);
});

pairingForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = pairingCodeNode?.value.trim();
  if (code === undefined || code.length === 0) return;
  if (pairButtonNode) pairButtonNode.disabled = true;
  if (pairingResultNode) pairingResultNode.textContent = "Pairing…";
  void chrome.runtime.sendMessage({
    type: "PAIR_CAPTURE_INSTALLATION",
    code,
  }).then((result: unknown) => {
    if (isSuccessfulPairResult(result)) {
      if (pairingCodeNode) pairingCodeNode.value = "";
      if (pairingResultNode) {
        pairingResultNode.textContent = `Paired (credential v${result.credentialVersion})`;
      }
    } else if (pairingResultNode) {
      pairingResultNode.textContent = readPairingError(result);
    }
  }).catch((error: unknown) => {
    if (pairingResultNode) {
      pairingResultNode.textContent = error instanceof Error
        ? error.message
        : "Pairing failed";
    }
  }).finally(() => {
    if (pairButtonNode) pairButtonNode.disabled = false;
    void render();
  });
});

async function render(): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled", "captureEndpoint", "eventQueue", "lastCaptureError", "lastSuccessfulCaptureAt", "captureCredential", "captureCredentialVersion"]);
  if (enabledNode) enabledNode.checked = state.captureEnabled !== false;
  if (endpointNode) endpointNode.value = typeof state.captureEndpoint === "string" ? state.captureEndpoint : "http://localhost:3000/api/capture/events";
  if (queueNode) queueNode.textContent = Array.isArray(state.eventQueue) ? String(state.eventQueue.length) : "0";
  if (successNode) successNode.textContent = typeof state.lastSuccessfulCaptureAt === "string" ? state.lastSuccessfulCaptureAt : "Never";
  if (errorNode) errorNode.textContent = typeof state.lastCaptureError === "string" ? state.lastCaptureError : "None";
  if (statusNode) statusNode.textContent = state.captureEnabled === false ? "Capture disabled" : "Capture enabled";
  if (pairingStateNode) {
    const paired = typeof state.captureCredential === "string";
    const needsPairing = typeof state.lastCaptureError === "string"
      && state.lastCaptureError.startsWith("Pairing required:");
    pairingStateNode.textContent = needsPairing
      ? "Pairing needs attention"
      : paired
        ? `Paired (credential v${readCredentialVersion(state.captureCredentialVersion)})`
        : "Not paired";
  }
}

function isSuccessfulPairResult(
  value: unknown,
): value is { readonly ok: true; readonly credentialVersion: number } {
  return typeof value === "object"
    && value !== null
    && "ok" in value
    && value.ok === true
    && "credentialVersion" in value
    && typeof value.credentialVersion === "number";
}

function readPairingError(value: unknown): string {
  if (
    typeof value === "object"
    && value !== null
    && "error" in value
    && typeof value.error === "string"
  ) {
    return value.error;
  }
  return "Pairing failed";
}

function readCredentialVersion(value: unknown): string {
  return typeof value === "number" && Number.isInteger(value)
    ? String(value)
    : "?";
}
