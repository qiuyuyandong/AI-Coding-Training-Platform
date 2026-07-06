# Phase 2.1 Browser Capture Hardening Design

日期：2026-07-06  
状态：Completed on 2026-07-06; retained as historical design context  
上游依据：`docs/superpowers/specs/2026-07-05-ai-coding-training-platform-design.md`

## 1. 背景

V1 已经完成本地 Next.js 应用、Capture API、SQLite 事件表、Chrome MV3 extension 源码、统一题目入口和基础 Coach/Growth/Compliance 页面。当前最大断点是：extension 仍只是 TypeScript 源码，manifest 指向尚不存在的 `.js` 文件；capture 失败时缺少可靠反馈；API 对无效 body 会抛出 500；用户无法判断本地采集是否真的工作。

Phase 2.1 选择 **Browser capture hardening** 作为第一轮子项目。目标不是增加 AI Coach 或 Playwright companion，而是把“用户打开原站题页 → extension 观测用户可见页面 → 本地 API 持久化 capture event → app 显示采集状态”做成可安装、可开关、可诊断、可测试的闭环。该阶段已完成，后续运行细节见 `docs/runbook.md`。

## 2. 目标

Phase 2.1 完成后，用户应该能够：

1. 构建 extension 产物并在 Chrome 中加载 `extension/dist`。
2. 在 popup 中启用或关闭本地采集。
3. 打开支持的 OJ 题目页后看到 `PAGE_DETECTED` 事件被采集。
4. 在本地 app 未启动、API 返回 400、API 返回 500、网络失败时看到明确状态。
5. 在 training 页面看到最近 capture 状态，而不是只能查看数据库。
6. 通过测试确认平台 URL 检测、事件转换、API 400 语义、background queue 行为正常。

## 3. 非目标

Phase 2.1 明确不做：

- LLM Coach 或外部模型调用。
- Playwright/CDP companion agent。
- 自动提交到原平台。
- 读取 cookies、session token、localStorage token 或绕过登录态。
- 缓存 LeetCode、NowCoder、Luogu 等平台完整题面。
- 多用户、云同步、公开部署安全模型。
- 完整在线判题或本地沙箱执行。

这些能力可以进入 Phase 2.2+，但不能污染 Phase 2.1 的边界。

## 4. 推荐方案

采用“浏览器插件采集硬化”方案，而不是先做 Training records loop、Local companion 或 LLM Coach。理由是：后续训练记录、能力画像、Coach、Growth 都依赖可信 capture 事件。先把数据入口做可靠，比先做上层分析更稳。

备选方案对比：

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| Browser capture hardening | 最短路径补齐 V1 最大断点；合规边界清晰；直接支撑后续 Coach/Growth | 不会立刻产出 AI 教练效果 | 采用 |
| Training records loop | 用户立刻看到 attempts/stats | capture 不稳会导致数据脏 | 推迟到 Phase 2.2 |
| Local Playwright/CDP companion | 能力上限高，观测更可控 | 进程管理、安全边界、浏览器连接复杂 | 推迟到 Phase 2.3+ |

## 5. 架构

Phase 2.1 分 5 个边界，每个边界都应能独立测试。

### 5.1 Extension build layer

新增 extension 构建脚本，将 `extension/src/background.ts`、`content.ts`、`popup.ts`、`platforms.ts` 编译为 `extension/dist/*.js`。manifest 改为指向 dist 文件。构建不引入复杂 bundler 配置，优先使用现有 TypeScript/esbuild 级别的轻量流程；若需要新依赖，只能为 extension build 服务。

### 5.2 Platform detector layer

`extension/src/platforms.ts` 保持纯函数化。它只接收 `Location` 与 `documentTitle`，输出 `DetectedProblem | null`，不发送网络请求、不访问 chrome API、不写 storage。新增测试覆盖 LeetCode、Codeforces、AtCoder、NowCoder、Luogu 的典型 URL，以及 unsupported URL。

### 5.3 Capture transport layer

background script 负责接收 content script 的 `CAPTURE_EVENT` message，写入本地 bounded queue，并向 `http://localhost:3000/api/capture/events` flush。失败时保留可重试事件，记录 `lastCaptureError`；成功时记录 `lastSuccessfulCaptureAt` 并从 queue 移除。

队列规则：

- 最多保留最近 100 条事件。
- API 400 表示事件永久无效，丢弃该事件并记录 validation error。
- 网络失败或 5xx 表示可重试，保留事件。
- extension 启动、popup 打开、定时 tick 时尝试 flush。

### 5.4 Capture API layer

`app/api/capture/events/route.ts` 从 `CaptureEventSchema.parse()` 改为 `safeParse()`。无效 body 返回 400 JSON，成功请求写入 SQLite 并返回 `{ ok: true, eventId }`。数据库异常返回 500 JSON。V1 仍默认 localhost-only，不新增远程认证。

### 5.5 App feedback layer

新增轻量 Capture Status 能力，优先做最小可用：

- API 提供最近 capture event 或 capture status。
- Training 页面展示最近一次 capture 状态：captured、pending、failed、local app unreachable、validation error。
- Popup 展示 enabled/disabled、queue length、last success、last error。

## 6. 数据流

主路径：

```text
User opens /training
→ clicks Open original problem
→ original OJ page loads
→ content.ts detects supported URL
→ content.ts sends PAGE_DETECTED to background.ts
→ background.ts enqueues event
→ background.ts POSTs event to localhost API
→ API validates with CaptureEventSchema.safeParse
→ saveCaptureEvent writes SQLite row
→ app exposes recent capture status
→ UI shows captured / pending / failed
```

Submission capture 在 Phase 2.1 采用 best-effort：只捕获页面上明显可见的 verdict 文本，不深挖 DOM，不绕登录态。若平台 DOM 不稳定，允许只做 page detection。

平台支持分层：

- LeetCode：page detection 必做；submission detection best-effort。
- Codeforces：page detection 必做；可利用 URL 稳定性。
- AtCoder：page detection 必做；contest/task URL 稳定。
- NowCoder/Luogu：保守 page detection；不采完整题面。

## 7. 错误处理

### 7.1 Local app unreachable

`fetch` 失败时，background 保留事件，popup 显示 `Local app unreachable`，training 页面保持最近状态不覆盖为成功。

### 7.2 API 400 validation error

API 返回 400 表示事件结构不合法。background 丢弃该事件，记录 validation error，避免无限重试坏数据。

### 7.3 API 500 or SQLite failure

API 返回 5xx 时，background 保留事件并稍后重试。API 返回 JSON error，不暴露 stack trace。

### 7.4 Unsupported page

detector 返回 `null` 时 content script 不发送事件，不记录错误。

## 8. 数据与接口

### 8.1 Existing CaptureEvent

沿用现有 `CaptureEventSchema`：

- `id`
- `type`
- `platform`
- `problemExternalId`
- `problemTitle`
- `canonicalUrl`
- `occurredAt`
- `payload`

### 8.2 Extension local state

Chrome storage local 保存：

- `captureEnabled: boolean`
- `eventQueue: CaptureEvent[]`
- `lastCaptureError?: string`
- `lastSuccessfulCaptureAt?: string`
- `lastDetectedProblem?: DetectedProblem`

### 8.3 App status endpoint

新增或扩展本地 API，用于读取最近 capture 状态。推荐新增 `app/api/capture/status/route.ts`，返回最近事件和简单状态，而不是让 UI 直接读取 SQLite。

## 9. 测试策略

### 9.1 Unit tests

- `detectProblemFromLocation()` 覆盖 5 平台和 unsupported URL。
- `submissionEventToAttemptUpdate()` 覆盖 accepted、failed、unknown verdict。
- `isCaptureMessage()` 对坏 message 返回 false。
- queue flush 对 200、400、500、network error 行为不同。

### 9.2 API tests

- valid capture event 返回 200 并写入 SQLite。
- invalid body 返回 400，不写入 SQLite。
- DB failure 返回 500 JSON。

### 9.3 Build checks

- `npm run extension:build`
- `npm run typecheck`
- `npm run test`
- `npm run build`

### 9.4 Manual smoke

1. 启动 `npm run dev`。
2. 构建 extension 并加载 `extension/dist`。
3. Popup 打开 capture。
4. 打开 LeetCode 或 Codeforces 题目页。
5. Popup 和 training 页面显示最近 capture 成功。
6. 停止 app 后刷新题页，popup 显示本地 app 不可达且 queue 保留事件。

## 10. 成功标准

Phase 2.1 完成后必须满足：

- Extension 可构建并可加载。
- Capture 可由用户明确启用/关闭。
- 至少 LeetCode、Codeforces、AtCoder 的 page detection 有测试覆盖并能产生事件。
- API invalid body 返回 400，不再变成 500。
- Background queue 对 200/400/500/network failure 有不同处理。
- Training 页面或 CaptureStatusPanel 能显示最近 capture 状态。
- 全量 `typecheck/test/build` 通过。

## 11. 设计约束

- 所有 capture 默认 local-only。
- 不读取或上传平台 session/cookie/token。
- 不缓存商业平台完整题面。
- 不把用户代码发送到外部服务。
- 不引入大型状态管理库；extension state 先用 `chrome.storage.local`。
- 文件应保持小而清晰；detector、transport、API、UI 状态展示分离。

## 12. 后续 Phase

Phase 2.1 之后推荐顺序：

1. Phase 2.2：Training records loop，把 capture events 转成 attempts、stats、Coach/Growth 真实数据。
2. Phase 2.3：Local Playwright/CDP companion，增强复杂平台观测能力。
3. Phase 2.4：LLM Coach，在本地规则 Coach 稳定后增加解释层。
