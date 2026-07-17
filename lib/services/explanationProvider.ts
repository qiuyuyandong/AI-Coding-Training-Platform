import type Database from "better-sqlite3";
import { findAbilitySnapshot } from "@/lib/repositories/ability";
import {
  explainLevel,
  type Explanation,
} from "@/lib/services/evidenceExplanation";

/**
 * V0 ability explanation provider (Todo 15).
 *
 * A thin wrapper that bundles the snapshot lookup with the pure
 * `explainLevel` builder. The provider exists so the API handler
 * (Todo 15) and any future UI can request an explanation through a
 * single entry point without re-implementing the snapshot lookup. When
 * the learner has no recorded snapshot for the node, the provider
 * returns an `unassessed` / `low` explanation with empty citations; the
 * callers do not need to special-case the cold start.
 *
 * The provider is intentionally synchronous and stateless. It never
 * opens the SQLite handle, never reads Node process state, and never
 * touches the clock.
 */

export type ExplanationWithMeta = {
  readonly explanation: Explanation;
  readonly hasSnapshot: boolean;
  readonly asOfTime: string | null;
};

export function getExplanation(
  db: Database.Database,
  learnerId: string,
  nodeId: string,
): ExplanationWithMeta {
  const snapshot = findAbilitySnapshot(db, learnerId, nodeId);
  if (snapshot === null) {
    return {
      explanation: explainLevel("unassessed", "low", [], [], []),
      hasSnapshot: false,
      asOfTime: null,
    };
  }
  const explanation = explainLevel(
    snapshot.visible_level,
    snapshot.confidence,
    [],
    [],
    [],
  );
  return {
    explanation,
    hasSnapshot: true,
    asOfTime: snapshot.as_of_time,
  };
}
