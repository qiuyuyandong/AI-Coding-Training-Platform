import type { AttemptResult, TrainingAttempt } from "@/lib/domain/training";

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

const EMPTY_DISTRIBUTION: ResultDistribution = {
  draft: 0,
  passed: 0,
  failed: 0,
  partial: 0,
  stuck: 0,
};

export function buildGrowthStats(attempts: readonly TrainingAttempt[]): GrowthStats {
  const resultDistribution = attempts.reduce<ResultDistribution>(
    (distribution, attempt) => ({
      ...distribution,
      [attempt.result]: distribution[attempt.result] + 1,
    }),
    EMPTY_DISTRIBUTION,
  );
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
      .map((attempt) => ({
        id: attempt.id,
        problemTitle: attempt.problemTitle,
        platform: attempt.platform,
        result: attempt.result,
        updatedAt: attempt.updatedAt,
      })),
  };
}
