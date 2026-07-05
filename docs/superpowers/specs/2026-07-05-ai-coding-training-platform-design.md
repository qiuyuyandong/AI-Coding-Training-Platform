# AI 一体化刷题训练网站设计文档

日期：2026-07-05  
调研依据：`.omo/ultraresearch/20260705-auto-problem-ingestion/SYNTHESIS.md`

## 1. 产品定位

第一版定位为个人本地使用的 **自动题源聚合 + AI 单入口刷题训练台**。用户不需要在多个平台之间维护训练记录；本站负责发现、导入、展示可合规缓存的题目，并把训练、复盘、能力画像和推荐沉淀在同一个入口。

V1 的主线是：题源目录同步/开放题库导入 → 用户在本站训练台开始题目 → 系统记录 attempt → 更新能力画像 → Coach 识别薄弱点 → 推荐下一轮训练。手动创建仍保留，但只是 fallback，不再是默认主路径。

关键边界：自动获取不等于服务端批量爬取第三方完整题面。系统按题源权限分层处理：开放/授权题库可保存完整题面；Codeforces/AtCoder 等官方/公开 API 只保存元数据；浏览器插件或本地代理捕获属于 Phase 2 的用户授权本地能力。

## 2. 第一版原则

- **Single-entry training**：搜索、选题、训练、代码草稿、结果、复盘、推荐和成长面板都在本站完成。
- **Automatic but policy-gated ingestion**：所有自动导入先经过 Source Policy，决定能保存完整题面、元数据，还是只保存外链。
- **Licensed-content first**：V1 完整题面来自开放许可证、用户自有内容或明确授权来源。
- **Metadata connector now, risky crawler never by default**：Codeforces/AtCoder 类 connector 可做目录和标签，不把无授权平台题面缓存作为默认能力。
- **Explainable recommendation**：每个推荐都说明目标弱点、证据、难度原因和复盘问题。
- **Local-first privacy**：训练记录、代码、复盘、捕获题面和能力画像默认保存在本地。
- **Compliance by design**：不绕过登录、验证码、反爬、付费墙或访问控制。

## 3. V1 范围

### 包含

- Source Registry：配置题源名称、URL、许可证、风险等级、同步方式、缓存策略和展示策略。
- 开放/授权题库导入：完整题面、样例、标签、难度、归因、license、content hash。
- 官方/公开元数据 connector：Codeforces/AtCoder 目录级同步，保存标题、标签、难度、原题链接和 external ID。
- 统一 Problem Catalog：合并搜索开放题库、官方元数据和用户手动题目。
- 单入口 Training Workspace：题面展示或原题打开入口、计时、代码草稿、结果、错误类型、复盘、重练标记。
- 训练记录、能力画像、规则版 Coach、RecommendationLog、成长面板。
- 合规面板：展示每个题目的来源、cache tier、content rights、同步方式和删除缓存入口。

### 不包含

- 不做 Luogu、NowCoder、LeetCode 等平台完整题面的默认服务端爬虫。
- 不缓存无明确授权的商业平台完整题面作为公开或核心功能。
- 不绕过登录、验证码、付费墙、反爬或平台访问控制。
- 不实现自动提交到原平台或完整在线判题沙箱。
- 不接入外部 LLM 作为 V1 必需能力。
- 不做多人账号、云端同步、公开部署、排行榜或社交功能。

## 4. Phase 2+ 范围

- 浏览器插件或 userscript：用户主动安装后，捕获当前浏览器中的题目上下文、代码和提交结果。
- 本地 Playwright/CDP companion agent：在用户机器上辅助个人训练流捕获，不做服务端批量抓取。
- 外部 LLM Coach：在规则版 Coach 基础上做解释、提问和个性化表达。
- 合作授权题库或课程题库。
- 样例运行或轻量本地判题。

## 5. 核心模块

### 5.1 Source Registry 与 Policy Engine

Source Registry 是所有自动题源的入口。每个 source 必须显式声明：`id`、`name`、`homepage`、`license`、`riskLevel`、`syncMode`、`cachePolicy`、`attributionRequired`、`enabled`。

Policy Engine 接收 connector 返回的 ImportCandidate，输出允许持久化的字段。adapter 不能自行决定缓存完整题面。

### 5.2 Problem Catalog

Problem 是训练入口，不是无差别题库镜像。V1 支持自动导入、手动创建、编辑、列表、搜索、按来源筛选和训练状态管理。

关键字段：`id`、`sourceId`、`externalId`、`title`、`canonicalUrl`、`tags`、`difficulty`、`status`、`cacheTier`、`contentRights`、`ingestionMethod`、`contentHash`、`lastSyncedAt`、`createdAt`、`updatedAt`。

`cacheTier` 第一版支持：

- `licensed_full`：开放/授权题库完整题面，可站内展示。
- `metadata_only`：只保存标题、URL、标签、难度、来源和用户备注。
- `user_local_capture`：用户授权捕获并仅本地保存的题面，Phase 2 使用。
- `manual_only`：用户手动录入内容。

### 5.3 ProblemStatement

ProblemStatement 保存可展示题面快照。只有 `licensed_full`、`manual_only` 和 Phase 2 的 `user_local_capture` 可以写入完整题面。字段包括 `problemId`、`statementMarkdown`、`samples`、`constraints`、`language`、`attribution`、`license`、`versionHash`。

### 5.4 IngestionJob

IngestionJob 记录每次自动同步。字段包括 `id`、`sourceId`、`connectorType`、`status`、`startedAt`、`finishedAt`、`itemsSeen`、`itemsImported`、`itemsSkipped`、`errorSummary`。

### 5.5 TrainingAttempt

每次训练产生一条 Attempt。它是所有分析的事实来源。

结果枚举：`passed`、`failed`、`partial`、`stuck`、`draft`。`draft` 可以保存但不参与 Coach 分析，直到关键字段补齐。

错误类型枚举：思路不会、审题错误、边界条件、复杂度不够、数据结构选择错误、实现 bug、语法/API 不熟、调试能力不足、心态/时间分配问题。

### 5.6 AbilityProfile

AbilityProfile 按标签维护能力估计。它不追求复杂深度知识追踪，V1 使用 BKT-like 规则和间隔复习字段即可。

关键字段：`tag`、`mastery`、`confidence`、`slip`、`guess`、`attemptCount`、`lastProbedAt`、`spacedNextReview`。

### 5.7 Rule Coach

Rule Coach 读取 Problems、TrainingAttempts、AbilityProfiles 和 RecommendationLogs，输出结构化 CoachAnalysis。

输出包含：

- `summary`：总体诊断。
- `weakPoints`：薄弱点、证据 attempt IDs、解释。
- `recommendations`：推荐题目、目标弱点、推荐原因、舒适圈解释、复盘问题。
- `rubricNotes`：对复盘质量、错误归因质量、训练习惯的结构化评价。

### 5.8 RecommendationLog

每次生成推荐都必须保存日志。RecommendationLog 用来避免重复推荐、评估推荐质量，并为 Phase 2 的 AI Coach 提供上下文。

关键字段：`id`、`generatedAt`、`basisWindowStart`、`basisWindowEnd`、`items`、`acceptedProblemIds`、`outcomeSummary`。

### 5.9 StatsSnapshot 与成长面板

成长面板读取 StatsSnapshot，而不是每次渲染都从原始 attempt 现场计算。V1 可以在 attempt 保存后同步刷新 snapshot。

指标包括：总训练次数、连续训练天数、每日训练量、标签正确率、标签平均耗时、错误类型分布、难度分布、复盘完成率。

## 6. 数据流

1. 用户启用题源，Source Registry 加载 source policy。
2. Connector 同步开放/授权题库或官方元数据，产生 ImportCandidate。
3. Policy Engine 决定保存完整题面、元数据或跳过高风险字段。
4. Problem Catalog 展示可训练题目。
5. 用户从本站进入 Training Workspace；完整题面在站内展示，metadata-only 题目提供原题打开和后续捕获入口。
6. 用户保存 TrainingAttempt，包括结果、耗时、错误类型、代码和复盘。
7. 系统根据 attempt 更新 Problem 状态、AbilityProfile 和 StatsSnapshot。
8. Rule Coach 生成 CoachAnalysis 和 RecommendationLog。
9. 用户查看推荐题单，并在下一轮训练中接受或跳过推荐。

## 7. “舒适圈外一点”推荐策略

V1 使用可解释启发式：

- 目标成功区间：预计成功率 60%–70%。
- 推荐混合：60% 薄弱点突破、25% 熟练区巩固、15% 新标签探索。
- 间隔复习：到期标签或重练题优先进入候选池。
- 避免重复：近期 RecommendationLog 已推荐但用户未接受的题目降低权重。
- 每个推荐必须展示：目标标签、证据、难度原因、预计挑战点、复盘问题。

## 8. 合规与隐私边界

- V1 自动导入仅限开放/授权完整题库和官方/公开元数据。
- V1 不访问登录态页面、验证码、付费内容、反爬保护内容或平台访问控制。
- V1 不把用户代码发送给外部 AI 服务。
- 每个 Problem 必须展示来源、缓存等级、授权说明和删除缓存入口。
- 如果未来公开部署，必须重新评估题面缓存、用户代码、AI provider、数据删除、日志和备份策略。
- Phase 2 插件/本地代理必须是可关闭、可降级、可测试的输入插件，并默认 local-only。

## 9. 测试重点

- Source Registry、Policy Engine 和 cacheTier 行为。
- 开放/授权题库导入完整题面。
- Codeforces/AtCoder connector 只保存元数据，不伪造完整题面。
- TrainingAttempt 创建、draft 行为、错误类型校验。
- AbilityProfile 在连续正确/错误 attempt 后的变化。
- StatsSnapshot 与原始 attempt 的一致性。
- Rule Coach 输出结构完整，且 evidenceAttemptIds 可回溯。
- RecommendationLog 持久化和去重逻辑。
- Playwright E2E：用本地授权题库 fixture 自动导入并跑通完整训练周期。

## 10. 成功标准

第一版完成后，用户可以把本站作为唯一训练入口：自动导入可合规使用的题目或题目元数据 → 在 Training Workspace 训练 → 记录结果和复盘 → 生成能力画像 → 获得弱点诊断 → 收到下一轮推荐 → 在成长面板看到趋势。

只有当这个闭环稳定后，才进入 Phase 2：浏览器插件、本地采集代理、外部 LLM、合作题库和轻量判题能力。
