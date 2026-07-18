# ADR 0001: Local Pilot, Cloud SaaS Target

- Status: Accepted product direction; cloud implementation deferred to Phase 7
- Date: 2026-07-13

## Context

The repository is currently a single-user local Next.js application backed by `better-sqlite3`. This is useful for fast, private experiments, but it cannot provide public accounts, cross-device history, platform-funded AI quotas, centralized analysis or a sustainable paid service.

The first users are the owner and roommates, and the core learning loop is still unvalidated. Migrating immediately to a full multi-tenant platform would add authentication, authorization, cloud storage, operations and compliance work before proving that users will follow the recommended tasks.

## Decision

Use two explicit architecture stages:

1. **V0–V1 pilot:** keep the existing local Next.js + SQLite runtime while validating reliable OJ capture, the daily learning loop, evidence semantics, editor-agnostic project practice and the four-week pilot.
2. **Public Beta:** migrate to a hosted multi-tenant service after the Phase 6 readiness gate. Use a durable PostgreSQL-compatible database for structured data, encrypted object storage for explicitly selected code snapshots, authenticated HTTPS ingestion for browser OJ events, and user-initiated project-evidence submission.

Design new domain data with stable IDs, append-only/replayable evidence and storage interfaces so the public migration can rebuild derived state instead of copying opaque local snapshots.

Ordinary APIs, not MCP, carry high-frequency training events. MCP remains a later optional interface for external AI clients.

Project learning does not use an editor plugin or background workspace
monitor. Build/test results, snapshots and Git diffs enter only after explicit
user action and preview. The system never treats save counts, edit duration,
debug activity, command history or keystrokes as learning evidence.

## Consequences

Positive:

- the core product can be tested before a cloud rewrite;
- current code remains useful;
- public architecture, default AI quota and future billing remain possible;
- replayable evidence gives the migration an auditable path.

Costs:

- local and cloud storage adapters eventually both need support;
- a deliberate local-to-cloud import/export flow is required;
- per-user secrets and tenant authorization cannot reuse the local `.env.local` pattern;
- V1 pilot success does not mean the public service is operationally ready.

## Guardrails before Phase 7

- Do not claim accounts, sync, hosted AI or cloud retention are currently implemented.
- Do not add ad-hoc `user_id` columns without a tenant authorization design.
- Do not use a shared SQLite file or ephemeral deployment filesystem as public storage.
- Do not upload local pilot data when an account is later created without preview and explicit import choice.
- Keep content-package versions separate from personal learning state.
- Keep code snapshot bytes out of general analytics rows.

## Phase 7 decisions still required

- exact database, object-storage, auth and hosting providers;
- BYOK encryption/key-management implementation;
- snapshot/report/event retention and deletion SLA;
- platform AI provider, quota and fallback policy;
- mainland-China access and browser-extension distribution strategy;
- purpose-specific consent and raw-code/model-training policy;
- backup, restore, incident response and pricing readiness.

These are intentionally unresolved provider choices, not permission to implement them silently.
