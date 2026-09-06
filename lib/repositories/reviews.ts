import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  ReviewItemSchema,
  type ReviewItem,
  type ReviewPurpose,
} from "@/lib/domain/review";

type ReviewRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly node_id: string;
  readonly purpose: string;
  readonly due_at: string;
  readonly priority: number;
  readonly selected_practice_task_id: string | null;
  readonly scheduler_version: string;
  readonly source_summary_id: string;
  readonly reason_codes_json: string;
  readonly status: string;
  readonly created_at: string;
  readonly completed_at: string | null;
};

export type CreateReviewInput = Omit<ReviewItem, "id" | "status" | "completedAt">;

export function createOpenReview(
  db: Database.Database,
  input: CreateReviewInput,
): { readonly review: ReviewItem; readonly replayed: boolean } {
  const candidate = ReviewItemSchema.parse({
    ...input,
    id: `review_${randomUUID()}`,
    status: "open",
    completedAt: null,
  });
  const row = {
    id: candidate.id,
    learnerId: candidate.learnerId,
    nodeId: candidate.nodeId,
    purpose: candidate.purpose,
    dueAt: candidate.dueAt,
    priority: candidate.priority,
    selectedPracticeTaskId: candidate.selectedPracticeTaskId,
    schedulerVersion: candidate.schedulerVersion,
    sourceSummaryId: candidate.sourceSummaryId,
    reasonCodesJson: JSON.stringify(candidate.reasonCodes),
    status: candidate.status,
    createdAt: candidate.createdAt,
    completedAt: candidate.completedAt,
  };
  const result = db.prepare(`
    INSERT OR IGNORE INTO review_items (
      id, learner_id, node_id, purpose, due_at, priority,
      selected_practice_task_id, scheduler_version, source_summary_id,
      reason_codes_json, status, created_at, completed_at
    ) VALUES (
      @id, @learnerId, @nodeId, @purpose, @dueAt, @priority,
      @selectedPracticeTaskId, @schedulerVersion, @sourceSummaryId,
      @reasonCodesJson, @status, @createdAt, @completedAt
    )
  `).run(row);
  if (result.changes === 1) return { review: candidate, replayed: false };
  const existing = db.prepare<[string, string, string], ReviewRow>(`
    SELECT * FROM review_items
    WHERE source_summary_id = ? AND node_id = ? AND purpose = ? AND status = 'open'
  `).get(candidate.sourceSummaryId, candidate.nodeId, candidate.purpose);
  if (existing === undefined) throw new Error("Review replay row disappeared");
  return { review: fromReviewRow(existing), replayed: true };
}

export function listDueReviews(
  db: Database.Database,
  learnerId: string,
  asOf: string,
  limit = 20,
): readonly ReviewItem[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer from 1 to 100");
  }
  return db.prepare<[string, string, number], ReviewRow>(`
    SELECT * FROM review_items
    WHERE learner_id = ? AND status = 'open' AND due_at <= ?
    ORDER BY priority DESC, due_at ASC, id ASC
    LIMIT ?
  `).all(learnerId, asOf, limit).map(fromReviewRow);
}

export function completeReview(
  db: Database.Database,
  reviewId: string,
  completedAt: string,
): boolean {
  return db.prepare(`
    UPDATE review_items SET status = 'completed', completed_at = ?
    WHERE id = ? AND status = 'open'
  `).run(completedAt, reviewId).changes === 1;
}

export function selectReviewPracticeTaskId(
  db: Database.Database,
  nodeId: string,
  purpose: ReviewPurpose,
): string | null {
  const preferredKind = purpose === "variant" || purpose === "transfer" ? "variant" : "review";
  const row = db.prepare<[string, string], { readonly id: string }>(`
    SELECT task.id
    FROM node_practice_mappings mapping
    JOIN practice_tasks task ON task.id = mapping.practice_task_id
    WHERE mapping.node_id = ?
    ORDER BY CASE task.kind WHEN ? THEN 0 ELSE 1 END,
             mapping.sort_order ASC, task.id ASC
    LIMIT 1
  `).get(nodeId, preferredKind);
  return row?.id ?? null;
}

export function findOpenReviewForNode(
  db: Database.Database,
  learnerId: string,
  nodeId: string,
  purposes: readonly ReviewPurpose[],
): ReviewItem | null {
  const purpose = purposes[0];
  if (purpose === undefined) return null;
  const row = db.prepare<[string, string, string], ReviewRow>(`
    SELECT * FROM review_items
    WHERE learner_id = ? AND node_id = ? AND purpose = ? AND status = 'open'
    ORDER BY priority DESC, due_at ASC LIMIT 1
  `).get(learnerId, nodeId, purpose);
  return row === undefined ? null : fromReviewRow(row);
}

const ReasonCodesSchema = z.array(z.string().min(1));

function fromReviewRow(row: ReviewRow): ReviewItem {
  return ReviewItemSchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    nodeId: row.node_id,
    purpose: row.purpose,
    dueAt: row.due_at,
    priority: row.priority,
    selectedPracticeTaskId: row.selected_practice_task_id,
    schedulerVersion: row.scheduler_version,
    sourceSummaryId: row.source_summary_id,
    reasonCodes: ReasonCodesSchema.parse(JSON.parse(row.reason_codes_json)),
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  });
}
