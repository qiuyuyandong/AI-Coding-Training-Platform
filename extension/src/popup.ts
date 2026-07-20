import type { CaptureEvent } from "@/lib/capture/events";

const DEFAULT_ENDPOINT = "http://localhost:3000/api/capture/events";
const POPUP_STORAGE_KEYS = [
  "captureEnabled",
  "captureEndpoint",
  "eventQueue",
  "lastCaptureError",
  "lastSuccessfulCaptureAt",
  "lastDeliveredEventType",
  "lastDeliveredEventId",
  "lastDeliveredEventOccurredAt",
  "lastDeliveredAttemptId",
  "lastDeliveredAttemptStatus",
  "lastDeliveredCreatedAttempt",
  "captureCredential",
  "captureCredentialVersion",
] as const;

type PopupNodes = {
  readonly enabled: HTMLInputElement | null;
  readonly endpoint: HTMLInputElement | null;
  readonly queue: Element | null;
  readonly delivery: Element | null;
  readonly deliveryMeta: Element | null;
  readonly attempt: Element | null;
  readonly error: Element | null;
  readonly status: Element | null;
  readonly pairingForm: HTMLFormElement | null;
  readonly pairingCode: HTMLInputElement | null;
  readonly pairButton: HTMLButtonElement | null;
  readonly pairingState: Element | null;
  readonly pairingResult: Element | null;
};

export type PopupPresentation = {
  readonly captureEnabled: boolean;
  readonly endpoint: string;
  readonly queueText: string;
  readonly deliveryText: string;
  readonly deliveryMetaText: string;
  readonly attemptText: string;
  readonly blockingReasonText: string;
  readonly captureStatusText: string;
  readonly pairingStateText: string;
};

let popupInitialized = false;

export function presentPopupState(value: unknown): PopupPresentation {
  const captureEnabled = readField(value, "captureEnabled") !== false;
  const endpointValue = readField(value, "captureEndpoint");
  const queueValue = readField(value, "eventQueue");
  const eventType = readCaptureEventType(readField(value, "lastDeliveredEventType"));
  const eventId = readNonEmptyString(readField(value, "lastDeliveredEventId"));
  const eventOccurredAt = readNonEmptyString(
    readField(value, "lastDeliveredEventOccurredAt"),
  );
  const deliveredAt = readNonEmptyString(readField(value, "lastSuccessfulCaptureAt"));
  const attemptStatus = readAttemptStatus(
    readField(value, "lastDeliveredAttemptStatus"),
  );
  const createdAttempt = readField(value, "lastDeliveredCreatedAttempt") === true;
  const lastError = readNonEmptyString(readField(value, "lastCaptureError"));
  const paired = typeof readField(value, "captureCredential") === "string";
  const credentialVersion = readPositiveInteger(
    readField(value, "captureCredentialVersion"),
  );
  const needsPairing = lastError?.startsWith("Pairing required:") === true;

  return {
    captureEnabled,
    endpoint: typeof endpointValue === "string" ? endpointValue : DEFAULT_ENDPOINT,
    queueText: `待发送事件 ${Array.isArray(queueValue) ? queueValue.length : 0}`,
    deliveryText: eventType === undefined
      ? "最近送达：暂无"
      : `最近送达：${captureEventLabel(eventType)}`,
    deliveryMetaText: deliveryMetadata(eventId, eventOccurredAt, deliveredAt),
    attemptText: eventType === undefined
      ? "训练记录：暂无送达结果"
      : createdAttempt
        ? attemptStatus === undefined
          ? "已形成训练记录"
          : `已形成训练记录 · ${attemptStatusLabel(attemptStatus)}`
        : "尚未形成训练记录",
    blockingReasonText: lastError === undefined
      ? "阻塞原因：无"
      : `阻塞原因：${localizeCaptureError(lastError)}`,
    captureStatusText: captureEnabled ? "本地采集已开启" : "本地采集已暂停",
    pairingStateText: needsPairing
      ? "配对需要处理"
      : paired
        ? pairingSuccessText(credentialVersion)
        : "未配对",
  };
}

export function pairingSuccessText(credentialVersion: number | undefined): string {
  return credentialVersion !== undefined && credentialVersion > 1
    ? "已配对 · 凭证已轮换"
    : "已配对";
}

export function pairingResultText(credentialVersion: number): string {
  return credentialVersion > 1 ? "凭证已轮换" : "已配对";
}

export function initializePopup(): void {
  if (popupInitialized) return;
  popupInitialized = true;

  const nodes = queryPopupNodes();
  nodes.enabled?.addEventListener("change", () => {
    if (nodes.enabled === null) return;
    void chrome.storage.local.set({ captureEnabled: nodes.enabled.checked });
  });
  nodes.endpoint?.addEventListener("change", () => {
    if (nodes.endpoint === null) return;
    void chrome.storage.local.set({ captureEndpoint: nodes.endpoint.value });
  });
  nodes.pairingForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void pairInstallation(nodes);
  });
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === "local") void renderPopup(nodes);
  });
  void renderPopup(nodes);
}

async function pairInstallation(nodes: PopupNodes): Promise<void> {
  const code = nodes.pairingCode?.value.trim();
  if (code === undefined || code.length === 0) return;
  if (nodes.pairButton !== null) nodes.pairButton.disabled = true;
  if (nodes.pairingResult !== null) nodes.pairingResult.textContent = "正在配对…";

  try {
    const result: unknown = await chrome.runtime.sendMessage({
      type: "PAIR_CAPTURE_INSTALLATION",
      code,
    });
    if (isSuccessfulPairResult(result)) {
      if (nodes.pairingCode !== null) nodes.pairingCode.value = "";
      if (nodes.pairingResult !== null) {
        nodes.pairingResult.textContent = pairingResultText(result.credentialVersion);
      }
    } else if (nodes.pairingResult !== null) {
      nodes.pairingResult.textContent = readPairingError(result);
    }
  } catch (error) {
    if (nodes.pairingResult !== null) {
      nodes.pairingResult.textContent = error instanceof Error
        ? error.message
        : "配对失败";
    }
  } finally {
    if (nodes.pairButton !== null) nodes.pairButton.disabled = false;
    await renderPopup(nodes);
  }
}

async function renderPopup(nodes: PopupNodes): Promise<void> {
  const stored: unknown = await chrome.storage.local.get(POPUP_STORAGE_KEYS);
  const presentation = presentPopupState(stored);

  if (nodes.enabled !== null) nodes.enabled.checked = presentation.captureEnabled;
  if (nodes.endpoint !== null) nodes.endpoint.value = presentation.endpoint;
  if (nodes.queue !== null) nodes.queue.textContent = presentation.queueText;
  if (nodes.delivery !== null) nodes.delivery.textContent = presentation.deliveryText;
  if (nodes.deliveryMeta !== null) {
    nodes.deliveryMeta.textContent = presentation.deliveryMetaText;
    nodes.deliveryMeta.toggleAttribute("hidden", presentation.deliveryMetaText.length === 0);
  }
  if (nodes.attempt !== null) nodes.attempt.textContent = presentation.attemptText;
  if (nodes.error !== null) nodes.error.textContent = presentation.blockingReasonText;
  if (nodes.status !== null) nodes.status.textContent = presentation.captureStatusText;
  if (nodes.pairingState !== null) {
    nodes.pairingState.textContent = presentation.pairingStateText;
  }
}

function queryPopupNodes(): PopupNodes {
  return {
    enabled: document.querySelector<HTMLInputElement>("#captureEnabled"),
    endpoint: document.querySelector<HTMLInputElement>("#captureEndpoint"),
    queue: document.querySelector("#queueState"),
    delivery: document.querySelector("#lastDelivery"),
    deliveryMeta: document.querySelector("#lastDeliveryMeta"),
    attempt: document.querySelector("#attemptState"),
    error: document.querySelector("#lastError"),
    status: document.querySelector("#status"),
    pairingForm: document.querySelector<HTMLFormElement>("#pairingForm"),
    pairingCode: document.querySelector<HTMLInputElement>("#pairingCode"),
    pairButton: document.querySelector<HTMLButtonElement>("#pairButton"),
    pairingState: document.querySelector("#pairingState"),
    pairingResult: document.querySelector("#pairingResult"),
  };
}

function readField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function readCaptureEventType(value: unknown): CaptureEvent["type"] | undefined {
  if (
    value === "SESSION_STARTED"
    || value === "SESSION_ENDED"
    || value === "SUBMISSION_OBSERVED"
    || value === "VERDICT_OBSERVED"
  ) {
    return value;
  }
  return undefined;
}

function captureEventLabel(type: CaptureEvent["type"]): string {
  if (type === "SUBMISSION_OBSERVED") return "提交动作";
  if (type === "VERDICT_OBSERVED") return "判题结果";
  return "页面会话";
}

function readAttemptStatus(value: unknown): string | undefined {
  if (
    value === "draft"
    || value === "passed"
    || value === "failed"
    || value === "partial"
    || value === "stuck"
  ) {
    return value;
  }
  return undefined;
}

function attemptStatusLabel(status: string): string {
  if (status === "draft") return "等待判题";
  if (status === "passed") return "已通过";
  if (status === "failed") return "未通过";
  if (status === "partial") return "部分通过";
  return "仍需处理";
}

function deliveryMetadata(
  eventId: string | undefined,
  eventOccurredAt: string | undefined,
  deliveredAt: string | undefined,
): string {
  const parts: string[] = [];
  if (eventId !== undefined) parts.push(`事件 ${eventId}`);
  if (eventOccurredAt !== undefined) parts.push(`发生于 ${eventOccurredAt}`);
  if (deliveredAt !== undefined) parts.push(`送达于 ${deliveredAt}`);
  return parts.join(" · ");
}

function localizeCaptureError(error: string): string {
  const prefixes: ReadonlyArray<readonly [string, string]> = [
    ["Pairing required:", "需要重新配对："],
    ["Origin rejected:", "请求来源被拒绝："],
    ["Validation error:", "事件校验失败："],
    ["Conflict:", "事件冲突："],
  ];
  const match = prefixes.find(([prefix]) => error.startsWith(prefix));
  return match === undefined
    ? error
    : `${match[1]}${error.slice(match[0].length).trim()}`;
}

function isSuccessfulPairResult(
  value: unknown,
): value is { readonly ok: true; readonly credentialVersion: number } {
  return typeof value === "object"
    && value !== null
    && "ok" in value
    && value.ok === true
    && "credentialVersion" in value
    && typeof value.credentialVersion === "number"
    && Number.isInteger(value.credentialVersion)
    && value.credentialVersion > 0;
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
  return "配对失败";
}

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  initializePopup();
}
