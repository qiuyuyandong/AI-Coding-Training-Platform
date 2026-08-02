import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";

const TARGETS = Object.freeze({
  "leetcode.cn": Object.freeze({
    platform: "leetcode",
    startUrl: "https://leetcode.cn/problemset/",
  }),
  "leetcode.com": Object.freeze({
    platform: "leetcode",
    startUrl: "https://leetcode.com/problemset/",
  }),
  "atcoder.jp": Object.freeze({
    platform: "atcoder",
    startUrl: "https://atcoder.jp/contests/",
  }),
  "codeforces.com": Object.freeze({
    platform: "codeforces",
    startUrl: "https://codeforces.com/problemset",
  }),
  "www.luogu.com.cn": Object.freeze({
    platform: "luogu",
    startUrl: "https://www.luogu.com.cn/problem/list",
  }),
});

const LOCAL_APP_ORIGIN = "http://localhost:3000";
const SAFE_LOCAL_KEYS = Object.freeze([
  "captureCredential",
  "captureEnabled",
  "confirmedSubmissions",
  "confirmedSubmissionTombstones",
  "captureOutbox",
  "captureQuarantine",
  "lastCaptureError",
  "lastSuccessfulCaptureAt",
]);

function hostnameArgument(argv) {
  const argument = argv.find((value) => value.startsWith("--hostname="));
  return argument?.slice("--hostname=".length) ?? "";
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function textField(value, field) {
  if (typeof value !== "object" || value === null) return undefined;
  const fieldValue = Reflect.get(value, field);
  return typeof fieldValue === "string" && fieldValue.length > 0 ? fieldValue : undefined;
}

function numberField(value, field) {
  if (typeof value !== "object" || value === null) return undefined;
  const fieldValue = Reflect.get(value, field);
  return typeof fieldValue === "number" && Number.isFinite(fieldValue) ? fieldValue : undefined;
}

function arrayField(value, field) {
  if (typeof value !== "object" || value === null) return [];
  const fieldValue = Reflect.get(value, field);
  return Array.isArray(fieldValue) ? fieldValue : [];
}

function summarizeTransientRequests(value) {
  const lifecycles = Array.isArray(value) ? value : arrayField(value, "requestLifecycles");
  const summaries = lifecycles.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const evidence = Reflect.get(entry, "evidence");
    const endpointKey = textField(evidence, "endpointKey");
    const requestId = textField(evidence, "requestId");
    const lifecycle = textField(evidence, "lifecycle");
    const method = textField(evidence, "method");
    const resourceType = textField(evidence, "resourceType");
    const documentId = textField(evidence, "documentId");
    const receivedAt = textField(evidence, "receivedAt");
    if (endpointKey === undefined || requestId === undefined || lifecycle === undefined
      || method === undefined || resourceType === undefined || documentId === undefined
      || receivedAt === undefined) {
      return [];
    }
    const statusCode = numberField(evidence, "statusCode");
    return [{
      endpointKey,
      requestId,
      lifecycle,
      method,
      resourceType,
      documentId,
      receivedAt,
      ...(statusCode === undefined ? {} : { statusCode }),
    }];
  });
  const exact = summaries.filter((request) =>
    request.endpointKey.startsWith("leetcode/submit/")
    || request.endpointKey.startsWith("leetcode/check/"));
  const generic = summaries.filter((request) =>
    !request.endpointKey.startsWith("leetcode/submit/")
    && !request.endpointKey.startsWith("leetcode/check/"));
  return [...exact.slice(-10), ...generic.slice(-3)];
}

function summarizeEndpointDiagnostics(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const reason = textField(entry, "reason");
    const pathname = textField(entry, "pathname");
    const method = textField(entry, "method");
    const requestId = textField(entry, "requestId");
    const documentId = textField(entry, "documentId");
    const receivedAt = textField(entry, "receivedAt");
    const statusCode = numberField(entry, "statusCode");
    if ((reason !== "unmatched_submit_path" && reason !== "unmatched_check_path")
      || pathname === undefined
      || method === undefined
      || requestId === undefined
      || documentId === undefined
      || receivedAt === undefined
      || statusCode === undefined) {
      return [];
    }
    return [{
      reason,
      pathname,
      method,
      statusCode,
      requestId,
      documentId,
      receivedAt,
    }];
  }).slice(-20);
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

function extensionBuildDigest(manifestPath) {
  const manifest = readFileSync(manifestPath);
  const background = readFileSync(resolve(manifestPath, "..", "background.js"));
  const content = readFileSync(resolve(manifestPath, "..", "content.js"));
  return createHash("sha256")
    .update(manifest)
    .update(background)
    .update(content)
    .digest("hex");
}

function hasCompletedRequest(state, prefix) {
  return state.transientRequests.some((request) =>
    request.endpointKey.startsWith(prefix)
    && request.lifecycle === "completed"
    && request.statusCode === 200);
}

function observationStage(state, database) {
  if (database.trainingAttempts > 0) return "sqlite_acknowledged";
  if (state.quarantine > 0) return "delivery_quarantined";
  if (state.lastCaptureError !== undefined) return "delivery_error";
  if (state.outbox > 0) return "bundle_queued";
  if (state.tombstones > 0) return "e3_finalized";
  if (state.unmatchedE3 > 0) return "e3_unmatched";
  if (state.confirmedSubmissions > 0) return "e2_confirmed";
  const latestDiagnostic = state.endpointDiagnostics.at(-1);
  if (latestDiagnostic !== undefined) return latestDiagnostic.reason;
  if (hasCompletedRequest(state, "leetcode/check/")) return "check_completed_without_e2";
  if (hasCompletedRequest(state, "leetcode/submit/")) return "submit_completed_without_check";
  if (state.transientRequests.some((request) => request.lifecycle === "completed")) {
    return "observer_ready";
  }
  return "waiting_for_observer";
}

async function assertLocalAppReady() {
  const response = await fetch(`${LOCAL_APP_ORIGIN}/`, { redirect: "manual" });
  if (!response.ok && ![301, 302, 307, 308].includes(response.status)) {
    throw new Error(`Local app preflight failed with HTTP ${response.status}`);
  }
}

async function waitForProductionObserver(worker, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readSafeExtensionState(worker);
    if (state.transientRequests.some((request) =>
      request.lifecycle === "completed" && request.statusCode === 200)) {
      return state;
    }
    await new Promise((complete) => setTimeout(complete, 250));
  }
  throw new Error("Production observer preflight did not record a completed safe E1.");
}

async function readSafeExtensionState(worker) {
  const stored = await worker.evaluate(async (keys) => {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(keys),
      chrome.storage.session.get([
        "transientE1",
        "transientUnmatchedE3",
        "leetcodeEndpointDiagnostics",
      ]),
    ]);
    return { local, session };
  }, SAFE_LOCAL_KEYS);
  const local = stored.local;
  const transient = typeof stored.session === "object" && stored.session !== null
    ? Reflect.get(stored.session, "transientE1")
    : undefined;
  const unmatched = typeof stored.session === "object" && stored.session !== null
    ? Reflect.get(stored.session, "transientUnmatchedE3")
    : undefined;
  const endpointDiagnostics = typeof stored.session === "object" && stored.session !== null
    ? Reflect.get(stored.session, "leetcodeEndpointDiagnostics")
    : undefined;
  return {
    paired: typeof local.captureCredential === "string" && local.captureCredential.length > 0,
    captureEnabled: local.captureEnabled !== false,
    confirmedSubmissions: arrayLength(local.confirmedSubmissions),
    tombstones: arrayLength(local.confirmedSubmissionTombstones),
    outbox: arrayLength(local.captureOutbox),
    quarantine: arrayLength(local.captureQuarantine),
    lastCaptureError: textField(local, "lastCaptureError"),
    lastSuccessfulCaptureAt: textField(local, "lastSuccessfulCaptureAt"),
    transientRequests: summarizeTransientRequests(transient),
    unmatchedE3: arrayLength(unmatched),
    endpointDiagnostics: summarizeEndpointDiagnostics(endpointDiagnostics),
  };
}

async function pairExtension(context, worker, extensionId) {
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
  const popup = await context.newPage();
  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    await popup.locator("#pairingCode").fill(code);
    await popup.locator("#pairButton").click();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const state = await readSafeExtensionState(worker);
      if (state.paired) return;
      await new Promise((complete) => setTimeout(complete, 250));
    }
    throw new Error("Extension did not persist the local pairing credential");
  } finally {
    await popup.close();
  }
}

async function stopCharacterization(context, extensionId) {
  const popup = await context.newPage();
  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    const result = await popup.evaluate(async () =>
      chrome.runtime.sendMessage({ type: "CHARACTERIZATION_STOP" }));
    if (typeof result !== "object" || result === null || Reflect.get(result, "ok") !== true) {
      throw new Error("Extension did not acknowledge CHARACTERIZATION_STOP.");
    }
  } finally {
    await popup.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const hostname = hostnameArgument(args);
  const resume = hasFlag(args, "--resume");
  const target = TARGETS[hostname];
  if (target === undefined) {
    throw new Error(`Unsupported hostname. Choose one of: ${Object.keys(TARGETS).join(", ")}`);
  }

  const extensionDist = resolve("extension", "dist");
  const manifestPath = resolve(extensionDist, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Production extension/dist is missing; run npm run extension:build first.");
  }

  const dbPathFile = resolve(".tmp", "server-db-path.txt");
  if (!existsSync(dbPathFile)) {
    throw new Error("Disposable database path is missing; start the live local server first.");
  }
  const dbPath = readFileSync(dbPathFile, "utf8").trim();
  if (!existsSync(dbPath)) throw new Error(`Disposable database does not exist: ${dbPath}`);
  await assertLocalAppReady();

  const profilePath = resolve(".local", "v4-characterization", hostname.replaceAll(".", "-"));
  const outputPath = resolve("output", "playwright", "v4-observation");
  mkdirSync(profilePath, { recursive: true });
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

  try {
    const existingWorker = context.serviceWorkers()[0];
    const worker = existingWorker ?? await context.waitForEvent("serviceworker", { timeout: 20_000 });
    const extensionId = new URL(worker.url()).hostname;
    await stopCharacterization(context, extensionId);
    process.stdout.write("CHARACTERIZATION_STOPPED=1\n");
    if (!resume) {
      await worker.evaluate(async () => {
        await chrome.storage.session.remove("leetcodeEndpointDiagnostics");
      });
    }

    const baselineState = await readSafeExtensionState(worker);
    if (!resume && (baselineState.confirmedSubmissions !== 0
      || baselineState.outbox !== 0
      || baselineState.quarantine !== 0)) {
      throw new Error(`Extension profile has pending capture state: ${JSON.stringify(baselineState)}`);
    }
    const baselineDatabase = readDatabaseCounts(dbPath);
    await pairExtension(context, worker, extensionId);

    const pages = context.pages();
    const platformPage = pages[0] ?? await context.newPage();
    await platformPage.goto(target.startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await platformPage.bringToFront();
    const observerState = await waitForProductionObserver(worker);

    process.stdout.write(`PLATFORM_URL=${target.startUrl}\n`);
    process.stdout.write(`DATABASE=${dbPath}\n`);
    process.stdout.write(`BASELINE_DB=${JSON.stringify(baselineDatabase)}\n`);
    process.stdout.write(`BUILD_SHA256=${extensionBuildDigest(manifestPath)}\n`);
    process.stdout.write(`BASELINE_EXTENSION=${JSON.stringify(baselineState)}\n`);
    process.stdout.write("PAIRING=READY\n");
    process.stdout.write(`PREFLIGHT_STAGE=${observationStage(observerState, baselineDatabase)}\n`);
    process.stdout.write("READY=1\n");

    let recorded = false;
    let priorStateJson = "";
    let latestObservation = {
      stage: observationStage(observerState, baselineDatabase),
      extension: observerState,
      database: baselineDatabase,
    };
    const monitor = setInterval(async () => {
      try {
        const state = await readSafeExtensionState(worker);
        const database = readDatabaseCounts(dbPath);
        const stage = observationStage(state, database);
        latestObservation = { stage, extension: state, database };
        const stateJson = JSON.stringify({ stage, extension: state, database });
        if (stateJson !== priorStateJson) {
          priorStateJson = stateJson;
          process.stdout.write(`STATE=${stateJson}\n`);
        }
        if (recorded) return;
        const hasObservationTombstone = resume
          ? state.tombstones > 0
          : state.tombstones > baselineState.tombstones;
        const delivered = hasObservationTombstone
          && state.confirmedSubmissions === 0
          && state.outbox === 0
          && state.quarantine === 0
          && state.lastCaptureError === undefined
          && database.captureEvents === baselineDatabase.captureEvents + 4
          && database.trainingSessions === baselineDatabase.trainingSessions + 1
          && database.trainingAttempts === baselineDatabase.trainingAttempts + 1;
        if (!delivered) return;

        recorded = true;
        const evidence = {
          schemaVersion: 1,
          platform: target.platform,
          hostname,
          observedAt: new Date().toISOString(),
          productionBuildSha256: extensionBuildDigest(manifestPath),
          baseline: {
            extension: baselineState,
            database: baselineDatabase,
          },
          delivered: {
            extension: state,
            database,
          },
          privacyBoundary: {
            platformDomRead: false,
            cookiesRead: false,
            sourceCodeRead: false,
            problemStatementRead: false,
          },
        };
        const evidencePath = resolve(
          outputPath,
          `${target.platform}-real-observation-${Date.now()}.json`,
        );
        writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
        process.stdout.write(`DELIVERED=1\nEVIDENCE=${evidencePath}\n`);
      } catch (error) {
        process.stderr.write(`MONITOR_ERROR=${String(error)}\n`);
      }
    }, 1_000);

    await new Promise((complete) => {
      context.once("close", complete);
    });
    clearInterval(monitor);
    if (!recorded) {
      const evidence = {
        schemaVersion: 1,
        platform: target.platform,
        hostname,
        observedAt: new Date().toISOString(),
        productionBuildSha256: extensionBuildDigest(manifestPath),
        outcome: "not_delivered",
        baseline: {
          extension: baselineState,
          database: baselineDatabase,
        },
        final: latestObservation,
        privacyBoundary: {
          platformDomRead: false,
          cookiesRead: false,
          sourceCodeRead: false,
          problemStatementRead: false,
          queryRetained: false,
        },
      };
      const evidencePath = resolve(
        outputPath,
        `${target.platform}-real-observation-failed-${Date.now()}.json`,
      );
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
      process.stdout.write(`DELIVERED=0\nEVIDENCE=${evidencePath}\n`);
    }
  } catch (error) {
    await context.close();
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
