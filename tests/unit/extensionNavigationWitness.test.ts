import { describe, expect, it } from "vitest";
import { readNavigationWitness } from "@/extension/src/characterizationNavigationWitness";

const at = "2026-07-27T03:30:00.000Z";
const sender = {
  id: "extension-id", origin: "https://ac.nowcoder.com", frameId: 0,
  tab: { id: 7 }, documentId: "document-list", url: "https://ac.nowcoder.com/acm/contest/18839",
};

describe("B3 navigation witness", () => {
  it("reduces the exact contest list sender to safe E0 evidence", () => {
    expect(readNavigationWitness({ type: "CHARACTERIZATION_NAVIGATION_OBSERVED" }, sender, "extension-id", at, 0))
      .toMatchObject({ tier: "E0", kind: "navigation_witness", pageClass: "contest_list", tabId: 7 });
  });

  it.each([
    "https://ac.nowcoder.com/acm/contest/18839?token=no",
    "https://ac.nowcoder.com/acm/contest/18839/1001#section",
    "https://ac.nowcoder.com/acm/contest/18839/1002",
    "https://ac.nowcoder.com.evil.example/acm/contest/18839",
  ])("rejects unsafe or unauthorized sender URL", (url) => {
    expect(readNavigationWitness({ type: "CHARACTERIZATION_NAVIGATION_OBSERVED" }, { ...sender, url }, "extension-id", at, 0)).toBeUndefined();
  });

  it("rejects a non-main-frame or foreign sender", () => {
    expect(readNavigationWitness({ type: "CHARACTERIZATION_NAVIGATION_OBSERVED" }, { ...sender, frameId: 1 }, "extension-id", at, 0)).toBeUndefined();
    expect(readNavigationWitness({ type: "CHARACTERIZATION_NAVIGATION_OBSERVED" }, { ...sender, id: "foreign" }, "extension-id", at, 0)).toBeUndefined();
  });
});
