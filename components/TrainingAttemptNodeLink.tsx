import {
  abilityLabel,
  findMappedAttempt,
  type MappedAttemptRow,
} from "@/lib/services/attemptNodeMapping";

/**
 * V0 mapped-attempt surface component (Todo 20).
 *
 * The Training page renders this small server component next to each
 * attempt row. When the attempt has a `attempt_node_mappings` row, the
 * component shows the mapped node title (linking to `/map/[nodeId]`)
 * and the current ability label. When the attempt is unmapped it
 * renders nothing, preserving Phase 0 Training semantics for legacy
 * rows that pre-date the V0 corpus.
 *
 * The component intentionally does not call `db.close()`; it accepts
 * the already-open handle from its server-component parent so the
 * Training page's `finally` block can release it. This matches the
 * repository DB-handle rule from `AGENTS.md`.
 */

type TrainingAttemptNodeLinkProps = {
  readonly attemptId: string;
  readonly db: import("better-sqlite3").Database;
  readonly learnerId?: string;
};

export function TrainingAttemptNodeLink({
  attemptId,
  db,
  learnerId,
}: TrainingAttemptNodeLinkProps) {
  const mapped: MappedAttemptRow = findMappedAttempt(db, attemptId, learnerId);
  if (!mapped.mapped || mapped.node === null) {
    return null;
  }
  const ability = mapped.ability;
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <p>
        <span className="font-medium text-slate-900">Node:</span>{" "}
        <a
          className="text-slate-900 underline underline-offset-2 hover:text-slate-700"
          href={`/map/${encodeURIComponent(mapped.node.stableId)}`}
        >
          {mapped.node.title}
        </a>
        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
          {mapped.node.role}
        </span>
      </p>
      {ability !== null ? (
        <p className="mt-1">
          <span className="font-medium text-slate-900">Ability:</span>{" "}
          <span aria-label={`Current ability is ${ability.label}`}>
            {abilityLabel({
              visibleLevel: ability.visibleLevel,
              confidence: ability.confidence,
            })}
          </span>
        </p>
      ) : (
        <p className="mt-1 italic text-slate-500">
          No ability snapshot recorded for this node yet.
        </p>
      )}
    </div>
  );
}