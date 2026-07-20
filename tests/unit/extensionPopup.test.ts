import { describe, expect, it } from "vitest";
import {
  pairingResultText,
  pairingSuccessText,
  presentPopupState,
} from "@/extension/src/popup";

describe("extension popup presenter", () => {
  it.each([
    ["SESSION_STARTED", "页面会话", false],
    ["SESSION_ENDED", "页面会话", false],
    ["SUBMISSION_OBSERVED", "提交动作", true],
    ["VERDICT_OBSERVED", "判题结果", true],
  ] as const)(
    "presents %s as %s without calling a session event a submission",
    (eventType, expectedLabel, createdAttempt) => {
      const presentation = presentPopupState({
        eventQueue: [{ event: { id: "queued_1" } }],
        lastDeliveredEventType: eventType,
        lastDeliveredEventId: "event_1",
        lastDeliveredEventOccurredAt: "2026-07-20T09:00:00.000Z",
        lastSuccessfulCaptureAt: "2026-07-20T09:00:01.000Z",
        lastDeliveredCreatedAttempt: createdAttempt,
        lastDeliveredAttemptStatus: createdAttempt ? "draft" : undefined,
      });

      expect(presentation.queueText).toBe("待发送事件 1");
      expect(presentation.deliveryText).toBe(`最近送达：${expectedLabel}`);
      expect(presentation.deliveryMetaText).toContain("事件 event_1");
      expect(presentation.deliveryMetaText).toContain("发生于 2026-07-20T09:00:00.000Z");
      expect(presentation.deliveryMetaText).toContain("送达于 2026-07-20T09:00:01.000Z");
      expect(presentation.attemptText).toBe(createdAttempt
        ? "已形成训练记录 · 等待判题"
        : "尚未形成训练记录");
      if (eventType === "SESSION_STARTED" || eventType === "SESSION_ENDED") {
        expect(presentation.deliveryText).not.toContain("提交");
      }
    },
  );

  it("shows a verdict materialization result and a localized blocking reason", () => {
    const presentation = presentPopupState({
      captureEnabled: false,
      eventQueue: [1, 2],
      lastDeliveredEventType: "VERDICT_OBSERVED",
      lastDeliveredEventId: "event_verdict",
      lastDeliveredCreatedAttempt: true,
      lastDeliveredAttemptId: "attempt_1",
      lastDeliveredAttemptStatus: "passed",
      lastCaptureError: "Pairing required: credential was revoked",
      captureCredential: "capture_secret",
      captureCredentialVersion: 2,
    });

    expect(presentation.captureStatusText).toBe("本地采集已暂停");
    expect(presentation.queueText).toBe("待发送事件 2");
    expect(presentation.deliveryText).toBe("最近送达：判题结果");
    expect(presentation.attemptText).toBe("已形成训练记录 · 已通过");
    expect(presentation.blockingReasonText).toBe(
      "阻塞原因：需要重新配对：credential was revoked",
    );
    expect(presentation.pairingStateText).toBe("配对需要处理");
  });

  it("keeps empty and malformed stored state truthful", () => {
    expect(presentPopupState(null)).toMatchObject({
      queueText: "待发送事件 0",
      deliveryText: "最近送达：暂无",
      attemptText: "训练记录：暂无送达结果",
      blockingReasonText: "阻塞原因：无",
      pairingStateText: "未配对",
    });
  });

  it("hides credential versions while distinguishing first pairing and rotation", () => {
    expect(pairingSuccessText(1)).toBe("已配对");
    expect(pairingResultText(1)).toBe("已配对");
    expect(pairingSuccessText(2)).toBe("已配对 · 凭证已轮换");
    expect(pairingResultText(2)).toBe("凭证已轮换");

    for (const text of [
      pairingSuccessText(1),
      pairingResultText(1),
      pairingSuccessText(2),
      pairingResultText(2),
    ]) {
      expect(text).not.toContain("credential");
      expect(text).not.toMatch(/v\d+/i);
    }
  });
});
