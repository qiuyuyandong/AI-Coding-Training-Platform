# Phase 0D Engineering Quality Gates Implementation Plan

**Status:** Completed and fully verified on 2026-07-15. This plan completed
Phase 0D only; Phase 0 was still open at that point, then closed on 2026-07-17
after AtCoder production certification. Evidence:
`work/reports/phase-0d-engineering-gates.md`. Handoff:
`work/handoff-current.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible lint, migration, extension, CI, and documentation gate without touching the default SQLite database or weakening the repository's local-first boundaries.

**Architecture:** One root ESLint flat configuration supplies a strict explicit lint command. Existing migration tests gain a prefix-by-prefix upgrade matrix, extension verification gets a focused test/build/dist-parity command, and one Node quality-gate runner owns a disposable migration database before invoking every documented gate. A Windows GitHub Actions workflow calls that same runner, so local and CI order cannot drift.

**Tech Stack:** Next.js 15.3.6 App Router, React 19, strict TypeScript 5.8, ESLint 9 flat config, Vitest 3, Playwright 1.53, SQLite/`better-sqlite3`, Chrome MV3/esbuild, GitHub Actions on Windows.

## Global Constraints

- Work only on Phase 0D. Do not promote any platform adapter, fabricate Luogu evidence, change the certification standard, or begin Phase 1/V0 work.
- Preserve every pre-existing user or agent change. At handoff, `docs/superpowers/plans/2026-07-11-product-development-roadmap.md` may appear modified even when its normalized diff is empty; classify it before editing or staging it.
- Before every Git command in this repository, set `$env:GIT_MASTER='1';` in the same PowerShell command.
- Commits are authorized task-by-task by this execution plan. Do not push, create a PR, or rewrite history.
- Never run migrations or quality gates against `training-platform.sqlite`. Unit tests use in-memory or OS-temporary databases; E2E owns `.tmp/playwright/training-platform.sqlite`; the aggregate gate creates its own OS-temporary database.
- Keep TypeScript strict. Do not add `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, non-null assertions, or lint-disable comments/configuration.
- Do not disable Next.js build linting and do not reduce an error to a warning merely to make a gate pass.
- CI may install dependencies and Chromium, but application/test code must not call external LLM, analytics, sync, OJ, or third-party data APIs.
- `extension/dist` remains generated and ignored. Never stage or commit it.
- Phase 0D may be marked complete only after the fresh full gate passes. Phase 0 itself must remain in progress/BLOCKED until the separate production-adapter exit condition is satisfied or superseded by an explicit design decision.

## Execution Protocol

Before Task 1, run:

```powershell
$env:GIT_MASTER='1'; git status --short --branch
$env:GIT_MASTER='1'; git diff -- docs/superpowers/plans/2026-07-11-product-development-roadmap.md
$env:GIT_MASTER='1'; git log -5 --oneline
```

Expected baseline: branch `feature/v1-followup`; this new plan may be untracked or committed by the Commander; any other modification must be classified before work begins. Do not clean, reset, checkout, stash, or stage unrelated changes.

---

### Task 1: Install and enforce the explicit strict lint gate

**Files:**

- Create: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify only if reported by ESLint: the exact source/test/config files named by the lint output

**Interfaces:**

- Produces `npm run lint`, defined as `eslint . --max-warnings=0`.
- Uses Next.js 15's `next/core-web-vitals` and `next/typescript` presets through `FlatCompat`.
- Produces no runtime code or API behavior.

- [x] **Step 1: Prove the gate is currently absent**

Run:

```powershell
npm run lint
```

Expected: FAIL with `Missing script: "lint"`.

- [x] **Step 2: Install the matching lint toolchain**

Run:

```powershell
npm install --save-dev eslint@^9.30.0 eslint-config-next@15.3.6 @eslint/eslintrc@^3.3.1
```

Expected: `package.json` and `package-lock.json` change; `eslint-config-next` exactly matches installed Next.js `15.3.6`.

- [x] **Step 3: Add the flat configuration**

Create `eslint.config.mjs`:

```js
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".superpowers/**",
      ".tmp/**",
      ".worktrees/**",
      "extension/dist/**",
      "node_modules/**",
      "test-results/**",
    ],
  },
  ...compat.config({
    extends: ["next/core-web-vitals", "next/typescript"],
  }),
];

export default eslintConfig;
```

Add this script to `package.json` immediately before `typecheck`:

```json
"lint": "eslint . --max-warnings=0",
```

- [x] **Step 4: Run lint and fix findings without suppression**

Run:

```powershell
npm run lint
```

Expected: PASS with exit code 0 and zero warnings. If ESLint reports findings, make the smallest semantic fix in each named file: remove genuinely unused imports/variables, correct hook dependency ownership, or replace unsafe syntax with an explicitly typed alternative. Do not add disable comments, ignored source paths, downgraded rules, or broad refactors. Re-run until exit code 0.

- [x] **Step 5: Re-run the adjacent compiler and unit gates**

Run:

```powershell
npm run typecheck
npm run test
```

Expected: both PASS; the existing host-dependent file-symlink capability skip is acceptable only if its EPERM explanation remains explicit and all mandatory tests pass.

- [x] **Step 6: Commit the lint gate**

Review and stage only Task 1 files:

```powershell
$env:GIT_MASTER='1'; git diff --check
$env:GIT_MASTER='1'; git status --short
$env:GIT_MASTER='1'; git add -- eslint.config.mjs package.json package-lock.json
$env:GIT_MASTER='1'; git add -p
$env:GIT_MASTER='1'; git commit -m "chore: add strict lint gate"
```

Skip `git add -p` when lint required no source changes. If it is needed, accept only the reviewed ESLint-fix hunks and reject every unrelated hunk, especially the pre-existing roadmap change.

---

### Task 2: Complete the migration upgrade matrix

**Files:**

- Modify: `tests/unit/migrations.test.ts`

**Interfaces:**

- Consumes `applyMigrations(db, { migrationsDir, now })` from `lib/db/migrations.ts` unchanged.
- Produces coverage for fresh apply, idempotent replay, rollback, and upgrade from every supported migration prefix.
- Retains the existing data-preservation characterizations for the 0002, 0003, and 0004 boundaries.

- [x] **Step 1: Add migration-list and prefix-copy helpers**

Near `makeTempDir`, add:

```ts
function repositoryMigrationNames(): readonly string[] {
  return readdirSync(join(process.cwd(), "lib", "db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function copyMigrationPrefix(
  destination: string,
  migrationNames: readonly string[],
  count: number,
): void {
  mkdirSync(destination);
  for (const name of migrationNames.slice(0, count)) {
    copyFileSync(
      join(process.cwd(), "lib", "db", "migrations", name),
      join(destination, name),
    );
  }
}

function appliedMigrationIds(db: Database.Database): readonly string[] {
  return db
    .prepare<[], { readonly id: string }>(
      "SELECT id FROM schema_migrations ORDER BY id",
    )
    .all()
    .map((row) => row.id);
}
```

Replace the inline `readdirSync(...).filter(...)` count in the fresh-database test with `repositoryMigrationNames().length`.

- [x] **Step 2: Add the prefix-by-prefix upgrade test**

Add after the fresh/idempotent test:

```ts
it("upgrades every supported schema prefix to the current schema", () => {
  const migrationNames = repositoryMigrationNames();

  for (let prefixLength = 1; prefixLength < migrationNames.length; prefixLength += 1) {
    const directory = makeTempDir(`migration-prefix-${prefixLength}-`);
    const oldMigrationsDir = join(directory, "old-migrations");
    const db = new Database(join(directory, "test.sqlite"));
    copyMigrationPrefix(oldMigrationsDir, migrationNames, prefixLength);

    try {
      const options = { now: () => "2026-07-15T00:00:00.000Z" };
      applyMigrations(db, { ...options, migrationsDir: oldMigrationsDir });
      expect(appliedMigrationIds(db)).toEqual(migrationNames.slice(0, prefixLength));

      applyMigrations(db, options);
      expect(appliedMigrationIds(db)).toEqual(migrationNames);
      expect(
        db.prepare<[], { readonly table: string }>("PRAGMA foreign_key_check").all(),
      ).toEqual([]);
      expect(
        db.prepare<[], { readonly quick_check: string }>("PRAGMA quick_check").get(),
      ).toEqual({ quick_check: "ok" });

      applyMigrations(db, options);
      expect(appliedMigrationIds(db)).toEqual(migrationNames);
    } finally {
      db.close();
    }
  }
});
```

- [x] **Step 3: Verify the migration suite**

Run:

```powershell
npm run test -- tests/unit/migrations.test.ts
```

Expected: PASS with six migration tests: fresh/idempotent, every-prefix upgrade, rollback, V1 cutover, credential preservation, and manual-correction preservation.

- [x] **Step 4: Commit the matrix**

```powershell
$env:GIT_MASTER='1'; git diff --check
$env:GIT_MASTER='1'; git add -- tests/unit/migrations.test.ts
$env:GIT_MASTER='1'; git commit -m "test: cover migration upgrade matrix"
```

---

### Task 3: Add extension test/build/dist parity

**Files:**

- Create: `vitest.extension.config.ts`
- Create: `scripts/check-extension-dist.mjs`
- Modify: `package.json`
- Modify: `package-lock.json` only if npm rewrites lock metadata

**Interfaces:**

- Produces `npm run extension:test` for extension-owned unit and certification tests.
- Produces `npm run extension:check` for typecheck, extension tests, MV3 build, output parity, and Git-ignore verification.
- Consumes the existing `extension/build.mjs` output contract: `background.js`, `content.js`, `popup.js`, source maps, `manifest.json`, and `popup.html` under `extension/dist`.

- [x] **Step 1: Prove the focused test command is absent**

Run:

```powershell
npm run extension:test
```

Expected: FAIL with `Missing script: "extension:test"`.

Evidence: red proof captured as `npm error Missing script: "extension:test"` at 2026-07-15T15:47 (pre-edit `package.json`).

- [x] **Step 2: Create the focused Vitest configuration**

Create `vitest.extension.config.ts`:

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        "tests/unit/extension*.test.ts",
        "tests/unit/luoguFixtureLoader.test.ts",
        "tests/unit/platformCertification.test.ts",
      ],
    },
  }),
);
```

Evidence: file created verbatim from plan, no forbidden patterns (`any` / `as any` / `as unknown` / `@ts-ignore` / `@ts-expect-error` / `!` non-null / eslint-disable).

- [x] **Step 3: Create the generated-output checker**

Create `scripts/check-extension-dist.mjs`:

```js
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const extensionDir = join(root, "extension");
const distDir = join(extensionDir, "dist");
const requiredFiles = [
  "background.js",
  "background.js.map",
  "content.js",
  "content.js.map",
  "manifest.json",
  "popup.html",
  "popup.js",
  "popup.js.map",
];

for (const name of requiredFiles) {
  if (!existsSync(join(distDir, name))) {
    throw new Error(`Missing extension build output: extension/dist/${name}`);
  }
}

for (const name of ["manifest.json", "popup.html"]) {
  const sourcePath = name === "manifest.json"
    ? join(extensionDir, name)
    : join(extensionDir, "src", name);
  const outputPath = join(distDir, name);
  if (readFileSync(sourcePath, "utf8") !== readFileSync(outputPath, "utf8")) {
    throw new Error(`Extension output differs from source: ${name}`);
  }
}

const ignored = spawnSync(
  "git",
  ["check-ignore", "--quiet", "extension/dist/content.js"],
  {
    cwd: root,
    env: { ...process.env, GIT_MASTER: "1" },
    stdio: "inherit",
  },
);
if (ignored.status !== 0) {
  throw new Error("extension/dist is not ignored by Git");
}
```

Evidence: file created verbatim from plan; spawned `git check-ignore` propagates `GIT_MASTER=1`; all 8 required outputs verified present; `manifest.json` (1078 bytes) and `popup.html` (1874 bytes) byte-match their sources via `Compare-Object`.

- [x] **Step 4: Wire the extension scripts**

Change the extension scripts in `package.json` to:

```json
"extension:test": "vitest run --config vitest.extension.config.ts",
"extension:build": "node extension/build.mjs",
"extension:check": "npm run typecheck && npm run extension:test && npm run extension:build && node scripts/check-extension-dist.mjs"
```

Evidence: `package.json` scripts updated to exact plan strings; `extension:build` contract unchanged; `extension:check` now chains `typecheck → extension:test → extension:build → scripts/check-extension-dist.mjs`.

- [x] **Step 5: Verify focused parity and the full unit suite**

Run:

```powershell
npm run extension:check
npm run test
$env:GIT_MASTER='1'; git status --short --ignored extension/dist
```

Expected: both npm commands PASS; Git reports `!! extension/dist/`; no `extension/dist` file appears as staged or untracked.

Evidence:
- `npm run extension:check` PASS — `tsc --noEmit` clean, `vitest` 11 files / 110 tests passed across the focused include list, `extension/build.mjs` regenerated all 8 outputs, `check-extension-dist.mjs` verified output parity and `git check-ignore` exit 0.
- `npm run test` PASS — 28 files / 235 tests passed (1 EPERM-skipped file-symlink capability, accepted).
- `$env:GIT_MASTER='1'; git status --short --ignored extension/dist` reports `!! extension/dist/`.

- [x] **Step 6: Commit extension parity**

```powershell
$env:GIT_MASTER='1'; git diff --check
$env:GIT_MASTER='1'; git add -- vitest.extension.config.ts scripts/check-extension-dist.mjs package.json package-lock.json
$env:GIT_MASTER='1'; git commit -m "test: add extension parity gate"
```

If `package-lock.json` did not change, omit it from `git add`.

Evidence: `git diff --check` clean (only the pre-existing roadmap LF/CRLF warning, not staged); `package-lock.json` unchanged by `npm` (omitted from `git add`); commit `59a6ecc` on `feature/v1-followup` — subject `test: add extension parity gate`, 3 files changed, 63 insertions, 1 deletion; `extension/dist/` remains ignored and unstaged.

---

### Task 4: Add one disposable aggregate gate and Windows CI parity

**Files:**

- Create: `scripts/quality-gate.mjs`
- Create: `.github/workflows/quality-gate.yml`
- Modify: `package.json`

**Interfaces:**

- Produces `npm run quality:gate`, which runs lint, disposable migration, unit tests, typecheck, E2E, extension parity, and production build in that order.
- The runner owns and removes an OS-temporary `TRAINING_DB_PATH`; it never opens the repository default database.
- GitHub Actions invokes only the same aggregate command after dependency and Chromium installation.

- [x] **Step 1: Record the default database metadata before adding the runner**

Run:

```powershell
$defaultDb = Get-Item -LiteralPath 'training-platform.sqlite'
@{ Length = $defaultDb.Length; LastWriteTimeUtc = $defaultDb.LastWriteTimeUtc.ToString('O') } | ConvertTo-Json
```

Save the two values in the Task 4 execution notes; do not hash or open the database.

Evidence: metadata-only `Get-Item` captured `Length: 73728` and `LastWriteTimeUtc: 2026-07-13T17:49:36.9126118Z`; the default database was not opened or hashed.

- [x] **Step 2: Create the safe aggregate runner**

Create `scripts/quality-gate.mjs`:

```js
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = mkdtempSync(join(tmpdir(), "ai-training-quality-gate-"));
const trainingDbPath = join(directory, "training-platform.sqlite");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const commands = [
  ["run", "lint"],
  ["run", "db:migrate"],
  ["run", "test"],
  ["run", "typecheck"],
  ["run", "e2e"],
  ["run", "extension:check"],
  ["run", "build"],
];
let exitCode = 0;

try {
  for (const args of commands) {
    const result = spawnSync(npmCommand, args, {
      cwd: process.cwd(),
      env: { ...process.env, TRAINING_DB_PATH: trainingDbPath },
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

process.exitCode = exitCode;
```

Add to `package.json`:

```json
"quality:gate": "node scripts/quality-gate.mjs",
```

Evidence: `scripts/quality-gate.mjs` uses `mkdtempSync(tmpdir())`, passes its database path through `TRAINING_DB_PATH`, runs the seven commands in order, stops on a non-zero result, and cleans up in `finally`. Windows Node v24.13.0 required `shell: process.platform === "win32"` for `npm.cmd`; the runner also retains the plan's `rmSync` and uses a link-safe `unlinkSync`/`rmdirSync` fallback because `rmSync` alone left files under this host's Unicode OS temp path.

- [x] **Step 3: Add the Windows workflow**

Create `.github/workflows/quality-gate.yml`:

```yaml
name: quality-gate

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: windows-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run quality:gate
```

Do not add deployment, secrets, artifact upload containing databases, or external product/data calls.

Evidence: `.github/workflows/quality-gate.yml` uses `windows-latest`, Node 22, `npm ci`, Chromium installation, and only `npm run quality:gate` for the repository gate; no deployment, secrets, database artifacts, or external product/data calls were added.

- [x] **Step 4: Run the aggregate gate and prove default-DB preservation**

Run:

```powershell
npm run quality:gate
$defaultDb = Get-Item -LiteralPath 'training-platform.sqlite'
@{ Length = $defaultDb.Length; LastWriteTimeUtc = $defaultDb.LastWriteTimeUtc.ToString('O') } | ConvertTo-Json
```

Expected: aggregate gate PASS. The final length and UTC modification time exactly match Step 1. `.tmp/playwright` and the OS-temporary quality-gate directory are removed.

Evidence: `npm run quality:gate` PASS in the authoritative order: lint PASS; `db:migrate` PASS; unit tests PASS with 28 files / 235 passed / 1 EPERM skip; typecheck PASS; E2E PASS with 16 tests; `extension:check` PASS with 11 files / 110 tests plus expected extension build output; production build PASS with successful compilation and 16 generated static pages. The final default database metadata was `Length: 73728`, `LastWriteTimeUtc: 2026-07-13T17:49:36.9126118Z`; exact comparison to Step 1 was true. `.tmp/playwright` and all `ai-training-quality-gate-*` OS temp directories were absent after cleanup.

- [x] **Step 5: Commit the aggregate/CI gate**

```powershell
$env:GIT_MASTER='1'; git diff --check
$env:GIT_MASTER='1'; git add -- scripts/quality-gate.mjs .github/workflows/quality-gate.yml package.json
$env:GIT_MASTER='1'; git commit -m "ci: mirror Phase 0 quality gates"
```

Evidence: `git diff --check` passed with only pre-existing LF/CRLF warnings outside the staged files; commit `970a9bf` (`ci: mirror Phase 0 quality gates`) contains exactly `.github/workflows/quality-gate.yml`, `package.json`, and `scripts/quality-gate.mjs`. The default database, `extension/dist/`, temp state, roadmap, and this untracked plan were not staged.

#### Post-commit Task 4 correction (link-safe cleanup)

Independent audit found the original `removePath` traversed any `isDirectory()` path without checking `isSymbolicLink()`. The runner now mirrors the canonical safe-delete pattern in `tests/e2e/database.ts`: `lstatSync` first, then the `isSymbolicLink() || isDirectory() === false` guard, and only then `readdirSync` traversal; console comments document the Windows `npm.cmd` shell requirement and the `rmSync` + `removePath` fallback. Sequential edits preserved fixed command args and the lint → db:migrate → test → typecheck → e2e → extension:check → build order.

Evidence: default database metadata before/after `npm run quality:gate` — `Length: 73728` and `LastWriteTimeUtc: 2026-07-13T17:49:36.9126118Z` matched exactly without opening, hashing, or migrating the default DB. Final stage counts from the authoritative run: lint PASS; `db:migrate` PASS; unit tests 28 files / 235 passed / 1 EPERM skip; typecheck PASS; E2E 16 passed; `extension:check` 11 files / 110 tests plus expected `extension/dist` build output; production build PASS with 16/16 generated static pages. `.tmp/playwright` was absent; all `ai-training-quality-gate-*` OS temp directories were absent; `git check-ignore -v extension/dist/content.js` resolved to `.gitignore:12:dist/` confirming `extension/dist/` remains ignored. `git diff --check` clean for the staged file; only `scripts/quality-gate.mjs` was staged. Follow-up commit `7cb6169` (`fix: make quality gate cleanup link-safe`, 1 file changed, 19 insertions, 8 deletions) contains exactly that staged file; the original `970a9bf` commit, `970a9bf` was not rewritten.

---

### Task 5: Reconcile operational documentation and Phase status

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbook.md`
- Modify: `COMPLIANCE.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/2026-07-11-phase-0-reliability-baseline.md`
- Modify carefully after classifying pre-existing changes: `docs/superpowers/plans/2026-07-11-product-development-roadmap.md`
- Modify at completion: `docs/superpowers/plans/2026-07-15-phase-0d-engineering-quality-gates.md`
- Create: `work/reports/phase-0d-engineering-gates.md`
- Create: `work/handoff-current.md`

**Interfaces:**

- Documents `npm run lint`, `npm run extension:check`, and `npm run quality:gate` as current commands.
- Records Phase 0D as completed only after Task 4's fresh gate.
- Keeps Phase 0 open/BLOCKED because no production adapter is certified.
- Produces a repository-readable Commander handoff; chat history is not required to recover state.

- [x] **Step 1: Update user and architecture documentation**

Make these exact content changes:

- `README.md` command block: add `npm run lint`, replace the standalone extension build recommendation in the full gate with `npm run extension:check`, and add `npm run quality:gate` as the safe all-in-one command.
- `docs/architecture.md` QA lifecycle: state that `scripts/quality-gate.mjs` owns an OS-temporary migration database, Playwright separately owns `.tmp/playwright/training-platform.sqlite`, and CI calls the same aggregate gate on Windows.
- `docs/runbook.md` verification block: list lint, migration, unit, type, E2E, extension check, build, then document `npm run quality:gate`; add recovery notes for a failed lint step, interrupted E2E cleanup, and an interrupted OS-temp gate directory.
- `COMPLIANCE.md`: state that CI/gate databases are disposable and contain only test/migration data; CI adds no deployment, account, analytics, sync, LLM, OJ scraping, cookies, tokens, or commercial problem content.

Evidence: README `## Commands` block now lists `npm run lint`, `npm run extension:check`, and `npm run quality:gate`; `docs/architecture.md` `## QA lifecycle` documents the `scripts/quality-gate.mjs` OS-temporary database, Playwright's `.tmp/playwright` ownership, and the Windows CI parity workflow; `docs/runbook.md` `## Verification` lists the seven gates and adds a `### Recovery` subsection covering lint failure, interrupted E2E cleanup, and an interrupted OS-temp gate directory; `COMPLIANCE.md` adds a `## Phase 0D CI and Quality Gate Databases` section describing the disposable CI/gate databases and CI's restricted surface.

- [x] **Step 2: Update Phase truth without erasing the certification blocker**

Apply these status rules:

- In `2026-07-11-phase-0-reliability-baseline.md`, mark all five Phase 0D work packages complete and mark the fresh/upgrade migration plus lint/unit/type/E2E/extension/build exit items complete. Leave the production-adapter exit item unchecked and keep Phase 0 status `In progress / BLOCKED`.
- In the active roadmap portfolio, change Phase 0 wording to `0A-0D executed; Phase 0 remains BLOCKED on production-adapter certification`. Do not describe Pre-V0 as complete.
- In the near-term execution order, replace “execute Phase 0D” with the explicit adapter decision/evidence action. Do not start Phase 1 while the Phase 0 exit gate remains authoritative.
- In `docs/superpowers/README.md` and `AGENTS.md`, add this plan as the completed Phase 0D execution record and preserve 0B4 as BLOCKED.
- Change this plan's status to `Completed and fully verified` only after the evidence report exists.

Evidence: baseline status changed to `In progress / BLOCKED` with 0A-0D complete; all five 0D work packages checked; the production-adapter exit item left unchecked and Phase 0 status preserved as `In progress / BLOCKED`; the fresh/upgrade migration, lint, unit, type, E2E, extension, and build exit items all checked. Roadmap Phase 0 row reads `In progress / BLOCKED; 0A-0D executed; Phase 0 remains BLOCKED on production-adapter certification`; near-term execution order item 1 now starts with `Acquire a publicly accessible verdict DOM...`; item 2 confirms Phase 0D is already executed and must not be re-executed. Pre-V0 section retains `not a completed multi-platform learning system`. `docs/superpowers/README.md` adds this plan to the completed Phase 0 records and notes the Phase 0D evidence artifact. `AGENTS.md` adds Phase 0D executed with commit history (`b3c1993`, `d3a201f`, `e7c14b5`, `dca2236`, `59a6ecc`, `970a9bf`, `7cb6169`) and keeps 0B4 BLOCKED.

- [x] **Step 3: Write the verification report**

Create `work/reports/phase-0d-engineering-gates.md` with these headings and real outputs/counts from the fresh Task 4 run:

```markdown
# Phase 0D Engineering Gates Report

## Scope
## Git Baseline
## Lint Gate
## Migration Matrix
## Unit and Type Gates
## E2E Gate
## Extension Gate
## Production Build
## Default Database Preservation
## Remaining Phase 0 Blocker
## Verdict
```

The verdict must be exactly one of `PASS`, `FAIL`, or `BLOCKED`. `PASS` means Phase 0D passed; it must explicitly say Phase 0 remains BLOCKED on production-adapter certification.

Evidence: report file created with all ten required headings, real Task 4 run counts, default-database length and LastWriteTimeUtc preserved exactly, and verdict `PASS` limited to Phase 0D with an explicit Phase 0 BLOCKED statement.

- [x] **Step 4: Create the Commander handoff**

Create `work/handoff-current.md`:

```markdown
# Current Handoff

## Workspace

- Branch: `feature/v1-followup`
- Worktree: repository root
- Default database: preserved and not opened by Phase 0D verification

## Current Phase

- Phase 0D: completed and verified
- Phase 0: BLOCKED on production-adapter certification

## Accepted

- Explicit strict lint gate
- Every-prefix migration upgrade matrix
- Extension test/build/dist parity
- Disposable aggregate quality gate
- Windows CI parity
- Phase 0D documentation and evidence report

## In Flight

- No Worker in flight

## Next Commander Action

- Decide whether to acquire public verdict DOM evidence or write a new design decision changing the production-adapter certification rule

## Known Risks

- All adapters remain experimental
- The Windows file-symlink capability test may remain skipped under EPERM; mandatory junction safety tests must pass
```

Evidence: handoff file created with all six required sections; no Worker in flight; next Commander action explicitly limited to a production-adapter decision/evidence choice; risks named against the actual environment.

- [x] **Step 5: Review documentation consistency**

Run:

```powershell
Select-String -Path README.md,AGENTS.md,COMPLIANCE.md,docs\architecture.md,docs\runbook.md,docs\superpowers\README.md,docs\superpowers\plans\2026-07-11-phase-0-reliability-baseline.md,docs\superpowers\plans\2026-07-11-product-development-roadmap.md -Pattern 'Phase 0D remains','npm run extension:build','npm run lint','quality:gate','production-adapter'
$env:GIT_MASTER='1'; git diff --check
```

Expected: no stale claim that Phase 0D remains; full-gate docs use `extension:check`; lint and aggregate commands are present; production-adapter BLOCKED wording remains; `git diff --check` reports no errors.

Evidence: `Select-String` reports no matches for `Phase 0D remains`, `npm run extension:build` (only one standalone `npm run extension:build` reference remains in `README.md` Browser Extension section, which is intentionally standalone extension build instructions — not in the full gate; `npm run lint`, `quality:gate`, and `production-adapter` all present and consistent); `git diff --check` reports no errors for staged files.

- [x] **Step 6: Commit documentation and repository truth**

First inspect the roadmap diff separately and ensure it contains both the pre-existing intended change and Task 5's status reconciliation:

```powershell
$env:GIT_MASTER='1'; git diff -- docs/superpowers/plans/2026-07-11-product-development-roadmap.md
$env:GIT_MASTER='1'; git status --short
```

Then stage only Task 5 files and commit:

```powershell
$env:GIT_MASTER='1'; git add -- README.md docs/architecture.md docs/runbook.md COMPLIANCE.md AGENTS.md docs/superpowers/README.md docs/superpowers/plans/2026-07-11-phase-0-reliability-baseline.md docs/superpowers/plans/2026-07-11-product-development-roadmap.md docs/superpowers/plans/2026-07-15-phase-0d-engineering-quality-gates.md work/reports/phase-0d-engineering-gates.md work/handoff-current.md
$env:GIT_MASTER='1'; git commit -m "docs: close Phase 0D engineering gates"
```

If the roadmap's pre-existing modification cannot be confidently classified, do not stage or commit it. Stop with status `blocked by dirty worktree ownership` and report the exact diff to the user.

Evidence: roadmap pre-existing `M` marker was classified at takeover as line-ending only (LF vs CRLF) with an empty normalized diff; after Task 5 textual edits the staged diff contains only the intended `0A-0D executed` Phase 0 row change, the near-term execution order replacement, the Pre-V0 quality-gate command block update, and the CRLF normalization that Git applies on staging. Single commit with exact subject `docs: close Phase 0D engineering gates` contains all 11 listed Task 5 files plus the new report and handoff; no default database, `extension/dist/`, temp, or unrelated file staged.

---

### Task 6: Independently verify the completed Phase 0D package

**Files:**

- Modify only if results differ: `work/reports/phase-0d-engineering-gates.md`
- Modify only if status evidence changes: `work/handoff-current.md`

**Interfaces:**

- Consumes `npm run quality:gate` as the authoritative Phase 0D verification command.
- Produces a clean or explicitly classified Git state and a Worker Report for Commander review.

- [x] **Step 1: Run the authoritative gate fresh after all documentation changes**

Run:

```powershell
npm run quality:gate
```

Expected: PASS for lint, disposable migration, all mandatory unit tests, typecheck, all E2E tests, extension parity, and production build. Do not reuse Task 4 output for this step.

Evidence: 2026-07-15 fresh run on commit `7394e22` (`docs: correct unit test count`) after Task 5 docs commits. `lint` zero warnings; `db:migrate` (OS-temp disposable) PASS; `test` 28 files / 235 passed / 1 skipped (236 total); `typecheck` PASS; `e2e` 16 passed (1.0m); `extension:check` chain (typecheck + 11 files / 110 + build + dist parity) PASS; `build` 16/16 static pages.

- [x] **Step 2: Verify generated and temporary state**

Run:

```powershell
$env:GIT_MASTER='1'; git check-ignore -v extension/dist/content.js
Test-Path -LiteralPath '.tmp/playwright'
$env:GIT_MASTER='1'; git status --short --branch
```

Expected: `extension/dist/content.js` is ignored; `.tmp/playwright` is absent; Git contains no unexpected generated files. Any remaining pre-existing modification is named and classified.

Evidence: `git check-ignore -v extension/dist/content.js` → `.gitignore:12:dist/ extension/dist/content.js` (still ignored); `Test-Path -LiteralPath '.tmp/playwright'` → `False`; OS-temp `ai-training-quality-gate-*` directories under `$env:TEMP`: none; default `training-platform.sqlite` `Length` 73728 / `LastWriteTimeUtc` 2026-07-13T17:49:36.9126118Z byte-equal before and after the run; `git status --short --branch --untracked-files=all` clean after removing the transient `.tmp/quality-gate-task6.log` capture; no pre-existing modifications remain (the Task 5 commit `cd66285` intentionally staged the once-preserved roadmap delta; `7394e22` corrected unit test counts in `docs/runbook.md`).

- [x] **Step 3: Correct evidence if the fresh run differs**

If counts or results differ from the report, update only the factual evidence fields and rerun `git diff --check`. Never change `FAIL`/`BLOCKED` to `PASS` without a fresh successful gate.

Evidence: every count and gate result from the fresh Task 6 run matched the existing report exactly (28 / 235 / 1 skip; 16 E2E; 11 / 110 extension; 16/16 build pages). No factual correction required. `git diff --check` clean.

- [x] **Step 4: Commit evidence-only corrections if needed**

```powershell
$env:GIT_MASTER='1'; git add -- work/reports/phase-0d-engineering-gates.md work/handoff-current.md
$env:GIT_MASTER='1'; git commit -m "docs: record Phase 0D verification evidence"
```

Skip this commit when Step 3 made no changes.

Evidence: this commit is not skipped — Step 3 made no factual correction, but the user's explicit real-time checkpoint requirement makes Task 6 completion itself an evidence-only checkpoint. Stage 3 files only: `work/reports/phase-0d-engineering-gates.md` (new "Task 6 Independent Final Verification (2026-07-15)" subsection), `work/handoff-current.md` (added latest-gate note to Workspace + Accepted lines), and this plan (Task 6 checkboxes marked). No default database, `extension/dist/`, OS temp, or unrelated file staged. Commit subject: `docs: record Phase 0D verification evidence`.

- [x] **Step 5: Produce the Worker Report**

Report:

- commits created, in order;
- files changed by each task;
- fresh command results and test counts;
- default database length/time preservation evidence;
- final `git status --short --branch`;
- whether the pre-existing roadmap modification was preserved and how it was classified;
- remaining blocker: no certified production adapter;
- explicit statement that nothing was pushed and no PR was created.

The Worker must not declare Phase 0 complete. The correct maximum claim is: `Phase 0D completed and verified; Phase 0 remains BLOCKED on production-adapter certification.`

## Plan Self-Review

- Scope coverage: all five Phase 0D work packages map to Tasks 1-5; Task 6 repeats the full acceptance gate.
- Safety: migration commands are owned by OS-temp/E2E paths; default DB preservation is checked by metadata only.
- Type/config consistency: `lint`, `extension:test`, `extension:check`, and `quality:gate` names are consistent across scripts, CI, docs, and verification.
- Blocker integrity: no task promotes Luogu or marks Phase 0 complete.
- Placeholder scan: complete; every task names its files, commands, expected result, and acceptance boundary.

## Official Configuration Reference

- Next.js 15 ESLint configuration: https://nextjs.org/docs/15/pages/api-reference/config/eslint
- The repository uses the documented `FlatCompat` form with `next/core-web-vitals` and `next/typescript`; ESLint errors continue to fail `next build`.
