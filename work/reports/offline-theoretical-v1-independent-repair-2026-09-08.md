# Local V1 independent offline repair report (2026-09-08)

## Verdict

`theoretical-ready candidate` only.

The review started from pushed checkpoint
`c1d4cd7788ead4634d93cf9eaa078ddb438a28fd`, reproduced the reported failure
classes, repaired them in implementation commit `64a179d`, and reran the
canonical ten-stage gate from the beginning. Clean-install and Windows-runner
repairs then closed the last reproducibility blocker at checkpoint `990862e`.
This is offline and synthetic evidence. It does not establish
`runtime-validated` or `release-ready`.

No real `yu` Chrome profile, OJ, AI provider, compiler workspace, clean Windows
machine, pilot, PR, deployment, release, READY, click, or submission was used.

## Confirmed defects repaired

1. Deleting one `full` artifact cleared a required snapshot locator and could
   violate migration `0010`'s CHECK; shared content-addressed bytes could also
   be deleted while another active reference still needed them. Soft deletion
   now retains the locator, counts other active references, removes bytes only
   for the last active reference, and restores bytes if the DB write fails.
2. AI request identity existed only after result/audit persistence. A provider
   call followed by a report/proposal insert failure could consume quota without
   leaving enough durable state to prevent another call or changed-input key
   reuse. Migration `0018_ai_request_lifecycle.sql` records identity before
   launch; quota debit and launch authorization share one transaction; a retry
   persists a deterministic `persistence_error` fallback without another call
   or debit. Report/proposal creation remains single-result and replay-safe.
3. Vault backup copied the evidence directory rather than the active reference
   set, retained source absolute paths in SQLite, and diagnosis checked mostly
   for existence. Backup now prevalidates active full snapshots by path, file
   type, size and SHA-256, excludes deleted/orphan files, normalizes references,
   and restore rewrites and validates destination references before any live
   swap. Diagnosis separately counts missing, corrupt and unreferenced files
   without returning paths. Every existing restore swap boundary still rolls
   back and the pre-restore safety backup remains restorable.
4. A malformed relay WebSocket upgrade left the one-client handshake slot
   permanently occupied. Socket close and relay shutdown now release/destroy
   the pending slot; the next valid client can connect.
5. The provider network guard permitted HTTP and did not cover several special
   IP classes. It now requires public HTTPS without credentials and rejects
   loopback, private, link-local, unspecified, CGNAT, multicast/reserved and
   documentation literals for IPv4/IPv6. Public IPv4, IPv6 and IPv4-mapped IPv6
   literals remain accepted. Hostnames are intentionally not DNS-resolved or
   pinned under the locked V1 contract.
6. Fresh local-V1 acceptance was an optional script rather than a required
   quality-gate stage. The canonical gate now runs ten stages and places
   `e2e:acceptance` immediately after ordinary App E2E. The matching Windows CI
   cap is 75 minutes to tolerate hosted Windows filesystem/build variance while
   the gate performs three production builds; the observed successful run
   completed in under 19 minutes. Workflow
   permissions and no-upload/no-deploy behavior are unchanged.
7. App/acceptance webServer waits expired before slow local production builds,
   while their test bodies never ran. Only the server-start allowance was raised
   to 10 minutes. Hosted Windows later proved ordinary database tests can exceed
   Vitest's five-second default, so the root default is 30 seconds; three
   exhaustive migration-prefix cases have explicit five-minute limits. Test
   assertions and the canonical stages remain unchanged.
8. The production Route H E2E selected the first listed service worker and
   evaluated it before the target extension context was ready. It now waits for
   the exact frozen extension URL and a live matching runtime ID. A minimum
   failing full-suite run was followed by a focused `1/1` pass and two complete
   gate passes with this case green.

## Clean-install reproducibility receipt

- Before repair, a detached clean checkout of
  `30962ecc434d8f0eb999cf66807562fbff392595` with no `node_modules`, Node
  `22.23.0`, and npm `10.9.8` reproduced `npm ci` exit `1`: the lockfile lacked
  `@emnapi/runtime@1.11.3` and `@emnapi/core@1.11.3` records required by the
  resolved sharp/unrs WASM dependency graph.
- Commit `3327232` added only those two lockfile package records (23 lines).
  `package.json`, top-level ranges, and resolved dependency versions did not
  change. Two independent no-`node_modules` checkouts then completed `npm ci`.
- The first clean full gate exposed stale-worktree assumptions in five CLI
  hashbang imports, exact-dist preparation, and relay Chromium teardown. The
  next remote run exposed Windows short-path/canonical-path false positives and
  hosted test-time budgets. Those were repaired without changing extension
  product files, provider contracts, backup data scope, or application features.
- Final local receipt: exact `990862e4f08a3c9af3b2adc2305a57a7a44cc657`,
  Node `22.23.0`, npm `10.9.8`, no pre-existing `node_modules`, `npm ci` exit
  `0`, and `npm run quality:gate` exit `0`.
- Final remote receipt: GitHub Actions Quality Gate run
  [`34220508035`](https://github.com/qiuyuyandong/AI-Coding-Training-Platform/actions/runs/34220508035),
  exact `990862e4f08a3c9af3b2adc2305a57a7a44cc657`, hosted Node `22.23.2`, npm
  `10.9.8`; Checkout, dependency install, Chromium install, and the complete
  canonical gate all concluded `success`.
- Intermediate runs are retained as failure evidence, not acceptance: run
  `34194787091` first reached the clean gate and exposed fresh-run assumptions;
  run `34217886111` reached all 129 root files and isolated one obsolete
  short-path spelling assertion (`128` files passed, one failed).

## Acceptance mapping

| Requirement | Code path | Evidence | Result |
| --- | --- | --- | --- |
| Shared `full` snapshot deletion | project evidence intake/repository and snapshot store | project evidence `11/11`; Vault `14/14` | PASS offline |
| Same-key AI concurrency, changed input, persistence retry, one debit | AI coach service and migration `0018` | AI coach `21/21`; migration prefix suites | PASS for local single-process V1 |
| URL composition, timeout, abnormal response and network boundary | shared OpenAI-compatible adapter | adapter `21/21`; fake fetch only | PASS offline; real provider pending |
| Code consent, citation validity and sensitive-output rejection | AI context projection and structured validators | AI coach regression suite | PASS offline |
| Active full-snapshot backup, relocation and restore rollback | Local Vault operations | Vault `14/14`, including five swap boundaries and safety-backup reversal | PASS offline; clean Windows stopped-process run pending |
| Diagnosis without sensitive paths | Vault diagnosis and settings projection | corrupt/orphan/missing count tests | PASS offline |
| API origin, bounds, 404, idempotency and error feedback | project/evidence/assessment/review/export/replace and plan routes | local V1 contracts `6/6`, project/UI and root route suites | PASS offline |
| Fresh manual loop plus six-stage project | `/today`, `/evidence`, `/projects`, public APIs | bundled Chromium acceptance `1/1`; zero AI/external requests | PASS offline; human pilot pending |
| Historical migration compatibility | migration runner through `0018` | full prefix, curriculum and Local Vault migration suites | PASS offline |
| Relay malformed handshake and browser survival | native relay and bundled Chromium probe | relay `5/5`; Chromium `1/1`; Route H focused and full E2E | PASS offline |
| Default DB and frozen extension | disposable roots and exact candidate diff | metadata/hash unchanged; product-path zero diff | PASS |

## Final verification evidence

The final `npm run quality:gate` exited `0` after all runtime-code changes:

- ESLint: PASS with zero warnings.
- Disposable migration through `0018_ai_request_lifecycle.sql`: PASS.
- Curriculum: 12 nodes, 13 edges, 12 resources, 12 practice mappings and 9
  careers.
- Root Vitest: 129 files, 2709 passed, 1 skipped. The skip is the documented
  Windows file-symlink capability probe (`EPERM`); mandatory junction/path and
  restore rollback cases passed.
- TypeScript: PASS under the repository strict rules.
- App Playwright: 25/25 passed; recorded external requests: zero.
- Fresh bundled-Chromium acceptance: 1/1 passed from a new temporary database;
  one manual attempt created evidence and a review, the review completed, the
  Today page remained usable, and six public-page/API project milestones
  produced six sessions, summaries and completion receipts. AI and external
  request counts were zero.
- Extension unit/build/parity: 1671/1671 passed.
- Extension bundled-Chromium Fake OJ E2E: 55 passed, 1 documented harness skip.
- Final Next.js production build: PASS; 28 routes emitted.

Focused regression evidence before the final gate included the nine-file core
set at `101/101`, migration prefixes at `24/24`, provider mapping at `21/21`,
standalone fresh acceptance `1/1`, ordinary App E2E `25/25`, and Route H
production connection `1/1`.

The matching fresh Windows run passed 129/129 files and 2710/2710 root tests;
that host can create the file-symlink capability fixture. It also passed App
E2E `25/25`, fresh acceptance `1/1`, extension unit `1671/1671`, extension E2E
`55/1`, and the 28-route production build.

Earlier full-gate attempts were not counted as acceptance: one found a default
five-second migration-test timeout, one found the App webServer startup timeout,
and one reproduced the Route H service-worker readiness race. Each was fixed
and followed by a new gate from lint rather than resuming after the failure.

## Preservation and residual gaps

- Default `training-platform.sqlite`: `479232` bytes, UTC mtime
  `2026-07-23T15:56:38.8411343Z`, SHA-256
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.
- Ports 3000 and 3010 were free after teardown; current-run Playwright roots
  were absent. The ignored gate log was not retained as product evidence.
- Frozen product candidate remains
  `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`; `extension/src`,
  `extension/manifest.json`, and `extension/identity.json` have zero diff.
- This local host skipped one file-symlink capability test under `EPERM`; the
  hosted Windows run executed it. One extension worker-restart harness scenario
  remains skipped in both and is not represented as passing.
- Real Chrome/OJ/provider, compiler workspace and clean Windows
  backup/restore/diagnosis are `runtime-validated: pending`.
- Human pilot, RC, packaging, deployment and release are
  `release-ready: pending`.

The next legitimate action is independent review of this pushed checkpoint or
a separately authorized, precisely scoped runtime-validation protocol. Neither
is implied by `theoretical-ready`.
