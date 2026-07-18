import { describe, expect, it } from "vitest";
import {
  PROJECTOR_VERSION,
  computeInputFingerprint,
  projectAbility,
  type AttemptRef,
  type ProjectorInput,
} from "@/lib/services/abilityProjector";
import type { AttemptNodeMappingRow } from "@/lib/domain/ability";

/**
 * Pure-function tests for `lib/services/abilityProjector.ts`.
 *
 * The projector is fully pure: it never imports SQLite, never touches
 * the file system, and never reads `process.env`. Every test feeds
 * hand-built fixtures and asserts the deterministic V0 rules from Todo
 * 14 of the `2026-07-17-v0-manual-learning-loop-vertical-slice` plan.
 */

const LEARNER_ID = "local-default-learner";
const NODE_ID = "cpp-io-types";
const CANONICAL_PROBLEM_ID = "atcoder-practice-1";
const ALTERNATE_PROBLEM_ID = "atcoder-abc086-a";

function makeMapping(
  nodeId: string,
  attemptId: string,
  role: "primary" | "supporting",
): AttemptNodeMappingRow {
  return {
    id: `mapping_${attemptId}_${nodeId}`,
    attempt_id: attemptId,
    node_id: nodeId,
    role,
    mapping_reason: `auto-mapping:${role}`,
    created_at: "2026-07-17T00:00:00.000Z",
  };
}

function makeAttempt(
  id: string,
  result: AttemptRef["result"],
  startedAt: string,
  options: {
    readonly revision?: number;
    readonly voided?: boolean;
    readonly canonicalProblemId?: string;
  } = {},
): AttemptRef {
  return {
    id,
    revision: options.revision ?? 1,
    result,
    voided: options.voided ?? false,
    startedAt,
    canonicalProblemId: options.canonicalProblemId ?? CANONICAL_PROBLEM_ID,
  };
}

function buildInput(
  nodeIds: readonly string[],
  mappings: ReadonlyArray<{
    readonly mapping: AttemptNodeMappingRow;
    readonly attempt: AttemptRef;
  }>,
  options: {
    readonly now?: string;
    readonly previousSnapshots?: ProjectorInput["previousSnapshots"];
  } = {},
): ProjectorInput {
  return {
    learnerId: LEARNER_ID,
    mappings,
    nodeIds,
    previousSnapshots: options.previousSnapshots,
    now: options.now ?? "2026-07-17T00:00:00.000Z",
  };
}

describe("computeInputFingerprint", () => {
  it("is deterministic for identical inputs", () => {
    const inputA = buildInput([NODE_ID], [
      {
        mapping: makeMapping(NODE_ID, "a1", "primary"),
        attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
      },
    ]);
    const inputB = buildInput([NODE_ID], [
      {
        mapping: makeMapping(NODE_ID, "a1", "primary"),
        attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
      },
    ]);
    expect(computeInputFingerprint(inputA)).toBe(
      computeInputFingerprint(inputB),
    );
  });

  it("returns a 64-character hex SHA-256 digest", () => {
    const fingerprint = computeInputFingerprint(buildInput([NODE_ID], []));
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs when a mapping's role flips primary to supporting", () => {
    const base = buildInput([NODE_ID], [
      {
        mapping: makeMapping(NODE_ID, "a1", "primary"),
        attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
      },
    ]);
    const flipped = buildInput([NODE_ID], [
      {
        mapping: makeMapping(NODE_ID, "a1", "supporting"),
        attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
      },
    ]);
    expect(computeInputFingerprint(base)).not.toBe(
      computeInputFingerprint(flipped),
    );
  });

  it("encodes the projector version into the digest", () => {
    expect(PROJECTOR_VERSION).toBe("v0-ability-projector-1");
    const fingerprint = computeInputFingerprint(buildInput([NODE_ID], []));
    expect(fingerprint.length).toBe(64);
  });
});

describe("projectAbility", () => {
  it("returns L1/low for a single qualifying primary pass", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L1");
    expect(projection?.confidence).toBe("low");
    expect(projection?.evidenceCount).toBe(1);
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0]).toMatchObject({
      nodeId: NODE_ID,
      previousLevel: "unassessed",
      newLevel: "L1",
    });
    expect(result.transitions[0]?.reasonCodes).toContain("primary_first_pass");
    expect(result.transitions[0]?.sourceAttemptIds).toEqual(["a1"]);
  });

  it("promotes to L2/medium for a second pass 7+ days later", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "passed", "2026-07-01T00:00:00.000Z"),
        },
        {
          mapping: makeMapping(NODE_ID, "a2", "primary"),
          attempt: makeAttempt("a2", "passed", "2026-07-15T00:00:00.000Z"),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L2");
    expect(projection?.confidence).toBe("medium");
    const transition = result.transitions.find(
      (entry) => entry.newLevel === "L2",
    );
    expect(transition?.reasonCodes).toContain(
      "primary_second_pass_delayed_reverification",
    );
    expect(transition?.sourceAttemptIds).toEqual(["a1", "a2"]);
  });

  it("promotes to L2/medium for distinct canonical problems", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt(
            "a1",
            "passed",
            "2026-07-10T00:00:00.000Z",
            { canonicalProblemId: CANONICAL_PROBLEM_ID },
          ),
        },
        {
          mapping: makeMapping(NODE_ID, "a2", "primary"),
          attempt: makeAttempt(
            "a2",
            "passed",
            "2026-07-10T01:00:00.000Z",
            { canonicalProblemId: ALTERNATE_PROBLEM_ID },
          ),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L2");
    expect(projection?.confidence).toBe("medium");
    const transition = result.transitions.find(
      (entry) => entry.newLevel === "L2",
    );
    expect(transition?.reasonCodes).toContain(
      "primary_second_pass_distinct_problem",
    );
  });

  it("caps at L1/low for short-window repeats on the same canonical problem", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
        },
        {
          mapping: makeMapping(NODE_ID, "a2", "primary"),
          attempt: makeAttempt("a2", "passed", "2026-07-10T02:00:00.000Z"),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L1");
    expect(projection?.confidence).toBe("low");
    const transition = result.transitions.find(
      (entry) => entry.newLevel === "L1",
    );
    expect(transition?.reasonCodes).toContain("primary_repeat_short_window");
  });

  it("promotes on a later qualifying pass after two short-window passes", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "passed", "2026-07-01T00:00:00.000Z"),
        },
        {
          mapping: makeMapping(NODE_ID, "a2", "primary"),
          attempt: makeAttempt("a2", "passed", "2026-07-01T02:00:00.000Z"),
        },
        {
          mapping: makeMapping(NODE_ID, "a3", "primary"),
          attempt: makeAttempt("a3", "passed", "2026-07-09T00:00:00.000Z"),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L2");
    expect(projection?.confidence).toBe("medium");
    expect(result.transitions[0]?.sourceAttemptIds).toEqual(["a1", "a3"]);
    expect(result.transitions[0]?.reasonCodes).toContain(
      "primary_second_pass_delayed_reverification",
    );
  });

  it("marks a projection stale at the 30-day boundary without lowering it", () => {
    const result = projectAbility(
      buildInput(
        [NODE_ID],
        [
          {
            mapping: makeMapping(NODE_ID, "a1", "primary"),
            attempt: makeAttempt("a1", "passed", "2026-06-01T00:00:00.000Z"),
          },
        ],
        { now: "2026-07-01T00:00:00.000Z" },
      ),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L1");
    expect(projection?.stale).toBe(true);
  });

  it("keeps unassessed/low for a single failed primary attempt", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "failed", "2026-07-10T00:00:00.000Z"),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("unassessed");
    expect(projection?.confidence).toBe("low");
    expect(projection?.evidenceCount).toBe(1);
    expect(result.transitions).toHaveLength(0);
  });

  it("does not lower L1 on a single ordinary failure after a pass", () => {
    const result = projectAbility(
      buildInput(
        [NODE_ID],
        [
          {
            mapping: makeMapping(NODE_ID, "a1", "primary"),
            attempt: makeAttempt("a1", "passed", "2026-07-01T00:00:00.000Z"),
          },
          {
            mapping: makeMapping(NODE_ID, "a2", "primary"),
            attempt: makeAttempt("a2", "failed", "2026-07-10T00:00:00.000Z"),
          },
        ],
        {
          previousSnapshots: new Map([
            [
              NODE_ID,
              {
                visibleLevel: "L1",
                confidence: "low",
                evidenceCount: 1,
              },
            ],
          ]),
        },
      ),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L1");
    expect(projection?.confidence).toBe("low");
    // No level change → no transition.
    expect(result.transitions).toHaveLength(0);
  });

  it("lowers L1 by one step when two latest primary attempts are both failures", () => {
    const result = projectAbility(
      buildInput(
        [NODE_ID],
        [
          {
            mapping: makeMapping(NODE_ID, "a1", "primary"),
            attempt: makeAttempt("a1", "passed", "2026-07-01T00:00:00.000Z"),
          },
          {
            mapping: makeMapping(NODE_ID, "a2", "primary"),
            attempt: makeAttempt("a2", "failed", "2026-07-10T00:00:00.000Z"),
          },
          {
            mapping: makeMapping(NODE_ID, "a3", "primary"),
            attempt: makeAttempt("a3", "stuck", "2026-07-15T00:00:00.000Z"),
          },
        ],
        {
          previousSnapshots: new Map([
            [
              NODE_ID,
              {
                visibleLevel: "L1",
                confidence: "low",
                evidenceCount: 1,
              },
            ],
          ]),
        },
      ),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("unassessed");
    const transition = result.transitions.find(
      (entry) => entry.previousLevel === "L1",
    );
    expect(transition?.reasonCodes).toContain(
      "two_consecutive_primary_failures_lower_one",
    );
    expect(transition?.sourceAttemptIds).toEqual(["a2", "a3"]);
  });

  it("excludes voided attempts from the projection", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z", {
            voided: true,
          }),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("unassessed");
    expect(projection?.evidenceCount).toBe(0);
    expect(result.transitions).toHaveLength(0);
  });

  it("excludes draft attempts from the projection", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "draft", "2026-07-10T00:00:00.000Z"),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("unassessed");
    expect(projection?.evidenceCount).toBe(0);
    expect(result.transitions).toHaveLength(0);
  });

  it("caps supporting-only evidence at L1/low", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "supporting"),
          attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
        },
        {
          mapping: makeMapping(NODE_ID, "a2", "supporting"),
          attempt: makeAttempt("a2", "passed", "2026-07-20T00:00:00.000Z"),
        },
      ]),
    );
    const projection = result.perNode.get(NODE_ID);
    expect(projection?.visibleLevel).toBe("L1");
    expect(projection?.confidence).toBe("low");
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0]?.reasonCodes).toContain(
      "supporting_only_cap_l1",
    );
  });

  it("is deterministic: same input → same projection and fingerprint", () => {
    const input = buildInput([NODE_ID], [
      {
        mapping: makeMapping(NODE_ID, "a1", "primary"),
        attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
      },
    ]);
    const a = projectAbility(input);
    const b = projectAbility(input);
    expect(a.inputFingerprint).toBe(b.inputFingerprint);
    expect(a.perNode.get(NODE_ID)).toEqual(b.perNode.get(NODE_ID));
    expect(a.transitions).toEqual(b.transitions);
  });

  it("emits no transitions when the previous snapshot already matches", () => {
    const previous = new Map([
      [
        NODE_ID,
        {
          visibleLevel: "L1" as const,
          confidence: "low" as const,
          evidenceCount: 1,
        },
      ],
    ]);
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
        },
      ], { previousSnapshots: previous }),
    );
    expect(result.perNode.get(NODE_ID)?.visibleLevel).toBe("L1");
    expect(result.transitions).toHaveLength(0);
  });

  it("returns unassessed for every node when mappings are empty", () => {
    const result = projectAbility(
      buildInput([NODE_ID, "cpp-control-flow-functions"], []),
    );
    expect(result.perNode.get(NODE_ID)).toEqual({
      visibleLevel: "unassessed",
      confidence: "low",
      evidenceCount: 0,
      stale: false,
    });
    expect(
      result.perNode.get("cpp-control-flow-functions"),
    ).toEqual({
      visibleLevel: "unassessed",
      confidence: "low",
      evidenceCount: 0,
      stale: false,
    });
    expect(result.transitions).toHaveLength(0);
  });

  it("orders mappings deterministically by (startedAt, id)", () => {
    const result = projectAbility(
      buildInput([NODE_ID], [
        {
          mapping: makeMapping(NODE_ID, "a2", "primary"),
          attempt: makeAttempt("a2", "passed", "2026-07-10T00:00:00.000Z"),
        },
        {
          mapping: makeMapping(NODE_ID, "a1", "primary"),
          attempt: makeAttempt("a1", "passed", "2026-07-10T00:00:00.000Z"),
        },
      ]),
    );
    const transition = result.transitions[0];
    expect(transition?.sourceAttemptIds).toEqual(["a1", "a2"]);
  });
});
