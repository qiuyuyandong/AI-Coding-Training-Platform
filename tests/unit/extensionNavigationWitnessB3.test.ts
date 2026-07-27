import { describe, expect, it } from "vitest";
import {
  B3_BUILD_SHA,
  buildB3E0Records,
  canB3Export,
  planB3WitnessStateWrite,
  startB3State,
  transitionB3Witness,
  validateB3WitnessState,
} from "@/extension/src/b3Witness";
import { readNavigationWitness } from "@/extension/src/characterizationNavigationWitness";

const NOW = "2026-07-27T03:30:00.000Z";
const LATER = "2026-07-27T03:31:00.000Z";

describe("B3 restart-safe navigation witness", () => {
  it("moves armed to list_seen to ready and exports exactly two E0 records", () => {
    const armed = startB3State(NOW, B3_BUILD_SHA);
    const list = transitionB3Witness(armed, "contest_list", "list-document", 7, NOW, B3_BUILD_SHA);
    expect(list?.status).toBe("list_seen");
    if (list === undefined) return;
    const ready = transitionB3Witness(list, "contest_problem", "problem-document", 7, LATER, B3_BUILD_SHA);
    expect(ready?.status).toBe("ready");
    if (ready === undefined) return;
    expect(canB3Export(ready, LATER, B3_BUILD_SHA)).toBe(true);
    expect(buildB3E0Records(ready)).toMatchObject([
      { pageClass: "contest_list", relativeTimingOrder: 0 },
      { pageClass: "contest_problem", relativeTimingOrder: 1 },
    ]);
  });

  it.each([
    ["problem first", "armed", "contest_problem", 7, "problem-document"],
    ["duplicate list", "list_seen", "contest_list", 7, "second-list-document"],
    ["cross-tab problem", "list_seen", "contest_problem", 8, "problem-document"],
    ["same document", "list_seen", "contest_problem", 7, "list-document"],
  ])("fails closed for %s", (_label, state, pageClass, tabId, documentId) => {
    const armed = startB3State(NOW, B3_BUILD_SHA);
    const current = state === "armed"
      ? armed
      : transitionB3Witness(armed, "contest_list", "list-document", 7, NOW, B3_BUILD_SHA);
    if (current === undefined) return;
    const next = transitionB3Witness(
      current,
      pageClass === "contest_list" ? "contest_list" : "contest_problem",
      documentId,
      tabId,
      LATER,
      B3_BUILD_SHA,
    );
    expect(next?.status).toBe("invalid");
    expect(next?.invalidReason).toBe("invalid_transition");
  });

  it("rejects a build mismatch and malformed stored state", () => {
    const armed = startB3State(NOW, B3_BUILD_SHA);
    expect(validateB3WitnessState({ ...armed, buildSha: "" })).toBe(false);
    expect(transitionB3Witness(armed, "contest_list", "list-document", 7, NOW, "other-build")?.invalidReason)
      .toBe("build_mismatch");
  });

  it("drops raw sender URL and forged message fields before persistence", () => {
    const witness = readNavigationWitness(
      { type: "CHARACTERIZATION_NAVIGATION_OBSERVED", route: "problem", url: "forged", documentId: "forged" },
      {
        id: "extension-id",
        origin: "https://ac.nowcoder.com",
        frameId: 0,
        tab: { id: 7 },
        documentId: "list-document",
        url: "https://ac.nowcoder.com/acm/contest/18839",
      },
      "extension-id",
      NOW,
    );
    const serialized = JSON.stringify(planB3WitnessStateWrite(startB3State(NOW, B3_BUILD_SHA)).items);
    expect(witness?.documentId).toBe("list-document");
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("nowcoder");
    expect(serialized).not.toContain("forged");
  });
});
