# Phase 0A E2E Data Safety and Migration Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Playwright run use a freshly migrated disposable SQLite database so browser QA can never read, seed, or delete the user's default `training-platform.sqlite`.

**Architecture:** Extract the SQL migration loop into a reusable `applyMigrations` function, then add a narrowly scoped E2E database lifecycle under `.tmp/playwright`. Playwright prepares that database before starting its owned Next.js server, injects the same absolute path into the server and test workers, runs smoke tests serially against the isolated database, and removes it during global teardown.

**Tech Stack:** TypeScript 5.8 strict mode, Node.js filesystem/path APIs, `better-sqlite3` 12.11, Vitest 3.2, Playwright 1.53, Next.js 15.3 App Router, PowerShell verification commands.

## Global Constraints

- Preserve the current local-pilot boundary from `docs/decisions/0001-local-pilot-to-cloud-saas.md`: Phase 0A introduces no external LLM, analytics, sync, account, or network dependency.
- Never open, migrate, seed, delete, or hash-write `training-platform.sqlite` from E2E code; only read its SHA-256 during the final safety verification.
- Recursive cleanup is allowed only for the resolved directory `<workspace>/.tmp/playwright`; guard that path before every `rmSync` call.
- Keep TypeScript strict. Do not use `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions.
- Keep database handles inside `try` / `finally` blocks and close them in `finally`.
- `npm run e2e` owns the Next.js server lifecycle; never reuse an existing server on port 3000.
- Keep E2E execution at one worker until tests stop sharing mutable database state.
- Do not start a separate long-running `npm run dev` or `npm run start` process.
- Every Git command must be prefixed with `$env:GIT_MASTER='1';`.
- Do not push or create a pull request. Commit steps are executed only after the user selects an execution workflow that authorizes implementation commits.
- Preserve the existing uncommitted `IDEA.md` and `.gitignore` work; stage only the files named by each commit step.

## Phase 0 Decomposition

`IDEA.md` Phase 0 contains four independently reviewable subprojects:

1. **Phase 0A — this plan:** migration reuse, disposable E2E database, clean-state regression, and QA documentation.
2. **Phase 0B — separate plan:** capture session/submission IDs, SPA navigation, same-verdict resubmissions, `pagehide`, and queue serialization.
3. **Phase 0C — separate plan:** problem-scoped attempt queries, true Growth aggregates, and canonical problem URLs.
4. **Phase 0D — separate plan:** ESLint, CI, migration compatibility gates, and complete handoff automation.

Completing this plan does not claim that all of Phase 0 is complete. It delivers the data-safety prerequisite required before 0B–0D.

## File Structure

- Create `lib/db/migrations.ts`: reusable, transaction-safe SQL migration application with deterministic test hooks.
- Modify `lib/db/migrate.ts`: minimal CLI adapter that opens the configured database, calls `applyMigrations`, and closes it.
- Create `tests/unit/migrations.test.ts`: migration idempotency and rollback tests using temporary databases.
- Modify `tests/unit/captureApi.test.ts`: consume the real migration runner instead of duplicating a hard-coded migration list.
- Create `tests/e2e/database.ts`: absolute E2E paths plus guarded prepare/cleanup functions.
- Create `tests/e2e/prepare.ts`: executable preparation entrypoint used by the Playwright-owned server command.
- Create `tests/e2e/global-teardown.ts`: cleanup hook for the disposable database directory.
- Create `tests/unit/e2eDatabase.test.ts`: verifies the isolated path and migrated schema.
- Create `tests/e2e/isolation.spec.ts`: browser-suite guard that proves workers and `openDatabase()` use the isolated path.
- Modify `playwright.config.ts`: inject the isolated path, prepare before server start, disable reuse, serialize workers, register teardown.
- Modify `package.json`: add the internal `e2e:prepare` script.
- Modify `.gitignore`: ignore only `.tmp/playwright/` E2E artifacts.
- Modify `tests/e2e/coach-growth.spec.ts`: make the empty Growth assertion match the actual sentence on a clean database.
- Modify `README.md`: document the product idea file and safe E2E lifecycle.
- Modify `docs/runbook.md`: document the disposable database path, cleanup behavior, and troubleshooting check.

---

### Task 1: Extract and Test the Reusable Migration Runner

**Files:**
- Create: `lib/db/migrations.ts`
- Modify: `lib/db/migrate.ts:1-32`
- Modify: `tests/unit/captureApi.test.ts:1-29`
- Test: `tests/unit/migrations.test.ts`

**Interfaces:**
- Consumes: a live `Database.Database` handle and optional `MigrationOptions`.
- Produces: `applyMigrations(db: Database.Database, options?: MigrationOptions): void`.
- Preserves: the CLI contract `npm run db:migrate` and the existing migration filename ordering rule.

- [ ] **Step 1: Write migration idempotency and rollback tests**

Create `tests/unit/migrations.test.ts`:

```ts
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "@/lib/db/migrations";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("applyMigrations", () => {
  it("applies every repository migration exactly once", () => {
    const directory = makeTempDir("migration-runner-");
    const db = new Database(join(directory, "test.sqlite"));

    try {
      const options = { now: () => "2026-07-11T00:00:00.000Z" };
      applyMigrations(db, options);
      applyMigrations(db, options);

      const migrationCount = db
        .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get();
      const attemptColumns = db
        .prepare<[], { readonly name: string }>("PRAGMA table_info(training_attempts)")
        .all()
        .map((column) => column.name);
      const expectedMigrationCount = readdirSync(
        join(process.cwd(), "lib", "db", "migrations"),
      ).filter((name) => name.endsWith(".sql")).length;

      expect(migrationCount).toEqual({ count: expectedMigrationCount });
      expect(attemptColumns).toContain("source_event_id");
    } finally {
      db.close();
    }
  });

  it("rolls back a failed migration and reports its filename", () => {
    const directory = makeTempDir("migration-failure-");
    const migrationsDir = join(directory, "migrations");
    const db = new Database(join(directory, "test.sqlite"));
    mkdirSync(migrationsDir);
    writeFileSync(
      join(migrationsDir, "0001_broken.sql"),
      "CREATE TABLE broken (id TEXT PRIMARY KEY); THIS IS NOT SQL;",
      "utf8",
    );

    try {
      expect(() =>
        applyMigrations(db, {
          migrationsDir,
          now: () => "2026-07-11T00:00:00.000Z",
        }),
      ).toThrow("Migration 0001_broken.sql failed");

      const migrationCount = db
        .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get();
      const brokenTable = db
        .prepare<[], { readonly name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'broken'")
        .get();

      expect(migrationCount).toEqual({ count: 0 });
      expect(brokenTable).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```powershell
npm run test -- tests/unit/migrations.test.ts
```

Expected: FAIL because `@/lib/db/migrations` does not exist yet. Do not proceed if the test passes for another reason.

- [ ] **Step 3: Implement the reusable migration function**

Create `lib/db/migrations.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";

type MigrationRow = {
  readonly id: string;
};

export type MigrationOptions = {
  readonly migrationsDir?: string;
  readonly now?: () => string;
};

export function applyMigrations(
  db: Database.Database,
  options: MigrationOptions = {},
): void {
  const migrationsDir =
    options.migrationsDir ?? join(process.cwd(), "lib", "db", "migrations");
  const now = options.now ?? (() => new Date().toISOString());

  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );

  const applied = new Set(
    db
      .prepare<[], MigrationRow>("SELECT id FROM schema_migrations")
      .all()
      .map((row) => row.id),
  );

  const fileNames = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const fileName of fileNames) {
    if (applied.has(fileName)) continue;

    const sql = readFileSync(join(migrationsDir, fileName), "utf8");
    try {
      const transaction = db.transaction(() => {
        db.exec(sql);
        db
          .prepare<[string, string]>(
            "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
          )
          .run(fileName, now());
      });
      transaction();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${fileName} failed: ${message}`, { cause: error });
    }
  }
}
```

- [ ] **Step 4: Replace the migration CLI with a thin adapter**

Replace `lib/db/migrate.ts` with:

```ts
import { openDatabase } from "./client";
import { applyMigrations } from "./migrations";

const db = openDatabase();

try {
  applyMigrations(db);
} finally {
  db.close();
}
```

- [ ] **Step 5: Make the capture API tests use the real migration runner**

In `tests/unit/captureApi.test.ts`, replace the filesystem import and add the migration import:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import type { CaptureEvent } from "@/lib/capture/events";
```

Replace the body of the `try` block in `beforeEach` with:

```ts
  try {
    applyMigrations(db, { now: () => "2026-07-11T00:00:00.000Z" });
  } finally {
    db.close();
  }
```

- [ ] **Step 6: Run migration and API tests**

Run:

```powershell
npm run test -- tests/unit/migrations.test.ts tests/unit/captureApi.test.ts
```

Expected: both test files pass; the migration test reports 2 passing tests and the capture API tests remain green.

- [ ] **Step 7: Verify the CLI contract and strict types**

Run with an isolated temporary database so the command cannot touch user data:

```powershell
$env:TRAINING_DB_PATH = Join-Path $env:TEMP 'ai-training-plan-migration-check.sqlite'
npm run db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Remove-Item -LiteralPath $env:TRAINING_DB_PATH -Force
Remove-Item -LiteralPath "$env:TRAINING_DB_PATH-journal" -Force -ErrorAction SilentlyContinue
```

Expected: `npm run db:migrate` exits 0 and the explicitly named temporary files are removed.

Run:

```powershell
npm run typecheck
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 8: Commit the reusable migration runner**

```powershell
$env:GIT_MASTER='1'; git add lib/db/migrations.ts lib/db/migrate.ts tests/unit/migrations.test.ts tests/unit/captureApi.test.ts
$env:GIT_MASTER='1'; git commit -m "test: reuse database migrations in isolated tests"
```

Expected: one commit containing only the four listed files. Do not stage `IDEA.md` or `.gitignore` in this commit.

---

### Task 2: Add the Disposable Playwright Database Lifecycle

**Files:**
- Create: `tests/e2e/database.ts`
- Create: `tests/e2e/prepare.ts`
- Create: `tests/e2e/global-teardown.ts`
- Create: `tests/e2e/isolation.spec.ts`
- Create: `tests/unit/e2eDatabase.test.ts`
- Modify: `playwright.config.ts:1-28`
- Modify: `package.json:6-17`
- Modify: `.gitignore:34-54`

**Interfaces:**
- Consumes: `applyMigrations(db)` from Task 1 and the existing `TRAINING_DB_PATH` contract from `lib/db/client.ts`.
- Produces: `E2E_ROOT`, `E2E_DB_PATH`, `prepareE2eDatabase(): void`, and `cleanupE2eDatabase(): void`.
- Guarantees: the Playwright server and all test workers resolve the same database under `<workspace>/.tmp/playwright`.

- [ ] **Step 1: Write the failing E2E database lifecycle unit test**

Create `tests/unit/e2eDatabase.test.ts`:

```ts
import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupE2eDatabase,
  E2E_DB_PATH,
  E2E_ROOT,
  prepareE2eDatabase,
} from "@/tests/e2e/database";

afterEach(() => {
  cleanupE2eDatabase();
});

describe("E2E database lifecycle", () => {
  it("prepares a migrated database only under the workspace temp root", () => {
    const workspaceTempRoot = resolve(process.cwd(), ".tmp");
    const defaultDatabasePath = resolve(process.cwd(), "training-platform.sqlite");

    prepareE2eDatabase();

    expect(relative(workspaceTempRoot, E2E_ROOT)).toBe("playwright");
    expect(resolve(E2E_DB_PATH)).not.toBe(defaultDatabasePath);
    expect(existsSync(E2E_DB_PATH)).toBe(true);

    const db = new Database(E2E_DB_PATH, { readonly: true });
    try {
      const migrationCount = db
        .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get();
      const expectedMigrationCount = readdirSync(
        resolve(process.cwd(), "lib", "db", "migrations"),
      ).filter((name) => name.endsWith(".sql")).length;
      expect(migrationCount).toEqual({ count: expectedMigrationCount });
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run the lifecycle test and verify the missing module failure**

Run:

```powershell
npm run test -- tests/unit/e2eDatabase.test.ts
```

Expected: FAIL because `@/tests/e2e/database` does not exist.

- [ ] **Step 3: Implement guarded E2E paths and lifecycle functions**

Create `tests/e2e/database.ts`:

```ts
import { mkdirSync, rmSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "../../lib/db/migrations";

const WORKSPACE_TEMP_ROOT = resolve(process.cwd(), ".tmp");

export const E2E_ROOT = resolve(WORKSPACE_TEMP_ROOT, "playwright");
export const E2E_DB_PATH = resolve(E2E_ROOT, "training-platform.sqlite");

function assertSafeE2eRoot(): void {
  const relativePath = relative(WORKSPACE_TEMP_ROOT, E2E_ROOT);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith("..\\") ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe E2E cleanup path: ${E2E_ROOT}`);
  }
}

export function cleanupE2eDatabase(): void {
  assertSafeE2eRoot();
  rmSync(E2E_ROOT, { recursive: true, force: true });
}

export function prepareE2eDatabase(): void {
  cleanupE2eDatabase();
  mkdirSync(E2E_ROOT, { recursive: true });

  const db = new Database(E2E_DB_PATH);
  try {
    applyMigrations(db, { now: () => "2026-07-11T00:00:00.000Z" });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Add the preparation and teardown entrypoints**

Create `tests/e2e/prepare.ts`:

```ts
import { prepareE2eDatabase } from "./database";

prepareE2eDatabase();
```

Create `tests/e2e/global-teardown.ts`:

```ts
import { cleanupE2eDatabase } from "./database";

export default function globalTeardown(): void {
  cleanupE2eDatabase();
}
```

- [ ] **Step 5: Add the internal preparation script**

In `package.json`, add `e2e:prepare` next to `e2e`:

```json
"e2e": "playwright test",
"e2e:prepare": "tsx tests/e2e/prepare.ts",
```

Do not change the public `npm run e2e` command.

- [ ] **Step 6: Replace the Playwright configuration**

Replace `playwright.config.ts` with:

```ts
import { defineConfig, devices } from "@playwright/test";
import { E2E_DB_PATH } from "./tests/e2e/database";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

process.env.TRAINING_DB_PATH = E2E_DB_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run e2e:prepare && npm run dev -- -p ${PORT}`,
    env: {
      TRAINING_DB_PATH: E2E_DB_PATH,
    },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
```

`webServer` plugins start before Playwright `globalSetup`, so database preparation intentionally lives in the owned server command rather than a `globalSetup` hook. `globalTeardown` performs cleanup after tests.

- [ ] **Step 7: Ignore the disposable root**

Add this block to `.gitignore` after the SQLite patterns:

```gitignore
# test runtime data
/.tmp/playwright/
```

Keep the existing `.superpowers/` ignore entry unchanged.

- [ ] **Step 8: Run the lifecycle unit test and strict typecheck**

Run:

```powershell
npm run test -- tests/unit/e2eDatabase.test.ts
npm run typecheck
```

Expected: the lifecycle test passes, `.tmp/playwright` is removed by `afterEach`, and typecheck exits 0.

- [ ] **Step 9: Add an E2E isolation guard**

Create `tests/e2e/isolation.spec.ts`:

```ts
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openDatabase } from "@/lib/db/client";
import { E2E_DB_PATH } from "./database";

test("uses the migrated disposable database", () => {
  const defaultDatabasePath = resolve(process.cwd(), "training-platform.sqlite");
  const configuredPath = process.env.TRAINING_DB_PATH;

  expect(configuredPath).toBe(E2E_DB_PATH);
  expect(resolve(configuredPath ?? defaultDatabasePath)).not.toBe(defaultDatabasePath);

  const db = openDatabase();
  try {
    const migrationCount = db
      .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
      .get();
    const expectedMigrationCount = readdirSync(
      resolve(process.cwd(), "lib", "db", "migrations"),
    ).filter((name) => name.endsWith(".sql")).length;

    expect(resolve(db.name)).toBe(resolve(E2E_DB_PATH));
    expect(migrationCount).toEqual({ count: expectedMigrationCount });
  } finally {
    db.close();
  }
});
```

- [ ] **Step 10: Run the isolated E2E guard**

Run:

```powershell
npm run e2e -- tests/e2e/isolation.spec.ts
```

Expected: 1 test passes; Playwright starts its own server; `.tmp/playwright` does not exist after global teardown.

Verify cleanup:

```powershell
Test-Path '.tmp\playwright'
```

Expected: `False`.

- [ ] **Step 11: Commit the disposable E2E lifecycle**

```powershell
$env:GIT_MASTER='1'; git add tests/e2e/database.ts tests/e2e/prepare.ts tests/e2e/global-teardown.ts tests/e2e/isolation.spec.ts tests/unit/e2eDatabase.test.ts playwright.config.ts package.json .gitignore
$env:GIT_MASTER='1'; git commit -m "test: isolate Playwright database lifecycle"
```

Expected: one commit containing only the listed lifecycle, configuration, package script, and ignore files. `IDEA.md` remains unstaged.

---

### Task 3: Repair the Clean-Database Growth Smoke Test

**Files:**
- Modify: `tests/e2e/coach-growth.spec.ts:13-18`

**Interfaces:**
- Consumes: the disposable empty `training_attempts` table produced by Task 2.
- Produces: one smoke assertion that accepts either the complete empty-state sentence or the populated distribution heading.
- Preserves: both valid Growth UI states; it does not weaken the test to a generic page-level selector.

- [ ] **Step 1: Reproduce the existing clean-database failure**

Run:

```powershell
npm run e2e -- tests/e2e/coach-growth.spec.ts -g "growth renders local training data surface"
```

Expected: FAIL at the current exact-text assertion because the page renders `No attempt data yet. Captured sessions will appear here after Phase 2.2 materializes them.` rather than an element whose entire text is `No attempt data yet`.

- [ ] **Step 2: Replace the brittle assertion**

Replace the test at `tests/e2e/coach-growth.spec.ts:13-18` with:

```ts
  test("growth renders local training data surface", async ({ page }) => {
    await page.goto("/growth");

    await expect(page.getByRole("heading", { name: "Growth" })).toBeVisible();
    const emptyState = page.getByText(/No attempt data yet\./);
    const populatedState = page.getByRole("heading", { name: "Result distribution" });
    await expect(emptyState.or(populatedState)).toBeVisible();
  });
```

- [ ] **Step 3: Run the focused regression test**

Run:

```powershell
npm run e2e -- tests/e2e/coach-growth.spec.ts -g "growth renders local training data surface"
```

Expected: 1 test passes on a freshly prepared database.

- [ ] **Step 4: Run the complete browser suite**

Run:

```powershell
npm run e2e
```

Expected: 10 tests pass using 1 worker: 5 catalog tests, 4 Coach/Growth tests, and 1 isolation guard. The Playwright-owned server stops automatically.

- [ ] **Step 5: Commit the clean-state regression**

```powershell
$env:GIT_MASTER='1'; git add tests/e2e/coach-growth.spec.ts
$env:GIT_MASTER='1'; git commit -m "test: cover clean Growth state"
```

Expected: one commit containing only the Growth smoke test change.

---

### Task 4: Document and Verify the Safe QA Lifecycle

**Files:**
- Modify: `README.md:15-34`
- Modify: `docs/runbook.md:1-12`
- Modify: `docs/runbook.md:34-71`

**Interfaces:**
- Consumes: the paths and behavior introduced in Tasks 1–3.
- Produces: user-facing documentation that states exactly which database E2E owns, when it is removed, and why port reuse is forbidden.
- Verifies: the user's default database hash remains unchanged across a complete browser run.

- [ ] **Step 1: Add the product direction document to README**

Under `README.md` → `## Project Docs`, insert:

```markdown
- `IDEA.md` defines the long-term product direction, learning model, and phased development roadmap.
```

- [ ] **Step 2: Replace the README E2E lifecycle paragraph**

Replace the paragraph immediately after the command block with:

```markdown
`npm run e2e` creates a freshly migrated database at `.tmp/playwright/training-platform.sqlite`, starts and stops its own Next.js server, and removes the disposable database afterward. It never reuses a server on port 3000 and never writes to the default `training-platform.sqlite`.
```

- [ ] **Step 3: Update the runbook setup and verification text**

Change the runbook update date to:

```markdown
Last updated: 2026-07-11
```

Replace the database paragraph under `## Setup` with:

```markdown
The default development database is `training-platform.sqlite`. Set `TRAINING_DB_PATH` for any manual isolated run. Playwright does this automatically and exclusively uses `.tmp/playwright/training-platform.sqlite`.
```

Replace the paragraph after the verification command block with:

```markdown
`npm run e2e` owns the Next.js server and an isolated SQLite lifecycle. It deletes and recreates `.tmp/playwright`, applies every repository migration, runs tests serially against that database, then removes it during global teardown. A process already listening on port 3000 is treated as an error; stop it rather than reusing an unknown server or database.
```

- [ ] **Step 4: Add E2E database troubleshooting**

Insert this section before `### Playwright browser is missing`:

```markdown
### E2E database cleanup did not finish

Expected state after `npm run e2e`: `.tmp/playwright` does not exist. If an interrupted run leaves it behind, first confirm no Playwright-owned Next.js process is running, then remove only the resolved `<workspace>/.tmp/playwright` directory. Never delete or replace `training-platform.sqlite` while cleaning test data.
```

- [ ] **Step 5: Verify documentation contains the exact safety contract**

Run:

```powershell
Select-String -Path README.md,docs\runbook.md -Pattern '\.tmp/playwright/training-platform\.sqlite|never writes to the default|Never delete or replace'
```

Expected: matches appear in both `README.md` and `docs/runbook.md`; the three safety concepts are present.

- [ ] **Step 6: Prove E2E does not modify the default database**

Run from the repository root. This handles both an existing user database and a fresh clone where the default database has not been created:

```powershell
$defaultPath = 'training-platform.sqlite'
$existedBefore = Test-Path -LiteralPath $defaultPath
$before = if ($existedBefore) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $defaultPath).Hash
} else {
  $null
}
npm run e2e
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$existsAfter = Test-Path -LiteralPath $defaultPath
if ($existedBefore -ne $existsAfter) { throw 'E2E changed whether training-platform.sqlite exists' }
if ($existedBefore) {
  $after = (Get-FileHash -Algorithm SHA256 -LiteralPath $defaultPath).Hash
  if ($before -ne $after) { throw 'E2E modified training-platform.sqlite' }
}
if (Test-Path '.tmp\playwright') { throw 'E2E cleanup left .tmp/playwright behind' }
```

Expected: 10 Playwright tests pass; no exception is thrown; the default database remains unchanged or absent; `.tmp/playwright` is absent.

- [ ] **Step 7: Run the remaining full handoff gates**

Run each command separately:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run extension:build
npm run build
```

Expected:

- migration command exits 0;
- every Vitest file passes with zero failures;
- TypeScript exits 0;
- extension build completes and emits `extension/dist` artifacts;
- Next.js production build completes with exit 0.

- [ ] **Step 8: Commit the QA documentation**

```powershell
$env:GIT_MASTER='1'; git add README.md docs/runbook.md
$env:GIT_MASTER='1'; git commit -m "docs: describe isolated E2E database"
```

Expected: one documentation-only commit. Do not stage `IDEA.md` or the implementation plan unless the user separately asks to commit planning documents.

## Final Acceptance Checklist

- [ ] `applyMigrations` is the only repository migration loop used by the CLI and API tests.
- [ ] Re-running migrations is idempotent.
- [ ] A failed migration is rolled back and includes its filename in the error.
- [ ] `npm run e2e` always prepares `.tmp/playwright/training-platform.sqlite` before server start.
- [ ] Playwright never reuses a process already listening on port 3000.
- [ ] E2E tests run with one worker while they share mutable SQLite state.
- [ ] The browser suite contains an isolation guard and reports 10 passing tests.
- [ ] The clean Growth empty state passes without relying on contaminated data.
- [ ] Global teardown removes `.tmp/playwright` after every completed run, including test failures; interrupted-run cleanup is documented.
- [ ] The SHA-256 of `training-platform.sqlite` is unchanged by E2E.
- [ ] README and runbook describe the isolated lifecycle accurately.
- [ ] Unit tests, typecheck, extension build, and production build all exit 0.

## Follow-on Plans

After this plan is implemented and accepted, write the next plans in this order:

1. `2026-07-11-phase-0b-capture-session-protocol.md`
2. `2026-07-11-phase-0c-query-and-analytics-correctness.md`
3. `2026-07-11-phase-0d-engineering-quality-gates.md`

Each follow-on plan must preserve the disposable database contract established here.
