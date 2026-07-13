import { describe, expect, it } from "vitest";
import {
  CAPTURE_PROTOCOL_VERSION,
  planExtensionInitialization,
} from "@/extension/src/installation";

const options = {
  now: "2026-07-14T00:00:00.000Z",
  createInstallationId: () => "installation_new",
};

describe("planExtensionInitialization", () => {
  it("discards a V1 queue once and records the count", () => {
    const plan = planExtensionInitialization(
      {
        captureProtocolVersion: 1,
        installationId: "installation_existing",
        eventQueue: [{ event: { id: "evt_1" } }, { event: { id: "evt_2" } }],
      },
      options,
    );

    expect(plan).toMatchObject({
      installationId: "installation_existing",
      captureProtocolVersion: CAPTURE_PROTOCOL_VERSION,
      eventQueue: [],
      discardedLegacyEventCount: 2,
      legacyQueueDiscardedAt: "2026-07-14T00:00:00.000Z",
      shouldLogLegacyDiscard: true,
    });
  });

  it("preserves valid V2 queue items without logging another cutover", () => {
    const v2Event = {
      schemaVersion: 2,
      id: "evt_session_1",
      type: "SESSION_STARTED",
      captureSessionId: "session_1",
      installationId: "installation_existing",
      adapterVersion: "multi-platform@0.2.0",
      parserVersion: "visible-verdict@0.2.0",
      pageOrigin: "https://leetcode.com",
      provenanceLevel: "extension_unpaired",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-14T00:00:00.000Z",
      payload: { source: "content_script" },
    };
    const plan = planExtensionInitialization(
      {
        captureProtocolVersion: 2,
        installationId: "installation_existing",
        eventQueue: [{ event: v2Event, attempts: 0 }],
        discardedLegacyEventCount: 3,
        legacyQueueDiscardedAt: "2026-07-13T00:00:00.000Z",
      },
      options,
    );

    expect(plan.eventQueue).toHaveLength(1);
    expect(plan.discardedLegacyEventCount).toBe(3);
    expect(plan.legacyQueueDiscardedAt).toBe("2026-07-13T00:00:00.000Z");
    expect(plan.shouldLogLegacyDiscard).toBe(false);
  });

  it("creates an installation ID only when none exists", () => {
    expect(planExtensionInitialization({}, options).installationId).toBe(
      "installation_new",
    );
    expect(
      planExtensionInitialization(
        { installationId: "installation_existing" },
        options,
      ).installationId,
    ).toBe("installation_existing");
  });
});
