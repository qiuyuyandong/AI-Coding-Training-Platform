# Phase 2 Browser Capture Hardening Implementation Plan

Status: Completed on 2026-07-06. This file is retained as a historical execution plan; use `docs/architecture.md` and `docs/runbook.md` for current onboarding.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Chrome MV3 capture source into a buildable, installable, diagnosable local capture loop from original OJ page to local SQLite-backed app status.

**Architecture:** Phase 2.1 keeps browser capture local-only and decomposes the work into extension build output, pure platform detection, pure transport/queue helpers, robust Capture API semantics, popup status controls, and app-side capture status display. The extension never reads cookies/session tokens and never caches third-party full statements.

**Tech Stack:** Next.js App Router, TypeScript strict mode, Vitest, better-sqlite3, Zod, Chrome MV3, esbuild for extension bundling.

---

## File Structure

Create or modify these files:

```text
extension/
  build.mjs                         # New extension build script using esbuild and fs copy
  manifest.json                     # Modify to describe dist-root paths after build
  src/background.ts                 # Modify to use transport queue helpers and storage state
  src/content.ts                    # Modify to respect captureEnabled before sending
  src/platforms.ts                  # Modify only if tests expose URL parsing gaps
  src/popup.html                    # Replace with toggle/status UI skeleton
  src/popup.ts                      # Replace with popup storage/status logic
  src/transport.ts                  # New pure queue/message/flush helpers
app/
  api/capture/events/route.ts       # Modify safeParse + 400/500 JSON behavior
  api/capture/status/route.ts       # New recent capture status endpoint
components/
  CaptureStatusPanel.tsx            # New client-side status panel
  TrainingWorkspace.tsx             # Modify to render CaptureStatusPanel
lib/
  repositories/captureEvents.ts     # Add listRecentCaptureEvents
tests/
  unit/extensionPlatforms.test.ts   # New platform detector tests
  unit/extensionTransport.test.ts   # New queue/message/flush tests
  unit/captureApi.test.ts           # New route handler tests
README.md                           # Add extension build/load commands
COMPLIANCE.md                       # Add Phase 2 local-only capture notes
package.json                        # Add esbuild dev dependency and extension:build script
```

---

### Task 1: Extension Build Pipeline

**Files:**
- Modify: `package.json`
- Create: `extension/build.mjs`
- Modify: `extension/manifest.json`

- [ ] **Step 1: Add the extension build script and esbuild dependency**

Edit `package.json` so `scripts` includes:

```json
"extension:build": "node extension/build.mjs",
"extension:check": "npm run typecheck && npm run extension:build"
```

Add this dev dependency:

```json
"esbuild": "0.25.11"
```

Run:

```powershell
npm install
```

Expected: install exits 0 and `package-lock.json` updates with esbuild.

- [ ] **Step 2: Write the build script**

Create `extension/build.mjs`:

```js
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const extensionDir = join(root, "extension");
const outdir = join(extensionDir, "dist");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: {
    background: join(extensionDir, "src", "background.ts"),
    content: join(extensionDir, "src", "content.ts"),
    popup: join(extensionDir, "src", "popup.ts"),
  },
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir,
  sourcemap: true,
  logLevel: "info",
});

copyFileSync(join(extensionDir, "manifest.json"), join(outdir, "manifest.json"));
copyFileSync(join(extensionDir, "src", "popup.html"), join(outdir, "popup.html"));
```

- [ ] **Step 3: Update the manifest to load dist-root files**

Replace `extension/manifest.json` with:

```json
{
  "manifest_version": 3,
  "name": "Unified OJ Capture",
  "version": "0.1.0",
  "description": "Detects user-visible OJ training events and sends them to the local training app.",
  "permissions": ["storage", "tabs", "alarms"],
  "host_permissions": [
    "http://localhost:3000/*",
    "https://leetcode.com/*",
    "https://www.nowcoder.com/*",
    "https://www.luogu.com.cn/*",
    "https://codeforces.com/*",
    "https://atcoder.jp/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://leetcode.com/problems/*",
        "https://www.nowcoder.com/*",
        "https://www.luogu.com.cn/*",
        "https://codeforces.com/problemset/problem/*",
        "https://atcoder.jp/contests/*/tasks/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

- [ ] **Step 4: Verify build output**

Run:

```powershell
npm run extension:build
```

Expected: `extension/dist/manifest.json`, `background.js`, `content.js`, `popup.js`, `popup.html`, and sourcemaps exist.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add package.json package-lock.json extension/build.mjs extension/manifest.json
$env:GIT_MASTER='1'; git commit -m "Add extension build pipeline" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 2: Platform Detector Coverage

**Files:**
- Create: `tests/unit/extensionPlatforms.test.ts`
- Modify: `extension/src/platforms.ts` only if tests fail for valid URL cases

- [ ] **Step 1: Write detector tests first**

Create `tests/unit/extensionPlatforms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectProblemFromLocation } from "@/extension/src/platforms";

function asLocation(url: string): Location {
  return new URL(url) as unknown as Location;
}

describe("detectProblemFromLocation", () => {
  it("detects LeetCode problem URLs", () => {
    expect(detectProblemFromLocation(asLocation("https://leetcode.com/problems/two-sum/"), "Two Sum - LeetCode")).toEqual({
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
    });
  });

  it("detects Codeforces problem URLs", () => {
    expect(detectProblemFromLocation(asLocation("https://codeforces.com/problemset/problem/4/A"), "A. Watermelon")).toEqual({
      platform: "codeforces",
      problemExternalId: "4A",
      problemTitle: "A. Watermelon",
      canonicalUrl: "https://codeforces.com/problemset/problem/4/A",
    });
  });

  it("detects AtCoder task URLs", () => {
    expect(detectProblemFromLocation(asLocation("https://atcoder.jp/contests/abc086/tasks/abc086_a"), "ABC086A - Product")).toEqual({
      platform: "atcoder",
      problemExternalId: "abc086_a",
      problemTitle: "ABC086A",
      canonicalUrl: "https://atcoder.jp/contests/abc086/tasks/abc086_a",
    });
  });

  it("detects NowCoder URLs conservatively", () => {
    expect(detectProblemFromLocation(asLocation("https://www.nowcoder.com/practice/example"), "Example - NowCoder")?.platform).toBe("nowcoder");
  });

  it("detects Luogu URLs conservatively", () => {
    expect(detectProblemFromLocation(asLocation("https://www.luogu.com.cn/problem/P1001"), "P1001 A+B Problem")?.platform).toBe("luogu");
  });

  it("returns null for unsupported hosts", () => {
    expect(detectProblemFromLocation(asLocation("https://example.com/problems/two-sum"), "Two Sum")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the detector tests**

```powershell
npm run test -- tests/unit/extensionPlatforms.test.ts
```

Expected: PASS. If a title normalization expectation fails, update `extension/src/platforms.ts` minimally and keep all tests passing.

- [ ] **Step 3: Run typecheck**

```powershell
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
$env:GIT_MASTER='1'; git add tests/unit/extensionPlatforms.test.ts extension/src/platforms.ts
$env:GIT_MASTER='1'; git commit -m "Add extension platform detector tests" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 3: Background Transport Queue

**Files:**
- Create: `extension/src/transport.ts`
- Modify: `extension/src/background.ts`
- Create: `tests/unit/extensionTransport.test.ts`

- [ ] **Step 1: Write failing transport tests**

Create `tests/unit/extensionTransport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CAPTURE_QUEUE_LIMIT,
  enqueueCaptureEvent,
  isCaptureMessage,
  planQueueAfterFlush,
  type CaptureQueueItem,
} from "@/extension/src/transport";
import type { CaptureEvent } from "@/lib/capture/events";

function event(id: string): CaptureEvent {
  return {
    id,
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: { source: "content_script" },
  };
}

describe("isCaptureMessage", () => {
  it("accepts capture messages", () => {
    expect(isCaptureMessage({ type: "CAPTURE_EVENT", event: event("evt_1") })).toBe(true);
  });

  it("rejects malformed messages", () => {
    expect(isCaptureMessage({ type: "OTHER", event: event("evt_1") })).toBe(false);
    expect(isCaptureMessage(null)).toBe(false);
  });
});

describe("enqueueCaptureEvent", () => {
  it("keeps only the most recent queue items", () => {
    const existing = Array.from({ length: CAPTURE_QUEUE_LIMIT }, (_, index): CaptureQueueItem => ({ event: event(`evt_${index}`), attempts: 0 }));
    const next = enqueueCaptureEvent(existing, event("evt_new"));
    expect(next).toHaveLength(CAPTURE_QUEUE_LIMIT);
    expect(next.at(-1)?.event.id).toBe("evt_new");
    expect(next[0]?.event.id).toBe("evt_1");
  });
});

describe("planQueueAfterFlush", () => {
  it("removes delivered events", () => {
    const result = planQueueAfterFlush([{ event: event("evt_1"), attempts: 0 }], { status: 200 });
    expect(result.queue).toEqual([]);
    expect(result.lastSuccessfulCaptureAt).toBeDefined();
  });

  it("drops validation errors", () => {
    const result = planQueueAfterFlush([{ event: event("evt_1"), attempts: 0 }], { status: 400, error: "bad payload" });
    expect(result.queue).toEqual([]);
    expect(result.lastCaptureError).toContain("bad payload");
  });

  it("keeps retryable failures", () => {
    const result = planQueueAfterFlush([{ event: event("evt_1"), attempts: 0 }], { status: 500, error: "server failed" });
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm run test -- tests/unit/extensionTransport.test.ts
```

Expected: FAIL because `extension/src/transport.ts` does not exist.

- [ ] **Step 3: Implement pure transport helpers**

Create `extension/src/transport.ts`:

```ts
import type { CaptureEvent } from "@/lib/capture/events";

export const CAPTURE_QUEUE_LIMIT = 100;

export type CaptureMessage = { type: "CAPTURE_EVENT"; event: CaptureEvent };

export type CaptureQueueItem = {
  event: CaptureEvent;
  attempts: number;
};

export type FlushResult =
  | { status: 200 }
  | { status: 400; error: string }
  | { status: 500; error: string }
  | { status: "network_error"; error: string };

export type QueuePlan = {
  queue: CaptureQueueItem[];
  lastCaptureError?: string;
  lastSuccessfulCaptureAt?: string;
};

export function isCaptureMessage(value: unknown): value is CaptureMessage {
  return typeof value === "object" && value !== null && "type" in value && (value as { type: unknown }).type === "CAPTURE_EVENT" && "event" in value;
}

export function enqueueCaptureEvent(queue: CaptureQueueItem[], event: CaptureEvent): CaptureQueueItem[] {
  return [...queue, { event, attempts: 0 }].slice(-CAPTURE_QUEUE_LIMIT);
}

export function planQueueAfterFlush(queue: CaptureQueueItem[], result: FlushResult): QueuePlan {
  if (queue.length === 0) return { queue };
  const [, ...rest] = queue;
  if (result.status === 200) {
    return { queue: rest, lastSuccessfulCaptureAt: new Date().toISOString() };
  }
  if (result.status === 400) {
    return { queue: rest, lastCaptureError: `Validation error: ${result.error}` };
  }
  const [head] = queue;
  if (!head) return { queue };
  return {
    queue: [{ ...head, attempts: head.attempts + 1 }, ...rest],
    lastCaptureError: result.error,
  };
}
```

- [ ] **Step 4: Update background script to use helpers**

Replace `extension/src/background.ts` with:

```ts
import { enqueueCaptureEvent, isCaptureMessage, planQueueAfterFlush, type CaptureQueueItem, type FlushResult } from "./transport";

const STORAGE_KEYS = ["captureEnabled", "eventQueue"] as const;
const FLUSH_ALARM_NAME = "flushCaptureQueue";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({ captureEnabled: true, eventQueue: [] });
  void chrome.alarms.create(FLUSH_ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCaptureMessage(message)) return;
  void enqueueAndFlush(message.event);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM_NAME) void flushQueue();
});

async function enqueueAndFlush(event: CaptureQueueItem["event"]): Promise<void> {
  const state = await chrome.storage.local.get(STORAGE_KEYS);
  if (state.captureEnabled === false) return;
  const queue = enqueueCaptureEvent(readQueue(state.eventQueue), event);
  await chrome.storage.local.set({ eventQueue: queue, lastDetectedProblem: event });
  await flushQueue();
}

async function flushQueue(): Promise<void> {
  const state = await chrome.storage.local.get(["eventQueue"]);
  const queue = readQueue(state.eventQueue);
  if (queue.length === 0) return;
  const result = await postCaptureEvent(queue[0].event);
  const plan = planQueueAfterFlush(queue, result);
  await chrome.storage.local.set(plan);
}

async function postCaptureEvent(event: CaptureQueueItem["event"]): Promise<FlushResult> {
  try {
    const response = await fetch("http://localhost:3000/api/capture/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    if (response.ok) return { status: 200 };
    const body = await response.json().catch(() => ({ error: response.statusText }));
    if (response.status === 400) return { status: 400, error: String(body.error ?? "Invalid capture event") };
    return { status: 500, error: String(body.error ?? `HTTP ${response.status}`) };
  } catch (err) {
    return { status: "network_error", error: err instanceof Error ? err.message : "Network error" };
  }
}

function readQueue(value: unknown): CaptureQueueItem[] {
  return Array.isArray(value) ? value.filter(isQueueItem) : [];
}

function isQueueItem(value: unknown): value is CaptureQueueItem {
  return typeof value === "object" && value !== null && "event" in value && "attempts" in value;
}
```

- [ ] **Step 5: Verify transport tests and typecheck**

```powershell
npm run test -- tests/unit/extensionTransport.test.ts
npm run typecheck
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```powershell
$env:GIT_MASTER='1'; git add extension/src/transport.ts extension/src/background.ts tests/unit/extensionTransport.test.ts
$env:GIT_MASTER='1'; git commit -m "Add extension capture transport queue" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 4: Capture API Validation and Status

**Files:**
- Modify: `lib/repositories/captureEvents.ts`
- Modify: `app/api/capture/events/route.ts`
- Create: `app/api/capture/status/route.ts`
- Create: `tests/unit/captureApi.test.ts`

- [ ] **Step 1: Write API tests**

Create `tests/unit/captureApi.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";

let tempDir = "";

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "capture-api-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  const db = openDatabase();
  try {
    const sql = readFileSync(join(process.cwd(), "lib", "db", "migrations", "0001_initial.sql"), "utf8");
    db.exec(sql);
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function validEvent() {
  return {
    id: "evt_api_1",
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: { source: "test" },
  };
}

describe("capture API", () => {
  it("returns 200 for valid capture events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");
    const response = await POST(new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify(validEvent()) }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, eventId: "evt_api_1" });
  });

  it("returns 400 for invalid capture events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");
    const response = await POST(new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify({ id: "bad" }) }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid capture event");
  });

  it("returns recent capture status", async () => {
    const events = await import("@/app/api/capture/events/route");
    await events.POST(new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify(validEvent()) }));
    const status = await import("@/app/api/capture/status/route");
    const response = await status.GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recentEvents[0].id).toBe("evt_api_1");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm run test -- tests/unit/captureApi.test.ts
```

Expected: FAIL because API still throws 500 for invalid body and status route does not exist.

- [ ] **Step 3: Add recent event repository read**

Append to `lib/repositories/captureEvents.ts`:

```ts
type CaptureEventRow = {
  id: string;
  type: string;
  platform: string;
  problem_external_id: string;
  problem_title: string;
  canonical_url: string;
  occurred_at: string;
  payload_json: string;
};

function fromCaptureEventRow(row: CaptureEventRow): CaptureEvent {
  return CaptureEventSchema.parse({
    id: row.id,
    type: row.type,
    platform: row.platform,
    problemExternalId: row.problem_external_id,
    problemTitle: row.problem_title,
    canonicalUrl: row.canonical_url,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  });
}

export function listRecentCaptureEvents(db: Database.Database, limit = 10): CaptureEvent[] {
  return db
    .prepare("SELECT * FROM capture_events ORDER BY occurred_at DESC LIMIT ?")
    .all(limit)
    .map((row) => fromCaptureEventRow(row as CaptureEventRow));
}
```

- [ ] **Step 4: Replace Capture Events POST route**

Replace `app/api/capture/events/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { saveCaptureEvent } from "@/lib/repositories/captureEvents";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = CaptureEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid capture event", issues: parsed.error.issues }, { status: 400 });
  }

  const db = openDatabase();
  try {
    saveCaptureEvent(db, parsed.data);
    return NextResponse.json({ ok: true, eventId: parsed.data.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to save capture event" }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 5: Add status route**

Create `app/api/capture/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { listRecentCaptureEvents } from "@/lib/repositories/captureEvents";

export async function GET() {
  const db = openDatabase();
  try {
    const recentEvents = listRecentCaptureEvents(db, 10);
    return NextResponse.json({ ok: true, recentEvents });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to read capture status", recentEvents: [] }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 6: Verify API tests and typecheck**

```powershell
npm run test -- tests/unit/captureApi.test.ts
npm run typecheck
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 7: Commit**

```powershell
$env:GIT_MASTER='1'; git add lib/repositories/captureEvents.ts app/api/capture/events/route.ts app/api/capture/status/route.ts tests/unit/captureApi.test.ts
$env:GIT_MASTER='1'; git commit -m "Harden capture API validation" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 5: Popup Capture Controls

**Files:**
- Modify: `extension/src/popup.html`
- Modify: `extension/src/popup.ts`
- Modify: `extension/src/content.ts`

- [ ] **Step 1: Replace popup HTML**

Replace `extension/src/popup.html` with:

```html
<!doctype html>
<html lang="zh-CN">
  <body>
    <main style="width: 300px; font-family: sans-serif; padding: 12px;">
      <h1 style="font-size: 16px; margin: 0 0 8px;">Unified OJ Capture</h1>
      <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <input id="captureEnabled" type="checkbox" />
        <span>Enable local capture</span>
      </label>
      <dl style="display: grid; grid-template-columns: 90px 1fr; gap: 6px; font-size: 12px;">
        <dt>Queue</dt><dd id="queueLength">0</dd>
        <dt>Last success</dt><dd id="lastSuccess">Never</dd>
        <dt>Last error</dt><dd id="lastError">None</dd>
      </dl>
      <p id="status" style="font-size: 12px; margin-top: 12px;">Ready</p>
      <script type="module" src="popup.js"></script>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Replace popup TypeScript**

Replace `extension/src/popup.ts` with:

```ts
const enabledNode = document.querySelector<HTMLInputElement>("#captureEnabled");
const queueNode = document.querySelector("#queueLength");
const successNode = document.querySelector("#lastSuccess");
const errorNode = document.querySelector("#lastError");
const statusNode = document.querySelector("#status");

void render();

enabledNode?.addEventListener("change", () => {
  void chrome.storage.local.set({ captureEnabled: enabledNode.checked }).then(render);
});

async function render(): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled", "eventQueue", "lastCaptureError", "lastSuccessfulCaptureAt"]);
  if (enabledNode) enabledNode.checked = state.captureEnabled !== false;
  if (queueNode) queueNode.textContent = Array.isArray(state.eventQueue) ? String(state.eventQueue.length) : "0";
  if (successNode) successNode.textContent = typeof state.lastSuccessfulCaptureAt === "string" ? state.lastSuccessfulCaptureAt : "Never";
  if (errorNode) errorNode.textContent = typeof state.lastCaptureError === "string" ? state.lastCaptureError : "None";
  if (statusNode) statusNode.textContent = state.captureEnabled === false ? "Capture disabled" : "Capture enabled";
}
```

- [ ] **Step 3: Respect captureEnabled in content script**

Replace `extension/src/content.ts` with:

```ts
import { detectProblemFromLocation } from "./platforms";

void run();

async function run(): Promise<void> {
  const state = await chrome.storage.local.get(["captureEnabled"]);
  if (state.captureEnabled === false) return;

  const detected = detectProblemFromLocation(window.location, document.title);
  if (!detected) return;

  chrome.runtime.sendMessage({
    type: "CAPTURE_EVENT",
    event: {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: "PAGE_DETECTED",
      ...detected,
      occurredAt: new Date().toISOString(),
      payload: { source: "content_script" },
    },
  });
}
```

- [ ] **Step 4: Verify extension build and typecheck**

```powershell
npm run extension:build
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```powershell
$env:GIT_MASTER='1'; git add extension/src/popup.html extension/src/popup.ts extension/src/content.ts
$env:GIT_MASTER='1'; git commit -m "Add extension capture controls" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 6: App Capture Status Panel

**Files:**
- Create: `components/CaptureStatusPanel.tsx`
- Modify: `components/TrainingWorkspace.tsx`

- [ ] **Step 1: Create client status panel**

Create `components/CaptureStatusPanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { CaptureEvent } from "@/lib/capture/events";

type CaptureStatus = {
  ok: boolean;
  recentEvents: CaptureEvent[];
  error?: string;
};

export function CaptureStatusPanel() {
  const [status, setStatus] = useState<CaptureStatus>({ ok: true, recentEvents: [] });

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch("/api/capture/status", { cache: "no-store" });
        const body = (await response.json()) as CaptureStatus;
        if (!cancelled) setStatus(body);
      } catch (err) {
        if (!cancelled) setStatus({ ok: false, recentEvents: [], error: err instanceof Error ? err.message : "Failed to load capture status" });
      }
    }
    void loadStatus();
    const id = window.setInterval(loadStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const latest = status.recentEvents[0];
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-slate-950">Capture status</h2>
      {!status.ok && <p className="mt-2 text-red-700">{status.error ?? "Capture status unavailable"}</p>}
      {status.ok && !latest && <p className="mt-2 text-slate-600">No capture events yet. Open an original problem with the extension enabled.</p>}
      {latest && (
        <div className="mt-2 text-slate-600">
          <p>Latest: {latest.type} · {latest.platform} · {latest.problemTitle}</p>
          <p className="text-xs text-slate-500">{latest.occurredAt}</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render the panel below the workspace**

Modify `components/TrainingWorkspace.tsx`:

```tsx
import { CaptureStatusPanel } from "./CaptureStatusPanel";

type TrainingWorkspaceProps = {
  platform: string;
  externalId: string;
};

export function TrainingWorkspace({ platform, externalId }: TrainingWorkspaceProps) {
  const url = buildPlatformUrl(platform, externalId);
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm uppercase tracking-wide text-slate-500">{platform}</p>
        <h1 className="mt-2 text-2xl font-semibold">{externalId}</h1>
        <p className="mt-3 text-slate-600">
          This V1 workspace opens the original platform and waits for the browser extension to return page/submission events.
        </p>
        <a className="mt-5 inline-block rounded-lg bg-slate-950 px-4 py-2 text-white" href={url} target="_blank" rel="noreferrer">
          Open original problem
        </a>
      </section>
      <CaptureStatusPanel />
    </>
  );
}

function buildPlatformUrl(platform: string, externalId: string): string {
  if (platform === "leetcode") return `https://leetcode.com/problems/${externalId}/`;
  if (platform === "codeforces") return `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`;
  if (platform === "atcoder") return `https://atcoder.jp/contests/${externalId.split("_")[0]}/tasks/${externalId}`;
  return "https://www.google.com/search?q=" + encodeURIComponent(`${platform} ${externalId}`);
}
```

- [ ] **Step 3: Verify build**

```powershell
npm run typecheck
npm run build
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```powershell
$env:GIT_MASTER='1'; git add components/CaptureStatusPanel.tsx components/TrainingWorkspace.tsx
$env:GIT_MASTER='1'; git commit -m "Show capture status in training workspace" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 7: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `COMPLIANCE.md`

- [ ] **Step 1: Update README commands**

Append to `README.md`:

````md

## Browser Extension

Build the Chrome MV3 extension:

```powershell
npm run extension:build
```

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000` so the extension can post capture events to `/api/capture/events`.
````

- [ ] **Step 2: Update compliance notes**

Append to `COMPLIANCE.md`:

```md

## Phase 2.1 Browser Capture

The browser extension is local-first and user-controlled:

- capture can be disabled from the popup;
- queued events stay in Chrome local storage until sent to the local app;
- invalid events are dropped after a 400 response to avoid retry loops;
- no cookies, session tokens, passwords, or hidden platform data are read or uploaded;
- commercial platform full statements remain out of scope unless explicitly licensed or manually entered by the user.
```

- [ ] **Step 3: Run full verification**

```powershell
npm run extension:build
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```powershell
$env:GIT_MASTER='1'; git add README.md COMPLIANCE.md
$env:GIT_MASTER='1'; git commit -m "Document browser capture hardening workflow" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Self-Review

- Spec coverage: Extension build, platform detection, transport queue, API 400/500 handling, app capture status, testing, docs, and local-only compliance boundaries are all covered.
- Placeholder scan: No TBD/TODO/fill-in-later steps remain.
- Type consistency: `CaptureEvent`, `DetectedProblem`, `CaptureQueueItem`, `FlushResult`, `eventQueue`, `lastCaptureError`, and `lastSuccessfulCaptureAt` names are consistent across tasks.
- Scope check: This plan only implements Phase 2.1 Browser Capture Hardening. Training attempts loop, LLM Coach, Playwright/CDP companion, and local judging remain future phases.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-phase-2-browser-capture-hardening.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
