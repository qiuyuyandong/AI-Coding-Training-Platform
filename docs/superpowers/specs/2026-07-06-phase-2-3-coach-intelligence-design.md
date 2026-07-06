# Phase 2.3 Coach Intelligence & Growth Insights Design

日期：2026-07-06  
状态：Completed on 2026-07-06; retained as historical design context  
上游依据：`docs/superpowers/specs/2026-07-06-phase-2-2-training-loop-design.md`

## 1. 背景

Phase 2.2 已经完成本地训练记录闭环：浏览器 extension 发送 capture events，本地 API 保存事件并 materialize 成 `TrainingAttempt`，Training 页面显示 attempt 状态，Coach/Growth 页面能读取真实 attempts。当前断点是：Coach 和 Growth 仍只是 attempts 的浅层展示，无法回答“我哪里弱、为什么、下一题/下一轮练什么”。

Phase 2.3 选择 **Coach Intelligence & Growth Insights**。目标是把现有 `training_attempts` 转成确定性的本地分析结果：能力画像、弱点证据、下一步建议和 Growth 指标。它不是 LLM Coach，不依赖云服务，也不引入新的浏览器捕获能力；它让 Phase 2.2 已经产生的数据第一次具备训练指导价值。该阶段已完成，当前服务边界见 `docs/architecture.md`。

## 2. 目标

Phase 2.3 完成后，用户应该能够：

1. 在 `/coach` 看到基于最近 attempts 的弱点摘要、证据和下一步建议，而不是只有计数。
2. 在 `/growth` 看到结果分布、完成率、最近训练趋势和需要复习的信号。
3. 系统能从 attempts 生成确定性的 `CoachAnalysis`，每条建议都能追溯到本地 attempt 证据。
4. 系统能从 attempts 生成轻量 ability signals，先按 `platform + problemExternalId` 和 attempt result 计算，不虚构缺失的 tag/difficulty 数据。
5. 没有 attempt、只有 draft、只有失败、混合结果等场景都有明确 UI 和测试覆盖。
6. 所有分析继续 local-only，不上传题目、代码、verdict、reflection 或任何平台登录态。

## 3. 非目标

Phase 2.3 明确不做：

- 外部 LLM Coach、远程模型调用或 prompt 管线。
- Playwright/CDP companion agent。
- 自动 problem ingestion、Codeforces/AtCoder connector 或大规模题库同步。
- 完整 BKT、IRT、间隔重复算法或机器学习模型。
- 本地代码执行、判题沙箱或代码存档。
- 富文本 attempt editor、reflection 编辑器或手动修正 verdict。
- 新 UI kit、图标库、动画、渐变或偏离 `DESIGN.md` 的视觉语言。

这些能力可以进入后续 Phase，但不能扩大 Phase 2.3 的边界。

## 4. 推荐方案

采用“deterministic analysis service”方案：新增纯服务层读取 `TrainingAttempt[]`，输出 typed analysis models；页面只负责渲染这些 models。服务层不直接打开数据库，不读取浏览器状态，不调用外部网络。

备选方案对比：

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| Deterministic analysis service | 可测试、local-only、无需新依赖；能立即提升 Coach/Growth | 规则不如 LLM 灵活 | 采用 |
| LLM Coach first | 输出更像“教练” | 需要隐私、prompt、成本、失败模式设计；本地数据仍少 | 推迟 |
| Problem catalog first | 修复训练入口和数据地基 | 用户选择了智能教练；且现有 attempts 已足够做第一版分析 | 推迟 |

## 5. 架构

Phase 2.3 分为 4 个边界，每个边界都应独立测试。

### 5.1 Coach domain layer

新增 Coach 分析类型，表达页面真正需要渲染的数据，而不是直接把 repository row 暴露给 UI。

建议模型：

- `CoachSignal`：描述一个可解释信号，例如 `problem-repeat-failure`、`recent-stuck`、`completion-momentum`。
- `CoachRecommendation`：包含 `title`、`reason`、`action`、`evidenceAttemptIds`。
- `CoachAnalysis`：包含 `summary`、`signals`、`recommendations`、`recentWindowSize`、`generatedAt`。

第一版分析只使用现有 fields：`result`、`verdict`、`language`、`startedAt`、`endedAt`、`updatedAt`、`problemExternalId`、`problemTitle`、`platform`。如果 tag/difficulty 在现有 attempts 中不可得，服务不能伪造 tag 能力画像。

### 5.2 Analysis service layer

新增服务从 `TrainingAttempt[]` 生成 `CoachAnalysis` 和 Growth stats。规则必须确定、短小、可单测。

Coach 规则第一版：

- 无 attempts：summary 说明还没有训练证据，recommendation 指向 `/training` 或问题目录入口。
- 只有 draft attempts：summary 说明训练已开始但还没有完成结果，recommendation 是完成一次提交。
- 最近窗口存在 `failed` 或 `stuck`：生成弱点信号，证据引用最近失败/stuck attempts，action 建议复盘这些题并重做一题相同平台题。
- 最近窗口全是 `passed`：生成 momentum 信号，action 建议提高难度或切换新题型；不声称具体 tag mastery。
- 混合结果：summary 统计 passed/failed/stuck/partial/draft，并优先推荐处理 failed/stuck。

Growth 规则第一版：

- `totalAttempts`：所有 attempts 数。
- `completedAttempts`：`result !== "draft"`。
- `passedAttempts`：`result === "passed"`。
- `completionRate`：`completedAttempts / totalAttempts`，total 为 0 时返回 0。
- `passRate`：`passedAttempts / completedAttempts`，completed 为 0 时返回 0。
- `resultDistribution`：draft/passed/failed/partial/stuck 各自计数。
- `recentActivity`：按 `updatedAt` 倒序截取最近 5 条，供 UI 列出趋势。

### 5.3 Repository integration layer

页面继续按 `DESIGN.md` 的 server-component 模式打开数据库并关闭连接。`/coach` 和 `/growth` 从 `listRecentAttempts()` 获取 attempts 后调用服务层，不在 JSX 中写业务规则。

Phase 2.3 不要求新增表。若实现时发现重复计算影响页面清晰度，可新增 `lib/services/coachAnalysis.ts` 和 `lib/services/growthStats.ts`，但不能引入持久化 `StatsSnapshot`，避免在第一版规则未稳定前制造迁移成本。

### 5.4 UI layer

UI 沿用 `DESIGN.md`：slate/white card surfaces、无图标、无 emoji、无新颜色。

`/coach` 页面建议结构：

1. 页面标题和一句说明。
2. Summary card：显示 `CoachAnalysis.summary`。
3. Weak signals card：列出弱点信号；无弱点时显示 momentum 或 empty state。
4. Recommendations card：列出最多 3 条建议，每条包含 reason/action/evidence count。

`/growth` 页面建议结构：

1. 保留 Attempts/Completed/Passed 三个 metric cards。
2. 新增 Completion Rate 和 Pass Rate。
3. 新增 Result Distribution 列表。
4. 新增 Recent Activity 列表，显示最近 5 条 attempts 的 title/result/updatedAt。

## 6. 数据流

Coach 主路径：

```text
/coach request
→ openDatabase()
→ listRecentAttempts(db, 50)
→ buildCoachAnalysis(attempts, now)
→ render summary/signals/recommendations
→ close database
```

Growth 主路径：

```text
/growth request
→ openDatabase()
→ listRecentAttempts(db, 50)
→ buildGrowthStats(attempts)
→ render metrics/distribution/recent activity
→ close database
```

错误路径：

```text
No attempts → empty analysis with explicit next action
Only drafts → incomplete-training analysis, no fake pass/fail insight
Malformed DB row → repository schema parsing throws, page surfaces framework error rather than silently lying
Unknown result value → impossible after TrainingAttemptSchema parsing; service uses exhaustive handling
```

## 7. 数据与接口

Phase 2.3 不新增 public API。`CoachAnalysis` 和 Growth stats 是内部 TypeScript models，供 server components 使用。

建议类型形状：

```typescript
type CoachSignalKind = "no-data" | "draft-only" | "recent-failure" | "recent-stuck" | "momentum";

type CoachSignal = {
  readonly kind: CoachSignalKind;
  readonly title: string;
  readonly detail: string;
  readonly evidenceAttemptIds: readonly string[];
};

type CoachRecommendation = {
  readonly title: string;
  readonly reason: string;
  readonly action: string;
  readonly evidenceAttemptIds: readonly string[];
};

type CoachAnalysis = {
  readonly summary: string;
  readonly signals: readonly CoachSignal[];
  readonly recommendations: readonly CoachRecommendation[];
  readonly recentWindowSize: number;
  readonly generatedAt: string;
};
```

实现时可根据现有 TypeScript style 调整文件名和 export 名称，但模型必须保持 readonly、可测试、无 `any`、无 type suppression。

## 8. 错误处理与边界规则

### 8.1 Empty data

空 attempts 不是错误。Coach/Growth 必须渲染明确 empty state，说明需要完成 captured training session 才能生成洞察。

### 8.2 Draft-only data

draft 表示训练开始但未完成。Coach 不能把 draft 视为失败，也不能计入 completed/pass rate。

### 8.3 Partial result

`partial` 是 completed attempt。Growth 的 completed count 包含 partial；Coach 把 partial 视为需要复盘的弱信号，但弱于 failed/stuck。

### 8.4 Evidence discipline

每条 recommendation 必须带 `evidenceAttemptIds`。没有证据时只能给 onboarding action，不能输出“你薄弱在 X”。

### 8.5 Time handling

服务层接收 `now` 字符串或 Date provider，测试中使用固定时间。不要在纯分析函数内部直接调用 `new Date()`，除非包装在页面边界。

## 9. 测试策略

### 9.1 Unit tests

- `buildCoachAnalysis([])` 返回 no-data summary 和 onboarding recommendation。
- 只有 draft attempts 时返回 draft-only signal，completed/pass insight 为 0。
- failed/stuck attempts 生成 recent-failure/recent-stuck signals，并带 evidence attempt ids。
- mixed results 统计 summary 正确，recommendations 优先 failed/stuck。
- all-passed recent window 生成 momentum signal，不生成虚假 weak point。
- `buildGrowthStats()` 覆盖 draft/passed/failed/partial/stuck 混合分布。
- completion/pass rate 在 0 denominator 时返回 0。

### 9.2 Page tests or route-level render tests

- `/coach` 无 attempts 时显示 empty/onboarding copy。
- `/coach` 有 failed/stuck attempts 时显示弱点摘要和 evidence count。
- `/growth` 有 mixed results 时显示 Attempts、Completed、Passed、Completion Rate、Pass Rate 和 distribution。

### 9.3 Regression tests from team audit

- Growth mixed-result 统计必须确认 `partial` 计入 completed，`draft` 不计入 completed。
- Coach failed/stuck 分支必须有 seeded attempts 覆盖。
- 如果修改 `buildPlatformUrl` 或 extension background，必须另开测试；Phase 2.3 不主动改这些文件。

### 9.4 Build checks

- `npm run test`
- `npm run typecheck`
- `npm run build`
- Final Codex review for implementation acceptance

## 10. 成功标准

Phase 2.3 完成后必须满足：

- `/coach` 不再只显示 attempt count，而是显示 summary、signals 和 recommendations。
- `/growth` 不再只有 3 个计数，而是显示 rates、result distribution 和 recent activity。
- Coach/Growth 的业务规则位于服务层，页面 JSX 不承担统计/决策逻辑。
- 所有分析建议都有 evidence 或明确标记为 onboarding action。
- Empty、draft-only、failed/stuck、mixed、all-passed 场景都有测试。
- `npm run test`、`npm run typecheck`、`npm run build` 通过。
- 不新增外部网络调用，不上传本地训练数据。

## 11. 后续 Phase 建议

Phase 2.3 之后推荐顺序：

1. **Phase 2.4 Attempt review/editor**：允许用户补 reflection、duration、error type，让 Coach evidence 更准确。
2. **Phase 2.5 Problem catalog & discovery**：把 `/problems` 接入 DB、搜索、筛选和种子数据，让推荐能指向真实题库。
3. **Phase 2.6 LLM Coach**：在 deterministic analysis 稳定后，把本地 analysis 作为上下文生成更自然的解释，但仍需用户明确选择是否调用外部模型。
