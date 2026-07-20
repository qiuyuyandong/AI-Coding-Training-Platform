请注意，将一切plan写入docs\superpowers\plans，将其作为plan的唯一入口。
如果其他机制有执行或写入plan的需要，则将该机制的plan mklink到superpowers\plans。（如.omo的plan）
## 最终汇报契约

完成重要开发、修复、计划执行、阶段收口、审查或发布准备任务后，最终回复必须使用中文，并提供一份基于实际证据的项目状态报告。

### 必须包含

1. **结果概述**

   * 用一句话说明本轮实际完成了什么。
   * 不要只说“已完成”，应说明完成到哪个工程或产品层级。

2. **版本与 Git 状态**

   * 当前分支。
   * 相关提交 SHA；如果尚未提交，明确写“未提交工作树”。
   * 工作区是否干净。
   * 是否已提交、是否已推送，禁止含糊表达。

3. **阶段定位**

   * 已完成阶段。
   * 当前所处阶段。
   * 下一阶段。
   * 产品长期目标。
   * 明确区分版本号与工程 Phase，禁止混用。

4. **当前可用程度**

   * 列出现在可以可靠使用的能力。
   * 列出尚不能可靠使用或尚未验收的能力。
   * 明确区分：

     * 已实现
     * 已通过自动化验证
     * 可供本地试用
     * 已完成真实观察
     * 已由用户验收
     * 可公开发布

5. **主要变更**

   * 按产品行为或工程结果归纳，而不是机械罗列修改文件。
   * 重点说明修复了什么真实问题、调整了什么范围、删除了什么过时设计。

6. **验证证据**

   * 写明实际运行的权威命令。
   * 报告测试、类型检查、lint、构建、迁移和 E2E 的真实结果。
   * 使用具体数字，例如“764 个单元测试通过、1 个跳过”。
   * 没有运行的检查必须写明“未运行”，禁止推断为通过。
   * 如果验证失败，说明失败阶段、影响范围和共同根因。

7. **剩余工作**

   * 只列真正未完成的当前任务。
   * 区分：

     * 可以立即执行的工程任务
     * 必须等待真实时间、外部参与者或用户决定的任务
     * 未来版本范围
   * 不得把历史计划中的空复选框直接视为当前待办。

8. **约束与未执行事项**

   * 说明哪些事情刻意没有执行及其原因。
   * 例如：没有伪造观察记录、没有提前提交、没有运行最终整理流程、没有修改用户数据。
   * 如果因仓库规则或用户指令停止，明确指出停止条件。

9. **下一步**

   * 给出当前唯一合理的下一动作。
   * 如果下一步需要用户授权、真实观察或外部输入，应明确说明。
   * 不得在条件尚未满足时擅自进入下一版本或扩展范围。

### 表述规则

* 结论必须与代码、Git、测试、报告和计划状态一致。
* 证据优先于计划复选框和旧状态文档。
* 不得把 `PASS`、`APPROVE`、`RC`、`Accepted` 或 `Released` 混为一谈。
* “工程门禁通过”不等于“产品已验收”。
* “Release Candidate”不等于“正式发布版本”。
* 存在真实观察、终审或用户验收缺口时，必须明确写出。
* 不得伪造日期、参与者记录、测试结果、审查意见或提交 SHA。
* 如果工作过程中发现新问题，应在报告中说明它是已修复、仍阻断还是转为后续事项。
* 最终回复应完整但避免重复过程日志，优先呈现结论、证据、边界和下一步。

### 推荐输出顺序

```text
已完成……
- 当前提交：
- 当前阶段：
- 下一阶段：
- 产品总目标：
- 当前可用程度：

主要结果：
- …

验证结果：
- …

仍未完成：
1. …

因此本轮没有……
下一步是……
```


# Agent Handoff Guide

> **Status (2026-07-20):** **V0 validation.** Phase 0 is complete; the V0
> vertical slice, domestic-OJ repair, and passive authenticated characterization
> are implemented in the uncommitted worktree. No replacement RC exists.
> Real-use observations, same-SHA F1–F4 verification, and explicit user
> acceptance remain pending. The previous `ACCEPT_CANDIDATE` report was
> premature because its observation artifacts contain no sessions.

> **Superseded V0 RC:** `b5166320768355666a5c4ff3f466c29c240ea8cf`
> predates the domestic-OJ runtime changes and must not anchor acceptance.
> The latest uncommitted quality gate passes; evidence is recorded in the
> active plan and `work/handoff-current.md`.
> `tests/unit/v0ReportValidators.test.ts` now contains 21 real
> temporary-repository cases for the two-commit release contract. Its focused
> suite, lint, typecheck, and authoritative quality gate pass.

This repository currently implements a local-first AI coding training prototype. It is on branch `feature/v1-followup`; Phase 0A, 0B1-0B3, 0B4 (BLOCKED), 0C1-0C2, 0D, and the Phase 0 AtCoder production certification (T1–T8) are implemented. Phase 0 is complete and reconciled green on 2026-07-17; AtCoder is the sole certified production adapter. The V0 manual learning loop vertical slice is implemented and in validation, not accepted. The domestic-OJ repair is implemented, passively characterized, reviewed, and quality-gate green in the uncommitted worktree; `b5166320768355666a5c4ff3f466c29c240ea8cf` is superseded and no replacement RC exists yet. The only active execution plan is `docs/superpowers/plans/2026-07-20-v0-domestic-oj-capture-stabilization.md`; the 2026-07-18 closeout plan is paused until a new RC is frozen.

`IDEA.md` and `docs/superpowers/plans/2026-07-11-product-development-roadmap.md` define the future V0/V0.5/V1/Public Beta direction. `docs/decisions/0001-local-pilot-to-cloud-saas.md` accepts cloud SaaS as the eventual target but explicitly defers implementation until the Phase 7 gate.

## Current shape

- Next.js App Router application with SQLite persistence through `better-sqlite3`.
- Chrome MV3 extension source lives under `extension/src`; build output is generated under ignored `extension/dist`.
- Paired capture events enter through `POST /api/capture/events`; raw events and deterministic session/attempt projections are written in one transaction with content-sensitive replay safeguards.
- The Chrome extension detects supported problem pages and visible verdict text, including English verdict tokens plus Chinese verdict labels used by NowCoder/Luogu-style UIs. A formal `PLATFORM_ADAPTERS` registry in `extension/src/platforms.ts` declares each platform's readiness as `experimental`, `production`, or `disabled`. AtCoder is `production` (certified 2026-07-17); LeetCode, NowCoder, Codeforces, and Luogu remain `experimental`.
- `/training` supports automatic and manual attempts, optimistic corrections, correction history, and logical voiding. Capture identity fields remain immutable.
- `/training`, `/coach`, and `/growth` use active, non-voided attempts by default; Growth labels automatic and manual sources.
- Domestic authenticated-characterization fixtures live under `tests/fixtures/{leetcode,nowcoder,luogu/authenticated}/`. They are strictly sanitized, prove passive detector behavior, and can never satisfy the production gate. The historical public-DOM Luogu certification corpus and BLOCKED artifact remain unchanged.
- E2E database teardown uses `lstatSync`-based safe deletion (handles symlinks, junctions, and broken reparse points). One file-symlink capability test is skipped under EPERM; all mandatory junction tests pass.
- Playwright e2e smoke tests own the local browser QA server lifecycle through `playwright.config.ts`.

## V0 manual learning loop (implemented; validation pending)

The V0 vertical slice and domestic-OJ repair pass the automated quality gate in the uncommitted worktree, but no replacement RC exists. It is **not yet an accepted release**: passive evidence covers LeetCode.cn AC, NowCoder AC, and Luogu AC/Compile Error without any agent submission, while user-performed LeetCode/NowCoder non-AC transitions, real-use observations, a new RC, and same-SHA F1–F4 remain pending. SHA `b5166320768355666a5c4ff3f466c29c240ea8cf` is superseded and must not anchor acceptance. The following surface exists in code today and is exercised by the offline-core Playwright gate:

- Curriculum catalog: `content/tracks/software-development-foundations-v1/` (12 published nodes, 13 prerequisite edges, 12 reviewed resources, 12 practice mappings) and `content/careers/career-directions-v1.json` (9 career summaries). Migration 0006 adds the catalog tables; the CLI scripts `validate-curriculum.mjs` and `check-curriculum-links.mjs` gate the package.
- Learner and plan persistence: migration 0007 adds `learner_profiles`, `learner_goals`, `diagnostic_sessions`, `diagnostic_responses`, `learner_node_baselines`, `learning_plans`, `daily_plan_snapshots`, `plan_items`, `task_feedback`, `plan_revision_events`.
- Ability projection: migration 0008 adds `attempt_node_mappings`, `ability_snapshots`, `ability_transitions`. The V0 E1 projector (`v0-ability-projector-1`) only reaches `L1` / `L2` from the initial one-task-per-node corpus; `L3–L5` are stored but unreachable.
- Pages: `/map` (keyboard-readable list of 12 nodes plus a static SVG visualization of the 13 edges, labelled supplementary), `/map/[nodeId]` (node detail with outcome, rationale, prerequisites, resource, practice, ability), `/plan` (goal + 6-prompt diagnosis + starting-node override), `/today` (one primary task with ≤3 alternatives and the completion loop).
- APIs: `POST /api/diagnosis` (start/response/complete/override), `POST /api/plans/items/[id]/complete`, `POST /api/plans/items/[id]/feedback`, `POST /api/plan/goal`, `POST /api/plan/override-start`.
- Optional AI reflection: `lib/services/reflectionExperiment.ts` (default disabled, per-request opt-in, native `fetch` only, 7-scalar allowlist, network-denial guard for loopback/RFC1918, deterministic result-keyed fallback). See ADR 0002.
- Observability: `scripts/validate-v0-observation.mjs` (owner/participants), `scripts/validate-v0-exit.mjs` (final two-commit release validation).

## Commands

Use these commands for verification:

```powershell
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run build
npm run quality:gate
```

`npm run lint` runs the strict ESLint flat config. `npm run extension:check` chains typecheck, focused extension tests, the MV3 build, and the `extension/dist` parity/ignore check. `npm run quality:gate` runs the seven commands above in this exact order under an OS-temporary database and is the safe single verification.

For browser smoke QA, Playwright owns the server lifecycle; do not start a separate long-running server. Its prepare/teardown flow creates and removes `.tmp/playwright/training-platform.sqlite` and refuses to reuse a server on port 3000. For other migration or build checks, set `TRAINING_DB_PATH` to a disposable path when the default database must remain untouched.

## Git discipline

- Do not commit unless the user explicitly asks or the active handoff task already includes committing.
- When running git commands in this repository, prefix the command with `$env:GIT_MASTER='1';`.
- Never push or create PRs unless explicitly requested.

## Type and implementation rules

- Keep TypeScript strict. Do not use `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions.
- Keep Coach and Growth logic in pure service modules under `lib/services/**`; pages should call services and render their outputs.
- Keep pages that read SQLite as server components and close database handles in `finally` blocks.
- Keep polling panels as small client components using `useEffect`, `useState`, `fetch(..., { cache: "no-store" })`, and a 5-second interval.

## Local-first boundaries

- Do not read cookies, session tokens, hidden platform data, localStorage tokens, passwords, or full commercial problem statements.
- Do not add external LLM, analytics, sync, or third-party API calls for attempts, verdicts, code, reflections, or capture data without a new explicit design decision.
- Capture and analysis remain local-only by default.

These are current implementation boundaries, not a permanent rejection of the approved cloud target. Future implementation must follow the active Phase plan and ADR; do not introduce cloud/AI behavior merely because it appears in the product vision.

## Useful docs

- `README.md` — quick start and user-facing feature overview.
- `COMPLIANCE.md` — privacy and platform-boundary rules.
- `DESIGN.md` — UI style rules for the quiet slate/white command-center interface.
- `docs/architecture.md` — current code/data flow.
- `docs/runbook.md` — setup, QA commands, and troubleshooting.

## Current handoff

- Phase 0D engineering gates executed on 2026-07-15 and completed/verified. Authoritative commit chronology:
  - Task 1 (strict lint gate and polling corrections): `b3c1993`, `d3a201f`, `e7c14b5`.
  - Task 2 (migration upgrade matrix): `dca2236`.
  - Task 3 (extension test/build/dist parity): `59a6ecc`.
  - Task 4 (aggregate quality gate, Windows CI, and link-safe cleanup correction): `970a9bf`, `7cb6169`.
  - Task 5 (operational docs/status reconciliation and unit-count correction): `cd66285`, `7394e22`.
  - Task 6 (independent final verification evidence): `1e3c950`.
  - Post-review evidence corrections: `71c6287`, `45b19a6`, `0ce73fb`. The authoritative Task 4 and Task 6 database-preservation checks used metadata-only `Get-Item`; a later final review-work QA lane mistakenly invoked `Get-FileHash` once, discarded the hash, made no write, and confirmed the same `Length` and `LastWriteTimeUtc`.
  Phase 0D plan: `docs/superpowers/plans/2026-07-15-phase-0d-engineering-quality-gates.md`. Evidence: `work/reports/phase-0d-engineering-gates.md`. Current Commander state: `work/handoff-current.md`.
- Phase 0C2 completed on 2026-07-14 and is merged at `983e10a`.
- Phase 0B4 (Luogu adapter certification) executed on 2026-07-14 with BLOCKED terminal state. The Luogu certification gate confirmed no production adapter existed at that time. The blocker artifact (`work/reports/luogu-adapter-blocker.json`) documents the missing public verdict DOM as the reason. Re-attempting Luogu production-adapter certification requires a publicly accessible Luogu page with verdict DOM or a new design decision to accept characterization-only evidence.
- Phase 0 AtCoder production certification (T1–T8) executed on 2026-07-16 to 2026-07-17 and completed. AtCoder is the sole production adapter. Phase 0 is green. F1–F4 final verification (plan compliance, code quality/security, hands-on QA, scope/docs fidelity) all APPROVE on 2026-07-17 against commit `45cdd92a161f27622dbe5706a805eab523220910`; no blockers; no required fixes. The user explicitly accepted the Phase 0 verification result on 2026-07-17. Phase 0 is technically verified, documented, and accepted. The current product action is executing `docs/superpowers/plans/2026-07-20-v0-domestic-oj-capture-stabilization.md`; resume the paused 2026-07-18 closeout plan only after a replacement RC is frozen. Do not re-execute the completed 0A-0C2, 0B4, AtCoder T1–T8, or V0 implementation plans; they are retained as implementation records. Do not start V0.5 until V0 is explicitly accepted.
