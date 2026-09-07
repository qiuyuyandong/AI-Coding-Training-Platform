import { z } from "zod";
import { DailyModeSchema, EffortBoundaryMinutesSchema } from "@/lib/domain/plan";

export const AiModeSchema = z.enum(["disabled", "on_demand"]);
export type AiMode = z.infer<typeof AiModeSchema>;

export const AiContextCategorySchema = z.enum(["evidence_summary", "code_snapshot"]);
export type AiContextCategory = z.infer<typeof AiContextCategorySchema>;

const TextSchema = z.string().trim().min(1).max(500);
const EvidenceIdsSchema = z.array(z.string().min(1).max(200)).max(20);

export const CoachReportSchema = z.object({
  summary: TextSchema,
  strengths: z.array(TextSchema).max(5),
  risks: z.array(TextSchema).max(5),
  nextSteps: z.array(TextSchema).min(1).max(5),
  evidenceIds: EvidenceIdsSchema,
}).strict();
export type CoachReport = z.infer<typeof CoachReportSchema>;

export const PlanChangeProposalSchema = z.object({
  dailyMode: DailyModeSchema,
  effortBoundaryMinutes: EffortBoundaryMinutesSchema,
  rationale: TextSchema,
  evidenceIds: EvidenceIdsSchema,
}).strict();
export type PlanChangeProposal = z.infer<typeof PlanChangeProposalSchema>;
