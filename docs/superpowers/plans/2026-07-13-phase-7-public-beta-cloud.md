# Phase 7 Public Beta Cloud Delivery Plan

**Status (2026-07-18):** Long-term total product target; not started. Phase 6
has not produced its readiness decision, so the entry gate is not met. This is
not an active implementation plan.

> **For agentic workers:** Activate this plan only after the Phase 6 readiness decision. Use `superpowers:brainstorming` for the provider/data architecture, `superpowers:writing-plans` for atomic tasks, the relevant security threat-model skill before implementation, `superpowers:test-driven-development` during implementation, and `superpowers:verification-before-completion` before inviting public users.

**Goal:** Convert the validated V1 pilot into a hosted multi-user product with durable cloud data, authenticated browser OJ ingestion, explicit project-evidence submission, limited platform AI and complete user data controls.

**Non-goals:** No social feed, leaderboard, large organization tenancy, automatic import of arbitrary repositories, unrestricted free AI, self-hosted foundation model, MCP ecosystem, or broad paid launch before cost and retention are understood.

**Entry gate:** Phase 6 produces a written readiness decision, zero unresolved critical data/security defects, a validated four-week learning loop, known capture correction rates, a tested backup/restore path and an explicit list of V1 gaps accepted for Public Beta.

## 1. Required Architecture Decisions

Before code changes, approve ADRs for:

1. PostgreSQL-compatible managed database and migration/rollback provider;
2. S3-compatible encrypted object storage for code snapshots;
3. account/authentication provider and session model;
4. tenant authorization policy and service-to-service identity;
5. encryption/key-management strategy for BYOK secrets;
6. platform AI providers, router/fallback policy and regional data transfer;
7. snapshot/report/event retention schedules and deletion SLA;
8. hosting topology for mainland-China accessibility and extension endpoints;
9. backup, restore, incident response and audit-log retention;
10. purpose-specific consent and policy versioning.

The atomic implementation plan copies the chosen exact providers and versions from these ADRs. Do not leave production storage as “SQLite on Vercel” or silently select a vendor inside feature code.

## 2. Target Data Boundaries

### Shared public content

- curriculum packages, career summaries, knowledge graph, reviewed resources and problem mappings;
- globally stable IDs and versions;
- no learner-private state.

### Tenant-scoped structured data

- account/profile, goals, plans, task actions, evidence facts, ability projections, reviews, reports, quotas and consent events;
- every repository query requires an authenticated tenant scope;
- public-content IDs may be referenced but never imply access to another learner's data.

### Tenant-scoped object data

- code snapshots and permitted diagnostics only;
- object key contains an opaque tenant namespace and random object ID, not email, local path or problem title;
- database row stores purpose, hash, size, type, retention state and authorization reference;
- deletion queues are idempotent, observable and retryable.

### Secrets

- platform keys remain service secrets;
- BYOK credentials are encrypted with managed keys, accessed only for the owning tenant and never written to application logs/database plaintext;
- exports and support bundles contain provider names/key-presence state, never credentials.

## 3. Migration Strategy

- Keep local SQLite as a pilot/offline export format, not a production shared database.
- Introduce persistence interfaces for learner/content/snapshot storage before moving routes.
- Build an explicit local-to-cloud import with preview, stable identity mapping, checksum, dry-run and rollback.
- Import append-only events first, then deterministically rebuild derived plans/ability/review snapshots using recorded versions.
- Never upload local data merely because the user creates an account; require an import/sync choice and show categories.
- Preserve a downloadable local export so users can leave the service.

## 4. Work Packages

### 7.1 Identity, account lifecycle and tenant authorization

- [ ] Implement sign-up/in/out, session expiry, credential recovery/provider flow, account closure and re-authentication for destructive actions.
- [ ] Add central tenant policy enforcement and tests for every learner-owned repository/API route.
- [ ] Deny cross-tenant identifiers with indistinguishable not-found behavior where appropriate.
- [ ] Add rate limits and audit events for auth, export, delete, secret and ingestion operations.

### 7.2 Durable relational persistence

- [ ] Port migrations/repositories to the selected PostgreSQL-compatible store while retaining pure domain services.
- [ ] Add tenant keys, foreign-key constraints, idempotency and version fields deliberately; do not mechanically add `user_id` without query tests.
- [ ] Test fresh deployment, local import, forward migration, rollback/recovery and derived-state replay.
- [ ] Back up and restore a staging dataset before the first invite.

### 7.3 Snapshot object storage and retention

- [ ] Implement encrypted upload/download through short-lived, tenant-bound authorization or a bounded server proxy.
- [ ] Validate type/size/hash/purpose and reject secrets, unsupported files and workspace-external content at the client and server.
- [ ] Implement full/basic/minimal modes, retention expiry, user pinning, per-task delete and delete-all.
- [ ] Reconcile orphan database rows/objects and prove deletion retries are safe.

### 7.4 Authenticated browser ingestion and explicit project evidence

- [ ] Replace localhost-only identity with scoped browser installations and revocable credentials.
- [ ] Bind every browser event to tenant, installation, adapter version, session/submission and idempotency key; bind every project-evidence submission to tenant, learner confirmation, task, purpose and checksum.
- [ ] Implement bounded offline queue, refresh, conflict response and visible sync health.
- [ ] Preserve local/manual fallback when cloud or a platform adapter is unavailable.

### 7.5 Platform AI quota and BYOK secrets

- [ ] Move platform-funded requests behind authenticated server endpoints with atomic/idempotent quota reservation.
- [ ] Store BYOK credentials in encrypted secret storage and reveal only masked provider/key-presence status.
- [ ] Implement provider disclosure, purpose/context categories, cost guardrails, timeout/fallback and deletion of retained reports.
- [ ] Prove quota/provider failures leave deterministic Coach/Today usable and do not double-charge.

### 7.6 Consent, export and deletion

- [ ] Version separate purposes for functional analysis, report retention, anonymized product improvement and raw-code/model-training use.
- [ ] Store consent/withdrawal events and enforce the current choice at collection, AI transfer, retention and training-data export boundaries.
- [ ] Build user-readable export covering structured data, object manifest, versions and provider history.
- [ ] Build account deletion with preview, re-authentication, grace policy if adopted, object purge, backup-retention disclosure and completion receipt.

### 7.7 Operations, support and distribution

- [ ] Add production health, structured redacted logging, alerting, incident runbook, provider/cost dashboards and restore drills.
- [ ] Publish Chrome and Edge packages with minimum optional host permissions and reviewed privacy disclosures.
- [ ] Provide a Windows installation/diagnostics path for the browser extension and editor-neutral explicit evidence workflow.
- [ ] Verify core pages, resources and extension endpoints from representative mainland-China networks.

### 7.8 Controlled Public Beta

- [ ] Invite a bounded cohort; cap storage and AI exposure per account/device.
- [ ] Monitor tenant/security errors, sync corrections, snapshot deletion, provider cost and deterministic fallback.
- [ ] Freeze payment integration until per-active-user infrastructure/AI cost and four-week value are measured.
- [ ] Produce a beta report and approve/reject the next commercial phase.

## 5. Security and Privacy Verification

Required automated suites include:

- cross-tenant read/write/IDOR attempts for every learner resource;
- device credential theft/revocation/replay and event idempotency;
- snapshot path/type/size/hash/secret/retention/delete cases;
- BYOK encryption/access/log/export cases;
- purpose withdrawal blocking future collection/AI/training export;
- prompt injection and unsupported evidence/resource citation;
- quota race, provider retry and double-charge prevention;
- local import dry-run, rollback and deterministic projection rebuild.

Run the normal repository gate plus the cloud integration, migration, authorization and restore suites defined in the atomic plan. Tests use isolated tenants and non-production credentials; no test calls a billable model unless a separately approved staging smoke check explicitly does so.

## 6. Exit Gate

- [ ] Every learner-private repository/API operation requires and tests a tenant scope.
- [ ] Automated cross-tenant suites find zero unauthorized read, mutation, object access or inference path.
- [ ] Browser installations can be listed and revoked; replay cannot duplicate browser events, explicit evidence or quota usage.
- [ ] Full/basic/minimal modes are enforced end to end.
- [ ] Export is complete and readable; account deletion removes active relational/object data according to the published contract.
- [ ] BYOK secrets never appear in plaintext database rows, responses, logs, support bundles or exports.
- [ ] Platform AI quotas are race-safe and deterministic fallback survives exhaustion/outage.
- [ ] Backup restore and one failed-migration rollback are rehearsed in staging.
- [ ] Chrome/Edge distribution and the editor-neutral Windows evidence workflow pass the supported-environment checklist.
- [ ] Public privacy/provider/retention disclosures match the implemented data flow.
- [ ] Critical security/data-loss defects are zero before public invitation.

## 7. Risks and Controls

- **Premature cloud rewrite:** activate only after Phase 6; preserve pure domain services and replayable events.
- **Cross-tenant leak:** central authorization, scoped repositories, negative tests and opaque object keys.
- **Snapshot cost/privacy:** event-only capture, three modes, quotas, retention and user deletion.
- **AI cost abuse:** atomic quota, rate limits, task-specific context limits and deterministic fallback.
- **BYOK secret exposure:** managed encryption, minimum access and no plaintext observability.
- **Consent laundering:** purpose-specific versions and enforcement, not one broad “improve service” checkbox.
- **Domestic availability:** provider/hosting evaluation, Chrome + Edge distribution and visible degraded modes.
