import type { AttemptResult, TrainingAttempt } from "@/lib/domain/training";
import type { AttemptAggregate } from "@/lib/repositories/attempts";

export type ResultDistribution = Record<AttemptResult, number>;

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

export function buildGrowthStats(
  aggregate: AttemptAggregate,
  recentAttempts: readonly TrainingAttempt[],
): GrowthStats {
  return {
    ...aggregate,
    completionRate: aggregate.totalAttempts === 0
      ? 0
      : aggregate.completedAttempts / aggregate.totalAttempts,
    passRate: aggregate.completedAttempts === 0
      ? 0
      : aggregate.passedAttempts / aggregate.completedAttempts,
    recentActivity: [...recentAttempts]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((attempt) => ({
        id: attempt.id,
        problemTitle: attempt.problemTitle,
        platform: attempt.platform,
        result: attempt.result,
        updatedAt: attempt.updatedAt,
      })),
  };
}
