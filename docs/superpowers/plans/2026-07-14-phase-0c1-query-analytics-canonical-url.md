# Phase 0C1 Query, Analytics, and Canonical URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automatic problem identity, attempt selection, Growth totals, and recent-window claims deterministic and accurate.

**Architecture:** One browser-safe pure service normalizes `(platform, externalId)` and builds canonical URLs at extension, API, catalog, and link boundaries. Attempt repositories expose explicit scoped list queries and full SQL aggregates; pages consume those contracts instead of treating a recent sample as lifetime data.

**Tech Stack:** Next.js App Router, strict TypeScript, SQLite/`better-sqlite3`, Zod, Vitest, Playwright, Chrome MV3.

## Global Constraints

- Preserve all existing SQLite rows; 0C1 has no migration or bulk data rewrite.
- Keep `SESSION_ENDED` optional and keep 0B authentication/raw-event/projection transaction behavior unchanged.
- Problem identity is `(platform, normalized externalId)`.
- Date windows are inclusive at `updatedFrom` and exclusive at `updatedBefore`.
- Growth totals cover every `training_attempts` row in scope; draft counts in total but not completed.
- Pass rate is `passedAttempts / completedAttempts`, or zero when completed is zero.
- Recent views state their exact row limit: Growth 5, Coach 50, Training 1.
- Manual record/correction remains 0C2; do not add manual provenance, schema, API, or UI here.
- Keep TypeScript strict; do not use forbidden type escape hatches or non-null assertions.

---

### Task 1: Canonical problem identity and URL boundaries

**Files:**

- Create: `lib/services/canonicalProblemUrl.ts`
- Create: `tests/unit/canonicalProblemUrl.test.ts`
- Modify: `extension/src/platforms.ts`
- Modify: `app/api/capture/events/route.ts`
- Modify: `lib/repositories/problems.ts`
- Modify: `components/TrainingWorkspace.tsx`
- Modify: `tests/unit/extensionPlatforms.test.ts`
- Modify: `tests/unit/captureApi.test.ts`
- Modify: `tests/unit/problemCatalog.test.tsx`

**Interfaces:**

- Produces `ProblemIdentity`, `normalizeProblemIdentity(identity)`, and `canonicalProblemUrl(identity, observedUrl?)`.
- Later tasks consume normalized `externalId` in repository query scopes.

- [ ] **Step 1: Write the canonical matrix tests**

Cover LeetCode query/submission URLs, Codeforces lowercase index, AtCoder query strings, Luogu `/problem/P1001`, NowCoder path/query input, generic manual URLs, invalid Codeforces IDs, empty IDs, and missing manual `observedUrl`.

```ts
expect(canonicalProblemUrl({ platform: "leetcode", externalId: "/Two-Sum/" }))
  .toBe("https://leetcode.com/problems/two-sum/");
expect(normalizeProblemIdentity({ platform: "codeforces", externalId: "4a" }))
  .toEqual({ platform: "codeforces", externalId: "4A" });
expect(() => canonicalProblemUrl({ platform: "codeforces", externalId: "bad" }))
  .toThrow("Invalid Codeforces problem ID");
```

- [ ] **Step 2: Run the tests and verify the red state**

Run: `npm run test -- tests/unit/canonicalProblemUrl.test.ts`

Expected: FAIL because `canonicalProblemUrl.ts` does not exist.

- [ ] **Step 3: Implement the pure normalizer**

Use `PlatformSchema` and `URL`; strip query/fragment, validate platform-specific structure, and return canonical hosts/paths exactly as specified in the design. Do not read browser globals or Node-only modules.

```ts
export type ProblemIdentity = {
  readonly platform: Platform;
  readonly externalId: string;
};

export function normalizeProblemIdentity(identity: ProblemIdentity): ProblemIdentity;
export function canonicalProblemUrl(identity: ProblemIdentity, observedUrl?: string): string;
```

- [ ] **Step 4: Route extension detection through the normalizer**

After extracting a candidate identity, call the pure service and return its normalized external ID and canonical URL. Add tests proving LeetCode `/description`, query, and hash variants collapse to one URL and Codeforces `4/a` becomes `4A`.

- [ ] **Step 5: Normalize capture before fingerprint/materialization**

In `POST /api/capture/events`, convert the parsed event's problem fields before the authenticated transaction:

```ts
const identity = normalizeProblemIdentity({
  platform: parsed.data.platform,
  externalId: parsed.data.problemExternalId,
});
const event = {
  ...parsed.data,
  problemExternalId: identity.externalId,
  canonicalUrl: canonicalProblemUrl(identity, parsed.data.canonicalUrl),
};
```

Map normalization errors to HTTP 400 and test zero raw/session writes.

- [ ] **Step 6: Normalize catalog write/read and training links**

`upsertProblem` persists normalized identity/URL. `fromRow` normalizes legacy rows for callers without updating SQLite. Replace `TrainingWorkspace.buildPlatformUrl` with `canonicalProblemUrl`; invalid query identity renders an unavailable-link message rather than a Google fallback.

- [ ] **Step 7: Verify and commit Task 1**

Run:

```powershell
npm run test -- tests/unit/canonicalProblemUrl.test.ts tests/unit/extensionPlatforms.test.ts tests/unit/captureApi.test.ts tests/unit/problemCatalog.test.tsx
npm run typecheck
npm run extension:build
```

Expected: all selected tests pass; typecheck and extension build exit 0.

Commit: `feat: normalize automatic problem identity`

### Task 2: Explicit scoped queries and full SQL aggregates

**Files:**

- Modify: `lib/repositories/attempts.ts`
- Create: `tests/unit/attemptQueries.test.ts`
- Modify: `tests/unit/captureMaterializer.test.ts` only if fixture normalization requires it

**Interfaces:**

- Consumes `normalizeProblemIdentity` from Task 1.
- Produces `AttemptProblemScope`, `AttemptTimeWindow`, `ListAttemptsQuery`, `AttemptAggregate`, `listAttempts`, `findLatestAttempt`, and `aggregateAttempts`.

- [ ] **Step 1: Write repository tests against an isolated migrated database**

Insert attempts for two platforms/problems across exact window boundaries. Prove:

- problem scope returns only `(platform, normalized externalId)` matches;
- ordering is `updated_at DESC, id DESC`;
- limit is mandatory, positive, integral, and at most 100;
- `updatedFrom` is inclusive and `updatedBefore` is exclusive;
- reversed or non-datetime windows throw;
- aggregate totals include more than 50 rows and return all five result buckets;
- draft affects total/completion rate but not completed/pass denominator;
- empty scope returns zeros.

```ts
expect(findLatestAttempt(db, {
  platform: "leetcode",
  externalId: "TWO-SUM",
})?.id).toBe("attempt_two_sum_latest");
expect(aggregateAttempts(db, {})).toMatchObject({
  totalAttempts: 60,
  completedAttempts: 55,
  passedAttempts: 30,
});
```

- [ ] **Step 2: Run the tests and verify the red state**

Run: `npm run test -- tests/unit/attemptQueries.test.ts`

Expected: FAIL because the scoped query exports do not exist.

- [ ] **Step 3: Implement validation and row mapping**

Use fixed SQL predicates with nullable bind parameters rather than interpolating values. Normalize problem scope before binding. Continue to map optional SQLite columns through `TrainingAttemptSchema`.

```ts
export type ListAttemptsQuery = AttemptTimeWindow & {
  readonly problem?: AttemptProblemScope;
  readonly limit: number;
};

export function listAttempts(
  db: Database.Database,
  query: ListAttemptsQuery,
): readonly TrainingAttempt[];
```

- [ ] **Step 4: Implement aggregate SQL**

Use one aggregate row with `COUNT(*)` and `SUM(CASE ...)`, then construct a complete `Record<AttemptResult, number>`. No `LIMIT` is permitted in aggregate SQL.

```sql
SELECT
  COUNT(*) AS total_attempts,
  COALESCE(SUM(CASE WHEN result <> 'draft' THEN 1 ELSE 0 END), 0) AS completed_attempts,
  COALESCE(SUM(CASE WHEN result = 'passed' THEN 1 ELSE 0 END), 0) AS passed_attempts
FROM training_attempts
WHERE (@updatedFrom IS NULL OR updated_at >= @updatedFrom)
  AND (@updatedBefore IS NULL OR updated_at < @updatedBefore)
```

- [ ] **Step 5: Keep a temporary explicit-limit compatibility wrapper**

Keep `listRecentAttempts(db, limit)` only so Task 2 remains independently type-correct while existing consumers are migrated. Remove its default parameter immediately, implement it as `listAttempts(db, { limit })`, and mark its deletion in Task 3. It must never permit an implicit limit.

- [ ] **Step 6: Verify and commit Task 2**

Run:

```powershell
npm run test -- tests/unit/attemptQueries.test.ts tests/unit/captureMaterializer.test.ts
npm run typecheck
```

Expected: selected tests and typecheck pass.

Commit: `feat: add scoped attempt queries`

### Task 3: Correct Training, Growth, Coach, and API consumers

**Files:**

- Modify: `app/api/attempts/recent/route.ts`
- Modify: `components/AttemptStatusPanel.tsx`
- Modify: `lib/services/growthStats.ts`
- Modify: `app/growth/page.tsx`
- Modify: `app/coach/page.tsx`
- Modify: `lib/repositories/attempts.ts`
- Modify: `tests/unit/growthStats.test.ts`
- Modify: `tests/unit/captureApi.test.ts`
- Modify: `tests/unit/coachAnalysis.test.ts` only for explicit window labels/model fields if needed

**Interfaces:**

- Consumes Task 2 query and aggregate functions.
- Produces a scoped recent-attempt HTTP response and `buildGrowthStats(aggregate, recentAttempts)`.

- [ ] **Step 1: Write failing API and Growth service tests**

Test `GET /api/attempts/recent?platform=leetcode&externalId=two-sum&limit=1`, paired scope validation, unsupported platform, invalid/out-of-range limit, and an older target hidden behind 15 newer unrelated attempts. Update Growth tests so totals come from a supplied aggregate while recent activity remains five rows.

```ts
const stats = buildGrowthStats(
  aggregate({ totalAttempts: 60, completedAttempts: 50, passedAttempts: 20 }),
  recentAttempts,
);
expect(stats.totalAttempts).toBe(60);
expect(stats.recentActivity).toHaveLength(5);
```

- [ ] **Step 2: Run the tests and verify the red state**

Run: `npm run test -- tests/unit/growthStats.test.ts tests/unit/captureApi.test.ts`

Expected: FAIL because consumers still use `listRecentAttempts` and old Growth input.

- [ ] **Step 3: Implement query parsing and scoped polling**

The route defaults only `limit` to 10. `platform` and `externalId` are both absent for a global recent view or both present for a problem scope. Return HTTP 400 with `recentAttempts: []` for invalid combinations. The panel requests:

```ts
const query = new URLSearchParams({ platform, externalId, limit: "1" });
fetch(`/api/attempts/recent?${query}`, { cache: "no-store" });
```

Use the sole returned row directly; do not client-filter a global list.

- [ ] **Step 4: Separate Growth totals from recent activity**

Change `buildGrowthStats` to trust the repository aggregate for counts/rates and map/sort only the supplied recent rows. Growth page calls `aggregateAttempts(db, {})` and `listAttempts(db, { limit: 5 })`. Render section labels **All-time totals** and **Latest 5 attempts**.

- [ ] **Step 5: Make Coach's bounded scope explicit**

Coach calls `listAttempts(db, { limit: 50 })` and renders **Latest 50 attempts reviewed: N**. Keep its deterministic analysis algorithm unchanged.

After Training, Growth, Coach, and API no longer import it, delete the temporary `listRecentAttempts` wrapper from `lib/repositories/attempts.ts`.

- [ ] **Step 6: Verify and commit Task 3**

Run:

```powershell
npm run test -- tests/unit/growthStats.test.ts tests/unit/captureApi.test.ts tests/unit/coachAnalysis.test.ts tests/unit/problemCatalog.test.tsx
npm run typecheck
```

Expected: selected tests and typecheck pass.

Commit: `fix: align attempt analytics scopes`

### Task 4: Browser proof, current-state docs, and complete gate

**Files:**

- Modify: `tests/e2e/coach-growth.spec.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbook.md`
- Modify: `COMPLIANCE.md` only if canonical/manual boundary wording needs correction

**Interfaces:**

- Consumes all Task 1-3 public behavior.
- Produces no new runtime interface.

- [ ] **Step 1: Add a row-limit regression scenario**

Insert at least 60 isolated attempts into the disposable E2E database, including an older target problem and more than ten newer unrelated attempts. Read the authoritative database count, then prove:

- `/growth` shows that full count under **All-time totals**;
- **Latest 5 attempts** shows at most five activity rows;
- `/training` still shows the older target problem's latest scoped attempt;
- `/coach` states **Latest 50 attempts reviewed** rather than lifetime wording.

- [ ] **Step 2: Run focused E2E with default-database hash protection**

Run: `npm run e2e -- tests/e2e/coach-growth.spec.ts`

Expected: all selected browser tests pass and the default `training-platform.sqlite` hash/existence state is unchanged.

- [ ] **Step 3: Update current-state documentation**

Document the canonical matrix ownership, `(platform, normalized externalId)` identity, scoped Training API, all-time Growth aggregate, explicit recent row windows, read-time legacy normalization, no historical rewrite, and the 0C2 manual fallback boundary.

- [ ] **Step 4: Run the full quality gate separately**

Run with the bundled Node runtime and a disposable migration database:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

Expected: every command exits 0; E2E leaves the default database hash/existence state unchanged.

- [ ] **Step 5: Inspect scope and forbidden escapes**

Run `git diff --check`, inspect `git diff --stat`, scan TypeScript for forbidden escape hatches/non-null assertions, and confirm no generated test database or `test-results` directory remains.

- [ ] **Step 6: Commit Task 4**

Commit: `test: verify Phase 0C1 analytics correctness`

## Self-review record

- **Spec coverage:** canonical boundaries, scoped Training, SQL totals, time windows, empty data, Growth/Coach labels, row-limit E2E, and current-state docs each map to a task.
- **Scope:** manual record/correction is explicitly reserved for 0C2 because it needs a separate provenance/schema design.
- **Compatibility:** no migration or historical data rewrite; row mapping handles old URLs.
- **Type consistency:** Task 3 consumes the exact query/aggregate names defined in Task 2.
- **Placeholder scan:** no TBD/TODO, implicit error-handling step, or undefined neighboring interface remains.
