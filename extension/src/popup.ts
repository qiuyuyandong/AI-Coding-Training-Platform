import { settleExtensionOperation } from "./extensionOperation";
import { readConfirmedSubmissions } from "./confirmedSubmission";
import type { OrchestratorState } from "./backgroundOrchestrator";
import type { CharacterizationExportDocument } from "./characterization";
import { characterizationPlatformForHostname } from "./characterizationStorage";
import { parseNetworkTranscriptDocument } from "./networkTranscriptContract";
import { CaptureAttemptBundleSchema } from "@/lib/capture/attemptBundle";
import { DEFAULT_CAPTURE_ENDPOINT } from "./captureTransport";
import { safeQuarantineSummary, safeStoredCaptureError } from "./captureErrorPrivacy";
import type { CaptureRecoveryStatus } from "./captureRecovery";
import {
  LOCAL_CAPTURE_SETTINGS_URL,
  type CaptureConnectionStatus,
} from "./localConnection";

const DEFAULT_ENDPOINT = DEFAULT_CAPTURE_ENDPOINT;
const BUTTON_FEEDBACK_MS = 180;
const POPUP_STORAGE_KEYS = [
  "captureEnabled", "captureEndpoint", "confirmedSubmissions", "captureOutbox",
  "captureQuarantine", "lastCaptureError", "lastSuccessfulCaptureAt",
  "lastDeliveredAttemptStatus", "captureConnectionStatus",
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
  readonly connectionStateText: string;
  readonly recoveryText: string;
  readonly quarantineDetails: readonly string[];
};

export type QuarantineEntryPresentation = Readonly<{
  readonly summary: string;
  readonly retryable: boolean;
  readonly deletable: boolean;
  readonly malformed?: boolean;
  readonly id?: string;
}>;

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
  const connectionStatus = readConnectionStatus(readField(value, "captureConnectionStatus"));
  const malformedOutboxDetails = outbox
    .map(classifyOutboxEntry)
    .filter((entry) => entry.summary.length > 0);
  return {
    captureEnabled,
    endpoint: typeof endpoint === "string" ? endpoint : DEFAULT_ENDPOINT,
    pendingText: `等待判题 ${confirmedSubmissions.length}`,
    outboxText: `待同步结果 ${outbox.length}`,
    quarantineText: `已隔离结果 ${quarantine.length}`,
    lastSyncText: lastSync === undefined ? "最近同步：暂无" : `最近同步：${lastSync}`,
    blockingReasonText: error === undefined
      ? "阻塞原因：无"
      : `阻塞原因：${localizeCaptureError(safeStoredCaptureError(error) ?? "Retained capture error")}`,
    migrationText: removedClickIntents === 0
      ? "未发现点击创建的等待记录"
      : `已移除未经服务器确认的等待记录 ${removedClickIntents} 条`,
    transitionText: "网络确认采集尚未启用",
    connectionStateText: presentConnectionStatus(connectionStatus),
    recoveryText: presentCaptureRecoveryStatus(readField(value, "captureRecoveryStatus")),
    quarantineDetails: quarantine
      .map(classifyQuarantineEntry)
      .concat(malformedOutboxDetails)
      .map((entry) => entry.summary)
      .filter((text) => text.length > 0),
  };
}

export function classifyQuarantineEntry(value: unknown): QuarantineEntryPresentation {
  const structuredSummary = readNonEmptyString(readField(value, "summary"));
  const structuredRetryable = readField(value, "retryable");
  const structuredDeletable = readField(value, "deletable");
  if (structuredSummary !== undefined
    && typeof structuredRetryable === "boolean"
    && typeof structuredDeletable === "boolean") {
    const id = readNonEmptyString(readField(value, "id"));
    return {
      summary: safeQuarantineSummary(structuredSummary),
      retryable: structuredRetryable,
      deletable: structuredDeletable,
      ...(readField(value, "malformed") === true ? { malformed: true } : {}),
      ...(id === undefined ? {} : { id }),
    };
  }
  const id = readNonEmptyString(readField(value, "id"));
  if (isValidQuarantineEntry(value) && id !== undefined) {
    return { id, summary: quarantineSummary(value), retryable: true, deletable: true };
  }
  const directSummary = readNonEmptyString(readField(value, "summary"));
  if (directSummary !== undefined && readField(value, "item") === undefined) {
    return { summary: safeQuarantineSummary(directSummary), retryable: false, deletable: false };
  }
  if (id !== undefined || readField(value, "item") !== undefined) {
    const error = safeStoredCaptureError(readField(value, "error")) ?? "malformed retained bundle";
    return {
      summary: `? · ? · malformed quarantine bundle · ${id ?? "?"} · ${error}`,
      retryable: false,
      deletable: id !== undefined,
      malformed: true,
      ...(id === undefined ? {} : { id }),
    };
  }
  const error = safeStoredCaptureError(readField(value, "error"));
  return {
    summary: `? · ? · malformed quarantine record · ${error ?? "unrecognized retained value"}`,
    retryable: false,
    deletable: false,
    malformed: true,
  };
}

function classifyOutboxEntry(value: unknown): QuarantineEntryPresentation {
  if (isValidOutboxEntry(value)) return { summary: "", retryable: false, deletable: false };
  if (typeof value !== "object" || value === null) {
    return {
      summary: "? · ? · malformed outbox record",
      retryable: false,
      deletable: false,
      malformed: true,
    };
  }
  const id = readNonEmptyString(readField(value, "id"));
  return {
    summary: `? · ? · malformed outbox bundle · ${id ?? "?"} · retained without delivery`,
    retryable: false,
    deletable: false,
    malformed: true,
    ...(id === undefined ? {} : { id }),
  };
}

export function presentConnectionStatus(status: CaptureConnectionStatus): string {
  if (status === "connected") return "已连接本地应用";
  if (status === "service_unreachable") return "本地服务不可达";
  if (status === "capability_rejected") return "连接已失效";
  return "需要从本地设置页连接";
}

const CAPTURE_RECOVERY_ERROR_TEXT: Readonly<Record<string, string>> = Object.freeze({
  unsupported_browser: "浏览器能力不受支持",
  unsupported_capture_endpoint: "采集地址不受支持",
  capture_recovery_capacity_exceeded: "可恢复页面数量超过上限",
  capture_recovery_failed: "页面恢复未完成",
  initialization_failed: "后台初始化失败",
  persistence_failed: "本地持久化失败",
});

export function presentCaptureRecoveryStatus(value: unknown): string {
  if (typeof value !== "object" || value === null || Reflect.get(value, "schemaVersion") !== 1) {
    return "采集恢复：已阻断";
  }
  const state = Reflect.get(value, "state");
  if (state === "ready" && Reflect.ownKeys(value).length === 2) return "采集恢复：就绪";
  if (state === "recovering" && Reflect.ownKeys(value).length === 2) return "采集恢复：恢复中";
  if (state !== "blocked" || Reflect.ownKeys(value).length !== 3) return "采集恢复：已阻断";
  const error = Reflect.get(value, "error");
  const detail = typeof error === "string" ? CAPTURE_RECOVERY_ERROR_TEXT[error] : undefined;
  return detail === undefined ? "采集恢复：已阻断" : `采集恢复：已阻断（${detail}）`;
}

let initialized = false;
export function initializePopup(): void {
  if (initialized) return;
  initialized = true;
  const enabled = document.querySelector<HTMLInputElement>("#captureEnabled");
  enabled?.addEventListener("change", () => runPopupOperation(
    () => chrome.runtime.sendMessage({ type: "SET_CAPTURE_ENABLED", enabled: enabled.checked }),
  ));
  document.querySelector("#openConnectionSettings")?.addEventListener("click", () => {
    runPopupOperation(() => chrome.tabs.create({ url: LOCAL_CAPTURE_SETTINGS_URL }));
  });
  bindAction("#retryAll", { type: "RETRY_CAPTURE_OUTBOX" });
  bindAction("#recoverCapture", { type: "RETRY_CAPTURE_RECOVERY" });
  bindAction("#resetCaptureEndpoint", { type: "RESET_CAPTURE_ENDPOINT" });
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

export function renderOrchestratorSnapshot(
  state: OrchestratorState & { readonly captureRecoveryStatus?: CaptureRecoveryStatus },
): void {
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
  setText("#connectionState", presentConnectionStatus(state.captureConnectionStatus));
  setText("#status", state.captureEnabled ? "本地采集已开启" : "本地采集已暂停");
  setText("#recoveryState", presentCaptureRecoveryStatus(state.captureRecoveryStatus));
  setText("#captureEndpoint", `本地接收地址：${state.captureEndpoint}`);
  const enabled = document.querySelector<HTMLInputElement>("#captureEnabled");
  if (enabled !== null) enabled.checked = state.captureEnabled;
  const details = document.querySelector("#quarantineDetails");
  if (details !== null) renderQuarantine(details, state.quarantineDetails);
}

function renderLegacyPresentation(presentation: PopupPresentation, stored: unknown): void {
  setText("#pendingState", presentation.pendingText);
  setText("#outboxState", presentation.outboxText);
  setText("#quarantineState", presentation.quarantineText);
  setText("#lastDelivery", presentation.lastSyncText);
  setText("#lastError", presentation.blockingReasonText);
  setText("#migrationState", presentation.migrationText);
  setText("#transitionState", presentation.transitionText);
  setText("#connectionState", presentation.connectionStateText);
  setText("#status", presentation.captureEnabled ? "本地采集已开启" : "本地采集已暂停");
  setText("#recoveryState", presentation.recoveryText);
  setText("#captureEndpoint", `本地接收地址：${presentation.endpoint}`);
  const enabled = document.querySelector<HTMLInputElement>("#captureEnabled");
  if (enabled !== null) enabled.checked = presentation.captureEnabled;
  const details = document.querySelector("#quarantineDetails");
  if (details !== null) {
    const quarantine = readArray(readField(stored, "captureQuarantine"));
    const malformedOutbox = readArray(readField(stored, "captureOutbox"))
      .map(classifyOutboxEntry)
      .filter((entry) => entry.summary.length > 0);
    renderQuarantine(details, [...quarantine, ...malformedOutbox]);
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
  void error;
  setText("#actionResult", "操作失败：扩展操作失败");
  console.warn("[capture-v4] popup operation failed");
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
  const error = safeStoredCaptureError(readField(value, "error"));
  if (verdict === undefined || platform === undefined || problem === undefined
    || occurredAt === undefined || error === undefined) return "";
  return `${platform} · ${problem} · ${verdict} · ${occurredAt} · ${error}`;
}

function renderQuarantine(container: Element, entries: readonly unknown[]): void {
  container.replaceChildren();
  for (const entry of entries) {
    const presentation = classifyQuarantineEntry(entry);
    if (presentation.summary.length === 0) continue;
    const row = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = presentation.summary;
    if (!presentation.retryable && !presentation.deletable) {
      row.append(text);
      container.append(row);
      continue;
    }
    const controls: HTMLButtonElement[] = [];
    if (presentation.retryable && presentation.id !== undefined) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试此项";
      retry.addEventListener("click", () => runPopupButton(retry, "重试此项", () =>
        chrome.runtime.sendMessage({ type: "RETRY_QUARANTINED_CAPTURE", id: presentation.id })));
      controls.push(retry);
    }
    if (presentation.deletable && presentation.id !== undefined) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除此项";
      remove.addEventListener("click", () => {
        if (window.confirm("确定删除这条隔离结果？此操作不可恢复。")) {
          runPopupButton(remove, "删除此项", () => chrome.runtime.sendMessage({
            type: "DELETE_QUARANTINED_CAPTURE",
            id: presentation.id,
            ...(presentation.malformed === true ? { malformed: true } : {}),
          }));
        }
      });
      controls.push(remove);
    }
    row.append(text, ...controls);
    container.append(row);
  }
}

function isValidQuarantineEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const item = readField(value, "item");
  return readNonEmptyString(readField(value, "id")) !== undefined
    && readNonEmptyString(readField(value, "error")) !== undefined
    && readNonEmptyString(readField(value, "quarantinedAt")) !== undefined
    && isValidOutboxEntry(item);
}

function isValidOutboxEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return readNonEmptyString(readField(value, "id")) !== undefined
    && readField(value, "kind") === "attempt_bundle"
    && typeof readField(value, "attempts") === "number"
    && typeof readField(value, "createdAt") === "string"
    && CaptureAttemptBundleSchema.safeParse(readField(value, "bundle")).success;
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
function readNonnegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
function localizeCaptureError(error: string): string {
  const prefixes: ReadonlyArray<readonly [string, string]> = [
    ["Capability rejected:", "连接已失效："], ["Origin rejected:", "请求来源被拒绝："],
    ["Network unavailable:", "网络不可用："], ["Isolated result:", "结果已隔离："],
    ["ACK mismatch:", "ACK 身份不匹配："],
    ["Storage capacity reached:", "本地存储空间不足："],
  ];
  const match = prefixes.find(([prefix]) => error.startsWith(prefix));
  return match === undefined ? error : `${match[1]}${error.slice(match[0].length).trim()}`;
}
function readConnectionStatus(value: unknown): CaptureConnectionStatus {
  if (value === "connected" || value === "service_unreachable"
    || value === "capability_rejected") return value;
  return "connection_required";
}

// ---------------------------------------------------------------------------
// Characterization controls
// ---------------------------------------------------------------------------

export function readCharacterizationStartSelection(
  hostname: unknown,
  authenticated: unknown,
): { readonly hostname: string; readonly authenticated: boolean } | undefined {
  if (typeof hostname !== "string"
    || characterizationPlatformForHostname(hostname) === undefined
    || typeof authenticated !== "boolean") {
    return undefined;
  }
  return { hostname, authenticated };
}

function bindCharacterizationStart(): void {
  const button = document.querySelector<HTMLButtonElement>("#characterizationStart");
  button?.addEventListener("click", () => {
    // Reset export completed flag on new session start
    resetExportCompleted();
    runPopupButton(button, "开始诊断", async () => {
      const hostname = document.querySelector<HTMLSelectElement>("#characterizationHostname")?.value;
      const authenticated = document.querySelector<HTMLInputElement>("#characterizationAuthenticated")?.checked;
      const start = readCharacterizationStartSelection(hostname, authenticated);
      if (start === undefined) {
        setText("#characterizationResult", "启动失败: 请选择有效主机和登录状态");
        return;
      }
      const result = await chrome.runtime.sendMessage({ type: "CHARACTERIZATION_START", ...start });
      if (isCharacterizationStartResult(result)) {
        setText("#characterizationState", result.session.active ? "诊断模式进行中" : "诊断模式未启用");
        updateCharacterizationButtons(result.session.active, result.b3Status ?? "armed");
        updateWitnessStateDisplay(result.b3Status ?? "armed");
        setText("#characterizationResult", result.session.active ? "已开始" : "启动失败");
        // Refresh status after start
        await renderCharacterization();
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
        updateCharacterizationButtons(false, "armed");
        updateWitnessStateDisplay("armed");
        setText("#characterizationResult", "已停止");
        // Refresh status after stop
        await renderCharacterization();
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
          // B3: Mark that export succeeded - never allow re-export
          markExportCompleted();
          const delivery = await deliverCharacterizationExport(result.document);
          if (result.isB3Export) {
            setText("#characterizationResult", delivery.ok
              ? `B3导出成功`
              : `导出失败: ${delivery.reason}`);
          } else {
            setText("#characterizationResult", delivery.ok
              ? `已下载 ${delivery.count} 条记录`
              : `导出失败: ${delivery.reason}`);
          }
        } else {
          setText("#characterizationResult", `导出失败: ${result.reason}`);
        }
      }
      // Refresh status after export
      await renderCharacterization();
    });
  });
}

/** Track whether export has already succeeded this session. */
let exportCompletedThisSession = false;

/** Mark export as completed - disables export button permanently for this session. */
function markExportCompleted(): void {
  exportCompletedThisSession = true;
  const exportBtn = document.querySelector<HTMLButtonElement>("#characterizationExport");
  if (exportBtn !== null) exportBtn.disabled = true;
}

/** Reset export completed flag (called when starting a new session). */
function resetExportCompleted(): void {
  exportCompletedThisSession = false;
}

async function renderCharacterization(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STATUS" });
    if (isCharacterizationStatusResponse(response)) {
      setText("#characterizationState", response.status);
      // B3 export button: only enabled when session active AND export not completed AND B3 is ready
      const b3Status = response.b3Status ?? "armed";
      updateCharacterizationButtons(
        response.session.active,
        b3Status,
        exportCompletedThisSession,
        response.session.hostname,
        response.session.records?.length ?? 0,
      );
      updateWitnessStateDisplay(b3Status);
    }
  } catch {
    setText("#characterizationState", "诊断模式未启用");
    updateCharacterizationButtons(false, "armed", exportCompletedThisSession);
    updateWitnessStateDisplay("armed");
  }
}

function updateCharacterizationButtons(
  active: boolean,
  b3Status: string,
  alreadyExported = false,
  hostname = "",
  recordCount = 0,
): void {
  const startBtn = document.querySelector<HTMLButtonElement>("#characterizationStart");
  const stopBtn = document.querySelector<HTMLButtonElement>("#characterizationStop");
  const exportBtn = document.querySelector<HTMLButtonElement>("#characterizationExport");
  if (startBtn !== null) startBtn.disabled = active;
  if (stopBtn !== null) stopBtn.disabled = !active;
  // B3: export only enabled when active AND B3 is ready AND not already exported
  // After successful export, never re-enable (popup refresh won't reset this)
  const isNowCoder = characterizationPlatformForHostname(hostname) === "nowcoder";
  const evidenceReady = isNowCoder ? b3Status === "ready" : recordCount > 0;
  const canExport = active && evidenceReady && !alreadyExported && !exportCompletedThisSession;
  if (exportBtn !== null) exportBtn.disabled = !canExport;
}

function updateWitnessStateDisplay(witnessState: string): void {
  const witnessStateEl = document.querySelector("#characterizationWitnessState");
  if (witnessStateEl !== null) {
    const stateLabels: Record<string, string> = {
      armed: "待命中",
      list_seen: "已见列表",
      ready: "就绪",
      invalid: "无效",
    };
    witnessStateEl.textContent = `导航见证: ${stateLabels[witnessState] ?? witnessState}`;
  }
}

function isCharacterizationStartResult(value: unknown): value is { readonly ok: boolean; readonly session: { readonly active: boolean }; readonly b3Status?: string } {
  return typeof value === "object" && value !== null
    && "ok" in value && typeof value.ok === "boolean"
    && "session" in value && typeof value.session === "object" && value.session !== null
    && "active" in value.session && typeof value.session.active === "boolean";
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
    await download(blobUrl, `${value.meta.fixtureName}.json`);
    return { ok: true, count: value.evidence.length };
  } catch (error) {
    void error;
    return { ok: false, reason: "下载失败" };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function isCharacterizationExportResult(value: unknown): value is {
  readonly ok: boolean;
  readonly document?: unknown;
  readonly reason?: string;
  readonly isB3Export?: boolean;
} {
  return typeof value === "object" && value !== null && "ok" in value
    && typeof Reflect.get(value, "ok") === "boolean";
}

export function isCharacterizationExportDocument(value: unknown): value is CharacterizationExportDocument {
  return parseNetworkTranscriptDocument(value).ok;
}

function isCharacterizationStatusResponse(value: unknown): value is {
  readonly session: {
    readonly active: boolean;
    readonly hostname: string;
    readonly records?: readonly unknown[];
    readonly navigationWitnesses?: readonly unknown[];
  };
  readonly status: string;
  readonly b3Status?: string;
  readonly b3Revision?: number;
} {
  return typeof value === "object" && value !== null
    && "session" in value && typeof value.session === "object"
    && "status" in value && typeof value.status === "string";
}

if (typeof document !== "undefined" && typeof chrome !== "undefined") initializePopup();
