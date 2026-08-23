export const CAPTURE_CONTENT_SCRIPT_MATCHES = Object.freeze([
  "https://leetcode.com/problems/*",
  "https://leetcode.com/problems/*/description/*",
  "https://leetcode.com/problems/*/submissions/*",
  "https://leetcode.cn/problems/*",
  "https://leetcode.cn/problems/*/description/*",
  "https://leetcode.cn/problems/*/submissions/*",
  "https://leetcode.cn/submissions/*",
  "https://www.nowcoder.com/practice/*",
  "https://ac.nowcoder.com/acm/problem/*",
  "https://ac.nowcoder.com/acm/contest/18839",
  "https://ac.nowcoder.com/acm/contest/18839/",
  "https://ac.nowcoder.com/acm/contest/18839/1001",
  "https://ac.nowcoder.com/acm/contest/18839/1001/",
  "https://ac.nowcoder.com/acm/contest/view-submission*",
  "https://www.luogu.com.cn/problem/*",
  "https://www.luogu.com.cn/record/*",
  "https://codeforces.com/problemset/problem/*",
  "https://atcoder.jp/contests/*/tasks/*",
  "https://atcoder.jp/contests/*/submissions/*",
] as const);

export const MAX_CAPTURE_RECOVERY_DOCUMENTS = 100;
export const MAX_CAPTURE_RECOVERY_CONCURRENCY = 4;
export const MAX_CAPTURE_RECOVERY_INJECTIONS = 3;
export const CAPTURE_RECOVERY_READY_TIMEOUT_MS = 2_000;
export const CAPTURE_RECOVERY_RETRY_MINUTES = Object.freeze([1, 5, 15] as const);

export type CaptureRecoveryError =
  | "unsupported_browser"
  | "capture_recovery_capacity_exceeded"
  | "capture_recovery_failed";

export type CaptureRecoveryStatus =
  | Readonly<{ readonly schemaVersion: 1; readonly state: "ready" }>
  | Readonly<{ readonly schemaVersion: 1; readonly state: "recovering" }>
  | Readonly<{ readonly schemaVersion: 1; readonly state: "blocked"; readonly error: CaptureRecoveryError | "initialization_failed" | "persistence_failed" | "unsupported_capture_endpoint" }>;

export type CaptureRecoveryDocument = Readonly<{
  readonly tabId: number;
  readonly documentId: string;
  readonly url: string;
}>;

export type CaptureRecoveryFrame = Readonly<{
  readonly frameId: number;
  readonly documentId?: string;
  readonly url: string;
}>;

export type CaptureRecoveryTabFrames = Readonly<{
  readonly tabId: number;
  readonly frames: readonly CaptureRecoveryFrame[];
}>;

function wildcardPathMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
  return new RegExp(`^${escaped}$`, "u").test(value);
}

export function isCaptureContentScriptUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "" || url.port !== "") return false;
  return CAPTURE_CONTENT_SCRIPT_MATCHES.some((pattern) => {
    const separator = pattern.indexOf("://");
    const slash = pattern.indexOf("/", separator + 3);
    if (separator < 1 || slash < 0) return false;
    const protocol = pattern.slice(0, separator + 1);
    const hostname = pattern.slice(separator + 3, slash);
    const path = pattern.slice(slash);
    return url.protocol === protocol
      && url.hostname === hostname
      && wildcardPathMatches(path, `${url.pathname}${url.search}`);
  });
}

export function collectCaptureRecoveryDocuments(
  tabs: readonly CaptureRecoveryTabFrames[],
):
  | Readonly<{ readonly ok: true; readonly documents: readonly CaptureRecoveryDocument[] }>
  | Readonly<{ readonly ok: false; readonly error: "unsupported_browser" }> {
  const documents: CaptureRecoveryDocument[] = [];
  const identities = new Set<string>();
  for (const tab of tabs) {
    if (!Number.isInteger(tab.tabId) || tab.tabId < 0) return { ok: false, error: "unsupported_browser" };
    const mainFrames = tab.frames.filter((frame) => frame.frameId === 0);
    if (mainFrames.length !== 1) return { ok: false, error: "unsupported_browser" };
    const frame = mainFrames[0];
    if (frame === undefined || !isCaptureContentScriptUrl(frame.url)
      || typeof frame.documentId !== "string" || frame.documentId.length === 0
      || identities.has(frame.documentId)) {
      return { ok: false, error: "unsupported_browser" };
    }
    identities.add(frame.documentId);
    documents.push({ tabId: tab.tabId, documentId: frame.documentId, url: frame.url });
  }
  return { ok: true, documents };
}

export async function recoverCaptureDocuments(
  documents: readonly CaptureRecoveryDocument[],
  injectAndWaitForReady: (document: CaptureRecoveryDocument, attempt: number) => Promise<boolean>,
): Promise<
  | Readonly<{ readonly ok: true; readonly recovered: number }>
  | Readonly<{ readonly ok: false; readonly error: CaptureRecoveryError }>
> {
  if (documents.length > MAX_CAPTURE_RECOVERY_DOCUMENTS) {
    return { ok: false, error: "capture_recovery_capacity_exceeded" };
  }
  if (documents.some((document) => !Number.isInteger(document.tabId) || document.tabId < 0
    || document.documentId.length === 0 || !isCaptureContentScriptUrl(document.url))) {
    return { ok: false, error: "unsupported_browser" };
  }

  let cursor = 0;
  let failed = false;
  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      const document = documents[index];
      if (document === undefined) return;
      let ready = false;
      for (let attempt = 1; attempt <= MAX_CAPTURE_RECOVERY_INJECTIONS; attempt += 1) {
        try {
          ready = await injectAndWaitForReady(document, attempt);
        } catch {
          ready = false;
        }
        if (ready) break;
      }
      if (!ready) failed = true;
    }
  }

  const workerCount = Math.min(MAX_CAPTURE_RECOVERY_CONCURRENCY, documents.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return failed
    ? { ok: false, error: "capture_recovery_failed" }
    : { ok: true, recovered: documents.length };
}

export function nextCaptureRecoveryRetry(
  completedAttempts: number,
): Readonly<{ readonly attempt: number; readonly delayMinutes: 1 | 5 | 15 }> | undefined {
  const delayMinutes = CAPTURE_RECOVERY_RETRY_MINUTES[completedAttempts];
  return delayMinutes === undefined
    ? undefined
    : { attempt: completedAttempts + 1, delayMinutes };
}
