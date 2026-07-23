import { describe, expect, it } from "vitest";
import {
  pairingResultText,
  pairingSuccessText,
  presentPopupState,
  requestPairing,
  runButtonAction,
} from "@/extension/src/popup";

describe("extension popup presenter", () => {
  it("distinguishes waiting, outbox, quarantine, and migration counts", () => {
    expect(presentPopupState({
      pendingSubmissionIntents: [{ status: "active" }, { status: "expired" }],
      captureOutbox: [{}],
      captureQuarantine: [{}],
      discardedPreBundleEventCount: 32,
    })).toMatchObject({
      pendingText: "等待判题 1",
      outboxText: "待同步结果 1",
      quarantineText: "已隔离结果 1",
      migrationText: "已清除旧误采集记录 32 条",
    });
  });

  it("keeps empty state and capacity warnings truthful", () => {
    expect(presentPopupState({
      lastCaptureError: "Storage capacity reached: completed result was not persisted",
    })).toMatchObject({
      pendingText: "等待判题 0",
      outboxText: "待同步结果 0",
      quarantineText: "已隔离结果 0",
      migrationText: "未发现旧误采集记录",
      blockingReasonText: "阻塞原因：本地存储空间不足：completed result was not persisted",
    });
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
});
