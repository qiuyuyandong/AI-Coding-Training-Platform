/**
 * Restart-time LeetCode submit-epoch replay seam.
 *
 * Storage is read afresh on every invocation and delivery is injected so this
 * module remains independent of Chrome, DOM and wall-clock APIs.  The caller
 * owns the exact tab/frame/document send and receives one sequential call per
 * currently eligible unfinalized E2 record.
 */

import { readConfirmedSubmissionState } from "./confirmedSubmissionStorage";
import { readTransientSessionEvidenceState } from "./transientEvidenceStorage";
import {
  selectLeetCodeConfirmedEpochReplays,
  type LeetCodeConfirmedEpochReplay,
} from "./verdictCandidateCoordinator";

export type SubmitEpochReplayStorageArea = Readonly<{
  get: (keys: readonly string[]) => Promise<Record<string, unknown>>;
}>;

export type SubmitEpochReplayStorage = Readonly<{
  local: SubmitEpochReplayStorageArea;
  session: SubmitEpochReplayStorageArea;
}>;

export type SubmitEpochReplayInput = Readonly<{
  storage: SubmitEpochReplayStorage;
  now: () => string;
  deliver: (replay: LeetCodeConfirmedEpochReplay) => Promise<void>;
}>;

/**
 * Re-read authoritative state and deliver only exact replay controls.  A
 * finalized record, malformed/missing document, duplicate lifecycle or stale
 * E1/E2 join naturally selects no replay; this function never emits STARTED
 * and never fabricates a content baseline.
 */
export async function replayLeetCodeConfirmedEpochs(
  input: SubmitEpochReplayInput,
): Promise<readonly LeetCodeConfirmedEpochReplay[]> {
  const [local, session] = await Promise.all([
    input.storage.local.get(["confirmedSubmissions", "confirmedSubmissionTombstones"]),
    input.storage.session.get(["transientE1"]),
  ]);
  const confirmed = readConfirmedSubmissionState(local);
  const transient = readTransientSessionEvidenceState(session);
  const replays = selectLeetCodeConfirmedEpochReplays({
    requestLifecycles: transient.requestLifecycles,
    confirmed: confirmed.confirmed,
    now: input.now(),
  });
  for (const replay of replays) {
    await input.deliver(replay);
  }
  return replays;
}
