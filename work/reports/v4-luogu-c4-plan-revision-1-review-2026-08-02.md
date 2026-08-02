# V4 C4 Luogu Network Capture Migration — Revision 2 Audit Note

**Date:** 2026-08-02
**Author:** Build self-audit
**Source review:** independent `plan-reviewer` of revision 1, returned
`CHANGES_REQUIRED` (full transcript recorded in this session's reply
history).

## Audit Decisions

| Finding | Disposition | Where applied |
|---|---|---|
| B1 privacy test location + Luogu allowlist gap | closed | `Pre-storage pathname grammar` gains an explicit warning that the current `normalizeCharacterizationEndpointPath` has no Luogu block; privacy prerequisite tests are placed in the new Luogu block of `tests/unit/extensionNetworkObserver.test.ts`. |
| B2 submit-protocol shape unknown | closed | `Evidence target` gains a `Submit protocol shape is unknown` paragraph; `Evidence and identity policy` and `Failure Disposition` reword the `documentId` branch to depend on the sanitized transcript rather than the C2/C3 blocker. |
| H1 fixed 30-second TTL | closed | `Evidence and identity policy` binds the trusted E0 problem-hint window to `UI_HINT_TTL_MS = 30_000` from `extension/src/uiHint.ts`; `Independent Review Gate` item 3 and the privacy prerequisite inherit the same wording. |
| M1 Fake OJ placeholder scenarios | closed | `Fake OJ cases` preserves the existing `luoguScenario` placeholder, declares that new Luogu cases are derived from the sanitized transcript, and forbids copy-paste from another platform. |
| M2 readiness manifest entry timing | closed | `Scope` adds an explicit "Readiness manifest entry" subsection binding the `luogu` record insertion to the registry transition out of `"uncharacterized"`, with the required-field contract. |
| L1 preflight hash command per platform | closed | `Scope` now lists both the Windows PowerShell `Get-FileHash -Algorithm SHA256` form and the POSIX `sha256sum` form. |
| L2 redundant `lastRecordId` declarations | closed | The single statement lives in `Evidence and identity policy`; the review checklist, adapter unit cases, Fake OJ cases, and failure disposition now reference that statement instead of repeating it. |

## Self-Audit Verification

- B1 mitigation is enforceable: `networkObserver.ts` lines 244–262 show
  only `atcoder` and `codeforces` branches; the plan must add a `luogu`
  branch before any preflight receipt is written. The privacy prerequisite
  test plan names `tests/unit/extensionNetworkObserver.test.ts` and the
  five-platform isolation check.
- B2 mitigation is enforceable: the document continuity clause and the
  failure-disposition `documentId` clause both explicitly require the
  transcript to prove the absence of `documentId` before declaring the
  blocker.
- H1 mitigation is enforceable: `UI_HINT_TTL_MS = 30_000` is exported by
  `extension/src/uiHint.ts` and reused by `extension/src/background.ts`
  line 296; the plan forbids a Luogu-specific constant.
- M1 mitigation is enforceable: the existing `luoguScenario` is preserved
  by the plan, and the new-case section forbids copy-paste.
- M2 mitigation is enforceable: the readiness manifest validator in
  `scripts/validate-v4-adapter-readiness.mjs` only requires a record for
  non-`"uncharacterized"` registry statuses; the plan ties manifest
  insertion to that transition.
- L1 mitigation is enforceable: both commands are written verbatim and
  anchored to `extension/dist/{manifest.json,background.js,content.js}`.
- L2 mitigation is enforceable: there is now exactly one declaration of
  the `lastRecordId`-cannot-create-E2 rule, and three cross-references.

## Open Risks After Revision 2

- The plan does not commit a specific characterization fixture path
  beyond the templated `<capture-date>` placeholder; this is intentional
  because the user has not authorized a real window yet.
- The plan does not commit to a specific Luogu submit URL beyond the
  `/fe/api/problem/submit/{pid}` candidate; the real submit URL still
  requires the authenticated transcript.
- The plan does not alter the existing historical Luogu public-DOM
  blocker or the authenticated AC/CE DOM fixture; this preserves the
  Phase 0B4 evidence chain.

## Required Next Step

Independent re-review of revision 2 via `plan-reviewer`. No
implementation, no authenticated browsing, no natural submission may begin
until that reviewer returns `APPROVE` without remaining findings.