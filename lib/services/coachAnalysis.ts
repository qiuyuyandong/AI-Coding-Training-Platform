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

type AttemptGroups = {
  readonly recent: readonly TrainingAttempt[];
  readonly drafts: readonly TrainingAttempt[];
  readonly completed: readonly TrainingAttempt[];
  readonly stuck: readonly TrainingAttempt[];
  readonly failed: readonly TrainingAttempt[];
  readonly partial: readonly TrainingAttempt[];
  readonly passed: readonly TrainingAttempt[];
};

export function buildCoachAnalysis(attempts: readonly TrainingAttempt[], now: string): CoachAnalysis {
  const groups = groupAttempts(attempts);
  if (groups.recent.length === 0) return noDataAnalysis(now);
  if (groups.completed.length === 0) return draftOnlyAnalysis(groups.drafts, now);
  if (groups.stuck.length > 0 || groups.failed.length > 0) return reviewFirstAnalysis(groups, now);
  if (groups.partial.length > 0) return partialReviewAnalysis(groups, now);
  return momentumAnalysis(groups, now);
}

function groupAttempts(attempts: readonly TrainingAttempt[]): AttemptGroups {
  const recent = [...attempts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    recent,
    drafts: recent.filter((attempt) => attempt.result === "draft"),
    completed: recent.filter((attempt) => attempt.result !== "draft"),
    stuck: recent.filter((attempt) => attempt.result === "stuck"),
    failed: recent.filter((attempt) => attempt.result === "failed"),
    partial: recent.filter((attempt) => attempt.result === "partial"),
    passed: recent.filter((attempt) => attempt.result === "passed"),
  };
}

function noDataAnalysis(now: string): CoachAnalysis {
  return {
    summary: "No completed training evidence yet. Complete one captured training session to unlock local coach feedback.",
    signals: [
      {
        kind: "no-data",
        title: "No local evidence",
        detail: "Coach needs at least one captured attempt before it can identify patterns.",
        evidenceAttemptIds: [],
      },
    ],
    recommendations: [
      {
        title: "Complete one captured training session",
        reason: "The local coach only uses evidence stored on this device.",
        action: "Start from /training and finish one submission on the original platform.",
        evidenceAttemptIds: [],
      },
    ],
    recentWindowSize: 0,
    generatedAt: now,
  };
}

function draftOnlyAnalysis(drafts: readonly TrainingAttempt[], now: string): CoachAnalysis {
  const evidenceAttemptIds = drafts.map((attempt) => attempt.id);
  return {
    summary: `${drafts.length} in-progress attempts are waiting for a verdict.`,
    signals: [
      {
        kind: "draft-only",
        title: "Training in progress",
        detail: "Draft attempts are not counted as failures or completed work.",
        evidenceAttemptIds,
      },
    ],
    recommendations: [
      {
        title: "Finish one submission",
        reason: "A verdict is needed before Coach can separate solved, failed, partial, or stuck work.",
        action: "Finish one submission from an open training attempt.",
        evidenceAttemptIds,
      },
    ],
    recentWindowSize: drafts.length,
    generatedAt: now,
  };
}

function reviewFirstAnalysis(groups: AttemptGroups, now: string): CoachAnalysis {
  const reviewEvidence = [...groups.stuck, ...groups.failed].map((attempt) => attempt.id);
  return {
    summary: `${reviewEvidence.length} attempts need review before adding more volume. ${groups.passed.length} recent attempts passed.`,
    signals: reviewSignals(groups),
    recommendations: [
      {
        title: "Review failed or stuck attempts first",
        reason: "Recent failed/stuck work is the strongest local evidence of a weak point.",
        action: "Pick the newest failed or stuck attempt, write down the mistake, then retry a similar problem.",
        evidenceAttemptIds: reviewEvidence,
      },
    ],
    recentWindowSize: groups.recent.length,
    generatedAt: now,
  };
}

function reviewSignals(groups: AttemptGroups): readonly CoachSignal[] {
  return [stuckSignal(groups.stuck), failedSignal(groups.failed), partialSignal(groups.partial)].filter(
    (signal): signal is CoachSignal => signal !== null,
  );
}

function stuckSignal(stuck: readonly TrainingAttempt[]): CoachSignal | null {
  if (stuck.length === 0) return null;
  return {
    kind: "recent-stuck",
    title: "Recent stuck attempts",
    detail: `${stuck.length} attempts ended without a solved verdict.`,
    evidenceAttemptIds: stuck.map((attempt) => attempt.id),
  };
}

function failedSignal(failed: readonly TrainingAttempt[]): CoachSignal | null {
  if (failed.length === 0) return null;
  return {
    kind: "recent-failure",
    title: "Recent failed attempts",
    detail: `${failed.length} attempts produced a failed verdict.`,
    evidenceAttemptIds: failed.map((attempt) => attempt.id),
  };
}

function partialSignal(partial: readonly TrainingAttempt[]): CoachSignal | null {
  if (partial.length === 0) return null;
  return {
    kind: "partial-review",
    title: "Partial progress",
    detail: `${partial.length} partial attempts should be reviewed after failures.`,
    evidenceAttemptIds: partial.map((attempt) => attempt.id),
  };
}

function partialReviewAnalysis(groups: AttemptGroups, now: string): CoachAnalysis {
  const evidenceAttemptIds = groups.partial.map((attempt) => attempt.id);
  return {
    summary: `${groups.partial.length} partial attempt needs review. ${groups.passed.length} recent attempts passed.`,
    signals: [
      {
        kind: "partial-review",
        title: "Partial attempts need review",
        detail: "Partial results are completed attempts, but they still carry review value.",
        evidenceAttemptIds,
      },
    ],
    recommendations: [
      {
        title: "Convert partial progress into a clean solve",
        reason: "Partial work means the direction was close but incomplete.",
        action: "Retry the partial problem and focus on the first missing edge case.",
        evidenceAttemptIds,
      },
    ],
    recentWindowSize: groups.recent.length,
    generatedAt: now,
  };
}

function momentumAnalysis(groups: AttemptGroups, now: string): CoachAnalysis {
  const evidenceAttemptIds = groups.passed.map((attempt) => attempt.id);
  return {
    summary: `${groups.passed.length} recent passes. Keep the momentum, but avoid staying too comfortable.`,
    signals: [
      {
        kind: "momentum",
        title: "Passing momentum",
        detail: "Recent completed attempts are all passed.",
        evidenceAttemptIds,
      },
    ],
    recommendations: [
      {
        title: "Increase difficulty slightly",
        reason: "A clean recent window is a good time to stretch.",
        action: "Increase difficulty or switch to a less familiar problem pattern for the next session.",
        evidenceAttemptIds,
      },
    ],
    recentWindowSize: groups.recent.length,
    generatedAt: now,
  };
}
