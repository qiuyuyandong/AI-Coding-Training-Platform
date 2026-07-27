import { settleExtensionOperation } from "./extensionOperation";
import { readConfirmedSubmissions } from "./confirmedSubmission";
import type { OrchestratorState } from "./backgroundOrchestrator";
import type { CharacterizationExportDocument } from "./characterization";
import { parseNetworkTranscriptDocument } from "./networkTranscriptContract";

const DEFAULT_ENDPOINT = "http://localhost:3000/api/capture/events";
const BUTTON_FEEDBACK_MS = 180;
const POPUP_STORAGE_KEYS = [
  "captureEnabled", "captureEndpoint", "confirmedSubmissions", "captureOutbox",
  "captureQuarantine", "lastCaptureError", "lastSuccessfulCaptureAt",
  "lastDeliveredAttemptStatus", "captureCredential", "captureCredentialVersion",
  "v4ClickIntentMigration",
] as const;

export type PopupPresentation = {
  readonly captureEnabled: boolean;
  readonly endpoint: string;
  readonly pendingText: string;
  readonly outboxText: string;
  readonly quarantineText: string;
  readonly lastSyncText: string;
  readonly blockingReasonText: string;
  readonly migrationText: string;
  readonly transitionText: string;
  readonly pairingStateText: string;
  readonly quarantineDetails: readonly string[];
};

export function presentPopupState(value: unknown): PopupPresentation {
  const captureEnabled = readField(value, "captureEnabled") !== false;
  const endpoint = readField(value, "captureEndpoint");
  const confirmedSubmissions = readConfirmedSubmissions(
    readField(value, "confirmedSubmissions"),
  );
  const outbox = readArray(readField(value, "captureOutbox"));
  const quarantine = readArray(readField(value, "captureQuarantine"));
  const error = readNonEmptyString(readField(value, "lastCaptureError"));
  const lastSync = readNonEmptyString(readField(value, "lastSuccessfulCaptureAt"));
  const migration = readField(value, "v4ClickIntentMigration");
  const removedClickIntents = readNonnegativeInteger(
    readField(migration, "removedActiveIntentCount"),
  );
  const paired = typeof readField(value, "captureCredential") === "string";
  const credentialVersion = readPositiveInteger(readField(value, "captureCredentialVersion"));
  return {
    captureEnabled,
    endpoint: typeof endpoint === "string" ? endpoint : DEFAULT_ENDPOINT,
    pendingText: `等待判题 ${confirmedSubmissions.length}`,
    outboxText: `待同步结果 ${outbox.length}`,
    quarantineText: `已隔离结果 ${quarantine.length}`,
    lastSyncText: lastSync === undefined ? "最近同步：暂无" : `最近同步：${lastSync}`,
    blockingReasonText: error === undefined ? "阻塞原因：无" : `阻塞原因：${localizeCaptureError(error)}`,
    migrationText: removedClickIntents === 0
      ? "未发现点击创建的等待记录"
      : `已移除未经服务器确认的等待记录 ${removedClickIntents} 条`,
    transitionText: "网络确认采集尚未启用",
    pairingStateText: error?.startsWith("Pairing required:") === true
      ? "配对需要处理"
      : paired ? pairingSuccessText(credentialVersion) : "未配对",
    quarantineDetails: quarantine.map(quarantineSummary).filter((text) => text.length > 0),
  };
}

export function pairingSuccessText(credentialVersion: number | undefined): string {
  return credentialVersion !== undefined && credentialVersion > 1
    ? "已配对 · 凭证已轮换" : "已配对";
}

export function pairingResultText(credentialVersion: number): string {
  return credentialVersion > 1 ? "凭证已轮换" : "已配对";
}

let initialized = false;
export function initializePopup(): void {
  if (initialized) return;
  initialized = true;
  const enabled = document.querySelector<HTMLInputElement>("#captureEnabled");
  const endpoint = document.querySelector<HTMLInputElement>("#captureEndpoint");
  enabled?.addEventListener("change", () => runPopupOperation(
    () => chrome.storage.local.set({ captureEnabled: enabled.checked }),
  ));
  endpoint?.addEventListener("change", () => runPopupOperation(
    () => chrome.storage.local.set({ captureEndpoint: endpoint.value }),
  ));
  document.querySelector("#pairingForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = document.querySelector<HTMLButtonElement>("#pairButton");
    if (button !== null) runPopupButton(button, "配对", pairInstallation);
  });
  bindAction("#retryAll", { type: "RETRY_CAPTURE_OUTBOX" });
  bindConfirmedClear("#clearOutbox", "captureOutbox", "CLEAR_CAPTURE_OUTBOX", "待同步结果");
  bindConfirmedClear("#clearQuarantine", "captureQuarantine", "CLEAR_CAPTURE_QUARANTINE", "隔离结果");

  // Characterization controls
  bindCharacterizationStart();
  bindCharacterizationStop();
  bindCharacterizationExport();

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") runPopupOperation(renderPopup);
    if (area === "session") runPopupOperation(renderCharacterization);
  });
  runPopupOperation(renderPopup);
  runPopupOperation(renderCharacterization);
}

async function renderPopup(): Promise<void> {
  const state = await fetchCaptureStateSnapshot();
  if (state !== undefined) {
    renderOrchestratorSnapshot(state);
    return;
  }
  const stored: unknown = await chrome.storage.local.get(POPUP_STORAGE_KEYS);
  const presentation = presentPopupState(stored);
  renderLegacyPresentation(presentation, stored);
}

async function fetchCaptureStateSnapshot(): Promise<OrchestratorState | undefined> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
    if (isOrchestratorStateLike(response)) return response;
  } catch {
    // fall back to legacy renderer below
  }
  return undefined;
}

function isOrchestratorStateLike(value: unknown): value is OrchestratorState {
  return typeof value === "object" && value !== null
    && "waitingCount" in value && typeof Reflect.get(value, "waitingCount") === "number"
    && "outboxCount" in value && typeof Reflect.get(value, "outboxCount") === "number"
    && "quarantineCount" in value && typeof Reflect.get(value, "quarantineCount") === "number"
    && "sessionCount" in value && typeof Reflect.get(value, "sessionCount") === "number"
    && "finalizedCount" in value && typeof Reflect.get(value, "finalizedCount") === "number"
    && "installationId" in value && typeof Reflect.get(value, "installationId") === "string";
}

export function renderOrchestratorSnapshot(state: OrchestratorState): void {
  setText("#pendingState", `等待判题 ${state.waitingCount}`);
  setText("#outboxState", `待同步结果 ${state.outboxCount}`);
  setText("#quarantineState", `已隔离结果 ${state.quarantineCount}`);
  setText("#lastDelivery", state.lastSuccessfulCaptureAt === undefined
    ? "最近同步：暂无"
    : `最近同步：${state.lastSuccessfulCaptureAt}`);
  setText("#lastError", state.lastCaptureError === undefined
    ? "阻塞原因：无"
    : `阻塞原因：${localizeCaptureError(state.lastCaptureError)}`);
  setText("#migrationState", state.migrationRemovedActiveIntentCount === 0
    ? "未发现点击创建的等待记录"
    : `已移除未经服务器确认的等待记录 ${state.migrationRemovedActiveIntentCount} 条`);
  setText("#transitionState", "网络确认采集尚未启用");
  setText("#pairingState", state.provenanceLevel === "extension_paired"
    ? pairingSuccessText(state.captureCredentialVersion)
    : "未配对");
  setText("#status", state.captureEnabled ? "本地采集已开启" : "本地采集已暂停");
  const enabled = document.querySelector<HTMLInputElement>("#captureEnabled");
  const endpoint = document.querySelector<HTMLInputElement>("#captureEndpoint");
  if (enabled !== null) enabled.checked = state.captureEnabled;
  if (endpoint !== null) endpoint.value = state.captureEndpoint;
  const details = document.querySelector("#quarantineDetails");
  if (details !== null) renderQuarantine(details, state.quarantineDetails.map((line) => ({ summary: line })));
}

function renderLegacyPresentation(presentation: PopupPresentation, stored: unknown): void {
  setText("#pendingState", presentation.pendingText);
  setText("#outboxState", presentation.outboxText);
  setText("#quarantineState", presentation.quarantineText);
  setText("#lastDelivery", presentation.lastSyncText);
  setText("#lastError", presentation.blockingReasonText);
  setText("#migrationState", presentation.migrationText);
  setText("#transitionState", presentation.transitionText);
  setText("#pairingState", presentation.pairingStateText);
  setText("#status", presentation.captureEnabled ? "本地采集已开启" : "本地采集已暂停");
  const enabled = document.querySelector<HTMLInputElement>("#captureEnabled");
  const endpoint = document.querySelector<HTMLInputElement>("#captureEndpoint");
  if (enabled !== null) enabled.checked = presentation.captureEnabled;
  if (endpoint !== null) endpoint.value = presentation.endpoint;
  const details = document.querySelector("#quarantineDetails");
  if (details !== null) renderQuarantine(details, readArray(readField(stored, "captureQuarantine")));
}

async function pairInstallation(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("#pairingCode");
  const resultNode = document.querySelector("#pairingResult");
  const code = input?.value.trim();
  if (code === undefined || code.length === 0) return;
  const result = await requestPairing(
    (message) => chrome.runtime.sendMessage(message),
    code,
  );
  if (result.ok) {
    if (input !== null) input.value = "";
    if (resultNode !== null) resultNode.textContent = result.text;
  } else if (resultNode !== null) {
    resultNode.textContent = result.text;
  }
}

export async function requestPairing(
  sendMessage: (message: { readonly type: "PAIR_CAPTURE_INSTALLATION"; readonly code: string }) => Promise<unknown>,
  code: string,
): Promise<
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly text: string }
> {
  try {
    const result = await sendMessage({ type: "PAIR_CAPTURE_INSTALLATION", code });
    if (isSuccessfulPairResult(result)) {
      return { ok: true, text: pairingResultText(result.credentialVersion) };
    }
    return {
      ok: false,
      text: readNonEmptyString(readField(result, "error")) ?? "配对失败",
    };
  } catch (error) {
    return {
      ok: false,
      text: error instanceof Error ? error.message : "配对失败",
    };
  }
}

function bindAction(selector: string, message: Record<string, string>): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  button?.addEventListener("click", () => {
    runPopupButton(button, button.textContent?.trim() ?? "操作", async () => {
      await chrome.runtime.sendMessage(message);
      await renderPopup();
    });
  });
}

function bindConfirmedClear(
  selector: string,
  storageKey: string,
  type: string,
  label: string,
): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  button?.addEventListener("click", () => {
    runPopupButton(button, button.textContent?.trim() ?? label, async () => {
      const stored = await chrome.storage.local.get([storageKey]);
      const count = readArray(readField(stored, storageKey)).length;
      if (count === 0 || !window.confirm(`确定清空 ${count} 条${label}？此操作不可恢复。`)) return;
      await chrome.runtime.sendMessage({ type });
      await renderPopup();
    });
  });
}

export async function runButtonAction(
  button: HTMLButtonElement,
  operation: () => Promise<unknown>,
  reportError: (error: unknown) => void,
  wait: (milliseconds: number) => Promise<void> = waitFor,
): Promise<boolean> {
  button.classList.add("is-pressed");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const [succeeded] = await Promise.all([
      settleExtensionOperation(operation, reportError),
      wait(BUTTON_FEEDBACK_MS),
    ]);
    return succeeded;
  } finally {
    button.classList.remove("is-pressed");
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function runPopupButton(
  button: HTMLButtonElement,
  label: string,
  operation: () => Promise<unknown>,
): void {
  void runButtonAction(button, operation, reportPopupError).then((succeeded) => {
    if (succeeded) setText("#actionResult", `已触发：${label}`);
  });
}

function runPopupOperation(operation: () => Promise<unknown>): void {
  void settleExtensionOperation(operation, reportPopupError);
}

function reportPopupError(error: unknown): void {
  const message = error instanceof Error ? error.message : "扩展操作失败";
  setText("#actionResult", `操作失败：${message}`);
  console.warn("[capture-v4] popup operation failed", error);
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function quarantineSummary(value: unknown): string {
  const item = readField(value, "item");
  const bundle = readField(item, "bundle");
  const events = readArray(readField(bundle, "events"));
  const event = events[2];
  const payload = readField(event, "payload");
  const verdict = readNonEmptyString(readField(payload, "verdict"));
  const platform = readNonEmptyString(readField(event, "platform"));
  const problem = readNonEmptyString(readField(event, "problemExternalId"));
  const occurredAt = readNonEmptyString(readField(event, "occurredAt"));
  const error = readNonEmptyString(readField(value, "error"));
  if (verdict === undefined || platform === undefined || problem === undefined
    || occurredAt === undefined || error === undefined) return "";
  return `${platform} · ${problem} · ${verdict} · ${occurredAt} · ${error}`;
}

function renderQuarantine(container: Element, entries: readonly unknown[]): void {
  container.replaceChildren();
  for (const entry of entries) {
    const id = readNonEmptyString(readField(entry, "id"));
    const summary = quarantineSummary(entry);
    if (id === undefined || summary.length === 0) continue;
    const row = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = summary;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重试此项";
    retry.addEventListener("click", () => runPopupButton(retry, "重试此项", () =>
      chrome.runtime.sendMessage({ type: "RETRY_QUARANTINED_CAPTURE", id })));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除此项";
    remove.addEventListener("click", () => {
      if (window.confirm("确定删除这条隔离结果？此操作不可恢复。")) {
        runPopupButton(remove, "删除此项", () => chrome.runtime.sendMessage({
          type: "DELETE_QUARANTINED_CAPTURE", id,
        }));
      }
    });
    row.append(text, retry, remove);
    container.append(row);
  }
}

function setText(selector: string, text: string): void {
  const node = document.querySelector(selector);
  if (node !== null) node.textContent = text;
}

function readField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
function readArray(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
function readNonnegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
function localizeCaptureError(error: string): string {
  const prefixes: ReadonlyArray<readonly [string, string]> = [
    ["Pairing required:", "需要重新配对："], ["Origin rejected:", "请求来源被拒绝："],
    ["Network unavailable:", "网络不可用："], ["Isolated result:", "结果已隔离："],
    ["ACK mismatch:", "ACK 身份不匹配："],
    ["Storage capacity reached:", "本地存储空间不足："],
  ];
  const match = prefixes.find(([prefix]) => error.startsWith(prefix));
  return match === undefined ? error : `${match[1]}${error.slice(match[0].length).trim()}`;
}
function isSuccessfulPairResult(value: unknown): value is { readonly ok: true; readonly credentialVersion: number } {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === true
    && "credentialVersion" in value && typeof value.credentialVersion === "number";
}

// ---------------------------------------------------------------------------
// Characterization controls
// ---------------------------------------------------------------------------

export function readCharacterizationStartSelection(
  hostname: unknown,
  authenticated: unknown,
): { readonly hostname: "www.nowcoder.com" | "ac.nowcoder.com"; readonly authenticated: boolean } | undefined {
  if ((hostname !== "www.nowcoder.com" && hostname !== "ac.nowcoder.com") || typeof authenticated !== "boolean") {
    return undefined;
  }
  return { hostname, authenticated };
}

function bindCharacterizationStart(): void {
  const button = document.querySelector<HTMLButtonElement>("#characterizationStart");
  button?.addEventListener("click", () => {
    runPopupButton(button, "开始诊断", async () => {
      const hostname = document.querySelector<HTMLSelectElement>("#characterizationHostname")?.value;
      const authenticated = document.querySelector<HTMLInputElement>("#characterizationAuthenticated")?.checked;
      const start = readCharacterizationStartSelection(hostname, authenticated);
      if (start === undefined) {
        setText("#characterizationResult", "启动失败: 请选择有效主机和登录状态");
        return;
      }
      const result = await chrome.runtime.sendMessage({ type: "CHARACTERIZATION_START", ...start });
      if (isCharacterizationResult(result)) {
        setText("#characterizationState", result.session.active ? "诊断模式进行中" : "诊断模式未启用");
        updateCharacterizationButtons(result.session.active);
        setText("#characterizationResult", result.session.active ? "已开始" : "启动失败");
      }
    });
  });
}

function bindCharacterizationStop(): void {
  const button = document.querySelector<HTMLButtonElement>("#characterizationStop");
  button?.addEventListener("click", () => {
    runPopupButton(button, "停止诊断", async () => {
      const result = await chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STOP" });
      if (isCharacterizationResult(result)) {
        setText("#characterizationState", "诊断模式未启用");
        updateCharacterizationButtons(false);
        setText("#characterizationResult", "已停止");
      }
    });
  });
}

function bindCharacterizationExport(): void {
  const button = document.querySelector<HTMLButtonElement>("#characterizationExport");
  button?.addEventListener("click", () => {
    runPopupButton(button, "导出记录", async () => {
      const result = await chrome.runtime.sendMessage({ type: "CHARACTERIZATION_EXPORT" });
      if (isCharacterizationExportResult(result)) {
        if (result.ok && result.document !== undefined) {
          const delivery = await deliverCharacterizationExport(result.document);
          setText("#characterizationResult", delivery.ok
            ? `已下载 ${delivery.count} 条记录`
            : `导出失败: ${delivery.reason}`);
        } else {
          setText("#characterizationResult", `导出失败: ${result.reason}`);
        }
      }
    });
  });
}

async function renderCharacterization(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STATUS" });
    if (isCharacterizationStatusResponse(response)) {
      setText("#characterizationState", response.status);
      updateCharacterizationButtons(response.session.active);
    }
  } catch {
    setText("#characterizationState", "诊断模式未启用");
    updateCharacterizationButtons(false);
  }
}

function updateCharacterizationButtons(active: boolean): void {
  const startBtn = document.querySelector<HTMLButtonElement>("#characterizationStart");
  const stopBtn = document.querySelector<HTMLButtonElement>("#characterizationStop");
  const exportBtn = document.querySelector<HTMLButtonElement>("#characterizationExport");
  if (startBtn !== null) startBtn.disabled = active;
  if (stopBtn !== null) stopBtn.disabled = !active;
  if (exportBtn !== null) exportBtn.disabled = !active;
}

function isCharacterizationResult(value: unknown): value is { readonly ok: boolean; readonly session: { readonly active: boolean } } {
  return typeof value === "object" && value !== null
    && "ok" in value && typeof value.ok === "boolean"
    && "session" in value && typeof value.session === "object" && value.session !== null
    && "active" in value.session && typeof value.session.active === "boolean";
}

export async function deliverCharacterizationExport(
  value: unknown,
  download: (url: string, filename: string) => Promise<unknown> = async (url, filename) =>
    chrome.downloads.download({ url, filename, saveAs: true }),
): Promise<{ readonly ok: true; readonly count: number } | { readonly ok: false; readonly reason: string }> {
  if (!isCharacterizationExportDocument(value)) {
    return { ok: false, reason: "导出文档未通过 B1 安全校验" };
  }
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  }));
  try {
    await download(blobUrl, `nowcoder-characterization-${value.meta.captureDate}.json`);
    return { ok: true, count: value.evidence.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "下载失败" };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function isCharacterizationExportResult(value: unknown): value is {
  readonly ok: boolean;
  readonly document?: unknown;
  readonly reason?: string;
} {
  return typeof value === "object" && value !== null && "ok" in value
    && typeof Reflect.get(value, "ok") === "boolean";
}

export function isCharacterizationExportDocument(value: unknown): value is CharacterizationExportDocument {
  return parseNetworkTranscriptDocument(value).ok;
}

function isCharacterizationStatusResponse(value: unknown): value is { readonly session: { readonly active: boolean }; readonly status: string } {
  return typeof value === "object" && value !== null
    && "session" in value && typeof value.session === "object"
    && "status" in value && typeof value.status === "string";
}

if (typeof document !== "undefined" && typeof chrome !== "undefined") initializePopup();
