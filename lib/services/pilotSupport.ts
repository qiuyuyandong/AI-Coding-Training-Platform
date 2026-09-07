import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";

export const FeedbackCategorySchema = z.enum(["vault_health", "feature_counts", "schema"]);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

export type VaultDiagnosisSummary = Readonly<{
  status: "ok" | "error";
  database: "ok" | "error";
  sidecars: number;
  schemaMigrationCount: number;
  retainedSnapshotCount: number;
  missingSnapshotCount: number;
}>;

export function readMetricsEnabled(db: Database.Database, learnerId = LOCAL_DEFAULT_LEARNER_ID): boolean {
  return (db.prepare<[string], { readonly metrics_enabled: number }>(`
    SELECT metrics_enabled FROM pilot_support_preferences WHERE learner_id = ?
  `).get(learnerId)?.metrics_enabled ?? 0) === 1;
}

export function saveMetricsEnabled(
  db: Database.Database,
  enabled: boolean,
  now: string,
  learnerId = LOCAL_DEFAULT_LEARNER_ID,
): boolean {
  db.prepare(`
    INSERT INTO pilot_support_preferences (learner_id, metrics_enabled, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(learner_id) DO UPDATE SET metrics_enabled = excluded.metrics_enabled, updated_at = excluded.updated_at
  `).run(learnerId, enabled ? 1 : 0, now);
  return enabled;
}

export function buildFeedbackBundle(
  db: Database.Database,
  input: {
    readonly categories: readonly FeedbackCategory[];
    readonly diagnosis: VaultDiagnosisSummary;
    readonly now: string;
    readonly learnerId?: string;
  },
): Readonly<Record<string, unknown>> {
  const learnerId = input.learnerId ?? LOCAL_DEFAULT_LEARNER_ID;
  const categories = [...new Set(input.categories.map((category) => FeedbackCategorySchema.parse(category)))].sort();
  if (categories.length === 0) throw new RangeError("Select at least one feedback category");
  const data: Record<string, unknown> = {};
  if (categories.includes("vault_health")) {
    data["vaultHealth"] = {
      status: input.diagnosis.status,
      database: input.diagnosis.database,
      sidecars: input.diagnosis.sidecars,
      retainedSnapshots: input.diagnosis.retainedSnapshotCount,
      missingSnapshots: input.diagnosis.missingSnapshotCount,
    };
  }
  if (categories.includes("feature_counts")) {
    data["featureCounts"] = {
      attempts: scalarCountAll(db, "SELECT COUNT(*) AS count FROM training_attempts"),
      evidenceEvents: scalarCount(db, "SELECT COUNT(*) AS count FROM learning_evidence_events WHERE learner_id = ?", learnerId),
      projects: scalarCount(db, "SELECT COUNT(*) AS count FROM learner_projects WHERE learner_id = ?", learnerId),
      openReviews: scalarCount(db, "SELECT COUNT(*) AS count FROM review_items WHERE learner_id = ? AND status = 'open'", learnerId),
    };
  }
  if (categories.includes("schema")) data["schema"] = { migrationCount: input.diagnosis.schemaMigrationCount };
  const bundle = {
    format: "ai-coding-training-feedback",
    version: 1,
    createdAt: input.now,
    categories,
    data,
  } as const;
  assertFeedbackSafe(bundle);
  if (readMetricsEnabled(db, learnerId)) {
    db.prepare(`
      INSERT INTO pilot_support_events (id, learner_id, event_type, metric_value, occurred_at)
      VALUES (?, ?, 'feedback_exported', 1, ?)
    `).run(`support_event_${randomUUID()}`, learnerId, input.now);
  }
  return bundle;
}

function scalarCount(db: Database.Database, sql: string, learnerId: string): number {
  return db.prepare<[string], { readonly count: number }>(sql).get(learnerId)?.count ?? 0;
}

function scalarCountAll(db: Database.Database, sql: string): number {
  return db.prepare<[], { readonly count: number }>(sql).get()?.count ?? 0;
}

function assertFeedbackSafe(bundle: Readonly<Record<string, unknown>>): void {
  const serialized = JSON.stringify(bundle);
  if (/\b(?:api[_-]?key|secret|token|password|prompt|code|reflection|path|identity)\b/iu.test(serialized)
    || /[A-Za-z]:\\|\/(?:Users|home|var|tmp)\//u.test(serialized)) {
    throw new Error("Feedback bundle failed the privacy allowlist");
  }
}
