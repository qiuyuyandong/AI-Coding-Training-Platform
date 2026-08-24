# V4 Phase D 全项目捕获链路可靠性修复计划

**状态：已获批；仅授权离线实施、验证及必要的本地冻结提交。真实 OJ 浏览、点击、提交、推送、PR、发布均未授权。**

**执行状态（2026-08-24）：观察器修复、旧候选双通道 READY-only 证明、产品离线修复和新候选冻结均已完成。新候选 `34916705712cac1ef2e5d8816cd8e40fa4e29ca7` 已通过 exact 候选校验；新候选 READY-only 仍需新的单独授权。**

## 摘要

- 直接根因是观察器把跨刷新文档的 E0 保留数量误当作动作次数；同时修复六项产品级风险：持久化 ACK、运行时恢复、存储权限、初始化重试、端点契约、Chrome 能力基线。
- 严格按“观察器修复 → 旧候选 READY-only 证明 → 产品修复 → 新候选冻结 → 新候选 READY-only”执行。
- 全程禁止真实 OJ 提交、点击和动作授权；任何 READY-only 联网观察均需单独授权。

## 实施与停止门

1. **基线隔离**
   - 以 `915a98d0317148d063a3fad0e1888cb7aa74e2da` 为旧产品候选，保留当前未提交工作树，不覆盖、暂存或丢弃无法归属的修改。
   - 观察工具与产品候选分开提交、分开哈希；本计划不授权推送、PR、发布或真实平台动作。
2. **观察器修复**
   - 完整校验每条 E0 的闭合字段、时间和 `sourceDocumentId`。
   - 同目标、不同文档的 E0 投影为存在性 `0 | 1`；同一文档重复、目标混入、畸形数据仍失败关闭。
   - 同步修改纯投影与浏览器注入副本，保持二者行为一致；对外 schema 不变。
   - 重新冻结观察工具哈希，且观察器差异不得进入产品候选。
3. **旧候选证明门**
   - 单独获批后，用旧候选原始 dist/receipt 和新工具哈希依次执行 LeetCode、NowCoder 新 profile、新数据库 READY-only 通道。
   - 每条通道必须满足 `READY=1`、`ACTION_AUTHORIZED=0`、数据库 `0/0/0`；首条失败立即停止，不运行第二条。
4. **产品链路修复**
   - 完成下述接口和恢复机制后运行完整质量门，创建新的单一产品候选提交。
   - 扩展候选校验器显式所有权清单，纳入恢复协调器、content bootstrap/ingress、串行执行器及对应测试。
   - 运行 `node scripts/validate-v4-candidate.mjs --candidate <new-sha>`，冻结 exact dist、五项哈希、候选 receipt，并证明默认数据库字节数与 mtime 未变。
5. **新候选 READY 门**
   - 再次单独获批后，按相同顺序执行两条新候选 READY-only 通道。
   - 两条均通过后停止并返回用户；每个平台一次真实提交仍需新的单独授权。

## 关键产品与接口变更

### 持久化 ACK

- 新增闭合 `CaptureIngressAck`：成功仅在后台初始化、编排及全部必要存储写入完成后返回；失败只暴露固定的 `initialization_failed` 或 `persistence_failed`。
- 内容脚本采用 FIFO 内存队列，最多 8 条；同一消息最多发送 3 次，间隔 `250ms / 1s / 4s`，保持原对象和既有幂等身份，不新增页面侧持久存储。
- 捕获暂停返回已处理状态；扩展上下文失效停止重试。后台 local→session 写入顺序保留，局部成功由下一次初始化幂等收敛。

### 初始化与定向恢复

- 将一次性 initialization Promise 改为可重入、单航班初始化控制器；失败不再被串行执行器吞掉，后续可信事件可重新初始化。
- 自动重试使用现有 alarms，间隔 `1 / 5 / 15` 分钟，最多三次；重新启用和 `RETRY_CAPTURE_RECOVERY` 可立即重置预算。
- READY 升级为全部 manifest 顶层 content-script 页面的无页面数据控制信号。后台通过 `webNavigation.getAllFrames` 获取 Chrome 提供的主文档身份，只用 `documentIds` 定向注入；禁止 `allFrames`、tab 广播和 frame-only 降级。
- 每文档最多注入三次、每次等待 READY 2 秒；一次最多协调 100 个匹配文档、并发 4 个，超限整体失败关闭。
- 触发点包括初始化成功、后台/扩展启动、暂停后重新启用和手动恢复；URL 策略与 manifest matches 建立自动一致性测试。

### 存储与错误呈现

- 加入 `unlimitedStorage`，同步更新权限白名单和隐私审计；删除未接入生产的配额估算/预留死代码。
- 任何 storage Promise 拒绝都不得消费候选或删除恢复状态，并通过 ACK、内存恢复状态及可写时的固定 `lastCaptureError` 显示阻断。
- 弹窗新增闭合 `CaptureRecoveryStatus`（`ready | recovering | blocked`）和“恢复采集”操作；不展示原始异常、URL、文档身份或页面数据。

### 端点契约

- 唯一规范端点改为 `http://localhost:3000/api/capture/attempts`；旧默认 `/api/capture/events` 可安全迁移到同源新路径。
- 其他旧环回自定义值不再静默重定向：固定显示 `unsupported_capture_endpoint`，禁止配对与发送。
- 弹窗移除自由编辑；`RESET_CAPTURE_ENDPOINT` 显式恢复默认端点并清除端点绑定凭证/配对时间，保留 confirmed、outbox、quarantine 和瞬态恢复证据，随后要求重新配对。
- 不新增 App API 或数据库迁移。

### 浏览器能力与失败关闭

- manifest 声明 `minimum_chrome_version: "106"`；启动时检查所需 API 和主文档身份，缺失即 `unsupported_browser`，不宽泛降级。
- `automaticRetryBlocked`、401/403、ACK 身份不匹配、数据库迁移缺失、缺少 documentId、隔离队列和配对失效继续失败关闭。
- READY 前置检查必须确认规范端点、有效配对、恢复状态 ready、空 waiting/outbox/quarantine、空观察数据库及 exact dist/hash 一致；不得自动清空、重配或绕过。

## 测试与验收

- 观察器 RED/GREEN：跨文档双 E0→存在性 1；同文档重复、畸形时间/身份、异目标混入仍拒绝；纯投影与注入投影一致。
- 产品单元测试：ACK 晚于持久化；local/session 各边界失败可重放；三次重试只生成一个候选/一个 outbox；初始化首败后恢复；队列和恢复并发上限；所有非精确注入均拒绝。
- 浏览器测试：已打开页面的暂停→启用、扩展 reload、worker restart、READY 超时、Chrome 能力缺失、全部声明 URL 与非匹配 URL；证明无广播、无子框架和无重复监听器。
- 端点/权限测试：旧默认安全迁移、自定义端点不静默回退、重置清凭证但保留数据、真实 localhost App 完成一次幂等 ACK；manifest/source/dist 一致，隐私审计 `0 findings`。
- 权威终门依次运行定向 Vitest、`npm run typecheck`、`npm run extension:check`、`npm run extension:e2e`、`npm run quality:gate`、候选校验器；所有命令必须退出 0 并记录实际数字。
- 产品专项审查不得发现外部遥测、Sentry SDK、第三方网络、`tabs`/`activeTab`/`<all_urls>` 权限、原始页面数据或持久化内容队列。

## 基线与默认假设

- 当前分支 `feature/v1-followup`，旧候选为 `915a98d0317148d063a3fad0e1888cb7aa74e2da`；工作树不干净且未推送。
- 当前阶段仍是 V4 Phase D D4 修复，D4 未交付；D5、F1–F4、RC、发布、推送和 PR 均不在本计划授权范围。
- 产品长期目标仍是可靠的本地优先捕获链路并最终服务于 Phase 7/Public Beta；本轮不进入 V0.5，也不改变 local-first 数据边界。

## 观察器离线执行记录（2026-08-23）

- RED：定向观察器测试 `2 failed / 49 passed`。新增失败精确证明跨文档双 E0 被投影为 `2`，且同文档重复未在投影层拒绝。
- GREEN：纯投影与浏览器注入副本均校验 E0 闭合数据属性、规范 ISO 时间及安全 `sourceDocumentId`；同目标不同文档折叠为存在性 `0 | 1`，同文档重复、访问器字段、畸形身份和异目标继续失败关闭。
- 最终定向测试：`68/68` 通过；typecheck、定向 ESLint、两份 `node --check`、D4 acceptance profile、adapter readiness 和 `git diff --check` 均通过；扩展隐私审计 `0 findings`。
- 产品隔离：相对候选 `915a98d0317148d063a3fad0e1888cb7aa74e2da` 的 `extension/src`、manifest、`lib`、`app` 差异为空，旧候选未改变。
- 冻结文件哈希：runner `9F35CF21...D0B6465`、observer `974E916B...17F43`、diagnostic `EBDDA2C9...9E8287D`；组合工具哈希 `40FB0E40FFDD949F96C287B60AEC52C482B4BE6D9F620297CCBD2FCBDCB775A9`。
- acceptance-profile 哈希保持 `D35892A2FADDB8B8F4313684E96C261F6C256A3E9FEE79D34C5DB531678D6069`。
- 本记录形成时尚未启动本地观察浏览器；后续旧候选 READY-only 的实际结果见下一节。

## 旧候选 READY-only 执行记录（2026-08-23）

- 用户已单独批准 READY-only 测试；全程未提供 `--authorize-action`，未点击、未提交、未触发真实平台动作。
- LeetCode 使用全新 profile/database `p7f5-leetcode-ready-915a98d`，并包含一次已批准的诊断刷新；结果为 `OBSERVER_ARMED=1`、`BROWSE_ONLY=1`、`READY=1`、`ACTION_AUTHORIZED=0`，数据库 `capture_events/training_sessions/training_attempts = 0/0/0`。
- LeetCode 证据：`output/playwright/v4-observation/915a98d03171-leetcode-p7f5-leetcode-ready-915a98d-ready.json`；storage-key 诊断：`output/playwright/v4-observation/p7f5-leetcode-ready-915a98d-storage-key-diagnostic.json`。
- NowCoder 使用全新 profile/database `p7f5-nowcoder-ready-915a98d`；结果同为 `OBSERVER_ARMED=1`、`BROWSE_ONLY=1`、`READY=1`、`ACTION_AUTHORIZED=0`，数据库 `0/0/0`。
- NowCoder 证据：`output/playwright/v4-observation/915a98d03171-nowcoder-p7f5-nowcoder-ready-915a98d-ready.json`；storage-key 诊断：`output/playwright/v4-observation/p7f5-nowcoder-ready-915a98d-storage-key-diagnostic.json`。
- 两条证据均绑定旧候选 `915a98d0317148d063a3fad0e1888cb7aa74e2da`、组合工具哈希 `40FB0E40FFDD949F96C287B60AEC52C482B4BE6D9F620297CCBD2FCBDCB775A9`、profile 哈希 `D35892A2FADDB8B8F4313684E96C261F6C256A3E9FEE79D34C5DB531678D6069`、同一 receipt 哈希与五项 exact-dist 哈希，且 preAction/final 无漂移。
- NowCoder 首个本地命令在浏览器创建前因误用 `--candidate-sha` 被参数校验拒绝；核验 profile/证据均未创建且数据库仍为 `0/0/0` 后，按脚本真实参数契约启动唯一一次联网通道并通过。该预检错误未访问 OJ、未消耗通道动作或产生页面证据。
- 两条通道结束后本地服务均已关闭。旧候选证明门完成，产品修复门现已打开；新候选 READY-only 仍需新的单独授权。

## 观察工具兼容性冻结记录（2026-08-24）

- READY runner 补齐规范端点、有效配对、`captureRecoveryStatus=ready`、空 waiting/outbox/quarantine 前置门；READY 前不再自动配对，也不发送捕获数据。
- 观察工具兼容性提交为 `9cf79268840870398165974376a322095bcea602`，只包含 runner、observer 及其两份测试，不包含产品代码。
- 最终观察工具组合哈希为 `EB564C529595F5F168FE1300EBCA431340135F48C21AA132829A863C0F44DF19`；acceptance-profile 哈希仍为 `D35892A2FADDB8B8F4313684E96C261F6C256A3E9FEE79D34C5DB531678D6069`。
- 兼容性定向测试 `69/69`、两份脚本语法检查、隐私审计与两个契约校验器均通过。旧候选 READY 凭据继续只绑定其执行时的 `40FB0E40...CB775A9`，不得事后改写；后续新候选 READY 必须绑定新的 `EB564C52...F44DF19`。

## 产品离线执行记录（2026-08-24）

- 持久化 ACK 已闭合为 `persisted | paused | initialization_failed | persistence_failed`；成功只在初始化、编排和必要存储写入完成后返回。内容脚本使用最多 8 条 FIFO 内存队列，同一对象最多按 `250ms / 1s / 4s` 重试三次，扩展上下文失效立即停止。
- 初始化改为可重入单航班控制器；恢复协调器只接受 Chrome 提供的顶层 `documentId`，单次最多 100 个文档、并发 4、每文档最多三次注入且每次等待 READY 2 秒；自动恢复预算为 `1 / 5 / 15` 分钟，重新启用和手动恢复会重置预算。
- manifest 加入 `unlimitedStorage` 和 `minimum_chrome_version: "106"`；删除未接入生产的配额估算/预留代码。存储拒绝不会消费候选或删除恢复状态，弹窗只显示闭合恢复状态与固定错误码。
- 端点收敛到 `http://localhost:3000/api/capture/attempts`：旧默认 `/events` 同源迁移；其他自定义环回端点失败关闭为 `unsupported_capture_endpoint`。弹窗移除自由编辑，显式重置会清除端点绑定凭证但保留捕获与恢复证据。
- 候选校验器显式所有权清单已覆盖恢复协调器、content ingress/bootstrap 边界、串行执行器及对应测试，并继续拒绝未知路径、生成物、数据库、密钥和原始转录。
- 权威预冻结 `npm run quality:gate` 退出 `0`：根单测 `2550 passed / 1 skipped`，App E2E `25/25`，扩展单测 `1660/1660`，扩展 E2E `54 passed / 1 skipped`，生产构建静态页 `20/20`；lint、迁移、课程契约和 typecheck 均通过。
- Extension E2E 压力运行暴露 NowCoder worker-restart 测试只等待 `transientE1.length === 1`，可能在提交仍处于 `before_request` 时就终止 worker；后续状态 E1 虽被观察到，确认器仍正确拒绝未完成的提交生命周期。重启切点改为提交 E1 的 `completed + 200` 已持久化，并继续在确认后验证恢复 READY；定向压力复验 `30/30`，未增加无界请求重试或放宽五秒产品时间窗。
- 独立终检：扩展隐私审计 `0 findings`、adapter readiness `PASS`、D4 acceptance profiles `PASS`；未新增外部遥测、Sentry SDK、第三方网络、`tabs`、`activeTab`、`<all_urls>`、原始页面数据或持久化内容队列。
- 默认 `training-platform.sqlite` 在最终质量门前后均为 `479232` bytes，mtime 均为 `2026-07-23T15:56:38.8411343Z`。新候选 exact dist、五项哈希和 receipt 仅由候选校验器在干净隔离工作树中生成。

## 新产品候选冻结记录（2026-08-24）

- 单一产品候选提交：`34916705712cac1ef2e5d8816cd8e40fa4e29ca7`（`fix(v4): harden capture chain recovery`），父提交为观察工具兼容性提交 `9cf7926`；候选自身不包含观察器差异。
- `node scripts/validate-v4-candidate.mjs --candidate 34916705712cac1ef2e5d8816cd8e40fa4e29ca7` 退出 `0`，输出 `V4 candidate commit PASS`。
- exact dist：`.tmp/p7f6-exact-dist-3491670`；receipt：`.tmp/p7f6-candidate-receipt-3491670.json`；receipt SHA-256 为 `986EC5E4456BA60AC9918CB105691F2A8D70BC76FCB02375D09F75EF9630E1EE`。
- 五项 exact-dist 哈希：manifest `45F7CF9C...D605CC`、background `41347B02...D6064`、content `7BD8D441...EF324`、popup `9C1431DB...B7025`、main-world bridge `390E1440...DF5B`；十个 dist 文件逐字节一致。
- exact 候选门确认 root `2550/1`、App E2E `25/25`、extension unit `1660/1660`、extension E2E `54/1`、build `20/20`、privacy `0 findings`、readiness PASS，且默认数据库元数据保持不变。
- 后续提交 `6c0e1d7` 仅增加 ADR-0003 约束的开发态 Sentry 异常工具，不修改或重新标记该 extension 候选；它不构成新候选 READY 证据。
- 新候选 LeetCode → NowCoder READY-only 仍必须获得一次新的、命名候选与平台范围的授权；未授权真实点击或提交。
