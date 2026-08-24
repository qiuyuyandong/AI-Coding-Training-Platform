import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";
import {
  APPROVED_NOWCODER_PATH,
  EXACT_LOCAL_SNAPSHOT_KEYS,
  EXACT_SESSION_SNAPSHOT_KEYS,
  IGNORED_LOCAL_KEYS,
  IGNORED_SESSION_KEYS,
  LOCAL_TRIGGER_KEYS,
  SESSION_TRIGGER_KEYS,
  createObservationTerminalController,
  isExactObserverPageUrl,
  persistentObserverEntrypoint,
  projectD4AcceptanceEvidence,
  projectFailureReceipt,
  reduceObservationSnapshot,
  validateCandidateReceipt,
  validateReadyConnectionReceipt,
  validateObservationDatabase,
  validateObservationTarget,
} from "./v4-live-observation-observer.mjs";
import { buildStageSequence, storageKeyDiagnosticListener, validateDiagnosticOutputPath, writeDiagnosticOutputFile } from "./v4-live-observation-diagnostic.mjs";

const TARGETS = Object.freeze({
  "leetcode.cn": Object.freeze({
    platform: "leetcode",
    startUrl: "https://leetcode.cn/problemset/",
  }),
  "ac.nowcoder.com": Object.freeze({
    platform: "nowcoder",
    startUrl: `https://ac.nowcoder.com${APPROVED_NOWCODER_PATH}`,
  }),
});

const LOCAL_APP_ORIGIN = "http://localhost:3000";
const CANONICAL_CAPTURE_ENDPOINT = `${LOCAL_APP_ORIGIN}/api/capture/attempts`;
const D3_ARTIFACTS = Object.freeze([
  Object.freeze({ name: "manifest", file: "manifest.json" }),
  Object.freeze({ name: "background", file: "background.js" }),
  Object.freeze({ name: "content", file: "content.js" }),
  Object.freeze({ name: "popup", file: "popup.js" }),
  Object.freeze({ name: "mainWorldBridge", file: "main-world-bridge.js" }),
]);
const OBSERVATION_PROFILE_FILE = resolve(
  "docs",
  "superpowers",
  "specs",
  "v4-d4-acceptance-profiles.json",
);
const OBSERVATION_TOOL_FILES = Object.freeze([
  fileURLToPath(import.meta.url),
  resolve("scripts", "v4-live-observation-observer.mjs"),
  resolve("scripts", "v4-live-observation-diagnostic.mjs"),
  resolve("extension", "identity.json"),
]);
const PROFILE_ROOT = resolve(".tmp", "v4-d4-observation-profiles");
const CONNECTION_RECEIPT_ROOT = resolve(".tmp", "v4-ready-connection-receipts");
const EXPECTED_EXTENSION_ID = JSON.parse(
  readFileSync(resolve("extension", "identity.json"), "utf8"),
).extensionId;

function argumentValue(argv, name) {
  const argument = argv.find((value) => value.startsWith(`${name}=`));
  return argument?.slice(name.length + 1) ?? "";
}

function requiredArgument(argv, name) {
  const value = argumentValue(argv, name);
  if (value.length === 0) throw new Error(`Missing required argument ${name}=...`);
  return value;
}

function expectedArtifactHashes(argv) {
  const values = {};
  for (const artifact of D3_ARTIFACTS) {
    const value = requiredArgument(argv, `--hash-${artifact.name}`).toUpperCase();
    if (!/^[A-F0-9]{64}$/u.test(value)) throw new Error(`Invalid SHA-256 for ${artifact.file}`);
    values[artifact.file] = value;
  }
  return Object.freeze(values);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function sha256File(path) {
  if (!existsSync(path)) throw new Error(`Hash input is missing: ${path}`);
  return sha256Bytes(readFileSync(path));
}

function observationToolHash() {
  const hash = createHash("sha256");
  for (const path of OBSERVATION_TOOL_FILES) hash.update(readFileSync(path));
  return hash.digest("hex").toUpperCase();
}

function requiredSha256(argv, name) {
  const value = requiredArgument(argv, name).toUpperCase();
  if (!/^[A-F0-9]{64}$/u.test(value)) throw new Error(`Invalid SHA-256 for ${name}`);
  return value;
}

function assertContractHashes(expectedProfileHash, expectedToolHash, phase) {
  const profileHash = sha256File(OBSERVATION_PROFILE_FILE);
  const toolHash = observationToolHash();
  if (profileHash !== expectedProfileHash) throw new Error(`${phase} acceptance-profile hash drift`);
  if (toolHash !== expectedToolHash) throw new Error(`${phase} observation-tool hash drift`);
  return Object.freeze({ profileHash, toolHash });
}

function assertCandidateCommit(candidateSha) {
  if (!/^[a-f0-9]{40}$/u.test(candidateSha)) throw new Error("Invalid candidate SHA");
  execFileSync("git", ["cat-file", "-e", `${candidateSha}^{commit}`], {
    cwd: process.cwd(),
    env: { ...process.env, GIT_MASTER: "1" },
    stdio: "ignore",
  });
}

function assertCandidateReceiptFile(path, expected, phase) {
  if (!existsSync(path)) throw new Error(`${phase} candidate receipt is missing`);
  const raw = readFileSync(path);
  let receipt;
  try {
    receipt = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${phase} candidate receipt is not valid JSON`);
  }
  const validation = validateCandidateReceipt(receipt, expected);
  if (!validation.ok) throw new Error(`${phase} ${validation.reason}`);
  return sha256Bytes(raw);
}

function fixedProfilePath(profileId, preparing) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(profileId)) {
    throw new Error("Invalid fixed disposable profile id");
  }
  mkdirSync(PROFILE_ROOT, { recursive: true });
  const profilePath = resolve(PROFILE_ROOT, profileId);
  if (preparing) {
    if (existsSync(profilePath)) {
      throw new Error("Fixed disposable profile identity was already consumed; silent retry is forbidden");
    }
    mkdirSync(profilePath);
    return realpathSync.native(profilePath);
  }
  if (!existsSync(profilePath) || !lstatSync(profilePath).isDirectory()
    || realpathSync.native(profilePath) !== profilePath) {
    throw new Error("Prepared fixed profile is missing or non-canonical");
  }
  return profilePath;
}

function connectionReceiptPath(profileId, preparing) {
  mkdirSync(CONNECTION_RECEIPT_ROOT, { recursive: true });
  const path = resolve(CONNECTION_RECEIPT_ROOT, `${profileId}.json`);
  if (preparing && existsSync(path)) {
    throw new Error("Connection preparation receipt already exists; silent retry is forbidden");
  }
  if (!preparing && !existsSync(path)) throw new Error("Connection preparation receipt is missing");
  return path;
}

function readDatabaseCounts(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const captureEvents = db.prepare("SELECT count(*) AS count FROM capture_events").get();
    const trainingSessions = db.prepare("SELECT count(*) AS count FROM training_sessions").get();
    const trainingAttempts = db.prepare("SELECT count(*) AS count FROM training_attempts").get();
    return {
      captureEvents: Number(captureEvents.count),
      trainingSessions: Number(trainingSessions.count),
      trainingAttempts: Number(trainingAttempts.count),
    };
  } finally {
    db.close();
  }
}

function readArtifactHashes(extensionDist) {
  const hashes = {};
  for (const artifact of D3_ARTIFACTS) {
    const path = resolve(extensionDist, artifact.file);
    if (!existsSync(path)) throw new Error(`Exact extension artifact is missing: ${artifact.file}`);
    hashes[artifact.file] = createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
  }
  return Object.freeze(hashes);
}

function assertArtifactHashes(extensionDist, expected, phase) {
  const actual = readArtifactHashes(extensionDist);
  const drift = D3_ARTIFACTS.flatMap((artifact) => actual[artifact.file] === expected[artifact.file]
    ? []
    : [`${artifact.file}:${actual[artifact.file]} != ${expected[artifact.file]}`]);
  if (drift.length > 0) throw new Error(`${phase} exact-dist hash drift: ${drift.join(", ")}`);
  return actual;
}

async function assertLocalAppReady() {
  const response = await fetch(`${LOCAL_APP_ORIGIN}/`, { redirect: "manual" });
  if (!response.ok && ![301, 302, 307, 308].includes(response.status)) {
    throw new Error(`Local app preflight failed with HTTP ${response.status}`);
  }
}

async function assertCaptureReadyPreflight(popup) {
  const result = await popup.evaluate(async (canonicalEndpoint) => {
    const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
    if (typeof state !== "object" || state === null) return "state_invalid";
    if (Reflect.get(state, "captureEnabled") !== true) return "capture_disabled";
    if (Reflect.get(state, "captureEndpoint") !== canonicalEndpoint) return "endpoint_invalid";
    if (Reflect.get(state, "provenanceLevel") !== "extension_local") return "provenance_invalid";
    if (Reflect.get(state, "captureConnectionStatus") !== "connected") return "connection_invalid";
    const installationId = Reflect.get(state, "installationId");
    const captureCapabilityVersion = Reflect.get(state, "captureCapabilityVersion");
    if (typeof installationId !== "string" || installationId.length === 0
      || !Number.isInteger(captureCapabilityVersion) || captureCapabilityVersion < 1) {
      return "connection_identity_invalid";
    }
    const recovery = Reflect.get(state, "captureRecoveryStatus");
    if (typeof recovery !== "object" || recovery === null
      || Reflect.get(recovery, "schemaVersion") !== 1
      || Reflect.get(recovery, "state") !== "ready") return "recovery_not_ready";
    if (Reflect.get(state, "waitingCount") !== 0) return "waiting_not_empty";
    if (Reflect.get(state, "outboxCount") !== 0) return "outbox_not_empty";
    if (Reflect.get(state, "quarantineCount") !== 0) return "quarantine_not_empty";
    return { installationId, captureCapabilityVersion };
  }, CANONICAL_CAPTURE_ENDPOINT);
  if (typeof result === "string") throw new Error(`Capture READY preflight rejected: ${result}`);
  return result;
}

async function prepareReadyConnection(input) {
  const worker = input.context.serviceWorkers()[0]
    ?? await input.context.waitForEvent("serviceworker", { timeout: 20_000 });
  const extensionId = new URL(worker.url()).hostname;
  if (extensionId !== EXPECTED_EXTENSION_ID) throw new Error("Prepared extension ID is invalid");
  const settings = await input.context.newPage();
  try {
    await settings.goto(`${LOCAL_APP_ORIGIN}/settings`, { waitUntil: "load" });
    await settings.getByTestId("capture-connection-state").waitFor();
    await settings.getByRole("button", { name: "连接扩展" }).click();
    await settings.getByTestId("capture-connection-state")
      .filter({ hasText: "扩展已连接" })
      .waitFor({ timeout: 20_000 });
  } finally {
    await settings.close();
  }
  const popup = await input.context.newPage();
  let ready;
  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    ready = await assertCaptureReadyPreflight(popup);
  } finally {
    await popup.close();
  }
  const finalDatabase = readDatabaseCounts(input.dbPath);
  if (JSON.stringify(finalDatabase) !== JSON.stringify(input.initialCounts)) {
    throw new Error("Connection preparation changed the disposable database");
  }
  if (!existsSync(resolve(input.vaultConfigPath, "capture-installation.json"))) {
    throw new Error("Connection preparation did not create the bounded installation config");
  }
  const receipt = {
    schemaVersion: 1,
    candidateSha: input.candidateSha,
    platform: input.platform,
    profileIdentity: input.profileIdentity,
    databaseIdentity: input.databaseIdentity,
    vaultConfigIdentity: input.vaultConfigIdentity,
    extensionId,
    installationIdentity: sha256Bytes(ready.installationId),
    captureCapabilityVersion: ready.captureCapabilityVersion,
    candidateReceiptHash: input.candidateReceiptHash,
    artifactHashes: input.artifactHashes,
    database: finalDatabase,
    connection: "connected",
    preparedAt: new Date().toISOString(),
  };
  const validation = validateReadyConnectionReceipt(receipt, receipt);
  if (!validation.ok) throw new Error(validation.reason);
  writeFileSync(input.connectionReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(`CONNECTION_PREPARED=1\nCONNECTION_RECEIPT=${input.connectionReceiptPath}\n`);
}

function assertReadyConnectionReceiptFile(path, expected) {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("Connection preparation receipt is not valid JSON");
  }
  const validation = validateReadyConnectionReceipt(receipt, expected);
  if (!validation.ok) throw new Error(validation.reason);
  return receipt;
}

async function stopCharacterization(popup) {
  const result = await popup.evaluate(async () =>
    chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STOP" }));
  if (typeof result !== "object" || result === null || Reflect.get(result, "ok") !== true) {
    throw new Error("Extension did not acknowledge CHARACTERIZATION_STOP.");
  }
}

function sleep(milliseconds) {
  return new Promise((complete) => setTimeout(complete, milliseconds));
}

function safeStageEvidence(state, database) {
  const projected = projectD4AcceptanceEvidence(state, database);
  if (!projected.ok) throw new Error(projected.reason);
  return projected.value;
}

function closedFailureVerdict(reason, failure) {
  if (reason === "observer_capture_error") {
    return (failure?.extension?.confirmed ?? 0) > 0 ? "PRODUCT_FAIL" : "PROFILE_UNRESOLVED";
  }
  if (reason === "observer_target_rejected"
    || reason === "observer_storage_key_rejected"
    || reason === "observer_value_rejected"
    || reason === "observer_stage_rejected") return "OBSERVER_INVALID";
  return "ENVIRONMENT_BLOCKED";
}

async function main() {
  const args = process.argv.slice(2);
  const preparationArgument = argumentValue(args, "--prepare-connection");
  if (preparationArgument !== "" && preparationArgument !== "true") {
    throw new Error("--prepare-connection accepts only true");
  }
  const preparingConnection = preparationArgument === "true";
  const candidateSha = requiredArgument(args, "--candidate").toLowerCase();
  assertCandidateCommit(candidateSha);
  const expectedProfileHash = requiredSha256(args, "--profile-hash");
  const expectedToolHash = requiredSha256(args, "--tool-hash");
  const contractHashes = assertContractHashes(expectedProfileHash, expectedToolHash, "Preflight");
  const hostname = requiredArgument(args, "--hostname");
  const target = TARGETS[hostname];
  if (target === undefined) {
    throw new Error(`Unsupported hostname. Choose only: ${Object.keys(TARGETS).join(", ")}`);
  }
  const problemExternalId = requiredArgument(args, "--problem-id");
  if (target.platform === "nowcoder" && problemExternalId !== "acm/contest/18839/1001") {
    throw new Error("Observer target policy rejected the NowCoder problem id");
  }
  if (target.platform === "leetcode" && !/^[a-z0-9-]{1,100}$/u.test(problemExternalId)) {
    throw new Error("Observer target policy rejected the LeetCode problem id");
  }
  const startUrl = target.platform === "leetcode"
    ? `https://leetcode.cn/problems/${problemExternalId}/`
    : target.startUrl;
  const targetCheck = validateObservationTarget(hostname, new URL(startUrl).pathname);
  if (!targetCheck.ok || targetCheck.platform !== target.platform) {
    throw new Error("Observer target policy rejected before navigation");
  }
  const extensionDist = resolve(requiredArgument(args, "--extension-dist"));
  const expectedHashes = expectedArtifactHashes(args);
  const preflightHashes = assertArtifactHashes(extensionDist, expectedHashes, "Preflight");
  const candidateReceiptPath = resolve(requiredArgument(args, "--candidate-receipt"));
  const candidateReceiptHash = assertCandidateReceiptFile(candidateReceiptPath, {
    candidateSha,
    extensionDist,
    artifactHashes: expectedHashes,
  }, "Preflight");
  const profileId = requiredArgument(args, "--profile-id");
  const diagnosticArgument = argumentValue(args, "--diagnostic-storage-keys");
  let diagnosticPath;
  if (diagnosticArgument.length > 0) {
    const candidatePath = resolve(diagnosticArgument);
    const pathValidation = validateDiagnosticOutputPath(candidatePath, resolve("."));
    if (!pathValidation.ok) throw new Error(pathValidation.reason);
    diagnosticPath = candidatePath;
  }
  const refreshArgument = argumentValue(args, "--diagnostic-refresh-after-ms");
  let diagnosticRefreshAfterMs;
  if (refreshArgument.length > 0) {
    diagnosticRefreshAfterMs = Number(refreshArgument);
    if (!Number.isInteger(diagnosticRefreshAfterMs)
      || diagnosticRefreshAfterMs < 1 || diagnosticRefreshAfterMs > 60_000) {
      throw new Error("--diagnostic-refresh-after-ms must be an integer between 1 and 60000");
    }
  }
  const actionAuthorization = argumentValue(args, "--authorize-action");
  const expectedActionAuthorization = `${target.platform}:${problemExternalId}:${candidateSha}`;
  if (actionAuthorization.length > 0 && actionAuthorization !== expectedActionAuthorization) {
    throw new Error("Action authorization does not name the exact platform, target, and candidate");
  }
  const dbPathFile = resolve(".tmp", "server-db-path.txt");
  if (!existsSync(dbPathFile)) {
    throw new Error("Disposable database path is missing; start the live local server first.");
  }
  const dbPath = resolve(requiredArgument(args, "--database-path"));
  const pointerDbPath = readFileSync(dbPathFile, "utf8").trim();
  if (!existsSync(dbPath)) throw new Error(`Disposable database does not exist: ${dbPath}`);
  const initialCounts = readDatabaseCounts(dbPath);
  const databaseValidation = validateObservationDatabase({
    repoRoot: process.cwd(),
    pointerPath: pointerDbPath,
    explicitPath: dbPath,
    counts: initialCounts,
  });
  if (!databaseValidation.ok) throw new Error(databaseValidation.reason);
  await assertLocalAppReady();
  const profilePath = fixedProfilePath(profileId, preparingConnection);
  const profileIdentity = sha256Bytes(profilePath);
  const databaseIdentity = sha256Bytes(dbPath);
  const vaultConfigPath = resolve(dirname(dbPath), "vault-config");
  const vaultConfigIdentity = sha256Bytes(vaultConfigPath);
  const readyConnectionReceiptPath = connectionReceiptPath(profileId, preparingConnection);
  const expectedReadyConnection = {
    candidateSha,
    platform: target.platform,
    profileIdentity,
    databaseIdentity,
    vaultConfigIdentity,
    extensionId: EXPECTED_EXTENSION_ID,
    candidateReceiptHash,
    artifactHashes: expectedHashes,
  };
  const readyConnectionReceipt = preparingConnection
    ? undefined
    : assertReadyConnectionReceiptFile(readyConnectionReceiptPath, expectedReadyConnection);

  const outputPath = resolve("output", "playwright", "v4-observation");
  mkdirSync(outputPath, { recursive: true });
  const context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDist}`,
      `--load-extension=${extensionDist}`,
      "--disable-features=ExtensionDisableUnsupportedDeveloper",
    ],
  });
  if (preparingConnection) {
    try {
      await prepareReadyConnection({
        context,
        candidateSha,
        platform: target.platform,
        profileIdentity,
        databaseIdentity,
        vaultConfigPath,
        vaultConfigIdentity,
        dbPath,
        initialCounts,
        candidateReceiptHash,
        artifactHashes: preflightHashes,
        connectionReceiptPath: readyConnectionReceiptPath,
      });
    } finally {
      await context.close().catch(() => undefined);
    }
    return;
  }
  let popup;
  let platformPage;
  let stageState;
  let baselineDatabase;
  let latestDatabase;
  let ackEvidenceWritten = false;
  let failureEvidenceWritten = false;
  let failureReceipt;
  const stageHistory = [];
  const diagnosticBatches = [];
  let stageRejection;
  let diagnosticWritten = false;
  const observationTarget = Object.freeze({ platform: target.platform, problemExternalId });
  let eventChain = Promise.resolve();
  let resolveArmed;
  let rejectArmed;
  const armedPromise = new Promise((resolve, reject) => {
    resolveArmed = resolve;
    rejectArmed = reject;
  });
  const terminalController = createObservationTerminalController({
    closeContext: () => context.close(),
    rejectArmed: (error) => {
      if (typeof rejectArmed === "function") rejectArmed(error);
    },
  });
  const terminal = (reason) => {
    if (!terminalController.terminal && failureReceipt === undefined) {
      failureReceipt = Object.freeze({ reason });
    }
    return terminalController.fail(reason);
  };

  const writeDiagnosticOutput = (refresh = false) => {
    if (diagnosticPath === undefined) return;
    if (diagnosticWritten && !refresh) return;
    const firstWrite = !diagnosticWritten;
    diagnosticWritten = true;
    let finalProjection;
    if (stageState !== undefined) {
      try {
        finalProjection = safeStageEvidence(stageState, latestDatabase ?? baselineDatabase);
      } catch {
        finalProjection = undefined;
      }
    }
    const sequence = buildStageSequence(stageHistory, finalProjection);
    const writeResult = writeDiagnosticOutputFile(diagnosticPath, {
      schemaVersion: 2,
      note: "DIAGNOSTIC, NOT A READY RECEIPT, NOT ACCEPTANCE EVIDENCE",
      candidateSha,
      profileIdentity,
      rejectedBatches: diagnosticBatches,
      stageSequence: sequence.entries,
      stageSequenceCapped: sequence.capped,
      ...(stageRejection === undefined ? {} : { stageRejection }),
      ...(sequence.reason === undefined ? {} : { stageSequenceRejected: sequence.reason }),
      ...(terminalController.reason === undefined
        ? {}
        : { terminalReason: terminalController.reason }),
    });
    if (!writeResult.ok) {
      process.stderr.write("STORAGE_KEY_DIAGNOSTIC_ERROR=observer_evidence_write_failed\n");
      return;
    }
    if (firstWrite) process.stdout.write(`STORAGE_KEY_DIAGNOSTIC=${diagnosticPath}\n`);
  };

  const recordStageRejection = (diagnosticCode) => {
    if (diagnosticPath === undefined || stageRejection !== undefined
      || typeof diagnosticCode !== "string") return;
    stageRejection = Object.freeze({
      code: diagnosticCode,
      ...(stageState === undefined ? {} : { stage: stageState.stage }),
    });
  };

  const recordDiagnosticBatch = (area, keys) => {
    if (diagnosticPath === undefined) return;
    if (area !== "local" && area !== "session") {
      terminal("observer_value_rejected");
      return;
    }
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > 32
      || !keys.every((key) => typeof key === "string" && /^[A-Za-z0-9_.:/-]{1,200}$/u.test(key))) {
      terminal("observer_value_rejected");
      return;
    }
    if (diagnosticBatches.length >= 8) return;
    diagnosticBatches.push(Object.freeze({
      area,
      keys: Object.freeze([...new Set(keys)].sort()),
    }));
    writeDiagnosticOutput();
  };

  const writeEvidence = (outcome, finalStage, failure) => {
    const finalHashes = assertArtifactHashes(extensionDist, expectedHashes, "Final");
    const finalContractHashes = assertContractHashes(expectedProfileHash, expectedToolHash, "Final");
    const finalCandidateReceiptHash = assertCandidateReceiptFile(candidateReceiptPath, {
      candidateSha,
      extensionDist,
      artifactHashes: expectedHashes,
    }, "Final");
    if (finalCandidateReceiptHash !== candidateReceiptHash) {
      throw new Error("Final candidate receipt hash drift");
    }
    const failedStageHistory = stageHistory.map((entry) => ({ stage: entry.stage }));
    const payload = failure === undefined
      ? {
        schemaVersion: 3,
        platform: target.platform,
        candidateSha,
        profileIdentity,
        databaseIdentity,
        contract: {
          preAction: contractHashes,
          final: finalContractHashes,
        },
        exactDist: {
          pathProvided: true,
          candidateReceiptHash,
          preActionHashes: preflightHashes,
          finalHashes,
        },
        outcome,
        stageHistory,
        finalStage,
        baselineDatabase,
        finalDatabase: latestDatabase,
        privacyBoundary: {
          platformDomRead: false,
          cookiesRead: false,
          sourceCodeRead: false,
          problemStatementRead: false,
          responseBodyRead: false,
          headersRead: false,
          queryRetained: false,
        },
      }
      : {
        schemaVersion: 3,
        platform: target.platform,
        candidateSha,
        profileIdentity,
        databaseIdentity,
        contract: {
          preAction: contractHashes,
          final: finalContractHashes,
        },
        exactDist: {
          pathProvided: true,
          candidateReceiptHash,
          preActionHashes: preflightHashes,
          finalHashes,
        },
        outcome,
        stageHistory: failedStageHistory,
        finalStage,
        ...(baselineDatabase === undefined ? {} : { baselineDatabase }),
        ...(latestDatabase === undefined ? {} : { finalDatabase: latestDatabase }),
        failure: {
          verdict: closedFailureVerdict(failure.reason, failure),
          causalGrade: "UNRESOLVED",
          ...failure,
        },
        privacyBoundary: { noRawData: true },
      };
    const suffix = outcome === "acknowledged"
      ? "real-observation"
      : outcome === "ready_only"
        ? "ready"
        : "real-observation-failed";
    const evidencePath = resolve(outputPath, `${candidateSha.slice(0, 12)}-${target.platform}-${profileId}-${suffix}.json`);
    writeFileSync(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    process.stdout.write(`EVIDENCE=${evidencePath}\n`);
  };

  const recordFailure = (snapshot, database, reason) => {
    if (reason !== "observer_capture_error") {
      terminal(reason);
      return;
    }
    const projected = projectFailureReceipt(snapshot, database, observationTarget);
    if (!projected.ok) {
      terminal(projected.reason);
      return;
    }
    failureReceipt = projected.value;
    latestDatabase = database;
    terminal(reason);
    if (!failureEvidenceWritten) {
      writeEvidence("not_delivered", stageState?.stage ?? "observer_capture_error", failureReceipt);
      failureEvidenceWritten = true;
    }
  };

  const processObserverEvent = async (event) => {
    if (terminalController.terminal) return;
    if (typeof event !== "object" || event === null || typeof event.type !== "string") {
      terminal("observer_value_rejected");
      return;
    }
    if (event.type === "observer_armed") {
      // The page sends an already projected closed snapshot; preserve it
      // without attempting to reinterpret transient/raw values.
      if (typeof event.snapshot !== "object" || event.snapshot === null) {
        terminal("observer_value_rejected");
        return;
      }
      const database = baselineDatabase ?? readDatabaseCounts(dbPath);
      const reduced = reduceObservationSnapshot(
        undefined,
        event.snapshot,
        database,
        observationTarget,
        diagnosticPath !== undefined,
      );
      if (!reduced.ok) {
        recordStageRejection(reduced.diagnosticCode);
        recordFailure(event.snapshot, database, reduced.reason);
        return;
      }
      stageState = reduced.value;
      latestDatabase = database;
      stageHistory.push(safeStageEvidence(stageState, database));
      resolveArmed(event);
      return;
    }
    if (event.type === "observer_storage_key_rejected"
      || event.type === "observer_value_rejected"
      || event.type === "observer_page_closed") {
      terminal(event.type);
      return;
    }
    if (event.type === "observer_storage_key_diagnostic") {
      recordDiagnosticBatch(event.area, event.keys);
      return;
    }
    if (event.type !== "snapshot") {
      terminal("observer_value_rejected");
      return;
    }
    if (stageState === undefined) {
      recordStageRejection("snapshot_before_arm");
      terminal("observer_stage_rejected");
      return;
    }
    const database = readDatabaseCounts(dbPath);
    const reduced = reduceObservationSnapshot(
      stageState,
      event.snapshot,
      database,
      observationTarget,
      diagnosticPath !== undefined,
    );
    if (!reduced.ok) {
      recordStageRejection(reduced.diagnosticCode);
      recordFailure(event.snapshot, database, reduced.reason);
      return;
    }
    stageState = reduced.value;
    latestDatabase = database;
    if (stageHistory.at(-1)?.stage !== stageState.stage) {
      stageHistory.push(safeStageEvidence(stageState, database));
      process.stdout.write(`STAGE=${stageState.stage}\n`);
    }
    if (stageState.acknowledged && !ackEvidenceWritten) {
      ackEvidenceWritten = true;
      writeEvidence("acknowledged", stageState.stage);
      process.stdout.write("ACKNOWLEDGED=1\n");
    }
  };

  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 20_000 });
    const extensionId = new URL(worker.url()).hostname;
    popup = await context.newPage();
    popup.on("close", () => terminal("observer_page_closed"));
    const observerPageUrl = `chrome-extension://${extensionId}/popup.html`;
    popup.on("framenavigated", (frame) => {
      if (frame === popup.mainFrame() && !isExactObserverPageUrl(frame.url(), observerPageUrl)) {
        terminal("observer_page_closed");
      }
    });
    await popup.goto(observerPageUrl, { waitUntil: "domcontentloaded" });
    await stopCharacterization(popup);
    const readyConnection = await assertCaptureReadyPreflight(popup);
    if (readyConnectionReceipt === undefined
      || sha256Bytes(readyConnection.installationId) !== readyConnectionReceipt.installationIdentity
      || readyConnection.captureCapabilityVersion !== readyConnectionReceipt.captureCapabilityVersion
      || !existsSync(resolve(vaultConfigPath, "capture-installation.json"))) {
      throw new Error("Capture READY preflight rejected: connection_receipt_mismatch");
    }

    await popup.exposeFunction("__v4ObservationEvent", (event) => {
      eventChain = eventChain.then(() => processObserverEvent(event));
    });
    if (diagnosticPath !== undefined) {
      await popup.evaluate(storageKeyDiagnosticListener, {
        localKeys: LOCAL_TRIGGER_KEYS,
        sessionKeys: SESSION_TRIGGER_KEYS,
        ignoredLocalKeys: IGNORED_LOCAL_KEYS,
        ignoredSessionKeys: IGNORED_SESSION_KEYS,
      });
    }
    await popup.evaluate(persistentObserverEntrypoint, {
      localKeys: LOCAL_TRIGGER_KEYS,
      sessionKeys: SESSION_TRIGGER_KEYS,
      ignoredLocalKeys: IGNORED_LOCAL_KEYS,
      ignoredSessionKeys: IGNORED_SESSION_KEYS,
      exactLocalSnapshotKeys: EXACT_LOCAL_SNAPSHOT_KEYS,
      exactSessionSnapshotKeys: EXACT_SESSION_SNAPSHOT_KEYS,
      target: observationTarget,
    });
    const armedEvent = await armedPromise;
    await eventChain;
    if (terminalController.terminal || stageState === undefined || armedEvent === undefined) {
      throw new Error(terminalController.reason ?? "observer_failed_before_arm");
    }
    baselineDatabase = latestDatabase ?? readDatabaseCounts(dbPath);
    platformPage = await context.newPage();
    await platformPage.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(Number(argumentValue(args, "--browse-ms") || "1500"));
    await eventChain;
    if (diagnosticRefreshAfterMs !== undefined) {
      await platformPage.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      await sleep(diagnosticRefreshAfterMs);
      await eventChain;
    }
    if (terminalController.terminal) throw new Error(terminalController.reason);
    const browseDatabase = readDatabaseCounts(dbPath);
    if (stageState.stage !== "browse_only"
      || JSON.stringify(browseDatabase) !== JSON.stringify(baselineDatabase)) {
      throw new Error("browse-only baseline changed before user action");
    }
    latestDatabase = browseDatabase;
    process.stdout.write("OBSERVER_ARMED=1\nBROWSE_ONLY=1\nREADY=1\n");
    if (actionAuthorization.length === 0) {
      const readyEvidence = safeStageEvidence(stageState, browseDatabase);
      stageHistory.push(readyEvidence);
      writeEvidence("ready_only", stageState.stage);
      writeDiagnosticOutput(true);
      process.stdout.write("ACTION_AUTHORIZED=0\n");
      await context.close();
      return;
    }
    process.stdout.write("ACTION_AUTHORIZED=1\n");
    const databaseMonitor = setInterval(() => {
      if (terminalController.terminal || stageState === undefined || stageState.acknowledged) return;
      const database = readDatabaseCounts(dbPath);
      const reduced = reduceObservationSnapshot(
        stageState,
        stageState.latest,
        database,
        observationTarget,
        diagnosticPath !== undefined,
      );
      if (!reduced.ok) {
        recordStageRejection(reduced.diagnosticCode);
        return;
      }
      stageState = reduced.value;
      latestDatabase = database;
      if (stageState.acknowledged && !ackEvidenceWritten) {
        ackEvidenceWritten = true;
        stageHistory.push(safeStageEvidence(stageState, database));
        writeEvidence("acknowledged", stageState.stage);
        process.stdout.write("STAGE=acknowledged\nACKNOWLEDGED=1\n");
      }
    }, 250);
    await new Promise((complete) => context.once("close", complete));
    clearInterval(databaseMonitor);
    await eventChain;
    if (!stageState.acknowledged) {
      if (!failureEvidenceWritten) {
        writeEvidence("not_delivered", stageState.stage, failureReceipt);
        failureEvidenceWritten = true;
      }
      writeDiagnosticOutput(true);
      process.stdout.write(`DELIVERED=0\nTERMINAL=${terminalController.reason ?? "context_closed"}\n`);
    }
  } catch {
    terminal("observer_unexpected_failure");
    if (!failureEvidenceWritten && (failureReceipt !== undefined
      || (stageState !== undefined && latestDatabase !== undefined))) {
      try {
        writeEvidence("not_delivered", stageState?.stage ?? "observer_capture_error", failureReceipt);
        failureEvidenceWritten = true;
      } catch {
        process.stderr.write("EVIDENCE_ERROR=observer_evidence_write_failed\n");
      }
    }
    writeDiagnosticOutput(true);
    await context.close().catch(() => undefined);
    throw new Error(terminalController.reason ?? "observer_unexpected_failure");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
