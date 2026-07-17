import type { DifficultyBand } from "@/lib/domain/curriculum";
import type { EffortBoundaryMinutes } from "@/lib/domain/plan";

export const SELECTOR_VERSION = "v0-selector-1" as const;

export type CandidateTaskSelectorInput = {
  readonly nodes: ReadonlyArray<{
    readonly stable_id: string;
    readonly order_index: number;
    readonly title: string;
  }>;
  readonly edges: ReadonlyArray<{
    readonly from_stable_id: string;
    readonly to_stable_id: string;
  }>;
  readonly practicesByNode: ReadonlyMap<
    string,
    ReadonlyArray<{
      readonly stable_id: string;
      readonly title: string;
      readonly difficulty_band: DifficultyBand;
    }>
  >;
  readonly resourcesByNode: ReadonlyMap<string, { readonly review_status: string } | null>;
  readonly prerequisitesByNode?: Readonly<Record<string, readonly string[]>>;
  readonly baselinesByNode?: Readonly<Record<string, "unknown" | "needs_foundation" | "self_reported" | "ready" | undefined>>;
  readonly abilitiesByNode?: Readonly<Record<string, "unassessed" | "L1" | "L2" | "L3" | "L4" | "L5" | undefined>>;
  readonly recentlySkipped?: ReadonlyArray<string>;
  readonly recentCompletions?: ReadonlyArray<{ readonly practiceTaskId: string; readonly completedAt?: string }>;
  readonly goalPrimaryNodeId?: string;
  readonly goalInterestNodeIds?: ReadonlyArray<string>;
  readonly effortBoundaryMinutes: EffortBoundaryMinutes;
};

export type PracticeTaskRef = {
  readonly taskId: string;
  readonly nodeId: string;
  readonly title: string;
  readonly difficultyBand: DifficultyBand;
  readonly reasonCodes: readonly string[];
};

export type Alternatives = {
  readonly warmup?: PracticeTaskRef;
  readonly same_goal_alternative?: PracticeTaskRef;
  readonly weakness_review?: PracticeTaskRef;
};

export type CandidateTaskSelectorResult =
  | { readonly primary: PracticeTaskRef; readonly alternatives: Alternatives; readonly noCandidate: false }
  | { readonly primary: null; readonly alternatives: Alternatives; readonly noCandidate: true; readonly reason: string };

const DIFFICULTY_ORDINAL: Readonly<Record<DifficultyBand, number>> = {
  intro: 0,
  easy: 1,
  medium: 2,
  hard: 3,
};

const EFFORT_PREFERENCE: Readonly<Record<EffortBoundaryMinutes, readonly DifficultyBand[]>> = {
  15: ["intro", "easy", "medium", "hard"],
  30: ["easy", "intro", "medium", "hard"],
  60: ["medium", "easy", "hard", "intro"],
  90: ["hard", "medium", "easy", "intro"],
};

type Candidate = {
  readonly taskId: string;
  readonly nodeId: string;
  readonly title: string;
  readonly difficultyBand: DifficultyBand;
  readonly orderIndex: number;
  readonly reasonCodes: readonly string[];
};

export function selectCandidateTask(input: CandidateTaskSelectorInput): CandidateTaskSelectorResult {
  const successors = new Map<string, string[]>();
  for (const node of input.nodes) successors.set(node.stable_id, []);
  for (const edge of input.edges) {
    const list = successors.get(edge.from_stable_id);
    if (list !== undefined) list.push(edge.to_stable_id);
  }

  function transitiveDescendants(start: string): Set<string> {
    const out = new Set<string>([start]);
    const stack: string[] = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      const next = successors.get(cur) ?? [];
      for (const n of next) {
        if (!out.has(n)) {
          out.add(n);
          stack.push(n);
        }
      }
    }
    return out;
  }

  const primarySet = input.goalPrimaryNodeId !== undefined ? transitiveDescendants(input.goalPrimaryNodeId) : new Set<string>();
  const interestSet = new Set<string>();
  for (const id of input.goalInterestNodeIds ?? []) {
    for (const n of transitiveDescendants(id)) interestSet.add(n);
  }

  const baselines = input.baselinesByNode ?? {};
  const abilities = input.abilitiesByNode ?? {};
  const prereqs = input.prerequisitesByNode ?? {};

  // Determine eligibility
  const eligibleNodes = new Set<string>();
  for (const node of input.nodes) {
    const resource = input.resourcesByNode.get(node.stable_id);
    if (resource === null || resource === undefined) continue;
    if (resource.review_status !== "reviewed") continue;
    const practices = input.practicesByNode.get(node.stable_id);
    if (practices === undefined || practices.length === 0) continue;
    const nodePrereqs = prereqs[node.stable_id] ?? [];
    let blocked = false;
    for (const p of nodePrereqs) {
      const b = baselines[p];
      if (b === "unknown") { blocked = true; break; }
      if (b === "needs_foundation" || b === "self_reported") { blocked = true; break; }
    }
    if (blocked) continue;
    eligibleNodes.add(node.stable_id);
  }

  const skippedSet = new Set(input.recentlySkipped ?? []);
  const mostRecent = (input.recentCompletions ?? []).slice(-1)[0]?.practiceTaskId;

  const candidates: Candidate[] = [];
  for (const nodeId of eligibleNodes) {
    const node = input.nodes.find(n => n.stable_id === nodeId);
    if (node === undefined) continue;
    const practices = input.practicesByNode.get(nodeId);
    if (practices === undefined) continue;
    const ability = abilities[nodeId];
    for (const task of practices) {
      const reasonCodes: string[] = [];
      if (primarySet.has(nodeId)) reasonCodes.push("primary_goal");
      else if (interestSet.has(nodeId)) reasonCodes.push("interest_goal");
      else reasonCodes.push("common_foundation");
      if (ability === undefined || ability === "unassessed") reasonCodes.push("first_unassessed");
      if (ability !== undefined && ability !== "unassessed") reasonCodes.push("reachable_ability");
      const effortOrder = EFFORT_PREFERENCE[input.effortBoundaryMinutes];
      if (effortOrder.indexOf(task.difficulty_band) === 0) reasonCodes.push("within_effort");
      if (!skippedSet.has(task.stable_id)) reasonCodes.push("not_recently_skipped");
      if (mostRecent !== task.stable_id) reasonCodes.push("not_same_variant");
      if (task.difficulty_band === "intro" || task.difficulty_band === "easy") reasonCodes.push("low_difficulty_match");
      candidates.push({
        taskId: task.stable_id,
        nodeId,
        title: task.title,
        difficultyBand: task.difficulty_band,
        orderIndex: node.order_index,
        reasonCodes,
      });
    }
  }

  // Hard filter: skipped
  let pool = candidates.filter(c => !skippedSet.has(c.taskId));
  // Hard filter: same-variant (with fallback if only one candidate)
  if (mostRecent !== undefined) {
    const sameCount = pool.filter(c => c.taskId === mostRecent).length;
    if (sameCount > 0 && pool.length > 1) {
      pool = pool.filter(c => c.taskId !== mostRecent);
    }
  }

  // Sort
  const effortOrder = EFFORT_PREFERENCE[input.effortBoundaryMinutes];
  pool.sort((a, b) => {
    const goalA = primarySet.has(a.nodeId) ? 0 : interestSet.has(a.nodeId) ? 1 : 2;
    const goalB = primarySet.has(b.nodeId) ? 0 : interestSet.has(b.nodeId) ? 1 : 2;
    if (goalA !== goalB) return goalA - goalB;
    const effortA = effortOrder.indexOf(a.difficultyBand);
    const effortB = effortOrder.indexOf(b.difficultyBand);
    if (effortA !== effortB) return effortA - effortB;
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1;
    return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
  });

  if (pool.length === 0) {
    return { primary: null, alternatives: {}, noCandidate: true, reason: "all_tasks_blocked" };
  }

  const primary = pool[0]!;
  const primaryRef: PracticeTaskRef = {
    taskId: primary.taskId,
    nodeId: primary.nodeId,
    title: primary.title,
    difficultyBand: primary.difficultyBand,
    reasonCodes: primary.reasonCodes,
  };

  const used = new Set<string>([primary.taskId]);
  const alternatives: { warmup?: PracticeTaskRef; same_goal_alternative?: PracticeTaskRef; weakness_review?: PracticeTaskRef } = {};

  // Warmup: lowest difficulty strictly less than primary
  const warmupCandidate = pool.slice(1).find(c => !used.has(c.taskId) && !used.has(c.nodeId) && DIFFICULTY_ORDINAL[c.difficultyBand] < DIFFICULTY_ORDINAL[primary.difficultyBand]);
  if (warmupCandidate !== undefined) {
    const ref: PracticeTaskRef = { taskId: warmupCandidate.taskId, nodeId: warmupCandidate.nodeId, title: warmupCandidate.title, difficultyBand: warmupCandidate.difficultyBand, reasonCodes: warmupCandidate.reasonCodes };
    alternatives.warmup = ref;
    used.add(ref.taskId); used.add(ref.nodeId);
  }

  // Same goal alternative
  const sameGoalCandidate = pool.slice(1).find(c => {
    if (used.has(c.taskId) || used.has(c.nodeId)) return false;
    const primaryGoal = primarySet.has(primary.nodeId) ? primarySet : interestSet;
    const candidateGoal = primarySet.has(c.nodeId) ? primarySet : interestSet;
    return primaryGoal === candidateGoal && c.nodeId !== primary.nodeId;
  });
  if (sameGoalCandidate !== undefined) {
    const ref: PracticeTaskRef = { taskId: sameGoalCandidate.taskId, nodeId: sameGoalCandidate.nodeId, title: sameGoalCandidate.title, difficultyBand: sameGoalCandidate.difficultyBand, reasonCodes: sameGoalCandidate.reasonCodes };
    alternatives.same_goal_alternative = ref;
    used.add(ref.taskId); used.add(ref.nodeId);
  }

  // Weakness review: ability L1 or L2
  const weaknessCandidate = pool.slice(1).find(c => {
    if (used.has(c.taskId) || used.has(c.nodeId)) return false;
    const a = abilities[c.nodeId];
    return a === "L1" || a === "L2";
  });
  if (weaknessCandidate !== undefined) {
    const ref: PracticeTaskRef = { taskId: weaknessCandidate.taskId, nodeId: weaknessCandidate.nodeId, title: weaknessCandidate.title, difficultyBand: weaknessCandidate.difficultyBand, reasonCodes: weaknessCandidate.reasonCodes };
    alternatives.weakness_review = ref;
  }

  return { primary: primaryRef, alternatives, noCandidate: false };
}