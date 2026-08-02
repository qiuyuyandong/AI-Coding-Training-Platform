# V4 <Platform> Network Capture Migration

**Status:** Proposed. Do not implement this platform until this delta plan is independently reviewed.

## Characterization

- Date and source:
- Evidence tier: public or authenticated characterization.
- Safe fixture paths:
- Exact request matcher:
- E2 server-confirmation policy:
- E3 final-verdict identity policy:
- Retained allowlisted fields:
- Forbidden data confirmation:

## Scope

- Objective:
- Files:
- Dependencies and authorization:
- Explicit non-goals:

## Tests First

- Failing unit cases:
- Fake OJ cases:
- Real extension E2E cases:
- Real observation cases:

## Implementation Boundary

- Shared modules that may be modified and the reviewed defect that justifies it:
- Adapters and protocol-specific files that must not be touched:
- Forbidden inferences (no nearest-row guessing, no account identity correlation, no protocol reuse from another platform):

## Failure Disposition

- Missing or ambiguous E1/E2/E3:
- Endpoint drift: define a bounded path-only diagnostic or explicit closed
  rejection for owned submit/status-like routes that miss the exact matcher.
  A generic endpoint key must not silently satisfy or conceal platform
  readiness.
- Terminal readiness result: experimental, blocked, disabled, or production only with independent certification.

## Verification

```powershell
npm run extension:check
npm run extension:e2e
npm run quality:gate
node scripts/validate-v4-adapter-readiness.mjs --all
```

## Completion

- Actual terminal readiness result:
- Evidence report:
- Review result:
