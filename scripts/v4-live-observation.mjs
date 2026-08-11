import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";
import {
  APPROVED_NOWCODER_PATH,
  EXACT_LOCAL_SNAPSHOT_KEYS,
  EXACT_SESSION_SNAPSHOT_KEYS,
  LOCAL_TRIGGER_KEYS,
  SESSION_TRIGGER_KEYS,
  isExactObserverPageUrl,
  persistentObserverEntrypoint,
  projectFailureReceipt,
  projectStageEvidence,
  reduceObservationSnapshot,
  validateObservationDatabase,
  validateObservationTarget,
} from "./v4-live-observation-observer.mjs";

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
const D3_ARTIFACTS = Object.freeze([
  Object.freeze({ name: "manifest", file: "manifest.json" }),
  Object.freeze({ name: "background", file: "background.js" }),
  Object.freeze({ name: "content", file: "content.js" }),
  Object.freeze({ name: "popup", file: "popup.js" }),
  Object.freeze({ name: "mainWorldBridge", file: "main-world-bridge.js" }),
]);

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

function readPairingCode(value) {
  if (typeof value !== "object" || value === null) {
    throw new Error("Pairing response is not an object");
  }
  const code = Reflect.get(value, "code");
  if (Reflect.get(value, "ok") !== true || typeof code !== "string" || code.length === 0) {
    throw new Error("Pairing response did not contain a code");
  }
  return code;
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

async function pairedState(popup) {
  return popup.evaluate(async () => {
    const result = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
    return typeof result === "object"
      && result !== null
      && Reflect.get(result, "provenanceLevel") === "extension_paired";
  });
}

async function pairExtension(popup) {
  const response = await fetch(`${LOCAL_APP_ORIGIN}/api/capture/pairing-codes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: LOCAL_APP_ORIGIN,
    },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Pairing-code request failed with HTTP ${response.status}`);
  const code = readPairingCode(await response.json());
  await popup.locator("#pairingCode").fill(code);
  await popup.locator("#pairButton").click();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await pairedState(popup)) return;
    await new Promise((complete) => setTimeout(complete, 250));
  }
  throw new Error("Extension did not acknowledge pairing without exposing the credential");
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
  const projected = projectStageEvidence(state, database);
  if (!projected.ok) throw new Error(projected.reason);
  return projected.value;
}

async function main() {
  const args = process.argv.slice(2);
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

  const profileRoot = resolve(".tmp", "v4-live-observation-profiles");
  const outputPath = resolve("output", "playwright", "v4-observation");
  mkdirSync(profileRoot, { recursive: true });
  const profilePath = mkdtempSync(resolve(profileRoot, `${target.platform}-`));
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
  let popup;
  let platformPage;
  let observerTerminal = false;
  let terminalReason;
  let stageState;
  let baselineDatabase;
  let latestDatabase;
  let ackEvidenceWritten = false;
  let failureEvidenceWritten = false;
  let failureReceipt;
  const stageHistory = [];
  const observationTarget = Object.freeze({ platform: target.platform, problemExternalId });
  let eventChain = Promise.resolve();
  let resolveArmed;
  let rejectArmed;
  const armedPromise = new Promise((resolve, reject) => {
    resolveArmed = resolve;
    rejectArmed = reject;
  });

  const writeEvidence = (outcome, finalStage, failure) => {
    const finalHashes = assertArtifactHashes(extensionDist, expectedHashes, "Final");
    const failedStageHistory = stageHistory.map((entry) => ({ stage: entry.stage }));
    const payload = failure === undefined
      ? {
        schemaVersion: 2,
        platform: target.platform,
        hostname,
        observedAt: new Date().toISOString(),
        exactDist: {
          pathProvided: true,
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
        schemaVersion: 2,
        platform: target.platform,
        exactDist: {
          pathProvided: true,
          preActionHashes: preflightHashes,
          finalHashes,
        },
        outcome,
        stageHistory: failedStageHistory,
        finalStage,
        ...(baselineDatabase === undefined ? {} : { baselineDatabase }),
        ...(latestDatabase === undefined ? {} : { finalDatabase: latestDatabase }),
        failure,
        privacyBoundary: { noRawData: true },
      };
    const suffix = outcome === "acknowledged" ? "real-observation" : "real-observation-failed";
    const evidencePath = resolve(outputPath, `${target.platform}-${suffix}-${Date.now()}.json`);
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

  const terminal = (reason) => {
    if (observerTerminal) return;
    observerTerminal = true;
    terminalReason = reason;
    if (typeof rejectArmed === "function") rejectArmed(new Error(reason));
  };

  const processObserverEvent = async (event) => {
    if (observerTerminal) return;
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
      const reduced = reduceObservationSnapshot(undefined, event.snapshot, database, observationTarget);
      if (!reduced.ok) {
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
    if (event.type !== "snapshot") {
      terminal("observer_value_rejected");
      return;
    }
    if (stageState === undefined) {
      terminal("observer_stage_rejected");
      return;
    }
    const database = readDatabaseCounts(dbPath);
    const reduced = reduceObservationSnapshot(stageState, event.snapshot, database, observationTarget);
    if (!reduced.ok) {
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
    await pairExtension(popup);

    await popup.exposeFunction("__v4ObservationEvent", (event) => {
      eventChain = eventChain.then(() => processObserverEvent(event));
    });
    await popup.evaluate(persistentObserverEntrypoint, {
      localKeys: LOCAL_TRIGGER_KEYS,
      sessionKeys: SESSION_TRIGGER_KEYS,
      exactLocalSnapshotKeys: EXACT_LOCAL_SNAPSHOT_KEYS,
      exactSessionSnapshotKeys: EXACT_SESSION_SNAPSHOT_KEYS,
      target: observationTarget,
    });
    const armedEvent = await armedPromise;
    await eventChain;
    if (observerTerminal || stageState === undefined || armedEvent === undefined) {
      throw new Error(terminalReason ?? "observer_failed_before_arm");
    }
    baselineDatabase = latestDatabase ?? readDatabaseCounts(dbPath);
    platformPage = await context.newPage();
    await platformPage.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(Number(argumentValue(args, "--browse-ms") || "1500"));
    await eventChain;
    if (observerTerminal) throw new Error(terminalReason);
    const browseDatabase = readDatabaseCounts(dbPath);
    if (stageState.stage !== "browse_only"
      || JSON.stringify(browseDatabase) !== JSON.stringify(baselineDatabase)) {
      throw new Error("browse-only baseline changed before user action");
    }
    latestDatabase = browseDatabase;
    process.stdout.write("OBSERVER_ARMED=1\nBROWSE_ONLY=1\nREADY=1\n");
    const databaseMonitor = setInterval(() => {
      if (observerTerminal || stageState === undefined || stageState.acknowledged) return;
      const database = readDatabaseCounts(dbPath);
      const reduced = reduceObservationSnapshot(stageState, stageState.latest, database, observationTarget);
      if (!reduced.ok) return;
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
      process.stdout.write(`DELIVERED=0\nTERMINAL=${terminalReason ?? "context_closed"}\n`);
    }
  } catch (error) {
    terminalReason = terminalReason ?? (error instanceof Error ? error.message : String(error));
    if (!failureEvidenceWritten && (failureReceipt !== undefined
      || (stageState !== undefined && latestDatabase !== undefined))) {
      try {
        writeEvidence("not_delivered", stageState?.stage ?? "observer_capture_error", failureReceipt);
        failureEvidenceWritten = true;
      } catch (evidenceError) {
        process.stderr.write(`EVIDENCE_ERROR=${String(evidenceError)}\n`);
      }
    }
    await context.close();
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
