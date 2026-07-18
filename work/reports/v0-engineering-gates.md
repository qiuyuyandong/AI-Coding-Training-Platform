# V0 Engineering Gates Report

> **Status (2026-07-18): PRE-RC / SUPERSEDED EVIDENCE.** The earlier
> SHA-anchored engineering report described an implementation that predates the
> stabilization fixes. It is not valid release evidence for the current V0.

## Current verified worktree

The stabilization package repairs the plan-completion row-ID regression,
stale ability projection, later-pass L2 promotion, optional-AI lookup, and the
Windows curriculum-link test harness. A full worktree quality gate passed
before the release-validator rewrite; details are preserved in
`work/reports/v0-stabilization-2026-07-18.md`.

The two-commit V0 release validator now has 21 executable temporary-repository
regression cases. Its focused suite, lint, and typecheck pass.

## Release-evidence rule

This file intentionally contains no machine-readable `implementationSha` or
PASS decision yet. Those fields may be written only after:

1. the authoritative quality gate passes on the exact RC worktree;
2. independent review finds no blocking or important unresolved issue; and
3. the RC implementation commit exists and supplies its immutable 40-character
   SHA.

After the RC commit, this report will be regenerated against that SHA and kept
with the observation and final release evidence. V0 remains in validation.
