# Offline-Theoretical V1 Hardening, AI, and Operations Plan

**Status:** offline and synthetic implementation complete; `theoretical-ready` only.

Implementation checkpoints: `8ca24a1`, `b1d9e44`, `78b2de2`, `b3f8f38`, and
`9924923`, followed by the integration commit containing this closeout. The
full quality gate passed with root `2649/1`, App E2E `25/25`, extension
`1671/1671`, extension E2E `55/1`, and production build PASS. Runtime and
release gates remain pending and separately authorized.

**Goal:** make the local V1 code path theoretically usable without treating
real Chrome, OJ, AI-provider, Windows-machine, pilot, RC, or release evidence
as a prerequisite for continued engineering.

## Status model

- `theoretical-ready`: deterministic offline and synthetic-browser gates pass.
- `runtime-validated`: the relevant real browser, OJ, provider, toolchain, or
  clean Windows environment has been exercised.
- `release-ready`: pilot, acceptance, and release gates pass on one candidate.

The first state permits later code development. It never implies either of the
other states.

## Work packages

1. Harden the existing Phase 1-4 evidence and project loop. Enforce the
   project-owned capture mode server-side, make database/snapshot mutations
   failure-safe, close API and client-state gaps, and add route, component,
   replay, migration, and synthetic end-to-end coverage.
2. Add an observer-only native-WebSocket relay selected through
   `--cdp-transport=native-relay`. Keep the frozen `ee0e1f5` extension candidate
   unchanged. Test the relay with fake peers and isolated bundled Chromium;
   never attach to the `yu` profile or open an OJ.
3. Generalize the existing reflection experiment into one provider-neutral,
   OpenAI-compatible, on-demand AI service. Keep AI disabled by default,
   preserve deterministic fallback, store only validated structured reports,
   require evidence citations, and accept keys only from server environment.
4. Reuse Local Vault for consistent backup, fail-closed restore, diagnostics,
   opt-in local metrics, and previewable feedback export. Restore runs only
   while the application is stopped and always makes a pre-restore backup.
5. Reconcile status documentation around the three readiness states and retain
   all real-environment gaps as explicit future validation work.

## Fixed boundaries

- No real OJ, `yu` Chrome, external model, user workspace/compiler, clean
  Windows machine, deployment, release, or PR operation.
- Bundled Chromium, Fake OJ, temporary databases, fake provider transports,
  and temporary Vaults are allowed.
- AI is user-triggered. Structured reports are retained by default; raw prompt,
  key, and code are not. Code context is separately opt-in.
- Local usage metrics are disabled by default and have no upload path.
- The implementation branch is `codex/offline-theoretical-v1`. Passing
  checkpoints may be committed and pushed to that branch only.

## Delivery order

1. Baseline plan and status reconciliation.
2. Phase 1-4 correctness hardening.
3. CDP native relay.
4. On-demand AI coach.
5. Backup, restore, diagnostics, and local feedback.
6. Full synthetic gate, documentation reconciliation, and theoretical-ready
   report.

Each package leaves a focused runnable check. The final gate runs lint,
temporary migrations, curriculum validation, full unit tests, typecheck,
application E2E, extension Fake OJ E2E, production build, and the aggregate
quality gate without touching the default database.
