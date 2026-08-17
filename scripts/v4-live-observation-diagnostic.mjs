/**
 * Disposable, privacy-bounded diagnostic for the D4 live observation runner.
 *
 * This module exists only to pin which chrome.storage.onChanged key names a
 * batch carries when the main observer rejects it as outside its reviewed
 * trigger allowlists. It emits key NAMES and the storage area only; it never
 * reads values, oldValue, newValue, or any other storage content, and its
 * output must never enter the schemaVersion-3 observation evidence JSON.
 */

import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isCanonicalDescendant } from "./v4-live-observation-observer.mjs";

const SAFE_DIAGNOSTIC_KEY = /^[A-Za-z0-9_.:/-]{1,200}$/u;
const MAX_DIAGNOSTIC_KEYS = 32;

/**
 * Validate an operator-supplied diagnostic output path. It must be absolute,
 * end in -storage-key-diagnostic.json, stay inside the repository root, cross
 * no symbolic-link component, and not collide with a directory.
 */
export function validateDiagnosticOutputPath(candidatePath, repoRoot) {
  if (typeof candidatePath !== "string" || typeof repoRoot !== "string"
    || !isAbsolute(candidatePath)
    || !candidatePath.endsWith("-storage-key-diagnostic.json")) {
    return { ok: false, reason: "observer_diagnostic_path_rejected" };
  }
  const parent = dirname(candidatePath);
  if (!isCanonicalDescendant(repoRoot, parent)) {
    return { ok: false, reason: "observer_diagnostic_path_rejected" };
  }
  let current = resolve(repoRoot);
  for (const component of relative(repoRoot, parent).split(/[\\/]+/u)) {
    current = resolve(current, component);
    let stats;
    try {
      stats = lstatSync(current);
    } catch (error) {
      if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT") {
        continue;
      }
      return { ok: false, reason: "observer_diagnostic_path_rejected" };
    }
    if (stats.isSymbolicLink()) {
      return { ok: false, reason: "observer_diagnostic_path_rejected" };
    }
  }
  if (existsSync(candidatePath) && !lstatSync(candidatePath).isFile()) {
    return { ok: false, reason: "observer_diagnostic_path_rejected" };
  }
  return { ok: true };
}

/**
 * Write the closed diagnostic payload. Failures never throw and never alter
 * the main observation terminal reason.
 */
export function writeDiagnosticOutputFile(path, payload) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, reason: "observer_evidence_write_failed" };
  }
}

const CLOSED_STAGE_NAMES = new Set([
  "browse_only",
  "e1_observed",
  "e2_confirmed",
  "e3_outbox",
  "acknowledged",
]);
const STAGE_SEQUENCE_COUNT_KEYS = [
  "authorizedActions",
  "exactSubmitCorroboration",
  "stableResultLifecycles",
  "e2Confirmed",
  "e3Finalized",
];
const STAGE_SEQUENCE_CAP = 64;

/**
 * Project one bounded stage-evidence record into the closed stage-sequence
 * entry. Forbidden fields are dropped; invalid projections return undefined.
 */
export function buildStageSequenceEntry(seq, projection) {
  if (!Number.isInteger(seq) || seq < 1) return undefined;
  if (typeof projection !== "object" || projection === null
    || typeof projection.stage !== "string"
    || !CLOSED_STAGE_NAMES.has(projection.stage)
    || typeof projection.facts !== "object" || projection.facts === null) {
    return undefined;
  }
  const facts = projection.facts;
  if (!STAGE_SEQUENCE_COUNT_KEYS.every((key) =>
    Number.isInteger(facts[key]) && facts[key] >= 0)) {
    return undefined;
  }
  return Object.freeze({
    seq,
    stage: projection.stage,
    authorizedActions: facts.authorizedActions,
    exactSubmitCorroboration: facts.exactSubmitCorroboration,
    stableResultLifecycles: facts.stableResultLifecycles,
    e2Confirmed: facts.e2Confirmed,
    e3Finalized: facts.e3Finalized,
  });
}

/**
 * Build the bounded stage sequence from the runner's stage history plus the
 * final projection. Entries are capped at 64; the final projection is
 * appended only when its stage differs from the last recorded entry.
 */
export function buildStageSequence(history, finalProjection) {
  if (!Array.isArray(history)) {
    return { entries: Object.freeze([]), capped: false, reason: "observer_value_rejected" };
  }
  const entries = [];
  let capped = false;
  let seq = 1;
  for (const projection of history) {
    const entry = buildStageSequenceEntry(seq, projection);
    if (entry === undefined) {
      return { entries: Object.freeze([]), capped: false, reason: "observer_value_rejected" };
    }
    if (entries.length >= STAGE_SEQUENCE_CAP) {
      capped = true;
      break;
    }
    entries.push(entry);
    seq += 1;
  }
  if (!capped && finalProjection !== undefined) {
    const finalEntry = buildStageSequenceEntry(seq, finalProjection);
    if (finalEntry === undefined) {
      return { entries: Object.freeze([]), capped: false, reason: "observer_value_rejected" };
    }
    if (finalEntry.stage !== entries.at(-1)?.stage) {
      if (entries.length >= STAGE_SEQUENCE_CAP) capped = true;
      else entries.push(finalEntry);
    }
  }
  return { entries: Object.freeze(entries), capped };
}

/**
 * Classify one already-validated storage change batch. Returns the closed
 * rejected-key projection (area plus sorted, deduplicated key names) or a
 * rejection reason. Keys inside the trigger allowlists or the closed
 * ignore lists are not rejected. It must never access change values.
 */
export function classifyRejectedStorageBatch(
  area,
  changes,
  localKeys,
  sessionKeys,
  ignoredLocalKeys,
  ignoredSessionKeys,
) {
  if (area !== "local" && area !== "session") {
    return { ok: false, reason: "observer_value_rejected" };
  }
  if (typeof changes !== "object" || changes === null) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  if (!Array.isArray(localKeys) || !Array.isArray(sessionKeys)
    || !Array.isArray(ignoredLocalKeys) || !Array.isArray(ignoredSessionKeys)
    || ![...localKeys, ...sessionKeys, ...ignoredLocalKeys, ...ignoredSessionKeys]
      .every((key) => typeof key === "string")) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  const allowed = area === "local" ? localKeys : sessionKeys;
  const ignored = area === "local" ? ignoredLocalKeys : ignoredSessionKeys;
  const names = Object.keys(changes);
  const rejected = names.filter((name) => !allowed.includes(name) && !ignored.includes(name));
  if (rejected.length === 0) return { ok: true };
  if (rejected.length > MAX_DIAGNOSTIC_KEYS
    || !rejected.every((name) => SAFE_DIAGNOSTIC_KEY.test(name))) {
    return { ok: false, reason: "observer_value_rejected" };
  }
  return {
    ok: true,
    rejected: Object.freeze({
      area,
      keys: Object.freeze([...new Set(rejected)].sort()),
    }),
  };
}

/**
 * Self-contained listener source for the persistent popup page. It subscribes
 * a parallel chrome.storage.onChanged listener that only inspects batch key
 * names against the same allowlists the main observer uses, and forwards a
 * closed diagnostic event when an out-of-allowlist batch is seen.
 */
export function storageKeyDiagnosticListenerSource() {
  return `(${storageKeyDiagnosticListener.toString()})`;
}

export function storageKeyDiagnosticListener(configuration) {
  const localKeys = configuration.localKeys;
  const sessionKeys = configuration.sessionKeys;
  const ignoredLocalKeys = configuration.ignoredLocalKeys;
  const ignoredSessionKeys = configuration.ignoredSessionKeys;
  const safeKey = /^[A-Za-z0-9_.:/-]{1,200}$/u;
  const maxKeys = 32;
  const validArea = (area) => area === "local" || area === "session";
  const stringArray = (value) => Array.isArray(value)
    && value.every((key) => typeof key === "string");
  const validConfiguration = () => stringArray(localKeys)
    && stringArray(sessionKeys)
    && stringArray(ignoredLocalKeys)
    && stringArray(ignoredSessionKeys);
  if (!validConfiguration()) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!validArea(area)) return;
    const allowed = area === "local" ? localKeys : sessionKeys;
    const ignored = area === "local" ? ignoredLocalKeys : ignoredSessionKeys;
    const names = Object.keys(changes);
    const rejected = names.filter((name) => !allowed.includes(name) && !ignored.includes(name));
    if (rejected.length === 0 || rejected.length > maxKeys) return;
    if (!rejected.every((name) => safeKey.test(name))) return;
    if (typeof window.__v4ObservationEvent === "function") {
      window.__v4ObservationEvent({
        type: "observer_storage_key_diagnostic",
        area,
        keys: [...new Set(rejected)].sort(),
      });
    }
  });
}
