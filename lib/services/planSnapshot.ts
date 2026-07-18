import { z } from "zod";

const LearningPlanSnapshotSchema = z.object({
  goalPrimaryNodeId: z.string().min(1).optional(),
  goalInterestNodeIds: z.array(z.string().min(1)).optional(),
}).strict();

export type LearningPlanSnapshot = z.infer<typeof LearningPlanSnapshotSchema>;

export function serializeLearningPlanSnapshot(
  snapshot: LearningPlanSnapshot,
): string {
  return JSON.stringify(LearningPlanSnapshotSchema.parse(snapshot));
}

export function parseLearningPlanSnapshot(raw: string): LearningPlanSnapshot {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = LearningPlanSnapshotSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}
