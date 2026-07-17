# ADR 0002: Optional V0 AI Reflection Boundary

- Status: Accepted
- Date: 2026-07-17

## Context

IDEA.md:396 states that V0 delivers a "规则式 Coach，AI 只做一个可关闭的薄切片" (rules-based Coach; AI contributes only one thin, closeable slice). The V0 gate in the product roadmap treats the core learning loop as a complete offline product. AI is an optional experiment that must not become a requirement for any user.

The current codebase is pre-AI. No provider calls, API keys, quota tables, or AI-authored content exist in `lib/`, `app/`, `components/`, `scripts/`, `extension/`, or `lib/db/migrations/`. COMPLIANCE.md reflects this pre-AI reality and must not be rewritten until Todo 26 after AI behavior is implemented and verified.

This ADR freezes the V0 AI boundary so every future todo (21, 22, 23) can reference it without re-litigating scope.

## Decision

- AI is a separable post-core experiment. The offline learning loop must function identically with AI disabled, config-missing, or unreachable.
- AI is disabled by default. The learner must explicitly opt in per completion; the default UI checkbox is unchecked.
- Local single-user API key comes only from Git-ignored environment configuration (`V0_AI_REFLECTION_API_KEY`). It is never persisted in SQLite, never logged, never returned to the client, and never written to diagnostics, exports, or audit payloads.
- Explicit unchecked per-request opt-in. The `requestAiReflection` flag defaults to false in every completion request body. The server must treat absent, null, or false as disabled.
- The request payload is an allowlist of exactly seven scalars. The seven scalar fields are: `nodeStableId`, `nodeTitle`, `practiceTaskStableId`, `practiceTaskTitle`, `planReasonCode` (the first persisted reason-codes entry after deterministic priority, defined in Todo 21), `effortBoundaryMinutes`, and `completionResult` (`passed` | `failed` | `partial` | `stuck`).
- Output is one non-persisted question parsed from `choices[0].message.content` as strict `{ question: string(1..300) }`. Reject responses containing URLs, code fences, mastery claims, evidence claims, or state-mutation instructions. The question is not persisted in any table.
- deterministic fallback activates on: disabled, config-missing, timeout, abort, HTTP-non-2xx, malformed JSON, schema failure, or unknown output. Fallback questions: passed → "What part of your approach would you reuse on a harder variant?"; partial → "What evidence shows progress, and what remains unresolved?"; failed or stuck → "What is the smallest failing assumption you can test next?".
- Network isolation: the AI call lives outside SQLite transactions. It cannot alter ability or plan state. A provider failure cannot convert a committed core success into an HTTP failure.
- Excluded data from every AI request: no code, no reflection text, no cookies, no tokens, no absolute file paths, no full problem statements, no platform identity, no attempt IDs, no planning history, no host name, no provider telemetry opt-in.

## Consequences

V0 retains the complete offline learning loop without AI. AI only appears when the learner explicitly checks a per-completion opt-in. Release gating (engineering content privacy gates plus one-week owner trial plus two-week two-user observation) is unchanged. No AI tables, quota ledger, BYOK UI, provider preferences, analytics, retention, or model-training consent exist in V0.

## Notes / Open

Future work (V0.5 or later) may make this feature configurable or removable without a database migration. The current scope deliberately avoids any AI persistence so the decision to remove or re-architect the reflection experiment carries no data-migration cost.
