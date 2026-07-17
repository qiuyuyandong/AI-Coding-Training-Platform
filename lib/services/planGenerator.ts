import type { DifficultyBand } from "@/lib/domain/curriculum";
import type { DailyMode, EffortBoundaryMinutes } from "@/lib/domain/plan";
import {
  selectCandidateTask,
  type CandidateTaskSelectorInput,
  type PracticeTaskRef,
} from "@/lib/services/candidateTaskSelector";

/**
 * V0 immutable daily-plan generator.
 *
 * Wraps the deterministic `selectCandidateTask` (Todo 11) with an
 * explicit safe-foundation fallback. The Todo 12 contract says: when the
 * selector returns `noCandidate: true`, the generator MUST surface the
 * published AtCoder `practice_1` task on `cpp-io-types` rather than
 * returning an empty success. Callers (the persistence layer in
 * `planGenerationService`) persist the result with the same input
 * fingerprint and generator version, so two replays with identical
 * inputs produce byte-identical output and stable revision lineage.
 *
 * This module is pure: it does not import SQLite, Node process state,
 * or any clock. Determinism depends entirely on `selectCandidateTask`
 * being deterministic for the supplied input.
 */

export const PLAN_GENERATOR_VERSION = "v0-plan-generator-1" as const;

export type SafeFoundationFallback = {
  readonly type: "safe_foundation_fallback";
  readonly primary: PracticeTaskRef;
  readonly reason: string;
};

export type PlanGeneratorInput = Omit<
  CandidateTaskSelectorInput,
  "effortBoundaryMinutes"
> & {
  readonly learnerId: string;
  readonly dailyMode: DailyMode;
  readonly effortBoundaryMinutes: EffortBoundaryMinutes;
  readonly localDate: string;
  readonly inputFingerprint: string;
};

export type PlanGeneratorOutput = {
  readonly primary: PracticeTaskRef;
  readonly alternatives: {
    readonly warmup?: PracticeTaskRef;
    readonly same_goal_alternative?: PracticeTaskRef;
    readonly weakness_review?: PracticeTaskRef;
  };
  readonly mode: DailyMode;
  readonly isFallback: boolean;
  readonly reason?: string;
};

const SAFE_FALLBACK_NODE_STABLE_ID = "cpp-io-types";
const SAFE_FALLBACK_TASK_STABLE_ID = "task-cpp-io-types";
const SAFE_FALLBACK_TITLE = "Practice Task A";
const SAFE_FALLBACK_DIFFICULTY: DifficultyBand = "intro";

export function generatePlan(input: PlanGeneratorInput): PlanGeneratorOutput {
  const selectorResult = selectCandidateTask(input);
  if (
    selectorResult.noCandidate === false &&
    selectorResult.primary !== null
  ) {
    return {
      primary: selectorResult.primary,
      alternatives: selectorResult.alternatives,
      mode: input.dailyMode,
      isFallback: false,
    };
  }
  return {
    primary: {
      taskId: SAFE_FALLBACK_TASK_STABLE_ID,
      nodeId: SAFE_FALLBACK_NODE_STABLE_ID,
      title: SAFE_FALLBACK_TITLE,
      difficultyBand: SAFE_FALLBACK_DIFFICULTY,
      reasonCodes: ["common_foundation"],
    },
    alternatives: {},
    mode: input.dailyMode,
    isFallback: true,
    reason: `No eligible tasks; safe foundation fallback to AtCoder practice_1 on ${SAFE_FALLBACK_NODE_STABLE_ID}.`,
  };
}
