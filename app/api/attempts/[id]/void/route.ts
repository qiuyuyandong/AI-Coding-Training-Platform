import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
} from "@/lib/http/captureRequest";
import {
  AttemptNotFoundError,
  AttemptRevisionConflictError,
  VoidAttemptRequestSchema,
} from "@/lib/services/attemptCorrections";
import { voidAttemptWithReprojection } from "@/lib/services/abilityReprojection";
import { appendEvidenceEvent, mapEvidenceToNode } from "@/lib/repositories/evidence";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { replayEvidenceAbility } from "@/lib/services/evidenceAbilityReplay";

type RouteContext = {
  readonly params: Promise<{ readonly id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    requireSameOrigin(request);
    const parsed = VoidAttemptRequestSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid void request", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { id } = await context.params;
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const result = await voidAttemptWithReprojection(db, id, parsed.data);
      if (!result.replayed) {
        const now = result.attempt.voidedAt ?? new Date().toISOString();
        const event = appendEvidenceEvent(db, {
          learnerId: LOCAL_DEFAULT_LEARNER_ID,
          sourceType: "attempt",
          sourceId: id,
          eventType: "correction",
          occurredAt: now,
          factsJson: JSON.stringify({ voided: true, revision: result.attempt.revision }),
          provenanceJson: JSON.stringify({ userConfirmed: true }),
          schemaVersion: "learning-evidence-1",
          parserVersion: "learning-evidence-1",
          confidence: "high",
          supersedesEventId: null,
          idempotencyKey: `attempt:${id}:revision:${result.attempt.revision}:voided`,
        });
        const mappings = db.prepare<[string], {
          readonly node_id: string;
          readonly role: "primary" | "supporting";
          readonly mapping_reason: string;
        }>(`
          SELECT node_id, role, mapping_reason FROM attempt_node_mappings WHERE attempt_id = ?
        `).all(id);
        for (const mapping of mappings) {
          mapEvidenceToNode(db, {
            evidenceEventId: event.event.id,
            nodeId: mapping.node_id,
            role: mapping.role,
            strength: 100,
            mappingReason: mapping.mapping_reason,
          });
        }
        db.prepare(`
          UPDATE review_items SET status = 'cancelled'
          WHERE status = 'open' AND source_summary_id IN (
            SELECT id FROM training_session_summaries
            WHERE learner_id = ? AND source_type = 'attempt' AND source_id = ?
          )
        `).run(LOCAL_DEFAULT_LEARNER_ID, id);
      }
      replayEvidenceAbility(db, LOCAL_DEFAULT_LEARNER_ID, new Date().toISOString());
      return NextResponse.json({ ok: true, ...result });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    if (error instanceof AttemptNotFoundError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    if (error instanceof AttemptRevisionConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "Failed to void attempt" },
      { status: 500 },
    );
  }
}
