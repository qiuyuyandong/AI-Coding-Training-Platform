import { describe, expect, it } from "vitest";

import {
  UI_HINT_MAX_COUNT,
  UI_HINT_TTL_MS,
  isEligibleUiHint,
  pruneStoredUiHints,
  retainUiHint,
} from "@/extension/src/uiHint";

function target(html: string, selector = "button"): Element {
  document.body.innerHTML = html;
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`Missing test target: ${selector}`);
  return element;
}

describe("V4 Phase 0 UI hints", () => {
  it("rejects an untrusted event before target semantics", () => {
    expect(isEligibleUiHint({
      isTrusted: false,
      platform: "leetcode",
      target: target("<button>Submit</button>"),
    })).toBe(false);
  });

  it.each([
    ["hidden", '<button hidden>Submit</button>'],
    ["display none", '<button style="display:none">Submit</button>'],
    ["disabled", "<button disabled>Submit</button>"],
    ["aria-disabled", '<button aria-disabled="true">Submit</button>'],
  ])("rejects a %s control", (_name, html) => {
    expect(isEligibleUiHint({
      isTrusted: true,
      platform: "leetcode",
      target: target(html),
    })).toBe(false);
  });

  it.each([
    ["generic exact button", "<button>保存并提交</button>", "button"],
    ["role button", '<div role="button">保存并提交</div>', "div"],
    ["short label", '<button class="btn-submit">提交</button>', "button"],
  ])("rejects NowCoder %s", (_name, html, selector) => {
    expect(isEligibleUiHint({
      isTrusted: true,
      platform: "nowcoder",
      target: target(html, selector),
    })).toBe(false);
  });

  it("accepts only the observed NowCoder control contract", () => {
    expect(isEligibleUiHint({
      isTrusted: true,
      platform: "nowcoder",
      target: target(
        '<button class="btn btn-submit"><span>保存并提交</span></button>',
        "span",
      ),
    })).toBe(true);
  });

  it("expires old hints and bounds the session-only collection", () => {
    const now = "2026-07-24T00:01:00.000Z";
    const existing = Array.from({ length: UI_HINT_MAX_COUNT }, (_value, index) => ({
      schemaVersion: 1 as const,
      tier: "E0" as const,
      kind: "ui_hint" as const,
      platform: "leetcode" as const,
      problemExternalId: `problem_${index}`,
      sourceDocumentId: `document_${index}`,
      observedAt: new Date(Date.parse(now) - UI_HINT_TTL_MS + index).toISOString(),
    }));

    const retained = retainUiHint(existing, {
      schemaVersion: 1,
      tier: "E0",
      kind: "ui_hint",
      platform: "leetcode",
      problemExternalId: "latest",
      sourceDocumentId: "document_latest",
      observedAt: now,
    }, now);

    expect(retained).toHaveLength(UI_HINT_MAX_COUNT);
    expect(retained.at(-1)?.problemExternalId).toBe("latest");
    expect(retained.some((hint) => hint.problemExternalId === "problem_0")).toBe(false);
  });

  it("removes a lone hint from session storage after TTL without another click", async () => {
    const values: Record<string, unknown> = {
      uiHints: [{
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: "leetcode",
        problemExternalId: "two-sum",
        sourceDocumentId: "document_1",
        observedAt: "2026-07-24T00:00:00.000Z",
      }],
    };
    const writes: Record<string, unknown>[] = [];
    const storage = {
      get: async () => values,
      set: async (items: Record<string, unknown>) => {
        Object.assign(values, items);
        writes.push(items);
      },
    };

    await expect(pruneStoredUiHints(
      storage,
      new Date(Date.parse("2026-07-24T00:00:00.000Z") + UI_HINT_TTL_MS).toISOString(),
    )).resolves.toEqual([]);
    expect(writes).toEqual([{ uiHints: [] }]);
    expect(values.uiHints).toEqual([]);
  });

  it("retains E0 one millisecond before TTL without rewriting session storage", async () => {
    const observedAt = "2026-07-24T00:00:00.000Z";
    const values: Record<string, unknown> = {
      uiHints: [{
        schemaVersion: 1,
        tier: "E0",
        kind: "ui_hint",
        platform: "leetcode",
        problemExternalId: "two-sum",
        sourceDocumentId: "document_1",
        observedAt,
      }],
    };
    const writes: Record<string, unknown>[] = [];
    const storage = {
      get: async () => values,
      set: async (items: Record<string, unknown>) => {
        Object.assign(values, items);
        writes.push(items);
      },
    };
    const now = new Date(Date.parse(observedAt) + UI_HINT_TTL_MS - 1).toISOString();

    const retained = await pruneStoredUiHints(storage, now);
    expect(retained).toHaveLength(1);
    expect(values.uiHints).toHaveLength(1);
    expect(writes).toEqual([]);
  });
});
