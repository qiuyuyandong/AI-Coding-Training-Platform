# V4 Phase D Local Vault P0 Baseline — 2026-08-24

## Authorization

The user approved
`docs/superpowers/plans/2026-08-24-v4-phase-d-local-vault-no-pairing-revision.md`
for offline P0–P6 implementation, validation, and necessary local commits.
P1 is a hard stop on failure. P7 and all real OJ browsing, clicking, submitting,
push, PR, release, D4 delivery, and D5 work remain unauthorized.

## Git baseline

- Branch: `feature/v1-followup`
- HEAD: `e6e3faadf110be004323d3a3eb40ae21c2832182`
- Upstream relation: ahead of `origin/feature/v1-followup` by 12 commits
- Worktree was already dirty before P0. The following paths are pre-existing,
  user-owned changes and must not be reverted or mixed into Local Vault commits:
  - `.gitignore`
  - `docs/superpowers/plans/2026-08-23-v4-phase-d-cross-project-capture-chain-reliability-repair.md`
  - `next.config.ts`
  - `package-lock.json`
  - `package.json`
  - `sentry.server.config.ts`
  - `work/handoff-current.md`
  - `.mcp.json`
  - `app/api/sentry-example-api/`
  - `app/global-error.tsx`
  - `app/sentry-example-page/`
  - `opencode.json`
  - `sentry.edge.config.ts`
  - `work/reports/v4-phase-d-p7f6-new-candidate-ready-preflight-blocker-2026-08-24.md`
- The approved Local Vault plan was also untracked at baseline and becomes
  task-owned only for recording and executing this authorization.

## Default database guard

- Path: `D:\Cowork\AI刷题训练平台\training-platform.sqlite`
- Size: `479232` bytes
- mtime UTC: `2026-07-23T15:56:38.8411343Z`
- SHA-256: `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`

P1 must not open or mutate this database. P2–P6 tests and migration checks use
only disposable Vaults/databases. Candidate validation must prove these three
default-database values remain unchanged.

## Superseded candidate assets retained as history

- Candidate: `34916705712cac1ef2e5d8816cd8e40fa4e29ca7`
- Receipt: `.tmp/p7f6-candidate-receipt-3491670.json`
- Receipt SHA-256:
  `986EC5E4456BA60AC9918CB105691F2A8D70BC76FCB02375D09F75EF9630E1EE`
- Exact dist: `.tmp/p7f6-exact-dist-3491670`

| Asset | SHA-256 |
|---|---|
| `manifest.json` | `45F7CF9C66A77B10FE49252FEC7D3F941D535B9E36F85F6BDC16117591D605CC` |
| `background.js` | `41347B02C232D6648FCFF67862DECFE8E0BE2C6971AA89FAA008266B2CAD6064` |
| `content.js` | `7BD8D4414261338940FA8D9A71EDDFEBD57A0441468B9EB3518FEBFB71DEF324` |
| `popup.js` | `9C1431DBD591C4C329EEEF35F6642469B572A882306ED9FABBF8C035F94B7025` |
| `main-world-bridge.js` | `390E14403830EEB27BC3925E7136C27A2303499303428316123549B9BF54DF5B` |

The Local Vault implementation necessarily changes the product, manifest,
migration, and readiness contract. Candidate `3491670` therefore remains only
immutable evidence for the superseded paired product and cannot be relabelled.

## P0 result

ADR 0004 records the approved local trust boundary, Vault ownership, exact
extension-Origin prerequisite, and Phase 7 exclusion. The Phase 0B3 design is
marked historical without rewriting its implementation record. No runtime code,
database, extension storage, server, browser, or OJ was touched in P0.
