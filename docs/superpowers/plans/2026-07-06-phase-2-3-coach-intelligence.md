# Phase 2.3 Coach Intelligence & Growth Insights Implementation Plan

Status: Completed on 2026-07-06. This file is retained as a historical execution plan; use `docs/architecture.md` and `docs/runbook.md` for current onboarding.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn local `TrainingAttempt` records into deterministic Coach recommendations and Growth metrics.

**Architecture:** Add pure service modules for Coach analysis and Growth stats, backed by unit tests. Keep `/coach` and `/growth` as server components that read attempts from SQLite, call service functions, and render quiet card-based UI from `DESIGN.md`.

**Tech Stack:** Next.js App Router, TypeScript strict mode, Zod-validated domain types, better-sqlite3, Vitest, Tailwind CSS.

---

## File Structure

- Create `lib/services/coachAnalysis.ts`: typed Coach signals, recommendations, and `buildCoachAnalysis(attempts, now)`.
- Create `lib/services/growthStats.ts`: typed Growth metrics, result distribution, recent activity, and `buildGrowthStats(attempts)`.
- Create `tests/unit/coachAnalysis.test.ts`: empty, draft-only, failed/stuck, mixed, all-passed scenarios.
- Create `tests/unit/growthStats.test.ts`: zero denominator and mixed result distribution scenarios.
- Modify `app/coach/page.tsx`: remove inline counts, call `buildCoachAnalysis`, render summary/signals/recommendations.
- Modify `app/growth/page.tsx`: remove inline filters, call `buildGrowthStats`, render metrics/distribution/recent activity.

## Task 1: Coach Analysis Service

**Files:**
- Create: `tests/unit/coachAnalysis.test.ts`
- Create: `lib/services/coachAnalysis.ts`

- [ ] **Step 1: Write the failing Coach analysis tests**

Create `tests/unit/coachAnalysis.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { TrainingAttempt } from "@/lib/domain/training";
import { buildCoachAnalysis } from "@/lib/services/coachAnalysis";

const NOW = "2026-07-06T12:00:00.000Z";

function attempt(overrides: Partial<TrainingAttempt>): TrainingAttempt {
  return {
    id: "attempt_1",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    startedAt: "2026-07-06T10:00:00.000Z",
    result: "draft",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildCoachAnalysis", () => {
  it("returns onboarding guidance when there are no attempts", () => {
    const analysis = buildCoachAnalysis([], NOW);

    expect(analysis.summary).toContain("No completed training evidence yet");
    expect(analysis.recentWindowSize).toBe(0);
    expect(analysis.signals).toEqual([
      expect.objectContaining({ kind: "no-data", evidenceAttemptIds: [] }),
    ]);
    expect(analysis.recommendations).toEqual([
      expect.objectContaining({ title: "Complete one captured training session", evidenceAttemptIds: [] }),
    ]);
  });

  it("returns draft-only guidance without treating drafts as failures", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "draft_1", result: "draft" }),
      attempt({ id: "draft_2", result: "draft", updatedAt: "2026-07-06T11:00:00.000Z" }),
    ], NOW);

    expect(analysis.summary).toContain("2 in-progress attempts");
    expect(analysis.signals).toEqual([
      expect.objectContaining({ kind: "draft-only", evidenceAttemptIds: ["draft_2", "draft_1"] }),
    ]);
    expect(analysis.recommendations[0]?.action).toContain("Finish one submission");
  });

  it("prioritizes failed and stuck attempts with evidence", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "passed_1", result: "passed", problemTitle: "Valid Parentheses" }),
      attempt({ id: "failed_1", result: "failed", problemTitle: "Two Sum", verdict: "Wrong Answer", updatedAt: "2026-07-06T11:00:00.000Z" }),
      attempt({ id: "stuck_1", result: "stuck", problemTitle: "Three Sum", updatedAt: "2026-07-06T11:30:00.000Z" }),
    ], NOW);

    expect(analysis.summary).toContain("2 attempts need review");
    expect(analysis.signals.map((signal) => signal.kind)).toEqual(["recent-stuck", "recent-failure"]);
    expect(analysis.recommendations[0]?.evidenceAttemptIds).toEqual(["stuck_1", "failed_1"]);
  });

  it("treats partial attempts as review-worthy but lower priority than failed or stuck", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "partial_1", result: "partial", problemTitle: "Binary Search", updatedAt: "2026-07-06T11:00:00.000Z" }),
      attempt({ id: "passed_1", result: "passed", problemTitle: "Two Sum" }),
    ], NOW);

    expect(analysis.summary).toContain("1 partial attempt");
    expect(analysis.signals[0]).toEqual(expect.objectContaining({ kind: "partial-review", evidenceAttemptIds: ["partial_1"] }));
  });

  it("returns momentum guidance when recent attempts all passed", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "passed_1", result: "passed", problemTitle: "Two Sum" }),
      attempt({ id: "passed_2", result: "passed", problemTitle: "Valid Parentheses", updatedAt: "2026-07-06T11:00:00.000Z" }),
    ], NOW);

    expect(analysis.summary).toContain("2 recent passes");
    expect(analysis.signals).toEqual([
      expect.objectContaining({ kind: "momentum", evidenceAttemptIds: ["passed_2", "passed_1"] }),
    ]);
    expect(analysis.recommendations[0]?.action).toContain("Increase difficulty");
  });
});
```

- [ ] **Step 2: Run the Coach analysis tests and verify they fail**

Run: `npm run test -- tests/unit/coachAnalysis.test.ts`

Expected: FAIL because `@/lib/services/coachAnalysis` does not exist.

- [ ] **Step 3: Implement `lib/services/coachAnalysis.ts`**

Create `lib/services/coachAnalysis.ts`:

```typescript
import type { TrainingAttempt } from "@/lib/domain/training";

export type CoachSignalKind = "no-data" | "draft-only" | "recent-failure" | "recent-stuck" | "partial-review" | "momentum";

export type CoachSignal = {
  readonly kind: CoachSignalKind;
  readonly title: string;
  readonly detail: string;
  readonly evidenceAttemptIds: readonly string[];
};

export type CoachRecommendation = {
  readonly title: string;
  readonly reason: string;
  readonly action: string;
  readonly evidenceAttemptIds: readonly string[];
};

export type CoachAnalysis = {
  readonly summary: string;
  readonly signals: readonly CoachSignal[];
  readonly recommendations: readonly CoachRecommendation[];
  readonly recentWindowSize: number;
  readonly generatedAt: string;
};

export function buildCoachAnalysis(attempts: readonly TrainingAttempt[], now: string): CoachAnalysis {
  const recent = [...attempts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (recent.length === 0) return noDataAnalysis(now);

  const drafts = recent.filter((attempt) => attempt.result === "draft");
  const completed = recent.filter((attempt) => attempt.result !== "draft");
  if (completed.length === 0) return draftOnlyAnalysis(drafts, now);

  const stuck = recent.filter((attempt) => attempt.result === "stuck");
  const failed = recent.filter((attempt) => attempt.result === "failed");
  const partial = recent.filter((attempt) => attempt.result === "partial");
  const passed = recent.filter((attempt) => attempt.result === "passed");

  if (stuck.length > 0 || failed.length > 0) return reviewFirstAnalysis({ recent, stuck, failed, partial, passed, now });
  if (partial.length > 0) return partialReviewAnalysis({ recent, partial, passed, now });
  return momentumAnalysis(recent, passed, now);
}

function noDataAnalysis(now: string): CoachAnalysis {
  return {
    summary: "No completed training evidence yet. Complete one captured training session to unlock local coach feedback.",
    signals: [{ kind: "no-data", title: "No local evidence", detail: "Coach needs at least one captured attempt before it can identify patterns.", evidenceAttemptIds: [] }],
    recommendations: [{ title: "Complete one captured training session", reason: "The local coach only uses evidence stored on this device.", action: "Start from /training and finish one submission on the original platform.", evidenceAttemptIds: [] }],
    recentWindowSize: 0,
    generatedAt: now,
  };
}

function draftOnlyAnalysis(drafts: readonly TrainingAttempt[], now: string): CoachAnalysis {
  const evidenceAttemptIds = drafts.map((attempt) => attempt.id);
  return {
    summary: `${drafts.length} in-progress attempts are waiting for a verdict.`,
    signals: [{ kind: "draft-only", title: "Training in progress", detail: "Draft attempts are not counted as failures or completed work.", evidenceAttemptIds }],
    recommendations: [{ title: "Finish one submission", reason: "A verdict is needed before Coach can separate solved, failed, partial, or stuck work.", action: "Finish one submission from an open training attempt.", evidenceAttemptIds }],
    recentWindowSize: drafts.length,
    generatedAt: now,
  };
}

function reviewFirstAnalysis(input: { readonly recent: readonly TrainingAttempt[]; readonly stuck: readonly TrainingAttempt[]; readonly failed: readonly TrainingAttempt[]; readonly partial: readonly TrainingAttempt[]; readonly passed: readonly TrainingAttempt[]; readonly now: string }): CoachAnalysis {
  const reviewEvidence = [...input.stuck, ...input.failed].map((attempt) => attempt.id);
  const signals: CoachSignal[] = [];
  if (input.stuck.length > 0) signals.push({ kind: "recent-stuck", title: "Recent stuck attempts", detail: `${input.stuck.length} attempts ended without a solved verdict.`, evidenceAttemptIds: input.stuck.map((attempt) => attempt.id) });
  if (input.failed.length > 0) signals.push({ kind: "recent-failure", title: "Recent failed attempts", detail: `${input.failed.length} attempts produced a failed verdict.`, evidenceAttemptIds: input.failed.map((attempt) => attempt.id) });
  if (input.partial.length > 0) signals.push({ kind: "partial-review", title: "Partial progress", detail: `${input.partial.length} partial attempts should be reviewed after failures.`, evidenceAttemptIds: input.partial.map((attempt) => attempt.id) });
  return {
    summary: `${reviewEvidence.length} attempts need review before adding more volume. ${input.passed.length} recent attempts passed.`,
    signals,
    recommendations: [{ title: "Review failed or stuck attempts first", reason: "Recent failed/stuck work is the strongest local evidence of a weak point.", action: "Pick the newest failed or stuck attempt, write down the mistake, then retry a similar problem.", evidenceAttemptIds: reviewEvidence }],
    recentWindowSize: input.recent.length,
    generatedAt: input.now,
  };
}

function partialReviewAnalysis(input: { readonly recent: readonly TrainingAttempt[]; readonly partial: readonly TrainingAttempt[]; readonly passed: readonly TrainingAttempt[]; readonly now: string }): CoachAnalysis {
  const evidenceAttemptIds = input.partial.map((attempt) => attempt.id);
  return {
    summary: `${input.partial.length} partial attempt needs review. ${input.passed.length} recent attempts passed.`,
    signals: [{ kind: "partial-review", title: "Partial attempts need review", detail: "Partial results are completed attempts, but they still carry review value.", evidenceAttemptIds }],
    recommendations: [{ title: "Convert partial progress into a clean solve", reason: "Partial work means the direction was close but incomplete.", action: "Retry the partial problem and focus on the first missing edge case.", evidenceAttemptIds }],
    recentWindowSize: input.recent.length,
    generatedAt: input.now,
  };
}

function momentumAnalysis(recent: readonly TrainingAttempt[], passed: readonly TrainingAttempt[], now: string): CoachAnalysis {
  const evidenceAttemptIds = passed.map((attempt) => attempt.id);
  return {
    summary: `${passed.length} recent passes. Keep the momentum, but avoid staying too comfortable.`,
    signals: [{ kind: "momentum", title: "Passing momentum", detail: "Recent completed attempts are all passed.", evidenceAttemptIds }],
    recommendations: [{ title: "Increase difficulty slightly", reason: "A clean recent window is a good time to stretch.", action: "Increase difficulty or switch to a less familiar problem pattern for the next session.", evidenceAttemptIds }],
    recentWindowSize: recent.length,
    generatedAt: now,
  };
}
```

- [ ] **Step 4: Run the Coach analysis tests and verify they pass**

Run: `npm run test -- tests/unit/coachAnalysis.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
$env:GIT_MASTER='1'; git add lib/services/coachAnalysis.ts tests/unit/coachAnalysis.test.ts
$env:GIT_MASTER='1'; git commit -m "Add deterministic coach analysis"
```

## Task 2: Growth Stats Service

**Files:**
- Create: `tests/unit/growthStats.test.ts`
- Create: `lib/services/growthStats.ts`

- [ ] **Step 1: Write the failing Growth stats tests**

Create `tests/unit/growthStats.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { TrainingAttempt } from "@/lib/domain/training";
import { buildGrowthStats } from "@/lib/services/growthStats";

function attempt(overrides: Partial<TrainingAttempt>): TrainingAttempt {
  return {
    id: "attempt_1",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    startedAt: "2026-07-06T10:00:00.000Z",
    result: "draft",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildGrowthStats", () => {
  it("returns zero rates and empty distribution for no attempts", () => {
    const stats = buildGrowthStats([]);

    expect(stats.totalAttempts).toBe(0);
    expect(stats.completedAttempts).toBe(0);
    expect(stats.passedAttempts).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(stats.passRate).toBe(0);
    expect(stats.resultDistribution).toEqual({ draft: 0, passed: 0, failed: 0, partial: 0, stuck: 0 });
    expect(stats.recentActivity).toEqual([]);
  });

  it("counts partial as completed and draft as not completed", () => {
    const stats = buildGrowthStats([
      attempt({ id: "draft_1", result: "draft" }),
      attempt({ id: "passed_1", result: "passed" }),
      attempt({ id: "failed_1", result: "failed" }),
      attempt({ id: "partial_1", result: "partial" }),
      attempt({ id: "stuck_1", result: "stuck" }),
    ]);

    expect(stats.totalAttempts).toBe(5);
    expect(stats.completedAttempts).toBe(4);
    expect(stats.passedAttempts).toBe(1);
    expect(stats.completionRate).toBe(0.8);
    expect(stats.passRate).toBe(0.25);
    expect(stats.resultDistribution).toEqual({ draft: 1, passed: 1, failed: 1, partial: 1, stuck: 1 });
  });

  it("sorts recent activity by updatedAt descending and limits to five", () => {
    const stats = buildGrowthStats(Array.from({ length: 6 }, (_, index) => attempt({
      id: `attempt_${index}`,
      problemTitle: `Problem ${index}`,
      result: "passed",
      updatedAt: `2026-07-06T10:0${index}:00.000Z`,
    })));

    expect(stats.recentActivity.map((item) => item.id)).toEqual(["attempt_5", "attempt_4", "attempt_3", "attempt_2", "attempt_1"]);
  });
});
```

- [ ] **Step 2: Run the Growth stats tests and verify they fail**

Run: `npm run test -- tests/unit/growthStats.test.ts`

Expected: FAIL because `@/lib/services/growthStats` does not exist.

- [ ] **Step 3: Implement `lib/services/growthStats.ts`**

Create `lib/services/growthStats.ts`:

```typescript
import type { AttemptResult, TrainingAttempt } from "@/lib/domain/training";

type ResultDistribution = Record<AttemptResult, number>;

export type GrowthActivityItem = {
  readonly id: string;
  readonly problemTitle: string;
  readonly platform: TrainingAttempt["platform"];
  readonly result: AttemptResult;
  readonly updatedAt: string;
};

export type GrowthStats = {
  readonly totalAttempts: number;
  readonly completedAttempts: number;
  readonly passedAttempts: number;
  readonly completionRate: number;
  readonly passRate: number;
  readonly resultDistribution: ResultDistribution;
  readonly recentActivity: readonly GrowthActivityItem[];
};

const EMPTY_DISTRIBUTION: ResultDistribution = { draft: 0, passed: 0, failed: 0, partial: 0, stuck: 0 };

export function buildGrowthStats(attempts: readonly TrainingAttempt[]): GrowthStats {
  const resultDistribution = attempts.reduce<ResultDistribution>((distribution, attempt) => ({
    ...distribution,
    [attempt.result]: distribution[attempt.result] + 1,
  }), EMPTY_DISTRIBUTION);
  const totalAttempts = attempts.length;
  const completedAttempts = totalAttempts - resultDistribution.draft;
  const passedAttempts = resultDistribution.passed;
  return {
    totalAttempts,
    completedAttempts,
    passedAttempts,
    completionRate: totalAttempts === 0 ? 0 : completedAttempts / totalAttempts,
    passRate: completedAttempts === 0 ? 0 : passedAttempts / completedAttempts,
    resultDistribution,
    recentActivity: [...attempts]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((attempt) => ({ id: attempt.id, problemTitle: attempt.problemTitle, platform: attempt.platform, result: attempt.result, updatedAt: attempt.updatedAt })),
  };
}
```

- [ ] **Step 4: Run the Growth stats tests and verify they pass**

Run: `npm run test -- tests/unit/growthStats.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
$env:GIT_MASTER='1'; git add lib/services/growthStats.ts tests/unit/growthStats.test.ts
$env:GIT_MASTER='1'; git commit -m "Add deterministic growth stats"
```

## Task 3: Coach and Growth Pages

**Files:**
- Modify: `app/coach/page.tsx`
- Modify: `app/growth/page.tsx`

- [ ] **Step 1: Update `/coach` to render CoachAnalysis**

Modify `app/coach/page.tsx` so it imports `buildCoachAnalysis`, calls it with `new Date().toISOString()` at the page boundary, and renders summary, signals, and recommendations inside `DESIGN.md`-style cards.

- [ ] **Step 2: Update `/growth` to render GrowthStats**

Modify `app/growth/page.tsx` so it imports `buildGrowthStats`, renders Attempts/Completed/Passed plus Completion Rate and Pass Rate, then renders result distribution and recent activity.

- [ ] **Step 3: Run focused service tests plus typecheck**

Run: `npm run test -- tests/unit/coachAnalysis.test.ts tests/unit/growthStats.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit Task 3**

Run:

```powershell
$env:GIT_MASTER='1'; git add app/coach/page.tsx app/growth/page.tsx
$env:GIT_MASTER='1'; git commit -m "Render coach and growth insights"
```

## Task 4: Final Verification and Docs

**Files:**
- Modify: `README.md`
- Modify: `COMPLIANCE.md`

- [ ] **Step 1: Update docs for Phase 2.3**

Add a short README note that `/coach` and `/growth` now use deterministic local analysis from attempts. Add a COMPLIANCE note that analysis remains local-only and external LLM calls are still out of scope.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm run test
npm run typecheck
npm run build
node "C:\Users\迷失\.claude\plugins\cache\openai-codex\codex\1.0.4\scripts\codex-companion.mjs" review
```

Expected: all commands pass; Codex review reports no actionable correctness issues.

- [ ] **Step 3: Commit Task 4**

Run:

```powershell
$env:GIT_MASTER='1'; git add README.md COMPLIANCE.md
$env:GIT_MASTER='1'; git commit -m "Document coach intelligence insights"
```

- [ ] **Step 4: Final clean status**

Run: `$env:GIT_MASTER='1'; git status --short`

Expected: no output.
