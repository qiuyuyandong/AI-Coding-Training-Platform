import { describe, expect, it } from "vitest";
import {
  pairingResultText,
  pairingSuccessText,
  presentPopupState,
  requestPairing,
  runButtonAction,
  deliverCharacterizationExport,
  isCharacterizationExportDocument,
  readCharacterizationStartSelection,
} from "@/extension/src/popup";
import { parseNetworkTranscriptEvidence, parseNetworkTranscriptMeta } from "@/tests/helpers/networkTranscriptContract";

const exportDocument = {
  meta: {
    fixtureName: "nowcoder-characterization-2026-07-26",
    sourceUrl: "https://www.nowcoder.com/",
    captureDate: "2026-07-26",
    captureMethod: "extension characterization export",
    authenticated: false,
    sanitized: true,
    evidenceTier: "characterization-derived",
    productionEligible: false,
    signals: [{ kind: "network_request_observed", platform: "nowcoder", tier: "E1" }],
  },
  evidence: [{
    schemaVersion: 1, evidenceId: "e1_nowcoder_export", platform: "nowcoder", tier: "E1",
    kind: "network_request_observed", receivedAt: "2026-07-26T12:00:00.000Z",
    tabId: 1, frameId: 0, documentId: "doc-export", requestId: "request-export",
    method: "POST", normalizedPath: "/submit", resourceType: "xmlhttprequest",
  }],
} as const;

describe("extension popup presenter", () => {
  it("distinguishes waiting, outbox, quarantine, and migration counts", () => {
    expect(presentPopupState({
      pendingSubmissionIntents: [{ status: "active" }, { status: "active" }],
      confirmedSubmissions: [{
        schemaVersion: 1,
        status: "confirmed",
        platform: "atcoder",
        problemExternalId: "abc100_a",
        externalSubmissionId: "123",
        confirmedAt: "2026-07-24T00:00:00.000Z",
      }],
      uiHints: [{ tier: "E0" }],
      captureOutbox: [{}],
      captureQuarantine: [{}],
      v4ClickIntentMigration: {
        removedActiveIntentCount: 32,
        reason: "click_only_intents_not_server_confirmed",
      },
    })).toMatchObject({
      pendingText: "等待判题 1",
      outboxText: "待同步结果 1",
      quarantineText: "已隔离结果 1",
      migrationText: "已移除未经服务器确认的等待记录 32 条",
      transitionText: "网络确认采集尚未启用",
    });
  });

  it("keeps empty state and capacity warnings truthful", () => {
    expect(presentPopupState({
      lastCaptureError: "Storage capacity reached: completed result was not persisted",
    })).toMatchObject({
      pendingText: "等待判题 0",
      outboxText: "待同步结果 0",
      quarantineText: "已隔离结果 0",
      migrationText: "未发现点击创建的等待记录",
      blockingReasonText: "阻塞原因：本地存储空间不足：completed result was not persisted",
    });
  });

  it("ignores malformed confirmed state instead of increasing waiting", () => {
    expect(presentPopupState({
      confirmedSubmissions: [
        { status: "confirmed" },
        { schemaVersion: 99, status: "confirmed" },
      ],
      pendingSubmissionIntents: [{ status: "active" }],
    }).pendingText).toBe("等待判题 0");
  });

  it("does not expose credential versions", () => {
    expect(pairingSuccessText(1)).toBe("已配对");
    expect(pairingSuccessText(2)).toBe("已配对 · 凭证已轮换");
    expect(pairingResultText(2)).toBe("凭证已轮换");
  });

  it("returns a user-visible error when pairing messaging rejects", async () => {
    const result = await requestPairing(
      async () => { throw new Error("配对服务暂不可用"); },
      "PAIR-1234",
    );
    expect(result).toEqual({ ok: false, text: "配对服务暂不可用" });
  });

  it("keeps visible button feedback until an action settles", async () => {
    const button = document.createElement("button");
    let finishOperation: (() => void) | undefined;
    const operation = new Promise<void>((resolve) => { finishOperation = resolve; });
    const result = runButtonAction(
      button,
      () => operation,
      () => undefined,
      async () => undefined,
    );

    expect(button.classList.contains("is-pressed")).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    finishOperation?.();
    await expect(result).resolves.toBe(true);
    expect(button.classList.contains("is-pressed")).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });

  it("restores a button and reports a rejected action", async () => {
    const button = document.createElement("button");
    const errors: unknown[] = [];
    const failure = new Error("service worker unavailable");

    await expect(runButtonAction(
      button,
      async () => { throw failure; },
      (error) => errors.push(error),
      async () => undefined,
    )).resolves.toBe(false);

    expect(errors).toEqual([failure]);
    expect(button.classList.contains("is-pressed")).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it("preserves required hostname and authentication choices at start", () => {
    expect(readCharacterizationStartSelection("ac.nowcoder.com", true)).toEqual({
      hostname: "ac.nowcoder.com", authenticated: true,
    });
    expect(readCharacterizationStartSelection("www.nowcoder.com", false)).toEqual({
      hostname: "www.nowcoder.com", authenticated: false,
    });
    expect(readCharacterizationStartSelection("leetcode.cn", true)).toEqual({
      hostname: "leetcode.cn", authenticated: true,
    });
    expect(readCharacterizationStartSelection("leetcode.com", false)).toEqual({
      hostname: "leetcode.com", authenticated: false,
    });
    expect(readCharacterizationStartSelection("example.com", false)).toBeUndefined();
  });

  it("downloads only a complete B1 document and the actual B1 parsers accept it", async () => {
    expect(isCharacterizationExportDocument(exportDocument)).toBe(true);
    expect(parseNetworkTranscriptMeta(exportDocument.meta).ok).toBe(true);
    expect(parseNetworkTranscriptEvidence(exportDocument.evidence[0]).ok).toBe(true);
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:characterization-export";
    URL.revokeObjectURL = () => undefined;
    const downloads: Array<readonly [string, string]> = [];
    try {
      await expect(deliverCharacterizationExport(exportDocument, async (url, filename) => {
        downloads.push([url, filename]);
      })).resolves.toEqual({ ok: true, count: 1 });
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
    expect(downloads).toEqual([["blob:characterization-export", "nowcoder-characterization-2026-07-26.json"]]);
  });

  it("uses the characterized platform in the downloaded filename", async () => {
    const leetcodeDocument = {
      ...exportDocument,
      meta: {
        ...exportDocument.meta,
        fixtureName: "leetcode-characterization-2026-07-26",
        sourceUrl: "https://leetcode.cn/",
        signals: [{ kind: "network_request_observed", platform: "leetcode", tier: "E1" }],
      },
      evidence: [{
        ...exportDocument.evidence[0],
        evidenceId: "e1_leetcode_export",
        platform: "leetcode",
        normalizedPath: "/problems/two-sum/submit/",
      }],
    } as const;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:leetcode-characterization-export";
    URL.revokeObjectURL = () => undefined;
    const filenames: string[] = [];
    try {
      await expect(deliverCharacterizationExport(leetcodeDocument, async (_url, filename) => {
        filenames.push(filename);
      })).resolves.toEqual({ ok: true, count: 1 });
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
    expect(filenames).toEqual(["leetcode-characterization-2026-07-26.json"]);
  });

  it("accepts authenticated ac.nowcoder.com output and rejects dishonest unauthenticated metadata", () => {
    const authenticated = {
      ...exportDocument,
      meta: {
        ...exportDocument.meta,
        sourceUrl: "https://ac.nowcoder.com/",
        authenticated: true,
        evidenceTier: "authenticated-characterization",
      },
    };
    expect(isCharacterizationExportDocument(authenticated)).toBe(true);
    expect(isCharacterizationExportDocument({
      ...authenticated,
      meta: { ...authenticated.meta, authenticated: false },
    })).toBe(false);
    expect(isCharacterizationExportDocument(exportDocument)).toBe(true);
  });

  it("does not deliver an incomplete or unsafe export payload", async () => {
    const invalid = { ...exportDocument, evidence: [{ ...exportDocument.evidence[0], requestBody: "unsafe" }] };
    let delivered = false;
    await expect(deliverCharacterizationExport(invalid, async () => { delivered = true; }))
      .resolves.toEqual({ ok: false, reason: "导出文档未通过 B1 安全校验" });
    expect(delivered).toBe(false);
  });
});
