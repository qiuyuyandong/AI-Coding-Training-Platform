import type { ReviewPurpose } from "@/lib/domain/review";
import type { TrainingSessionSummary } from "@/lib/domain/evidence";

export const REVIEW_SCHEDULER_VERSION = "review-scheduler-1" as const;

export type ScheduledReview = {
  readonly purpose: ReviewPurpose;
  readonly dueAt: string;
  readonly priority: number;
  readonly reasonCodes: readonly string[];
  readonly schedulerVersion: typeof REVIEW_SCHEDULER_VERSION;
};

export function scheduleNextReview(
  summary: Pick<TrainingSessionSummary, "outcome" | "coverageLevel" | "createdAt">,
): ScheduledReview {
  switch (summary.outcome) {
    case "independent_effective_completion":
      return createReview(
        summary.coverageLevel === "E4" ? "transfer" : "variant",
        summary.createdAt,
        summary.coverageLevel === "E4" ? 14 : 7,
        55,
        "verify_independent_transfer",
      );
    case "assisted_effective_completion":
      return createReview("refresh", summary.createdAt, 1, 80, "recheck_without_assistance");
    case "productive_struggle":
      return createReview("prerequisite_check", summary.createdAt, 1, 90, "continue_from_progress");
    case "unproductive_trial_and_error":
      return createReview("prerequisite_check", summary.createdAt, 2, 95, "backtrack_before_retry");
    case "insufficient_evidence":
      return createReview("refresh", summary.createdAt, 1, 65, "collect_missing_evidence");
  }
}

function createReview(
  purpose: ReviewPurpose,
  from: string,
  days: number,
  priority: number,
  reasonCode: string,
): ScheduledReview {
  const due = new Date(from);
  if (Number.isNaN(due.getTime())) throw new RangeError("createdAt must be an ISO date-time");
  due.setUTCDate(due.getUTCDate() + days);
  return {
    purpose,
    dueAt: due.toISOString(),
    priority,
    reasonCodes: [reasonCode],
    schedulerVersion: REVIEW_SCHEDULER_VERSION,
  };
}
