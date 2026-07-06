# Phase 2.2 Training Records Loop Design

日期：2026-07-06  
状态：Approved for planning  
上游依据：`docs/superpowers/specs/2026-07-06-phase-2-browser-capture-hardening-design.md`

## 1. 背景

Phase 2.1 已经把浏览器采集链路做成可构建、可开关、可排队、可诊断的本地闭环：extension 发送 `CaptureEvent`，本地 API 持久化事件，Training 页面显示最近采集状态。当前断点是：capture event 仍只是事件日志，不会自动成为训练事实。Coach、Growth 和 Attempts 只能依赖手动或种子数据，无法反映用户刚刚在原平台完成的训练。

Phase 2.2 选择 **Training records loop**。目标是把 `PAGE_DETECTED`、`SUBMISSION_DETECTED`、`VERDICT_UPDATED` 等本地 capture events 转成 `TrainingAttempt` 草稿或结果记录，并让 Stats、Coach、Growth 基于这些 attempt 更新。它不是新的浏览器观测层，也不是 LLM Coach；它是 Phase 2.1 数据入口到 V1 分析闭环之间的最小可靠桥。

## 2. 目标

Phase 2.2 完成后，用户应该能够：

1. 打开原平台题页后，系统创建或复用一条 `draft` attempt。
2. 原平台出现提交或 verdict 事件后，系统把相关 attempt 更新为 `passed`、`failed`、`partial` 或 `stuck`。
3. Training 页面显示当前题目的最近 attempt 状态，而不只是最近 capture event。
4. Coach 和 Growth 页面读取真实 attempts，展示弱点、训练趋势和下一步建议的最小可用版本。
5. 重复的 capture event 不产生重复 attempts，页面刷新和 extension 重试保持幂等。
6. 所有数据继续默认 local-only，不上传用户代码或平台登录态。

## 3. 非目标

Phase 2.2 明确不做：

- Playwright/CDP companion agent。
- 外部 LLM Coach 或远程模型调用。
- 自动提交代码到原平台。
- 读取 cookies、session tokens、隐藏 DOM、localStorage token 或绕过登录态。
- 缓存商业平台完整题面。
- 完整本地判题沙箱、样例运行器或代码执行。
- 复杂 attempt 编辑器、复盘富文本、多人账号或云同步。

这些能力可以进入 Phase 2.3+，但不能扩大 Phase 2.2 的边界。

## 4. 推荐方案

采用“capture-to-attempt materialization”方案：Capture API 在保存事件后调用一个小型 materializer，把事件转换成 attempt upsert/update，再刷新 stats/coach 所需的派生数据。

备选方案对比：

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| Capture-to-attempt materialization | 最短路径闭合 V1 训练数据循环；直接复用 Phase 2.1；便于测试幂等性 | 需要定义事件与 attempt 的关联规则 | 采用 |
| Manual-first attempt editor | 用户可修正更多细节；低自动化风险 | 延迟 capture pipeline 价值；Coach/Growth 仍缺自动数据 | 推迟 |
| Coach/Growth dashboard first | 页面效果明显 | 没有真实 attempt 输入时容易变成假数据展示 | 推迟到 materialization 后 |

## 5. 架构

Phase 2.2 分为 5 个边界，每个边界都应独立测试。

### 5.1 Capture materializer layer

新增服务层负责把单个 `CaptureEvent` 解释为 attempt 操作。它只接收已通过 `CaptureEventSchema` 的事件和数据库句柄，不直接读取 chrome storage 或浏览器状态。

事件规则：

- `PAGE_DETECTED`：创建或复用同一 `platform + problemExternalId` 的最新 `draft` attempt，写入 `startedAt`、题目标题和 canonical URL。
- `TRAINING_STARTED`：与 `PAGE_DETECTED` 同等处理，但优先使用事件时间作为明确开始时间。
- `SUBMISSION_DETECTED` / `VERDICT_UPDATED`：查找同题目的最新 open draft attempt；若不存在，创建一条 draft 再立即更新。根据 payload verdict 生成 result 和 verdict 字段。
- `TRAINING_ENDED`：若有 open draft，则标记为 `stuck` 或保留已完成结果；第一版不强制用户填写复盘。

### 5.2 Attempt repository layer

补齐 repository 能力，使服务层可以幂等 upsert 和更新 attempts。推荐新增或扩展这些函数：

- `findOpenAttemptByProblem(db, platform, problemExternalId)`。
- `createDraftAttemptFromCapture(db, draft)`。
- `updateAttemptFromCapture(db, attemptId, update)`。
- `listRecentAttempts(db, limit)`。

幂等性不依赖浏览器只发一次事件。保存 capture event 时已经有 event id，materializer 应记录 `sourceEventId` 或使用等价的唯一关联规则，避免同一 capture event 重放时重复创建 attempt。

### 5.3 API integration layer

`app/api/capture/events/route.ts` 保持边界职责：先 `safeParse`，再保存 capture event，再调用 materializer。返回 JSON 应包含 `{ ok: true, eventId, attemptId?, attemptStatus? }`，便于 extension 和 UI 诊断。无效 body 仍返回 400；数据库或 materialization 失败返回 500，不暴露 stack trace。

### 5.4 App feedback layer

Training 页面新增 attempt 状态展示，与 CaptureStatusPanel 分离。CaptureStatusPanel 继续回答“采集是否工作”；Attempt 状态面板回答“这次训练记录是否已经形成”。Coach/Growth 页面优先读取 recent attempts 和 stats snapshot，没有数据时显示明确空状态，而不是假推荐。

### 5.5 Derived data refresh layer

materializer 每次成功写入或更新 attempt 后，触发轻量派生数据刷新：

- 更新 Problem 状态为 `attempted` 或类似现有状态。
- 刷新 AbilityProfile 的最小规则：accepted 提升 mastery，failed/stuck 降低 confidence 或记录薄弱信号。
- 刷新 StatsSnapshot 或 recent stats 查询，让 Growth 页面能显示真实训练数。
- Coach 使用 attempts 输出最小诊断，不引入 LLM。

如果现有 stats/coach 服务尚为 stub，Phase 2.2 只实现最小可验证闭环，不追求完整推荐算法。

## 6. 数据流

主路径：

```text
User opens /training and original OJ page
→ extension sends PAGE_DETECTED
→ POST /api/capture/events validates and saves CaptureEvent
→ materializer creates/reuses draft TrainingAttempt
→ Training page shows draft attempt
→ extension later sends SUBMISSION_DETECTED or VERDICT_UPDATED
→ materializer updates same attempt with verdict/result/endedAt
→ stats/coach derived data refreshes
→ Growth/Coach pages show real attempt-based output
```

错误路径：

```text
Invalid event body → 400, no capture event, no attempt
Duplicate event id → no duplicate attempt, return existing materialized result if available
No open draft on verdict event → create draft from event context, then update it
Unknown verdict → result failed with verdict "Unknown" unless payload indicates accepted
DB failure → 500 JSON, extension queue retries according to Phase 2.1 transport rules
```

## 7. 数据与接口

### 7.1 Existing CaptureEvent

沿用 `CaptureEventSchema`。Phase 2.2 不扩大浏览器采集字段，不要求 content script 读取代码或隐藏数据。

### 7.2 TrainingAttempt materialized fields

第一版 attempt 需要支持：

- `id`
- `platform`
- `problemExternalId`
- `problemTitle`
- `canonicalUrl`
- `result`: `draft | passed | failed | partial | stuck`
- `verdict?`
- `language?`
- `startedAt`
- `endedAt?`
- `source`: `capture`
- `sourceEventId` 或等价幂等关联字段

如现有 schema 字段名称不同，实现时跟随现有迁移和 domain types，不做无关重命名。

### 7.3 API responses

`POST /api/capture/events` 成功响应扩展为：

```json
{
  "ok": true,
  "eventId": "evt_...",
  "attemptId": "attempt_...",
  "attemptStatus": "draft"
}
```

当事件无需改动 attempt 时，`attemptId` 可以省略，但必须保持 `ok: true`。

新增或扩展 attempts/status endpoint 用于 Training 页面读取最近 attempt。优先小接口而非把数据库行直接暴露给组件。

## 8. 错误处理

### 8.1 Duplicate capture event

同一 `event.id` 重放应幂等。保存 capture event 可使用唯一约束或捕获重复插入；materializer 不应创建第二条 attempt。

### 8.2 Missing draft before verdict

如果用户先产生 verdict 事件，系统用事件上下文创建 draft，再立即更新为完成状态。这比丢弃 verdict 更符合本地训练记录目标。

### 8.3 Unknown or malformed verdict payload

CaptureEvent 结构合法但 payload 缺少 verdict 时，`submissionEventToAttemptUpdate()` 输出 `Unknown`，result 默认为 `failed`。后续可在 UI 中允许用户修正，但 Phase 2.2 不实现复杂编辑。

### 8.4 Derived data refresh failure

attempt 写入成功但 stats/coach 刷新失败时，API 返回 500 会导致 extension 重试，可能造成重复写入风险。因此实现应把 attempt materialization 和 derived refresh 放在同一事务，或保证重试幂等。

## 9. 测试策略

### 9.1 Unit tests

- `pageDetectedEventToAttemptDraft()` 生成 draft 字段。
- `submissionEventToAttemptUpdate()` 覆盖 accepted、failed、unknown verdict、language optional。
- materializer 对 `PAGE_DETECTED` 创建 draft。
- materializer 对重复 event 不重复创建 attempt。
- materializer 对 verdict event 更新 open draft。
- materializer 对无 draft verdict 创建并完成 attempt。

### 9.2 API tests

- valid `PAGE_DETECTED` 返回 200、保存 capture event、创建 draft attempt。
- valid verdict event 返回 200、更新 attempt result。
- duplicate event 返回 200 或明确幂等结果，不重复 attempt。
- invalid body 返回 400，不写 capture event，不写 attempt。
- simulated DB/materializer failure 返回 500 JSON。

### 9.3 UI smoke tests

- `/training?platform=leetcode&externalId=two-sum` 在 capture 后显示 recent attempt 状态。
- `/coach` 无 attempt 时显示空状态，有 failed attempt 时显示最小弱点说明。
- `/growth` 有 attempts 时显示真实训练数量或趋势摘要。

### 9.4 Build checks

- `npm run typecheck`
- `npm run test`
- `npm run extension:build`
- `npm run build`
- Codex review for final code acceptance

## 10. 成功标准

Phase 2.2 完成后必须满足：

- Capture event 能自动创建或更新 TrainingAttempt。
- 重复 capture event 不会产生重复 attempt。
- `PAGE_DETECTED` 到 draft attempt、verdict event 到 completed attempt 的路径都有测试。
- Training 页面能展示最近 attempt 状态。
- Coach/Growth 至少展示基于真实 attempts 的最小可用状态或空状态。
- 所有数据保持 local-only，不读取或上传平台登录态、cookies、session tokens 或完整商业题面。
- 全量 `typecheck/test/build/extension:build` 通过，并完成 Codex review。

## 11. 后续 Phase

Phase 2.2 之后推荐顺序：

1. Phase 2.3：Local Playwright/CDP companion，增强复杂平台观测能力，但仍 local-only。
2. Phase 2.4：Attempt review/editor，让用户补充错误类型、复盘和代码草稿。
3. Phase 2.5：LLM Coach，在真实 attempt 数据和本地规则 Coach 稳定后增加解释层。
