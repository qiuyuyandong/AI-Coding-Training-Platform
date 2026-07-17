import type Database from "better-sqlite3";
import { z } from "zod";
import { AbilityConfidenceSchema, AbilityLevelSchema } from "@/lib/domain/ability";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";

/**
 * V0 mapped-attempt surface helper (Todo 20).
 *
 * Existing `/training` rows are the source of truth for the learner's
 * attempt history. After Todo 14/15, a *subset* of those attempts carry
 * an `attempt_node_mappings` row that links them to one
 * `knowledge_nodes` row, and the corresponding `ability_snapshots` row
 * holds the current visible level and confidence. The UI must surface
 * that evidence inline so the learner can see *why* an attempt
 * influenced the next decision.
 *
 * This helper is the single read path for the Training page. It is a
 * pure transport layer: it accepts a caller-owned SQLite handle,
 * JOINs the three tables, returns a deterministic list, and never
 * opens or closes the database. The shape is strictly typed and the
 * Zod schemas at the boundary reject malformed rows early.
 *
 * Rows without a mapping are returned with `mapped: false` so the
 * caller can render them as before (Phase 0 Coach/Growth semantics are
 * preserved). Rows with a mapping but no snapshot carry `mapped: true`
 * and `ability: null` (the projector has not yet run for that node).
 */

const MappedNodeRowSchema = z.object({
  node_id: z.string().min(1),
  node_stable_id: z.string().min(1),
  node_title: z.string().min(1),
  mapping_role: z.enum(["primary", "supporting"]),
});

const MappedAbilityRowSchema = z.object({
  visible_level: AbilityLevelSchema,
  confidence: AbilityConfidenceSchema,
});

export type MappedAttemptRow = {
  readonly attemptId: string;
  readonly mapped: boolean;
  readonly node: {
    readonly nodeId: string;
    readonly stableId: string;
    readonly title: string;
    readonly role: "primary" | "supporting";
  } | null;
  readonly ability: {
    readonly visibleLevel: z.infer<typeof AbilityLevelSchema>;
    readonly confidence: z.infer<typeof AbilityConfidenceSchema>;
    readonly label: string;
  } | null;
};

export type AbilityLabelInput = {
  readonly visibleLevel: z.infer<typeof AbilityLevelSchema>;
  readonly confidence: z.infer<typeof AbilityConfidenceSchema>;
};

/**
 * Translate an ability snapshot into a short human-readable label.
 *
 * The label is intentionally terse so it can sit inline next to the
 * attempt row without breaking the page layout. The visible level is
 * already a stable V0 enum (`unassessed`, `L1`, `L2`, ...); the
 * confidence is appended as a parenthetical so the learner can see
 * uncertainty at a glance.
 */
export function abilityLabel(input: AbilityLabelInput): string {
  const level = AbilityLevelSchema.parse(input.visibleLevel);
  const confidence = AbilityConfidenceSchema.parse(input.confidence);
  return `${level} (${confidence})`;
}

type AttemptMappingJoinRow = {
  readonly attempt_id: string;
  readonly node_id: string | null;
  readonly node_stable_id: string | null;
  readonly node_title: string | null;
  readonly mapping_role: string | null;
};

/**
 * Return the mapped node + ability snapshot for one attempt id, or
 * `null` for the `node` field when the attempt has no mapping.
 *
 * The single-row lookup is intended for the inline Training page link
 * and never opens its own database handle.
 */
export function findMappedAttempt(
  db: Database.Database,
  attemptId: string,
  learnerId: string = LOCAL_DEFAULT_LEARNER_ID,
): MappedAttemptRow {
  if (attemptId.length === 0) {
    throw new RangeError("attemptId must not be empty");
  }
  const joinRow = db
    .prepare<[string], AttemptMappingJoinRow>(
      `SELECT m.attempt_id     AS attempt_id,
              n.id             AS node_id,
              n.stable_id      AS node_stable_id,
              n.title          AS node_title,
              m.role           AS mapping_role
         FROM attempt_node_mappings m
         LEFT JOIN knowledge_nodes n ON n.id = m.node_id
         JOIN training_attempts a ON a.id = m.attempt_id
        WHERE m.attempt_id = ?
          AND a.voided_at IS NULL
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT 1`,
    )
    .get(attemptId);

  if (joinRow === undefined || joinRow.node_id === null || joinRow.node_stable_id === null
    || joinRow.node_title === null || joinRow.mapping_role === null) {
    return {
      attemptId,
      mapped: false,
      node: null,
      ability: null,
    };
  }

  const parsed = MappedNodeRowSchema.parse({
    node_id: joinRow.node_id,
    node_stable_id: joinRow.node_stable_id,
    node_title: joinRow.node_title,
    mapping_role: joinRow.mapping_role,
  });

  const abilityRow = db
    .prepare<[string, string], {
      readonly visible_level: string;
      readonly confidence: string;
    }>(
      `SELECT visible_level, confidence
         FROM ability_snapshots
        WHERE learner_id = ? AND node_id = ?
        LIMIT 1`,
    )
    .get(learnerId, parsed.node_id);

  let ability: MappedAttemptRow["ability"] = null;
  if (abilityRow !== undefined) {
    const parsedAbility = MappedAbilityRowSchema.parse({
      visible_level: abilityRow.visible_level,
      confidence: abilityRow.confidence,
    });
    ability = {
      visibleLevel: parsedAbility.visible_level,
      confidence: parsedAbility.confidence,
      label: abilityLabel({
        visibleLevel: parsedAbility.visible_level,
        confidence: parsedAbility.confidence,
      }),
    };
  }

  return {
    attemptId,
    mapped: true,
    node: {
      nodeId: parsed.node_id,
      stableId: parsed.node_stable_id,
      title: parsed.node_title,
      role: parsed.mapping_role,
    },
    ability,
  };
}

/**
 * Batch variant of {@link findMappedAttempt}. The query joins every
 * attempt id in one SQL statement so the Training page does not issue
 * N+1 statements.
 */
export function listMappedAttempts(
  db: Database.Database,
  attemptIds: readonly string[],
  learnerId: string = LOCAL_DEFAULT_LEARNER_ID,
): MappedAttemptRow[] {
  if (attemptIds.length === 0) return [];
  const unique = [...new Set(attemptIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return [];

  const placeholders = unique.map(() => "?").join(", ");
  const joinRows = db
    .prepare<unknown[], {
      readonly attempt_id: string;
      readonly node_id: string;
      readonly node_stable_id: string;
      readonly node_title: string;
      readonly mapping_role: string;
    }>(
      `SELECT m.attempt_id     AS attempt_id,
              n.id             AS node_id,
              n.stable_id      AS node_stable_id,
              n.title          AS node_title,
              m.role           AS mapping_role
         FROM attempt_node_mappings m
         JOIN knowledge_nodes n ON n.id = m.node_id
         JOIN training_attempts a ON a.id = m.attempt_id
        WHERE m.attempt_id IN (${placeholders})
          AND a.voided_at IS NULL
        ORDER BY m.attempt_id ASC, m.created_at ASC, m.id ASC`,
    )
    .all(...unique);

  const uniqueNodeIds = [...new Set(joinRows.map((row) => row.node_id))];
  const abilityRows: Array<{
    readonly node_id: string;
    readonly visible_level: string;
    readonly confidence: string;
  }> = uniqueNodeIds.length === 0
    ? []
    : db
      .prepare<unknown[], {
        readonly node_id: string;
        readonly visible_level: string;
        readonly confidence: string;
      }>(
        `SELECT node_id, visible_level, confidence
           FROM ability_snapshots
          WHERE learner_id = ?
            AND node_id IN (${uniqueNodeIds.map(() => "?").join(", ")})`,
      )
      .all(learnerId, ...uniqueNodeIds);

  const abilityByNode = new Map<string, MappedAttemptRow["ability"]>();
  for (const row of abilityRows) {
    const parsed = MappedAbilityRowSchema.parse({
      visible_level: row.visible_level,
      confidence: row.confidence,
    });
    abilityByNode.set(row.node_id, {
      visibleLevel: parsed.visible_level,
      confidence: parsed.confidence,
      label: abilityLabel({
        visibleLevel: parsed.visible_level,
        confidence: parsed.confidence,
      }),
    });
  }

  const mappedByAttempt = new Map<string, MappedAttemptRow>();
  for (const row of joinRows) {
    const parsed = MappedNodeRowSchema.parse({
      node_id: row.node_id,
      node_stable_id: row.node_stable_id,
      node_title: row.node_title,
      mapping_role: row.mapping_role,
    });
    mappedByAttempt.set(row.attempt_id, {
      attemptId: row.attempt_id,
      mapped: true,
      node: {
        nodeId: parsed.node_id,
        stableId: parsed.node_stable_id,
        title: parsed.node_title,
        role: parsed.mapping_role,
      },
      ability: abilityByNode.get(parsed.node_id) ?? null,
    });
  }

  return unique.map((attemptId) => mappedByAttempt.get(attemptId) ?? {
    attemptId,
    mapped: false,
    node: null,
    ability: null,
  });
}