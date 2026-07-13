# Phase 5 Provider-Neutral AI Coach Delivery Plan

> **For agentic workers:** Use `superpowers:brainstorming` to approve the active data/AI contract, `superpowers:writing-plans` for atomic tasks, `superpowers:test-driven-development` during implementation, `openai-docs` when implementing OpenAI APIs, and `superpowers:verification-before-completion` at each release gate.

**Goal:** Add an evidence-grounded coach that supports a limited platform-funded model and user-provided API credentials while deterministic graph, planning, evidence and review services remain authoritative.

**Non-goals:** No self-trained foundation model, autonomous curriculum publication, silent mastery mutation, unsupported evidence claims, unbounded background calls, MCP event transport, billing in this Phase, or automatic upload of arbitrary repositories.

**Dependencies:** The thin V0 experiment may use Phase 1–3 summaries. Full V0.5/V1 behavior requires stable goals, graph, plans, evidence IDs, review state and snapshot-purpose controls. Public per-user secrets and production quotas additionally require Phase 7 identity/security work.

## 1. Product Contract

Three access paths share one product analysis pipeline:

1. **Deterministic fallback** — always available, no model/key/network required;
2. **Platform default AI** — small free quota, server-funded, rate/cost limited;
3. **BYOK** — learner chooses a supported provider/model and uses their own quota.

Quota exhaustion offers: wait for reset, switch to BYOK, or—only after commercial validation—upgrade. It never removes the knowledge map, plan, review or rule-based Coach.

The platform owns the learning-analysis system; the model is a replaceable reasoning component:

```text
Graph + planner + evidence service
  → allowlisted structured context
  → task-specific model adapter
  → schema-validated explanation/proposal
  → evidence/prerequisite validation
  → user review when stateful
```

## 2. AI Responsibilities and Authority

AI may:

- explain current graph position and recommendation reasons;
- summarize a training session and possible error pattern;
- generate one short reflection question;
- compare reviewed resource candidates supplied by the system;
- discuss goals and propose typed plan revisions;
- analyze user-authorized code snapshots for the current session;
- explain what evidence is missing for the next level.

AI may not:

- invent or publish graph edges, resources or formal routes;
- classify mastery/ability from raw logs without the evidence service;
- write evidence facts or ability snapshots directly;
- cite evidence IDs absent from the request;
- bypass prerequisites, review obligations, effort limits or user confirmation;
- label a learner lazy, incapable or unsuitable for a career.

## 3. Provider and Model Strategy

Expose product-level methods rather than provider-shaped calls:

```ts
interface LearningAiService {
  explainSession(input: ExplainSessionInput): Promise<CoachReport>;
  generateReflection(input: ReflectionInput): Promise<ReflectionPrompt>;
  explainAbility(input: ExplainAbilityInput): Promise<AbilityExplanation>;
  proposePlanRevision(input: PlanRevisionInput): Promise<PlanChangeProposal>;
}
```

Adapters may include direct providers, one router/backup provider and BYOK credentials. Core product code depends only on this interface.

V1 does not train a model. After enough records contain training trajectory, user feedback and later transfer/retention outcomes, a future small model may handle narrow tasks such as error classification or log compression. From-scratch foundation-model training remains out of scope.

MCP is not used for request routing or high-frequency training logs. A future MCP server may expose read-only learning tools to external AI clients after Public Beta.

## 4. Data, Consent, and Security Contract

### 4.1 Context categories

Default safe context may include:

- node/task IDs and titles;
- plan reason codes and selected effort boundary;
- derived session outcome, evidence coverage and confidence;
- bounded verdict/error/diff features;
- due reviews and target-career level;
- user-authored question for the current request.

Raw code, reflection text and detailed diagnostics require their own enabled category. Full problem statements, local absolute paths, cookies, tokens, environment variables and unrelated workspace files are always excluded.

### 4.2 Separate purposes

Store distinct choices for:

1. sending data to complete the current AI analysis;
2. retaining the validated report in the learner history;
3. using anonymized structured feedback to improve rules;
4. using raw code/dialogue to train a general model.

Purpose 4 is not implied by purposes 1–3 and requires a separate public-release decision/consent contract.

### 4.3 Secret handling

- Platform provider keys are server-only, never returned to clients or written to audit payloads.
- Local single-user BYOK may temporarily use process environment/Git-ignored configuration.
- Public multi-user BYOK must use encrypted secret storage/KMS and tenant-scoped access in Phase 7; it cannot ask each user to edit the server's `.env.local`.
- Keys never enter SQLite learning tables, logs, diagnostics, exports, HTML or model context.

### 4.4 Untrusted input/output

- External resource titles, notes, problem metadata and code comments are untrusted and cannot alter system instructions.
- Build context through a typed allowlist, not string concatenation.
- Parse outputs with Zod and reject unknown evidence/resource IDs.
- Stateful operations are typed proposals, pass deterministic validation, show a diff and require acceptance.
- Provider errors, malformed output, quota exhaustion and timeouts return deterministic fallback without partial state changes.

## 5. Planned Data Contracts

At Phase 5 kickoff, assign the next available migration prefix to `ai_coach_service.sql` after inspecting merged history.

Tables contain no secret and no unredacted prompt by default:

- `ai_provider_preferences`: mode (`platform_default`, `byok`, `disabled`), provider/model identifier, enabled context categories and secret reference metadata;
- `ai_quota_ledger`: subject, quota period, request class, reserved/used units, status and idempotency key;
- `ai_request_audits`: purpose, schema/context version, provider/model, field categories, payload hash, status, latency and token/cost metadata;
- `ai_coach_reports`: validated structured result, evidence references, uncertainty, model/schema version and retention state;
- `plan_change_proposals`: typed operations, rationale, evidence references, validation and user decision;
- `ai_feedback`: accepted/helpful/corrected signal linked to a report, without silently authorizing model training;
- `ai_consent_events`: purpose-specific choice, policy version, source and withdrawal time.

Core modules:

- `lib/ai/provider.ts`
- `lib/ai/providers/openAiCompatible.ts`
- `lib/ai/contextBuilder.ts`
- `lib/ai/redaction.ts`
- `lib/ai/responseSchemas.ts`
- `lib/ai/quota.ts`
- `lib/services/learningAiService.ts`
- `lib/services/coachReportService.ts`
- `lib/services/planProposalService.ts`
- `lib/services/aiConsentService.ts`

## 6. Work Packages

### 5.1 Threat model, purpose model and context allowlist

- [ ] Test that keys, cookies/tokens, hidden/full problem content, absolute paths, unrelated files and disabled categories cannot enter requests/logs.
- [ ] Implement typed context builders per AI task with explicit size limits and purpose IDs.
- [ ] Treat external text/code comments as quoted data and add prompt-injection regression fixtures.
- [ ] Document providers, retention, deletion, quota and fallback behavior.

### 5.2 Provider-neutral contract

- [ ] Define adapter request/response/error interfaces and contract tests using local mock fetch.
- [ ] Implement one OpenAI-compatible adapter behind `LearningAiService`.
- [ ] Normalize timeout, abort, rate limit, quota, malformed output and provider outage.
- [ ] Unit/E2E tests deny unexpected external network calls.

### 5.3 Platform-default and BYOK modes

- [ ] Test disabled, platform-default, BYOK, exhausted quota, invalid key and provider fallback states.
- [ ] Add server-side platform-key configuration and an idempotent reservation/usage quota ledger.
- [ ] Add local BYOK connection test without returning/logging the key.
- [ ] Leave public encrypted per-user secret persistence behind the Phase 7 gate.

### 5.4 Evidence-grounded reports

- [ ] Test reports for independent completion, assisted completion, productive struggle, insufficient evidence and code-analysis-disabled mode.
- [ ] Require claims, evidence IDs, uncertainty and suggested action.
- [ ] Reject unsupported evidence/resource references and fall back to deterministic Coach.
- [ ] Let the user inspect included data categories and delete retained reports.

### 5.5 Reflection and plan proposals

- [ ] Trigger short reflection only for assisted, abnormal, disputed or unfinished sessions, not after every task.
- [ ] Restrict plan operations to typed reprioritization, task replacement, reviewed-resource suggestion, diagnosis request or goal clarification.
- [ ] Validate prerequisites, reviews, effort boundary, workload and resource status.
- [ ] Show before/after diff and require acceptance; accepted changes create normal plan events.

### 5.6 AI evaluation and observability

- [ ] Add fixed regression cases for one-AC false mastery, fabricated evidence, unreviewed resource, prompt injection, overconfident career judgment and direct state mutation.
- [ ] Record latency/token/cost/quota metadata without raw secrets or unrelated content.
- [ ] Collect user correction/helpfulness separately from model-training consent.
- [ ] Add E2E paths for disabled AI, platform quota, BYOK, rejected proposal, malformed response and deterministic fallback.

## 7. Verification Commands

All provider tests use local mocks:

```powershell
npm run test -- tests/unit/aiContextBuilder.test.ts tests/unit/aiProviderContract.test.ts tests/unit/aiQuota.test.ts tests/unit/coachReportService.test.ts tests/unit/planProposalService.test.ts tests/unit/aiConsentService.test.ts
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

## 8. Exit Gate

- [ ] With AI disabled, unavailable or quota-exhausted, all deterministic learning functions remain usable.
- [ ] Platform and BYOK keys never enter client payloads, learning tables, logs, diagnostics or exports.
- [ ] Every accepted AI claim cites supplied evidence IDs; unknown citations are rejected.
- [ ] Disabled context categories never enter the payload, including raw code.
- [ ] Prompt-injection fixtures cannot change tool authority or publish content.
- [ ] AI plan changes are typed, validated, diffed and explicitly accepted.
- [ ] Quota reservations are idempotent and provider failures do not double-charge usage.
- [ ] Feedback collection does not imply raw-code/model-training consent.
- [ ] No automated test calls a real provider.
- [ ] Full phase gate passes.

## 9. Risks and Controls

- **AI authority creep:** deterministic services own facts and state; AI emits explanations/proposals only.
- **Secret leakage:** server-only/encrypted secret references, allowlists and redaction tests.
- **Prompt injection:** typed context boundaries, quoted untrusted data, fixed adversarial fixtures and no arbitrary tools.
- **Cost spikes:** explicit quotas, request classes, idempotent ledger, size limits and deterministic fallback.
- **Provider lock-in:** product-level interface plus direct/route/BYOK adapters.
- **Consent ambiguity:** separate analysis, retention, product improvement and model-training purposes.
