import { generateKeyPairSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { chromium, expect, test, type BrowserContext, type Page, type Worker } from "@playwright/test";

import identity from "../../extension/identity.json";
import { CaptureAttemptBundleSchema, type CaptureAttemptBundle } from "../../lib/capture/attemptBundle";
import { hashCaptureCapability } from "../../lib/services/captureCapability";
import { ingestCaptureAttemptBundle } from "../../lib/services/captureAttemptBundle";
import {
  createDisposableDirectory,
  openDisposableDatabase,
  readDatabaseCounts,
  runMigrations,
  snapshotDefaultDatabase,
  verifyDefaultDatabaseUntouched,
} from "./database";

const PROBE_HOST = "127.0.0.1";
const PROBE_PORT = 3000;
const PROBE_BASE_URL = `http://localhost:${PROBE_PORT}`;
const SETTINGS_URL = `${PROBE_BASE_URL}/settings`;
const CHALLENGE_TTL_MS = 60_000;

type Challenge = {
  readonly id: string;
  readonly nonce: string;
  readonly createdAtMs: number;
  consumed: boolean;
};

type InstallationConfig = {
  readonly schemaVersion: 1;
  readonly installationId: string;
  readonly credentialVersion: number;
  readonly credentialHash: string;
  readonly createdAt: string;
  readonly rotatedAt?: string;
};

type ProbeState = {
  activeDbPath: string;
  readonly configPath: string;
  readonly challenges: Map<string, Challenge>;
  readonly acceptedOrigins: string[];
};

type ConnectResult = {
  readonly ok: boolean;
  readonly status?: number;
  readonly credentialVersion?: number;
  readonly error?: string;
};

type StoredInstallation = {
  readonly installationId: string;
  readonly credentialVersion: number;
  readonly capability: string;
};

type FetchResult = {
  readonly status: number;
  readonly body: string;
};

test("Route H survives installation lifecycles and keeps the capability outside page-visible state", async () => {
  const chromeExecutable = requireChrome151Executable();
  const beforeDefaultDb = snapshotDefaultDatabase();
  const disposable = createDisposableDirectory();
  const dbOnePath = join(disposable.dirPath, "vault-one.sqlite");
  const dbTwoPath = join(disposable.dirPath, "vault-two.sqlite");
  const targetExtensionPath = join(disposable.dirPath, "target-extension");
  const attackerExtensionPath = join(disposable.dirPath, "attacker-extension");
  const profileOnePath = join(disposable.dirPath, "profile-one");
  const profileTwoPath = join(disposable.dirPath, "profile-two");
  const configPath = join(disposable.dirPath, "capture-installation.json");
  runMigrations(dbOnePath);
  runMigrations(dbTwoPath);
  writeTargetExtension(targetExtensionPath);
  writeAttackerExtension(attackerExtensionPath);

  const state: ProbeState = {
    activeDbPath: dbOnePath,
    configPath,
    challenges: new Map(),
    acceptedOrigins: [],
  };
  const server = await startProbeServer(state);
  let firstContext: BrowserContext | undefined;
  let restartedContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  try {
    firstContext = await launchWithExtensions(
      chromeExecutable,
      profileOnePath,
      targetExtensionPath,
      attackerExtensionPath,
    );
    await expectChrome151(firstContext);
    const firstTargetWorker = await resolveTargetWorker(firstContext);
    await expectInstallationMissing(firstTargetWorker);
    await expectAttackerRejected(firstContext);

    const firstPage = await firstContext.newPage();
    const firstChallenge = await issueChallenge();
    const firstConnect = await sendConnectMessage(firstPage, SETTINGS_URL, firstChallenge);
    expect(firstConnect).toEqual({ ok: true, status: 201, credentialVersion: 1 });
    const firstInstallation = await readStoredInstallation(firstTargetWorker);
    expect(firstInstallation.capability).toMatch(/^capture_[A-Za-z0-9_-]{43}$/u);
    await expectPageDoesNotContainCapability(firstPage, firstInstallation.capability);
    expectConfigContainsOnlyHash(configPath, firstInstallation, 1);

    const missingAuth = await fetchFromWorker(firstTargetWorker, {
      path: "/api/capture/attempts",
      body: "not-json",
    });
    const wrongAuth = await fetchFromWorker(firstTargetWorker, {
      path: "/api/capture/attempts",
      authorization: "Bearer capture_wrong",
      body: "not-json",
    });
    expect(missingAuth.status).toBe(401);
    expect(wrongAuth.status).toBe(401);
    expect(readDatabaseCounts(dbOnePath)).toEqual({
      captureEvents: 0,
      trainingSessions: 0,
      trainingAttempts: 0,
    });

    const firstBundle = buildBundle(firstInstallation.installationId, "first");
    const firstIngest = await fetchUsingStoredCapability(firstTargetWorker, firstBundle);
    expect(firstIngest.status).toBe(200);
    expect(JSON.parse(firstIngest.body)).toMatchObject({ ok: true, replayed: false });
    const firstReplay = await fetchUsingStoredCapability(firstTargetWorker, firstBundle);
    expect(firstReplay.status).toBe(200);
    expect(JSON.parse(firstReplay.body)).toMatchObject({ ok: true, replayed: true });
    expect(readDatabaseCounts(dbOnePath)).toEqual({
      captureEvents: 4,
      trainingSessions: 1,
      trainingAttempts: 1,
    });

    await expectWrongSenderAndClosedSchemaRejected(firstPage);
    await expectExpiredChallengeRejected(firstPage);
    await expectCompletionReplayRejected(firstPage);
    await expectConcurrentCompletionIsSingleUse(firstPage, configPath);
    const rotatedInstallation = await readStoredInstallation(firstTargetWorker);
    expect(rotatedInstallation.credentialVersion).toBe(3);
    expectConfigContainsOnlyHash(configPath, rotatedInstallation, 3);

    await firstContext.close();
    firstContext = undefined;
    restartedContext = await launchWithExtensions(
      chromeExecutable,
      profileOnePath,
      targetExtensionPath,
      attackerExtensionPath,
    );
    const restartedWorker = await resolveTargetWorker(restartedContext);
    expect(await readStoredInstallation(restartedWorker)).toEqual(rotatedInstallation);

    const reloadPromise = restartedContext.waitForEvent("serviceworker", {
      predicate: (worker) => new URL(worker.url()).host === identity.extensionId,
      timeout: 20_000,
    });
    await restartedWorker.evaluate(() => chrome.runtime.reload()).catch((error: unknown) => {
      if (!(error instanceof Error) || !/closed|destroyed|Target page/u.test(error.message)) throw error;
    });
    const reloadedWorker = await reloadPromise;
    expect(await readStoredInstallation(reloadedWorker)).toEqual(rotatedInstallation);

    const configBeforeVaultSwitch = readFileSync(configPath, "utf8");
    state.activeDbPath = dbTwoPath;
    const secondVaultBundle = buildBundle(rotatedInstallation.installationId, "second-vault");
    const secondVaultIngest = await fetchUsingStoredCapability(reloadedWorker, secondVaultBundle);
    expect(secondVaultIngest.status).toBe(200);
    expect(readDatabaseCounts(dbTwoPath)).toEqual({
      captureEvents: 4,
      trainingSessions: 1,
      trainingAttempts: 1,
    });
    expect(readFileSync(configPath, "utf8")).toBe(configBeforeVaultSwitch);
    await restartedContext.close();
    restartedContext = undefined;

    secondContext = await launchWithExtensions(
      chromeExecutable,
      profileTwoPath,
      targetExtensionPath,
      attackerExtensionPath,
    );
    await expectChrome151(secondContext);
    const secondTargetWorker = await resolveTargetWorker(secondContext);
    await expectInstallationMissing(secondTargetWorker);
    const secondPage = await secondContext.newPage();
    const reinstallChallenge = await issueChallenge();
    const reinstallConnect = await sendConnectMessage(secondPage, SETTINGS_URL, reinstallChallenge);
    expect(reinstallConnect).toEqual({ ok: true, status: 201, credentialVersion: 4 });
    const reinstalled = await readStoredInstallation(secondTargetWorker);
    expect(reinstalled.installationId).not.toBe(rotatedInstallation.installationId);
    expect(reinstalled.capability).not.toBe(rotatedInstallation.capability);
    expectConfigContainsOnlyHash(configPath, reinstalled, 4);

    const reinstallBundle = buildBundle(reinstalled.installationId, "reinstalled");
    const reinstallIngest = await fetchUsingStoredCapability(secondTargetWorker, reinstallBundle);
    expect(reinstallIngest.status).toBe(200);
    expect(readDatabaseCounts(dbTwoPath)).toEqual({
      captureEvents: 8,
      trainingSessions: 2,
      trainingAttempts: 2,
    });

    expect(state.acceptedOrigins.length).toBeGreaterThan(0);
    expect(new Set(state.acceptedOrigins)).toEqual(new Set([identity.origin]));
  } finally {
    await firstContext?.close();
    await restartedContext?.close();
    await secondContext?.close();
    await closeServer(server);
    disposable.dispose();
  }

  expect(verifyDefaultDatabaseUntouched(beforeDefaultDb, snapshotDefaultDatabase())).toBe(true);
});

function requireChrome151Executable(): string {
  const executable = process.env.ROUTE_H_CHROME_EXECUTABLE;
  if (executable === undefined || executable.trim() === "") {
    throw new Error("ROUTE_H_CHROME_EXECUTABLE must point to Chrome for Testing 151");
  }
  if (!existsSync(executable)) throw new Error(`Chrome executable not found: ${executable}`);
  return executable;
}

async function expectChrome151(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(SETTINGS_URL);
    expect(await page.evaluate(() => navigator.userAgent)).toMatch(/Chrome\/151\./u);
  } finally {
    await page.close();
  }
}

async function launchWithExtensions(
  executablePath: string,
  profilePath: string,
  targetExtensionPath: string,
  attackerExtensionPath: string,
): Promise<BrowserContext> {
  mkdirSync(profilePath, { recursive: true });
  return chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: true,
    args: [
      `--disable-extensions-except=${targetExtensionPath},${attackerExtensionPath}`,
      `--load-extension=${targetExtensionPath},${attackerExtensionPath}`,
      "--disable-features=ExtensionDisableUnsupportedDeveloper",
      "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ],
  });
}

function writeTargetExtension(extensionPath: string): void {
  mkdirSync(extensionPath, { recursive: true });
  writeFileSync(join(extensionPath, "manifest.json"), `${JSON.stringify({
    manifest_version: 3,
    name: "Route H Target Probe",
    version: "0.0.1",
    key: identity.manifestKey,
    permissions: ["storage"],
    host_permissions: ["http://localhost/*"],
    externally_connectable: { matches: ["http://localhost/*"] },
    background: { service_worker: "background.js" },
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(extensionPath, "background.js"), targetWorkerSource(), "utf8");
}

function targetWorkerSource(): string {
  return `
const SETTINGS_URL = ${JSON.stringify(SETTINGS_URL)};
const COMPLETE_URL = ${JSON.stringify(`${PROBE_BASE_URL}/__route-h/complete`)};
const EXTENSION_ORIGIN = ${JSON.stringify(identity.origin)};
const STORAGE_KEY = "routeHInstallation";

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (sender.url !== SETTINGS_URL) {
    sendResponse({ ok: false, error: "sender_rejected" });
    return false;
  }
  if (!isConnectMessage(message)) {
    sendResponse({ ok: false, error: "schema_rejected" });
    return false;
  }
  void complete(message).then(sendResponse, () => sendResponse({ ok: false, error: "completion_failed" }));
  return true;
});

async function complete(message) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const capability = "capture_" + bytesToBase64Url(bytes);
  const installationId = "installation_" + crypto.randomUUID();
  const response = await fetch(COMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": EXTENSION_ORIGIN },
    body: JSON.stringify({
      schemaVersion: 1,
      challengeId: message.challengeId,
      nonce: message.nonce,
      installationId,
      capability,
    }),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (response.status === 201 && responseBody.ok === true && Number.isInteger(responseBody.credentialVersion)) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { installationId, capability, credentialVersion: responseBody.credentialVersion },
    });
  }
  return {
    ok: response.status === 201,
    status: response.status,
    ...(Number.isInteger(responseBody.credentialVersion)
      ? { credentialVersion: responseBody.credentialVersion }
      : {}),
  };
}

function isConnectMessage(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "challengeId,nonce,schemaVersion,type") return false;
  return value.schemaVersion === 1
    && value.type === "capture.install.connect"
    && typeof value.challengeId === "string"
    && value.challengeId.length >= 16
    && typeof value.nonce === "string"
    && value.nonce.length >= 32;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
`;
}

function writeAttackerExtension(extensionPath: string): void {
  mkdirSync(extensionPath, { recursive: true });
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const manifestKey = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  writeFileSync(join(extensionPath, "manifest.json"), `${JSON.stringify({
    manifest_version: 3,
    name: "Route H Attacker Probe",
    version: "0.0.1",
    key: manifestKey,
    permissions: ["storage"],
    background: { service_worker: "background.js" },
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(extensionPath, "background.js"), `
globalThis.attackResult = { state: "pending" };
chrome.runtime.sendMessage(
  ${JSON.stringify(identity.extensionId)},
  {
    schemaVersion: 1,
    type: "capture.install.connect",
    challengeId: "challenge_attacker_probe",
    nonce: "nonce_attacker_probe_0123456789abcdef",
  },
  (response) => {
    const message = chrome.runtime.lastError?.message;
    globalThis.attackResult = message === undefined
      ? { state: "delivered", response }
      : { state: "rejected", message };
  },
);
`, "utf8");
}

async function resolveTargetWorker(context: BrowserContext): Promise<Worker> {
  await expect.poll(() => context.serviceWorkers().map((worker) => worker.url()), {
    timeout: 20_000,
  }).toContain(`chrome-extension://${identity.extensionId}/background.js`);
  const worker = context.serviceWorkers().find(
    (candidate) => new URL(candidate.url()).host === identity.extensionId,
  );
  if (worker === undefined) throw new Error("Target extension worker was not registered");
  expect(new URL(worker.url()).host).toBe(identity.extensionId);
  return worker;
}

async function expectAttackerRejected(context: BrowserContext): Promise<void> {
  await expect.poll(() => context.serviceWorkers().length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  const attacker = context.serviceWorkers().find(
    (candidate) => new URL(candidate.url()).host !== identity.extensionId,
  );
  if (attacker === undefined) throw new Error("Attacker extension worker was not registered");
  await expect.poll(async () => readAttackResult(attacker), { timeout: 20_000 }).toMatchObject({
    state: "rejected",
  });
}

async function readAttackResult(worker: Worker): Promise<Readonly<Record<string, unknown>>> {
  const value: unknown = await worker.evaluate(() => Reflect.get(globalThis, "attackResult"));
  if (!isRecord(value)) throw new Error("Attacker result was not an object");
  return value;
}

async function expectInstallationMissing(worker: Worker): Promise<void> {
  const stored: unknown = await worker.evaluate(async () => {
    const result = await chrome.storage.local.get("routeHInstallation");
    return result.routeHInstallation;
  });
  expect(stored).toBeUndefined();
}

async function readStoredInstallation(worker: Worker): Promise<StoredInstallation> {
  const stored: unknown = await worker.evaluate(async () => {
    const result = await chrome.storage.local.get("routeHInstallation");
    return result.routeHInstallation;
  });
  if (!isStoredInstallation(stored)) throw new Error("Stored installation has an invalid shape");
  return stored;
}

async function issueChallenge(ageMs = 0): Promise<Challenge> {
  const response = await fetch(`${PROBE_BASE_URL}/__route-h/challenge?ageMs=${ageMs}`);
  expect(response.status).toBe(200);
  const parsed: unknown = await response.json();
  if (!isChallenge(parsed)) throw new Error("Challenge response has an invalid shape");
  return parsed;
}

async function sendConnectMessage(
  page: Page,
  url: string,
  challenge: Challenge,
  includeExtraKey = false,
): Promise<ConnectResult> {
  await page.goto(url);
  const result: unknown = await page.evaluate(
    ({ extensionId, challengeId, nonce, extra }) => new Promise((resolveMessage) => {
      const message = {
        schemaVersion: 1,
        type: "capture.install.connect",
        challengeId,
        nonce,
        ...(extra ? { unexpected: true } : {}),
      };
      chrome.runtime.sendMessage(extensionId, message, (response) => {
        const runtimeError = chrome.runtime.lastError?.message;
        resolveMessage(runtimeError === undefined ? response : { ok: false, error: runtimeError });
      });
    }),
    {
      extensionId: identity.extensionId,
      challengeId: challenge.id,
      nonce: challenge.nonce,
      extra: includeExtraKey,
    },
  );
  if (!isConnectResult(result)) throw new Error("Connect response has an invalid shape");
  return result;
}

async function expectPageDoesNotContainCapability(page: Page, capability: string): Promise<void> {
  expect(page.url()).toBe(SETTINGS_URL);
  expect(capability.length).toBeGreaterThan(32);
  const visibleState = await page.evaluate(() => ({
    body: document.body.textContent ?? "",
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  expect(JSON.stringify(visibleState)).not.toContain(capability);
}

function expectConfigContainsOnlyHash(
  configPath: string,
  installation: StoredInstallation,
  expectedVersion: number,
): void {
  const raw = readFileSync(configPath, "utf8");
  expect(raw).not.toContain(installation.capability);
  const parsed: unknown = JSON.parse(raw);
  if (!isInstallationConfig(parsed)) throw new Error("Installation config has an invalid shape");
  expect(parsed).toMatchObject({
    schemaVersion: 1,
    installationId: installation.installationId,
    credentialVersion: expectedVersion,
    credentialHash: hashCaptureCapability(installation.capability),
  });
  expect(Object.keys(parsed).sort()).toEqual([
    "createdAt",
    "credentialHash",
    "credentialVersion",
    "installationId",
    ...(expectedVersion > 1 ? ["rotatedAt"] : []),
    "schemaVersion",
  ].sort());
}

async function expectWrongSenderAndClosedSchemaRejected(page: Page): Promise<void> {
  const wrongSenderChallenge = await issueChallenge();
  expect(await sendConnectMessage(
    page,
    `${PROBE_BASE_URL}/not-settings`,
    wrongSenderChallenge,
  )).toEqual({ ok: false, error: "sender_rejected" });
  expect(await sendConnectMessage(page, SETTINGS_URL, wrongSenderChallenge, true)).toEqual({
    ok: false,
    error: "schema_rejected",
  });
}

async function expectExpiredChallengeRejected(page: Page): Promise<void> {
  const expired = await issueChallenge(CHALLENGE_TTL_MS + 1_000);
  expect(await sendConnectMessage(page, SETTINGS_URL, expired)).toEqual({ ok: false, status: 410 });
}

async function expectCompletionReplayRejected(page: Page): Promise<void> {
  const challenge = await issueChallenge();
  const first = await sendConnectMessage(page, SETTINGS_URL, challenge);
  expect(first.ok).toBe(true);
  const replay = await sendConnectMessage(page, SETTINGS_URL, challenge);
  expect(replay).toEqual({ ok: false, status: 409 });
}

async function expectConcurrentCompletionIsSingleUse(page: Page, configPath: string): Promise<void> {
  const challenge = await issueChallenge();
  await page.goto(SETTINGS_URL);
  const results: unknown = await page.evaluate(
    ({ extensionId, challengeId, nonce }) => {
      const send = (): Promise<unknown> => new Promise((resolveMessage) => {
        chrome.runtime.sendMessage(extensionId, {
          schemaVersion: 1,
          type: "capture.install.connect",
          challengeId,
          nonce,
        }, (response) => resolveMessage(response));
      });
      return Promise.all([send(), send()]);
    },
    { extensionId: identity.extensionId, challengeId: challenge.id, nonce: challenge.nonce },
  );
  if (!Array.isArray(results) || results.some((result) => !isConnectResult(result))) {
    throw new Error("Concurrent connect results have an invalid shape");
  }
  expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  const config: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  if (!isInstallationConfig(config)) throw new Error("Concurrent config has an invalid shape");
  expect(config.credentialVersion).toBeGreaterThanOrEqual(2);
}

async function fetchUsingStoredCapability(
  worker: Worker,
  bundle: CaptureAttemptBundle,
): Promise<FetchResult> {
  return fetchFromWorker(worker, {
    path: "/api/capture/attempts",
    useStoredAuthorization: true,
    body: JSON.stringify(bundle),
  });
}

async function fetchFromWorker(
  worker: Worker,
  input: {
    readonly path: string;
    readonly body: string;
    readonly authorization?: string;
    readonly useStoredAuthorization?: boolean;
  },
): Promise<FetchResult> {
  const result: unknown = await worker.evaluate(async ({ baseUrl, extensionOrigin, request }) => {
    let authorization = request.authorization;
    if (request.useStoredAuthorization === true) {
      const storage = await chrome.storage.local.get("routeHInstallation");
      const installation = storage.routeHInstallation;
      if (typeof installation !== "object" || installation === null) {
        throw new Error("Route H installation is missing");
      }
      const capability = Reflect.get(installation, "capability");
      if (typeof capability !== "string") throw new Error("Route H capability is missing");
      authorization = `Bearer ${capability}`;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Origin": extensionOrigin,
    };
    if (authorization !== undefined) headers.Authorization = authorization;
    const response = await fetch(`${baseUrl}${request.path}`, {
      method: "POST",
      headers,
      body: request.body,
    });
    return { status: response.status, body: await response.text() };
  }, { baseUrl: PROBE_BASE_URL, extensionOrigin: identity.origin, request: input });
  if (!isFetchResult(result)) throw new Error("Fetch result has an invalid shape");
  return result;
}

function buildBundle(installationId: string, suffix: string): CaptureAttemptBundle {
  const base = {
    schemaVersion: 2 as const,
    captureSessionId: `route_h_session_${suffix}`,
    installationId,
    adapterVersion: "route-h-spike@0.0.1",
    parserVersion: "route-h-spike@0.0.1",
    pageOrigin: "https://leetcode.cn",
    provenanceLevel: "extension_paired" as const,
    platform: "leetcode" as const,
    problemExternalId: `route-h-${suffix}`,
    problemTitle: `Route H ${suffix}`,
    canonicalUrl: `https://leetcode.cn/problems/route-h-${suffix}/`,
  };
  return CaptureAttemptBundleSchema.parse({
    schemaVersion: 1,
    bundleId: `route_h_bundle_${suffix}`,
    events: [
      {
        ...base,
        id: `route_h_started_${suffix}`,
        type: "SESSION_STARTED",
        occurredAt: "2026-08-25T00:00:00.000Z",
        payload: { source: "content_script" },
      },
      {
        ...base,
        id: `route_h_submitted_${suffix}`,
        type: "SUBMISSION_OBSERVED",
        submissionId: `route_h_submission_${suffix}`,
        occurredAt: "2026-08-25T00:01:00.000Z",
        payload: { action: "submission_confirmed" },
      },
      {
        ...base,
        id: `route_h_verdict_${suffix}`,
        type: "VERDICT_OBSERVED",
        submissionId: `route_h_submission_${suffix}`,
        occurredAt: "2026-08-25T00:02:00.000Z",
        payload: { verdict: "Accepted" },
      },
      {
        ...base,
        id: `route_h_ended_${suffix}`,
        type: "SESSION_ENDED",
        occurredAt: "2026-08-25T00:03:00.000Z",
        payload: { endReason: "spa_navigation" },
      },
    ],
  });
}

async function startProbeServer(state: ProbeState): Promise<Server> {
  const server = createServer((request, response) => {
    void handleProbeRequest(request, response, state).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "unknown_error";
      writeJson(response, 500, { error: message });
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => rejectListen(error);
    server.once("error", onError);
    server.listen(PROBE_PORT, PROBE_HOST, () => {
      server.off("error", onError);
      resolveListen();
    });
  });
  return server;
}

async function handleProbeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: ProbeState,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${PROBE_HOST}:${PROBE_PORT}`);
  if (request.method === "GET" && (url.pathname === "/settings" || url.pathname === "/not-settings")) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><button id=connect>连接扩展</button></body></html>");
    return;
  }
  if (request.method === "GET" && url.pathname === "/__route-h/challenge") {
    const ageMs = Number(url.searchParams.get("ageMs") ?? "0");
    const challenge: Challenge = {
      id: `challenge_${randomUUID()}`,
      nonce: randomBytes(32).toString("base64url"),
      createdAtMs: Date.now() - (Number.isFinite(ageMs) && ageMs >= 0 ? ageMs : 0),
      consumed: false,
    };
    state.challenges.set(challenge.id, challenge);
    writeJson(response, 200, challenge);
    return;
  }
  if (request.method === "OPTIONS" && (
    url.pathname === "/__route-h/complete" || url.pathname === "/api/capture/attempts"
  )) {
    if (!acceptExactOrigin(request, response, state)) return;
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/__route-h/complete") {
    if (!acceptExactOrigin(request, response, state)) return;
    await handleCompletion(request, response, state);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/capture/attempts") {
    if (!acceptExactOrigin(request, response, state)) return;
    await handleCapture(request, response, state);
    return;
  }
  writeJson(response, 404, { error: "not_found" });
}

function acceptExactOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  state: ProbeState,
): boolean {
  const origin = readSingleHeader(request.headers.origin);
  if (origin !== identity.origin) {
    writeJson(response, 403, { error: "origin_rejected" });
    return false;
  }
  state.acceptedOrigins.push(origin);
  return true;
}

async function handleCompletion(
  request: IncomingMessage,
  response: ServerResponse,
  state: ProbeState,
): Promise<void> {
  const body = await readJsonBody(request);
  if (!isCompletionBody(body)) {
    writeJson(response, 400, { error: "schema_rejected" }, corsHeaders());
    return;
  }
  const challenge = state.challenges.get(body.challengeId);
  if (challenge === undefined || challenge.nonce !== body.nonce) {
    writeJson(response, 404, { error: "challenge_rejected" }, corsHeaders());
    return;
  }
  if (Date.now() - challenge.createdAtMs > CHALLENGE_TTL_MS) {
    writeJson(response, 410, { error: "challenge_expired" }, corsHeaders());
    return;
  }
  if (challenge.consumed) {
    writeJson(response, 409, { error: "challenge_consumed" }, corsHeaders());
    return;
  }
  challenge.consumed = true;

  const previous = readInstallationConfig(state.configPath);
  const now = new Date().toISOString();
  const next: InstallationConfig = {
    schemaVersion: 1,
    installationId: body.installationId,
    credentialVersion: (previous?.credentialVersion ?? 0) + 1,
    credentialHash: hashCaptureCapability(body.capability),
    createdAt: previous?.createdAt ?? now,
    ...(previous === null ? {} : { rotatedAt: now }),
  };
  writeConfigAtomically(state.configPath, next);
  writeJson(response, 201, {
    ok: true,
    credentialVersion: next.credentialVersion,
  }, corsHeaders());
}

async function handleCapture(
  request: IncomingMessage,
  response: ServerResponse,
  state: ProbeState,
): Promise<void> {
  const config = readInstallationConfig(state.configPath);
  const authorization = readSingleHeader(request.headers.authorization);
  const credential = authorization?.startsWith("Bearer ") === true
    ? authorization.slice("Bearer ".length)
    : null;
  if (
    config === null
    || credential === null
    || !safeHashEquals(config.credentialHash, hashCaptureCapability(credential))
  ) {
    writeJson(response, 401, { error: "capture_unauthorized" }, corsHeaders());
    return;
  }

  const body = await readJsonBody(request);
  const bundle = CaptureAttemptBundleSchema.parse(body);
  if (!bundle.events.every((event) => event.installationId === config.installationId)) {
    writeJson(response, 403, { error: "installation_mismatch" }, corsHeaders());
    return;
  }
  const db = openDisposableDatabase(state.activeDbPath);
  try {
    const ack = ingestCaptureAttemptBundle(db, bundle);
    writeJson(response, 200, ack, corsHeaders());
  } finally {
    db.close();
  }
}

function readInstallationConfig(configPath: string): InstallationConfig | null {
  if (!existsSync(configPath)) return null;
  const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  if (!isInstallationConfig(parsed)) throw new Error("Stored installation config is invalid");
  return parsed;
}

function writeConfigAtomically(configPath: string, config: InstallationConfig): void {
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  renameSync(temporaryPath, configPath);
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function corsHeaders(): Readonly<Record<string, string>> {
  return {
    "Access-Control-Allow-Origin": identity.origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Origin",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: Readonly<Record<string, unknown>>,
  headers: Readonly<Record<string, string>> = { "Content-Type": "application/json" },
): void {
  if (response.headersSent || response.writableEnded) return;
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 256 * 1024) throw new Error("request_body_too_large");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function isCompletionBody(value: unknown): value is {
  readonly schemaVersion: 1;
  readonly challengeId: string;
  readonly nonce: string;
  readonly installationId: string;
  readonly capability: string;
} {
  if (!isRecord(value)) return false;
  if (Object.keys(value).sort().join(",") !== [
    "capability",
    "challengeId",
    "installationId",
    "nonce",
    "schemaVersion",
  ].sort().join(",")) return false;
  return value.schemaVersion === 1
    && typeof value.challengeId === "string"
    && typeof value.nonce === "string"
    && typeof value.installationId === "string"
    && /^installation_[0-9a-f-]{36}$/u.test(value.installationId)
    && typeof value.capability === "string"
    && /^capture_[A-Za-z0-9_-]{43}$/u.test(value.capability);
}

function isChallenge(value: unknown): value is Challenge {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.nonce === "string"
    && typeof value.createdAtMs === "number"
    && typeof value.consumed === "boolean";
}

function isConnectResult(value: unknown): value is ConnectResult {
  return isRecord(value)
    && typeof value.ok === "boolean"
    && (value.status === undefined || typeof value.status === "number")
    && (value.credentialVersion === undefined || typeof value.credentialVersion === "number")
    && (value.error === undefined || typeof value.error === "string");
}

function isStoredInstallation(value: unknown): value is StoredInstallation {
  return isRecord(value)
    && typeof value.installationId === "string"
    && typeof value.credentialVersion === "number"
    && typeof value.capability === "string";
}

function isInstallationConfig(value: unknown): value is InstallationConfig {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.installationId === "string"
    && typeof value.credentialVersion === "number"
    && typeof value.credentialHash === "string"
    && typeof value.createdAt === "string"
    && (value.rotatedAt === undefined || typeof value.rotatedAt === "string");
}

function isFetchResult(value: unknown): value is FetchResult {
  return isRecord(value)
    && typeof value.status === "number"
    && typeof value.body === "string";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose();
      else rejectClose(error);
    });
  });
}
