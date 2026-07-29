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

> **Status (2026-07-29):** **V4 NowCoder E3 ingress engineering PASS**
> on the uncommitted Tasks 0-6 worktree of
> `docs/superpowers/plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`.
> Phase B B8's missing-E3 layer is fixed through a pure
> `extension/src/contentIngress.ts` coordinator (closed 7-input / 5-effect
> union, bounded 100 transient entries, no `chrome.*` / DOM / wall clock),
> an idempotent `extension/src/contentBootstrap.ts` sentinel
> (`installed | installing | inactive`), and
> `extension/src/background.ts` self-healing
> `chrome.scripting.executeScript` + `chrome.webNavigation`. Production-built
> `extension/dist` proves the chain end-to-end on a fresh profile with
> no characterization: real-Chrome Task 5 records one closed
> `contentIngressReady` and one unmatched E3 with the exact URL
> submission id; Task 6 records one bundle, one
> `POST /api/capture/attempts`, and one SQLite training attempt.
> `npm run quality:gate` exited 0 on 2026-07-29. **NowCoder remains
> `experimental`**; the Phase B B8 `BLOCKED` verdict from
> `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
> is superseded only for the missing-E3 ingress layer, every other
> Phase B outcome remains authoritative, and adapter promotion
> requires a separate reviewed decision.
>
> **Earlier V4 evidence (still authoritative for their own scope):**
> V4 infrastructure engineering PASS (scope-reduced) for Phase A Tasks A0-A12;
> Phase B B0-B7 complete and B8 terminally BLOCKED at real-result E3 ingress;
> formal V0 observation blocked. Phase 0 click-ingress stopgap (`2f4f5d8`
> and earlier V3 repair work) remains historical evidence, not a
> current acceptance anchor. Phase A0-A12 (`b3ec8cb` and the 12
> follow-on commits through `0dc3fbf`) is the authoritative V4
> framework engineering pass. Phase B B2 added an opt-in NowCoder
> diagnostic mode with session-backed production ingress isolation,
> worker-restart fail-closed, and exact safe transcript export;
> independent privacy review APPROVED on 2026-07-27.
> B4 safely characterized NowCoder; B5-B6 implemented the strict experimental
> adapter; B7 proves the production-dist synthetic full chain.
>
> **Superseded V0 RC:** `b5166320768355666a5c4ff3f466c29c240ea8cf`
> predates the domestic-OJ runtime changes and must not anchor
> acceptance. Earlier Phase 0 stopgap `2f4f5d8` is historical V3
> repair evidence, not a current acceptance anchor. The
> authoritative V4 Phase A A0-A12 closeout lives in
> `work/reports/phase-a-final-closeout.md` and `work/handoff-current.md`.
> `tests/unit/v0ReportValidators.test.ts` contains 21 real
> temporary-repository cases for the two-commit release contract.
>
> This repository currently implements a local-first AI coding
> training prototype. It is on branch `feature/v1-followup`. Phase 0A,
> 0B1-0B3, 0B4 (BLOCKED), 0C1-0C2, 0D, the Phase 0 AtCoder production
> certification (T1–T8), the V0 manual learning loop vertical slice
> (implemented; observation and acceptance pending), the V4 Phase 0
> click-ingress stopgap, and the V4 Phase A A0-A12 closeout scope are
> all on the branch. AtCoder is the sole certified production DOM
> adapter. Phase B is terminally `BLOCKED` after B0-B7 PASS and B8 partial
> observation: real E3 ingress remains missing. Do not
> start Phase C without fresh explicit authorization and a reviewed plan. Formal
> observation and replacement-RC work remain blocked. Do not start
> V0.5.
>
> `IDEA.md` and
> `docs/superpowers/plans/2026-07-11-product-development-roadmap.md`
> define the future V0/V0.5/V1/Public Beta direction.
> `docs/decisions/0001-local-pilot-to-cloud-saas.md` accepts cloud
> SaaS as the eventual target but explicitly defers implementation
> until the Phase 7 gate.

## Current shape

- Next.js App Router application with SQLite persistence through
  `better-sqlite3`.
- Chrome MV3 extension source lives under `extension/src`; build output
  is generated under ignored `extension/dist`.
- The V3 extension sends completed four-event attempt bundles through
  `POST /api/capture/attempts`; all four raw events and the
  deterministic attempt projection are written in one SQLite
  transaction. `POST /api/capture/events` remains only for backward
  compatibility.
- The V4 Phase 0 extension never creates waiting from a click. A
  trusted visible enabled exact control may create only a bounded E0
  hint in `chrome.storage.session`; NowCoder additionally requires
  `button.btn-submit` labelled exactly `保存并提交`. Waiting reads
  only validated `confirmedSubmissions`. Existing completed outbox
  items still use the V3 four-event/API contract. A formal
  `PLATFORM_ADAPTERS` registry declares DOM readiness; AtCoder is
  `production`, while LeetCode, NowCoder, Codeforces, and Luogu remain
  `experimental`; NowCoder's V4 network policy is also `experimental`, while
  the other real platforms remain network-uncharacterized.
- The V4 NowCoder E3 ingress repair (Tasks 0-6 of the
  2026-07-29 plan, uncommitted working tree) adds:
  - `extension/src/contentIngress.ts` — pure coordinator with a
    closed 7-input / 5-effect union, exactresult route gate
    (no trailing slash, synchronized with the existing E3 policy),
    bounded 100-entry transient registry, and a closed
    `CONTENT_RUNTIME_READY` value guard.
  - `extension/src/contentBootstrap.ts` — three-state
    `installed | installing | inactive` sentinel so a second
    static or programmatic injection reannounces readiness but
    cannot install another capture runtime, and a capture-disabled
    install clears the sentinel.
  - `extension/src/background.ts` self-healing
    `chrome.scripting.executeScript` (with `world: "ISOLATED"`,
    `target: { tabId, documentIds: [docId] }` when Chrome supplies
    a document id, otherwise `frameIds: [0]`) driven by four
    `chrome.webNavigation` listeners; `onStartup` and worker
    initialization reconcile an already-open eligible result
    tab via `reconcileOpenNowCoderResultTabs`.
  - `extension/manifest.json` — `scripting` and `webNavigation`
    permissions added; existing `content_scripts` matches and
    per-host `host_permissions` unchanged. No `<all_urls>`, no
    `tabs`, no `activeTab`, no `allFrames`.
  - Closed control-plane persistence: `session.contentIngressReady`
    (max 20) records ready handshakes observed by Task 5 only;
    `session.contentIngressDiagnostics` (max 20) records
    `injection_failed` reason codes only. Neither key enters
    capture state.
- V4 Phase A0-A12 (commits `7d6bf9e` through `b3ec8cb`, with review
  fix-up commits `9b81784`, `6401e17`, `30f3d73`, and the closeout
  `0dc3fbf`):
  - A0 webRequest test path GO. A1 Safe Evidence boundary.
  - A2 adapter contracts + AST dependency gate. A3 strict Evidence
    Correlator. A4 pure Capture State Machine (7-state model,
    SHA-256 bundle id, additive V3 `submission_confirmed` action).
    A5 session/local storage split. A6 production webRequest
    observer. A7 optional MAIN bridge (with recursive
    forbidden-key defense). A8 background orchestrator (pure data
    plane, no `chrome.*`). A9 Fake OJ matrix (18 scenarios + 3
    cross-platform smoke + 1 webRequest spike = 32 spec; 31 passed /
    1 known skip). A10 disposable SQLite lifecycle + production
    extension E2E smoke test. A11 nine-stage quality gate
    integration. A12 plan reconciliation + closeout report.
  - Every authoritative gate command exits 0. Real platforms remain
    uncharacterized for V4 network capture; B3 later adds only a NowCoder
    browse-only navigation witness.
- `/training` supports automatic and manual attempts, optimistic
  corrections, correction history, and logical voiding. Capture
  identity fields remain immutable.
- `/training`, `/coach`, and `/growth` use active, non-voided
  attempts by default; Growth labels automatic and manual sources.
- Domestic authenticated-characterization fixtures live under
  `tests/fixtures/{leetcode,nowcoder,luogu/authenticated}/`. They
  are strictly sanitized, prove passive detector behavior, and can
  never satisfy the production gate. The historical public-DOM
  Luogu certification corpus and BLOCKED artifact remain unchanged.
- E2E database teardown uses `lstatSync`-based safe deletion
  (handles symlinks, junctions, and broken reparse points). One
  file-symlink capability test is skipped under EPERM; all mandatory
  junction tests pass.
- Playwright e2e smoke tests own the local browser QA server
  lifecycle through `playwright.config.ts`.

## V0 manual learning loop (implemented; validation pending)

The V0 vertical slice and V3 repair at implementation commit `2f4f5d895ea8d965fb64d19dc784ca5514480688` pass the automated quality gate, bounded recovery, and a user-confirmed fresh natural LeetCode submission. Frozen SHAs `c587bfbcce2eab108a1c98455b2e6b481f71b290` and `894162b264124eed7315a116cae73b8e11d717b8` are defective and are not current implementation candidates. The repaired build is **not yet an accepted release**: formal observations and same-SHA F1–F4 remain pending. The following surface exists in code today and is exercised by the offline-core Playwright gate:

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
npm run curriculum:validate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run extension:e2e
npm run build
npm run quality:gate
```

`npm run lint` runs the strict ESLint flat config. `npm run
extension:check` chains typecheck, focused extension tests, the MV3
build, and the `extension/dist` parity/ignore check. `npm run
extension:e2e` runs the new bundled-Chromium Playwright lane that
loads the exact production `extension/dist` (Fake OJ matrix + A10
full-chain smoke). `npm run quality:gate` runs the nine commands
above in this exact order under an OS-temporary database and is the
safe single verification.

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
- Phase A A3 implements the strict Evidence Correlator as a pure module: no chrome.*, no DOM, no wall clock, no I/O. E1 lifecycle dedupes by requestId with invariant identity, latest apiTimeStamp, earliest receivedAt. CorrelateMainSummary returns a closed union of correlated / ambiguous (multiple_e1_candidates, e1_window_expired) / no_match (zero_candidates, expired, canceled, already_matched, crossed_fields, error) / rejected (with the A1 rejection reason). parseMainBridgeSummary enforces canonical UTC ISO datetime with real Gregorian dates and nonnegative finite apiTimeStamp. Disambiguation is full namespaced equality on platform:externalSubmissionId.
- Phase A A4 implements the pure Capture State Machine as a deterministic reducer over a closed 9-kind input union (4 V3 event variants, V4 SafeEvidence, and 4 A3 correlator outcomes). It projects to a 7-state canonical model and emits a closed effect union (bundle / rejected / ambiguous / ignored) with observedAt on every effect. Waiting only increments on SUBMISSION_CONFIRMED. E2-driven bundles carry the additive V3 action `submission_confirmed`; legacy `submit_clicked` remains accepted. E3-before-E2 retention is parked by stable submission key; bundle ids are real SHA-256 over fixed-width uint32 length-prefixed UTF-8 of identity fields with control-character rejection.
- Phase A A5 splits session/local storage. `transientEvidenceStorage.ts` is session-only and validates nested E1/E3 evidence through parseSafeEvidence with bounded closed-reason diagnostics. `confirmedSubmissionStorage.ts` is local-only, idempotent on finalized storageKeys, and bounds tombstones by count and age on every finalize. `installation.ts` adds `applyExtensionInitializationSplit({local, session})` that writes transient state to session and durable delivery/confirmed/tombstones/pairing to local, preserving existing tombstones and avoiding overwrites of stable fields.
- Phase A A6 implements the production webRequest observer. Five host-scoped lifecycle listeners (onBeforeRequest / onBeforeRedirect / onResponseStarted / onCompleted / onErrorOccurred) cover leetcode/nowcoder/luogu/codeforces and call `parseSafeEvidence` synchronously. Forbidden raw fields produce `ignored corrupt_record`; missing documentId / invalid tab/frame produce `missing_document_id`; non-adapted hosts and unsafe URLs produce `non_adapted_host` / `normalize_endpoint_failed`. `registerNetworkObserverListeners` is a pure dependency-injected helper that background.ts routes through the existing serialized executor. The AtCoder synthetic spike listener is preserved unchanged.
- Phase A A7 implements the optional low-trust MAIN bridge. `mainWorldBridge.ts` provides the IIFE MAIN-world script (built as `extension/dist/main-world-bridge.js` and gated to the four OJ hosts through `manifest.json`'s `web_accessible_resources`); `mainWorldRelay.ts` is the ISOLATED-world relay that re-validates the summary through `parseMainBridgeSummary` and adds a recursive forbidden-key gate (any of `body`/`rawBody`/`responseBody`/`code`/`headers`/`requestHeaders`/`responseHeaders`/`extraHeaders`/`cookie`/`authorization`/`csrf`/`token`/`username`/`account` at any depth) before emitting `V4_FORWARD_BRIDGE`. MAIN evidence alone can never confirm a submission; it must match one unique webRequest E1.
- Phase A A8 implements the pure Capture State Machine + background orchestrator. `captureStateMachine.ts` is the canonical 7-state reducer; `bundle_${sha256HexBytes(canonical)}` uses a pure-JS SHA-256 (byte-identical to Node `createHash("sha256")`) and a fixed-width uint32 length-prefix encoder so the module bundles under Chrome MV3 without Node-only APIs. `backgroundOrchestrator.ts` is the pure data plane: zero `chrome.*` calls, every side effect through the injected `ExtensionInitializationStorageSplit`. It accepts 9 input kinds (4 V3 event variants, V4 Safe Evidence, 4 A3 correlator outcomes plus `e0_recorded` / `e3_recorded` / `v3_submission_intent_recorded` / `user_action`); emits a closed 4-effect union (bundle / rejected / ambiguous / ignored) with `observedAt`; waiting only increments on `SUBMISSION_CONFIRMED`; E3-before-E2 retention is parked by stable submission key with most-recent-wins; browser-restart recovery produces a bundle from confirmed submission + new E3 without requiring transientE1; rejected diagnostics dedupe by reason + `summary.evidenceId` + tab/frame/document id/endpointKey.
- Phase A A9 completes the Fake OJ matrix. `tests/extension-e2e/{fakeOj,fakeOjScenarios,capture-v4-network.spec}.ts` cover 18 named scenarios + 3 cross-platform smoke tests; 31 of 32 Playwright tests pass with 1 known skip (the service-worker-restart scenario is `test.skip` because of a known test-harness infrastructure limitation in Playwright bundled Chromium; the module docblock in `capture-v4-network.spec.ts` honestly documents this).
- Phase A A10 adds the disposable SQLite lifecycle + production extension E2E smoke test. `tests/extension-e2e/database.ts` provides disposable directory, DB creation, migrations via `npm.cmd`, count readers, and default-DB snapshot / verify utilities with relative-path-based safe deletion under `.tmp/`. `tests/extension-e2e/capture-v4-full-chain.spec.ts` proves the disposable DB + production extension artifact + scenario identity helpers + default-DB preservation. `scripts/a10-bootstrap.mjs` is a reusable helper for future webServer-based integrations (currently unused). Independent review found and fixed 4 HIGH issues (path check prefix collision, stale path file teardown, missing `.tmp` mkdir, profile cleanup replacement) in commit `9b81784`.
- Phase A A11 integrates the new extension E2E lane into the canonical quality gate. `scripts/quality-gate.mjs` adds `npm run extension:e2e` as stage 7; the frozen `QUALITY_GATE_STAGES` array is now 9 stages. `.github/workflows/quality-gate.yml` is created as a local-only CI workflow with `permissions: contents: read`, `timeout-minutes: 20`, and `**` branch triggers. Independent review found and fixed 6 issues (HIGH npm ci / permissions, MEDIUM triggers / timeout, LOW docs accuracy / incorrect comment) in commit `6401e17`.
- Phase A A12 reconciles the plan and produces the final closeout report. `docs/superpowers/plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-a-evidence-core-extension-e2e.md` now has per-task execution result blocks with commit SHA, verification command, and review findings. `work/reports/phase-a-final-closeout.md` is the dated closeout report. Independent review found and fixed 4 issues (HIGH verdict honesty, MEDIUM missing SHAs / dev-server claim, LOW module list) in commit `30f3d73`. Phase A verdict is `V4 infrastructure engineering PASS (scope-reduced)`: the framework engineering pass is complete and every authoritative gate command exits 0, but the full E2->E3->real-popup-pair->real-API->SQLite delivery probe and the worker-restart recovery probe remain out of Phase A scope.
- Phase B B3 closes the NowCoder browse-only navigation witness at `b589776`. The four A-D lifecycle tests use CDP only to control the MV3 Worker, exact Fake OJ routes to load the production content script, and popup status/export as public recovery evidence. The strict two-E0 fixture and real observation remain in `tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json` and `work/reports/v4-nowcoder-b3-restart-safe-observation-2026-07-27.md`; no new user Chrome operation occurred. This is not a submission-protocol characterization, production promotion, RC, acceptance, release, or B4 authorization.
- Phase 0 AtCoder production certification (T1–T8) executed on 2026-07-16 to 2026-07-17 and completed. AtCoder is the sole production adapter. Phase 0 is green. F1–F4 final verification (plan compliance, code quality/security, hands-on QA, scope/docs fidelity) all APPROVE on 2026-07-17 against commit `45cdd92a161f27622dbe5706a805eab523220910`; no blockers; no required fixes. The user explicitly accepted the Phase 0 verification result on 2026-07-17. Phase 0 is technically verified, documented, and accepted. V4 Phase 0 is complete through `docs/superpowers/plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md`.   V4 Phase A A0-A12 is complete through `docs/superpowers/plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-a-evidence-core-extension-e2e.md` with verdict `V4 infrastructure engineering PASS (scope-reduced)`. Do not re-execute completed historical plans, resume formal V0 observation, or start V0.5 before the V4 gates permit it.
- V4 Phase B Tasks 0-6 of the NowCoder E3 ingress repair plan are complete
  on a single uncommitted SHA. The plan
  (`docs/superpowers/plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`)
  records per-task PASS blocks with verification commands and
  review-finding corrections; the closeout report
  (`work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md`)
  documents the real-Chrome Tasks 5/6 evidence against the
  production-built `extension/dist`. NowCoder remains `experimental`;
  promotion requires a separate reviewed decision. Do not start
  Phase C, V0 acceptance, V0.5 work, or push/PR operations until the
  user authorizes the next gate.
