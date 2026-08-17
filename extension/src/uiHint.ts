import type { Platform } from "./platforms";
import {
  SUBMIT_CONTROL_SELECTOR,
  isExactSubmitControl,
  normalizeControlLabel,
  resolveSubmitControl,
} from "./submissionControl";

export const UI_HINT_TTL_MS = 30_000;
export const UI_HINT_MAX_COUNT = 8;

export type UiHintDraft = {
  readonly schemaVersion: 1;
  readonly tier: "E0";
  readonly kind: "ui_hint";
  readonly platform: Platform;
  readonly problemExternalId: string;
  readonly observedAt: string;
};

export type StoredUiHint = UiHintDraft & {
  readonly sourceDocumentId: string;
};

export type UiHintMessage = {
  readonly type: "UI_HINT_OBSERVED";
  readonly hint: UiHintDraft;
};

export type UiHintSessionStorage = {
  readonly get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
};

export function isEligibleUiHint(input: {
  readonly isTrusted: boolean;
  readonly platform: Platform;
  readonly target: Element | null;
}): boolean {
  if (!input.isTrusted) return false;
  const target = input.target;
  if (target === null) return false;

  const resolution = resolveSubmitControl(target);
  if (resolution.kind !== "control") return false;
  const control = resolution.control;
  if (!isVisibleAndEnabled(control)) return false;

  if (input.platform === "nowcoder") {
    return control.matches("button.btn-submit")
      && normalizeControlLabel(control) === "保存并提交";
  }
  return isExactSubmitControl(input.platform, target);
}

/**
 * Visibility-seeded E0: report whether the document currently contains an
 * exact, visible, enabled submit control for the platform. This seeds the
 * bounded E0 hint BEFORE any click so the hint write can never race the
 * submit E1. It never creates waiting state.
 */
export function isVisibleSeededSubmitControl(
  platform: Platform,
  document: Document,
): boolean {
  if (platform === "nowcoder") {
    for (const control of Array.from(document.querySelectorAll("button.btn-submit"))) {
      if (normalizeControlLabel(control) !== "保存并提交") continue;
      if (isVisibleAndEnabled(control)) return true;
    }
    return false;
  }
  for (const control of Array.from(document.querySelectorAll(SUBMIT_CONTROL_SELECTOR))) {
    if (!isExactSubmitControl(platform, control)) continue;
    if (isVisibleAndEnabled(control)) return true;
  }
  return false;
}

export function isUiHintMessage(value: unknown): value is UiHintMessage {
  if (typeof value !== "object" || value === null) return false;
  if (!("type" in value) || value.type !== "UI_HINT_OBSERVED") return false;
  if (!("hint" in value) || typeof value.hint !== "object" || value.hint === null) {
    return false;
  }
  const hint = value.hint;
  return "schemaVersion" in hint && hint.schemaVersion === 1
    && "tier" in hint && hint.tier === "E0"
    && "kind" in hint && hint.kind === "ui_hint"
    && hasPlatform(hint, "platform")
    && hasNonemptyString(hint, "problemExternalId")
    && hasNonemptyString(hint, "observedAt");
}

export function readStoredUiHints(value: unknown): readonly StoredUiHint[] {
  return Array.isArray(value) ? value.filter(isStoredUiHint) : [];
}

export function retainUiHint(
  existing: readonly StoredUiHint[],
  hint: StoredUiHint,
  now: string,
): readonly StoredUiHint[] {
  const recent = pruneUiHints(existing, now);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return recent;
  const hintMs = Date.parse(hint.observedAt);
  if (!Number.isFinite(hintMs) || hintMs > nowMs || nowMs - hintMs >= UI_HINT_TTL_MS) {
    return recent.slice(-UI_HINT_MAX_COUNT);
  }
  return [...recent, hint].slice(-UI_HINT_MAX_COUNT);
}

export function pruneUiHints(
  existing: readonly StoredUiHint[],
  now: string,
): readonly StoredUiHint[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return [];
  return existing.filter((candidate) => {
    const observedMs = Date.parse(candidate.observedAt);
    return Number.isFinite(observedMs)
      && observedMs <= nowMs
      && nowMs - observedMs < UI_HINT_TTL_MS;
  }).slice(-UI_HINT_MAX_COUNT);
}

export async function pruneStoredUiHints(
  storage: UiHintSessionStorage,
  now: string,
): Promise<readonly StoredUiHint[]> {
  const stored = await storage.get(["uiHints"]);
  const current = readStoredUiHints(stored.uiHints);
  const retained = pruneUiHints(current, now);
  if (retained.length !== current.length) {
    await storage.set({ uiHints: retained });
  }
  return retained;
}

export function nextUiHintExpiry(
  hints: readonly StoredUiHint[],
): number | undefined {
  const expiries = hints
    .map((hint) => Date.parse(hint.observedAt) + UI_HINT_TTL_MS)
    .filter(Number.isFinite);
  return expiries.length === 0 ? undefined : Math.min(...expiries);
}

function isVisibleAndEnabled(control: Element): boolean {
  if (control.closest("[hidden], [aria-hidden=\"true\"]") !== null) return false;
  if (control.matches(":disabled, [disabled], [aria-disabled=\"true\"]")) return false;
  const view = control.ownerDocument.defaultView;
  if (view === null) return false;
  const style = view.getComputedStyle(control);
  return style.display !== "none" && style.visibility !== "hidden";
}

function isStoredUiHint(value: unknown): value is StoredUiHint {
  return isUiHintMessage({
    type: "UI_HINT_OBSERVED",
    hint: value,
  }) && typeof value === "object" && value !== null
    && hasNonemptyString(value, "sourceDocumentId");
}

function hasNonemptyString(value: object, key: string): boolean {
  return key in value
    && typeof Reflect.get(value, key) === "string"
    && String(Reflect.get(value, key)).length > 0;
}

function hasPlatform(value: object, key: string): boolean {
  if (!(key in value)) return false;
  const platform = Reflect.get(value, key);
  return platform === "leetcode" || platform === "nowcoder" || platform === "luogu"
    || platform === "codeforces" || platform === "atcoder";
}
