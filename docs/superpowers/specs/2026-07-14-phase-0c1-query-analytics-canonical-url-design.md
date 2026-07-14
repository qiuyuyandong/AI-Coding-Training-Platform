# Phase 0C1 Query, Analytics, and Canonical URL Design

**Status:** Approved by the standing Phase 0 execution direction on 2026-07-14

**Outcome:** Training pages select the correct problem attempt, Growth totals describe the full eligible dataset, recent views declare their row window, and every automatic problem link uses one canonical identity/URL implementation.

## Scope split

The original 0C portfolio combines correctness repairs with a new manual record/correction subsystem. These have different data-model and review risks, so 0C is split without dropping scope:

- **0C1 (this slice):** automatic-path identity normalization, canonical URLs, scoped attempt queries, SQL aggregates, Growth/Coach/query-window corrections, and a totals-over-row-limit browser proof.
- **0C2 (next slice):** manual record and correction provenance, schema/API/UI, and automatic/manual reconciliation.

0C1 does not add a migration, rewrite historical rows, change credential security, certify an OJ adapter, or add new product analytics.

## Approaches considered

1. **Normalize only while rendering.** Smallest patch, but stored events, catalog rows, APIs, and extension output would keep disagreeing. Rejected.
2. **Bulk rewrite all historical URLs and identities.** Produces clean storage, but changes existing evidence and requires rollback/collision policy. Rejected for 0C1.
3. **Normalize at every write/link boundary and normalize legacy rows when mapped for reads.** New data becomes stable, old data renders consistently, and no evidence is mutated. Selected.

For analytics, loading a larger recent list is still an arbitrary sample. Totals therefore come from SQL aggregates over the complete eligible scope, while recent rows remain a separate bounded query.

## Problem identity and canonical URLs

`lib/services/canonicalProblemUrl.ts` owns these pure interfaces:

```ts
export type ProblemIdentity = {
  readonly platform: Platform;
  readonly externalId: string;
};

export function normalizeProblemIdentity(
  identity: ProblemIdentity,
): ProblemIdentity;

export function canonicalProblemUrl(
  identity: ProblemIdentity,
  observedUrl?: string,
): string;
```

Automatic platform rules:

| Platform | Normalized external ID | Canonical URL |
|---|---|---|
| LeetCode | lowercase slug, no surrounding slash | `https://leetcode.com/problems/<slug>/` |
| Codeforces | numeric contest plus uppercase index (`4A`, `123B1`) | `https://codeforces.com/problemset/problem/<contest>/<index>` |
| AtCoder | lowercase task ID | `https://atcoder.jp/contests/<contest>/tasks/<task>` |
| Luogu | uppercase problem ID, with `/problem/` removed if supplied | `https://www.luogu.com.cn/problem/<id>` |
| NowCoder | normalized absolute pathname beginning with `/` | `https://www.nowcoder.com<pathname>` |
| Manual | trimmed external ID; requires an `observedUrl` | generic HTTPS/HTTP URL with query and fragment removed |

All rules reject empty or structurally invalid identities instead of guessing. Generic URL normalization removes query and fragment, lowercases the host through `URL`, and preserves the meaningful pathname.

The normalizer is used by:

- extension problem detection before a capture session starts;
- capture API normalization before fingerprinting/materialization;
- problem repository write and row-mapping boundaries;
- `TrainingWorkspace` original-problem links.

The server still validates the authenticated event's `installationId`. Canonicalization changes only problem identity/URL fields and is deterministic, so exact event replay remains stable.

## Attempt query contracts

`lib/repositories/attempts.ts` replaces implicit global recency with explicit query objects:

```ts
export type AttemptProblemScope = {
  readonly platform: Platform;
  readonly externalId: string;
};

export type AttemptTimeWindow = {
  readonly updatedFrom?: string;   // inclusive
  readonly updatedBefore?: string; // exclusive
};

export type ListAttemptsQuery = AttemptTimeWindow & {
  readonly problem?: AttemptProblemScope;
  readonly limit: number;
};

export type AttemptAggregate = {
  readonly totalAttempts: number;
  readonly completedAttempts: number;
  readonly passedAttempts: number;
  readonly resultDistribution: Record<AttemptResult, number>;
};
```

- `listAttempts(db, query)` always has an explicit positive limit and orders by `updated_at DESC, id DESC`.
- `findLatestAttempt(db, problem)` uses `(platform, normalized externalId)` and returns at most one row.
- `aggregateAttempts(db, window)` runs database aggregates without a row limit.
- The eligible 0C1 dataset is every row in `training_attempts`; `draft` counts in total but not completed, and pass rate uses completed attempts as its denominator.
- Empty scopes return zero counts and a complete five-result distribution.
- Malformed limits or reversed/invalid time windows are rejected before SQL execution.

## Consumers and labels

`GET /api/attempts/recent` accepts `platform`, `externalId`, and `limit`. `platform` and `externalId` must be supplied together. The Training panel calls it with the current problem and `limit=1`; it no longer downloads a global list and filters the first ten rows in the browser.

Growth loads:

- `aggregateAttempts(db, {})` for **All-time totals**;
- `listAttempts(db, { limit: 5 })` for **Latest 5 attempts**.

`buildGrowthStats` combines those two already-correct inputs and never recomputes totals from recent rows. Completion rate is `completed / total`; pass rate is `passed / completed`.

Coach intentionally remains a bounded heuristic over `listAttempts(db, { limit: 50 })` and labels it **Latest 50 attempts**. This is not presented as lifetime analysis.

## Compatibility and errors

- Existing databases require no migration and no destructive rewrite.
- Repository row mapping normalizes legacy identity/URL values returned to callers.
- New invalid automatic identities fail capture validation with HTTP 400 and are not written.
- API query errors return HTTP 400 with an empty result rather than silently falling back to global recency.
- Database failures remain HTTP 500 and all server pages/routes close their handles in `finally`.

## Verification and failure conditions

0C1 fails if any of these are true:

- two automatic boundaries build different URLs for the same `(platform, externalId)`;
- `/training` can miss the current problem because more than ten newer unrelated attempts exist;
- Growth totals stop at a recent-row limit or use drafts in the pass-rate denominator;
- recent UI text omits its row window;
- date-window bounds are not inclusive-lower/exclusive-upper;
- invalid scope parameters silently become a global query;
- exact capture replay or the 0B authenticated transaction regresses;
- E2E mutates the default database.

