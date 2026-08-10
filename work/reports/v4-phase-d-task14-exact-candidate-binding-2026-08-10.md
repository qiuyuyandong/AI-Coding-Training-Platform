# V4 Phase D Task 14 exact candidate binding closeout

Date: 2026-08-10

Branch: `feature/v1-followup`

Implementation commit: `0f695ddfad6989e407424feff457d28d081d657b`

Verdict: **ENGINEERING COMPLETE / INDEPENDENT REVIEW APPROVE**

This is Task 14 implementation evidence only. It is not a D4 real-platform
delivery observation, D5 approval, RC, user acceptance, or release.

## Product behavior closed

- New armed LeetCode verdict candidates persist an additive
  `submitRequestId`; their candidate identity is recomputed by the strict
  session parser, so request-ID or candidate-ID tampering is rejected.
- Legacy candidates without the additive field remain readable only through
  the bounded compatibility path and are never assigned a request ID.
- Armed candidates join only the exact request lifecycle and revalidate
  platform, problem, tab, frame, document, method, endpoint, lifecycle,
  status, stable submission identity, and E1/E2/E3 chronology. There is no
  latest-by-time or problem-only fallback.
- A stale legacy candidate predating a matching later E1 is terminalized
  immediately. This terminal-only reconciliation preserves confirmed records,
  tombstones, and independent armed candidates.
- Worker restart recovery reads local confirmed/tombstone and session E1 state
  afresh after existing candidate recovery. Only one unique exact unfinalized
  E1/E2 pair may emit `CONFIRMED` to its original tab/frame/document; no
  `STARTED`, lifecycle, or DOM baseline is synthesized.
- All submit-epoch/coordinator diagnostics accepted by the privacy boundary are
  fixed enums without URL, request, routing, problem, verdict, payload, code,
  credential, token, or account identity. Historical problem-slug patterns
  were removed from the allowlist.

## Review result

The independent repository reviewer inspected the exact Task 14 diff and the
frozen Task 12.2 contract. It returned `APPROVE` with no blocking or
non-blocking findings. It explicitly confirmed that an exact lifecycle that is
not yet eligible remains fail-closed pending without any fallback, and that
restart recovery replays only the unique exact `CONFIRMED` control without
synthesizing `STARTED`.

## Verification evidence

Authoritative Commander commands after the final privacy-boundary repair:

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionVerdictCandidateCoordinator.test.ts tests/unit/extensionTransientEvidenceStorage.test.ts tests/unit/extensionLeetCodeNetworkAdapter.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts tests/unit/extensionSubmitEpochReplay.test.ts tests/unit/extensionBackgroundOrchestrator.test.ts
npm run typecheck
npx eslint extension/src/adapters/leetcode/network.ts extension/src/background.ts extension/src/backgroundOrchestrator.ts extension/src/captureErrorPrivacy.ts extension/src/transientEvidenceStorage.ts extension/src/verdictCandidateCoordinator.ts extension/src/submitEpochReplay.ts tests/unit/extensionBackgroundOrchestrator.test.ts tests/unit/extensionLeetCodeNetworkAdapter.test.ts tests/unit/extensionTransientEvidenceStorage.test.ts tests/unit/extensionVerdictCandidateCoordinator.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts tests/unit/extensionSubmitEpochReplay.test.ts
$env:GIT_MASTER='1'; git diff --check
```

Results:

- focused Task 14 suite: 6 files, 228 tests passed;
- TypeScript typecheck: exit 0;
- targeted ESLint: exit 0;
- diff whitespace check: exit 0, with Windows CRLF conversion warnings only.

Not run in Task 14: full unit suite, `extension:check`, extension E2E,
production build/dist, privacy audit, D3 candidate validator, browser
observation, migration, or any database command.

## Boundary and next action

Task 15 is the only authorized next action. It must run focused and full
extension gates, privacy audit, and independent code/privacy/plan review;
repair only findings inside the approved design; then create and validate a
new immutable D3 implementation candidate and record the exact production-dist
hashes. Any later runtime, protocol, manifest, permission, build-script,
migration, or dist change invalidates that candidate and requires re-freeze
before Task 16.
