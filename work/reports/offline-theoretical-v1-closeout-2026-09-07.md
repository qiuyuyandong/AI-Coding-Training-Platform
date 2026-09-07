# Local V1 offline theoretical-ready closeout (2026-09-07)

## Verdict

`theoretical-ready` only.

The local application, synthetic browser flows, observer compatibility relay,
optional AI contracts, and Vault operations pass the offline quality gate.
This does not establish `runtime-validated` or `release-ready` status.

No real OJ, `yu` Chrome profile, real AI provider, user compiler workspace,
clean Windows machine, pilot, RC, deployment, release, PR, or other branch was
used.

## Delivered behavior

- Project evidence writes use the server-owned capture mode and compensate
  database/file failures. Corrections, deletion, replacement, replay, and UI
  refresh paths do not leave duplicate facts or stale snapshot references.
- The observer supports explicit `playwright|native-relay` transport selection.
  The opt-in relay is loopback-only, random-path, single-client, bounded,
  payload-free in logs, and disconnects without terminating Chromium.
- AI Coach is disabled by default and called only after explicit user action.
  It uses the shared OpenAI-compatible adapter, selected evidence IDs,
  separately authorized code context, idempotent quota accounting, strict
  structured output, and deterministic fallback. AI produces reports or
  proposals only; accepted proposals still traverse the existing plan rules.
- Local Vault backup, stopped-process restore, diagnosis, opt-in aggregate
  metrics, and manual aggregate feedback export reuse the existing Vault root.
  Restore validates hashes, SQLite, migrations, and snapshot references before
  atomic replacement and retains a pre-restore safety backup.
- The readiness model is split into independent theoretical, runtime, and
  release states so missing real-environment evidence no longer blocks offline
  engineering while remaining visible.

Ponytail constraints were applied by reusing the existing evidence projector,
plan regeneration, reflection adapter boundary, Local Vault root, and Route H
observer. No second identity model, graph, planner, snapshot root, installer,
telemetry uploader, or cloud architecture was added.

## Verification evidence

The final `npm run quality:gate` exited `0`:

- ESLint: PASS with zero warnings.
- Disposable migration through `0015_pilot_support.sql`: PASS.
- Curriculum validation: 12 nodes, 13 edges, 12 resources, 12 practice
  mappings, and 9 careers.
- Root Vitest: 126 files, 2649 passed, 1 skipped. The skip is the documented
  Windows file-symlink capability probe (`EPERM`); mandatory junction coverage
  passed.
- TypeScript: PASS under the repository strict rules.
- Application Playwright: 25/25 passed. This includes the existing manual
  training/evidence/review/today-plan paths and the new UI-driven six-milestone
  project flow with 6 sessions, 6 summaries, an open review, completion, and
  zero AI requests without a click.
- Extension unit/build/parity: 1671/1671 passed and production dist built.
- Extension bundled-Chromium Fake OJ E2E: 55 passed, 1 known harness-limitation
  skip.
- Final Next.js production build: PASS; 28 static/dynamic page routes emitted.

The first full integration run correctly failed at application E2E because the
new `/training` evidence query referenced `training_attempts.external_id`.
The actual schema contract is `problem_external_id`; the query and ambiguous
legacy Coach heading assertion were corrected, focused capture/training tests
passed, and the complete gate then passed.

The default `training-platform.sqlite` remained byte-for-byte and metadata
identical before and after all gates:

- Length: `479232` bytes.
- Last write UTC: `2026-07-23T15:56:38.8411343Z`.
- SHA-256: `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

## Frozen Route H boundary

- Product candidate remains
  `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`.
- `extension/src`, `extension/manifest.json`, and `extension/identity.json`
  have no diff from that candidate.
- Observer-tool hash is
  `08E9199BA12C3846464086E2D3DD0D13A145284449EDF361CBF26CF95CCEA23D`.
- No R5, READY, click, submission, or real-browser action ran.

## Remaining gates

- `runtime-validated`: pending for real Chrome/OJ, real provider, and a clean
  Windows machine under separately authorized protocols.
- `release-ready`: pending for pilot use, acceptance, RC, deployment, and
  release.

The only next action is to review this theoretical-ready checkpoint and, if
desired, separately authorize one named runtime-validation protocol. It must
not be inferred from this report.
