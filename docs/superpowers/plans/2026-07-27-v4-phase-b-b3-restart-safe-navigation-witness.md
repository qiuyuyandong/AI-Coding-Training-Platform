# V4 Phase B — NowCoder B3.1 Restart-Safe Navigation Witness Plan

## 1. 背景

当前 NowCoder B3 浏览负向观察已经完成一次真实授权执行，但结论为 `BLOCKED`。

已有事实：

* 分支：`feature/v1-followup`
* 首次 B3 构建 SHA：`6862f462978352fda7ab1e90639a5c1fbd960810`
* 最新文档 SHA：`9e270ecbee54e08cb13427b65318922b27351b9c`
* `npm run quality:gate` 已完整退出 0
* 授权路径已经真实执行：

  * `localhost:3000/resources`
  * NowCoder contest list
  * 精确 problem 页面
* 未点击提交控件
* 未读取、输入或修改用户代码
* 等待判题、outbox、quarantine 前后均为 0
* 当前没有生成严格 E0 fixture

阻断原因：

Chrome Manifest V3 Service Worker 在观察过程中发生重启或重新初始化。现有逻辑将 Worker 启动视为异常并无条件清除诊断 session，导致 list 与 problem 两条 E0 导航见证无法完成配对，导出按钮被禁用。

该问题不是 NowCoder 页面导航失败，也不是测试断言失败，而是当前诊断状态生命周期设计与 MV3 Service Worker 非持久化模型存在冲突。

---

## 2. 阶段目标

本阶段命名为：

`B3.1 — Restart-Safe Diagnostic Navigation Witness`

目标：

1. 将 B3 导航见证的权威状态从 Service Worker 内存迁移到 `chrome.storage.session`。
2. 允许正常的 Worker 终止和重新唤醒，不再因 Worker restart 本身清除合法 session。
3. 保留严格 fail-closed、安全白名单和隐私边界。
4. 防止异步消息并发导致状态覆盖或重复见证被错误接受。
5. 增加可重复的 Worker termination 集成测试。
6. 完整通过 `npm run quality:gate`。
7. 生成新的不可变实现 SHA。
8. 在新的 browse-only 授权下重新执行 B3。
9. 仅在得到严格安全 E0 fixture 后将 B3 标记为 `PASS`。

本阶段不进入 B4，不进行自然提交观察，不申请 production、RC、验收或发布资格。

---

## 3. 核心设计原则

### 3.1 Worker 必须可随时被销毁

Service Worker 不保存权威状态。

禁止依赖：

* 全局变量
* 内存中的 `Map` 或 `Set`
* popup 页面内存
* 长连接
* 人为保活 Worker
* DevTools 持续打开
* 定时 ping 保活

Service Worker 只负责：

1. 接收事件；
2. 同步净化 sender；
3. 从 `chrome.storage.session` 读取状态；
4. 执行状态转换；
5. 写回状态；
6. 在终态执行清理。

### 3.2 Worker restart 不等于异常

删除以下语义：

```text
Worker 启动或重启
→ 无条件清理诊断 session
```

替换为：

```text
Worker 被事件唤醒
→ 读取 storage.session
→ 校验 schema、SHA、TTL 和状态
→ 合法则继续
→ 不合法才 fail-closed
```

### 3.3 保留当前严格消息边界

content script 继续只发送常量消息。

禁止让 content script 提供可信的：

* route
* URL
* origin
* pathname
* tabId
* frameId
* documentId

background 必须同步从 `MessageSender` 中读取并验证：

* `sender.tab.id`
* `sender.frameId`
* `sender.documentId`
* `sender.url`

`sender.url` 只能在同步净化阶段用于精确白名单匹配。

匹配完成后立即映射为：

```ts
type CharacterizationRoute =
  | "contest-list"
  | "problem";
```

不得将原始 URL、origin 或 path 传入：

* async closure
* storage
* export
* fixture
* log
* error
* test snapshot

---

## 4. 状态模型

新增最小状态：

```ts
type B3WitnessStatus =
  | "armed"
  | "list-seen"
  | "ready"
  | "invalid";

type B3WitnessState = {
  schemaVersion: 1;
  buildSha: string;
  sessionId: string;
  revision: number;

  status: B3WitnessStatus;

  startedAt: number;
  expiresAt: number;

  tabId?: number;
  listDocumentId?: string;
  problemDocumentId?: string;

  invalidReason?: B3InvalidReason;
};
```

建议 TTL：

```text
5 分钟
```

允许根据已有真实观察耗时调整到最多 10 分钟，但不得创建长期 session。

### 4.1 允许保存的字段

只允许保存：

* schema version
* build SHA
* 随机 session ID
* revision
* 状态枚举
* 时间戳
* tab ID
* document ID
* 受控错误枚举

### 4.2 禁止保存的字段

禁止进入 `chrome.storage.session`：

* URL
* origin
* hostname
* pathname
* query
* hash
* 页面标题
* 页面正文
* 题目内容
* 用户代码
* 网络请求原文
* 网络响应原文
* Cookie
* Token
* 用户身份信息
* 任意 sender 原始对象

---

## 5. 状态转换

### 5.1 启动观察

只能由用户在 popup 中明确点击启动。

创建状态：

```ts
{
  schemaVersion: 1,
  buildSha: CURRENT_BUILD_SHA,
  sessionId: crypto.randomUUID(),
  revision: 0,
  status: "armed",
  startedAt: now,
  expiresAt: now + TTL
}
```

启动前必须：

1. 清理旧的终态或过期 session；
2. 清理旧 alarm；
3. 确认 NowCoder production observer 没有被同时启用；
4. 不影响其他平台的 production observer。

不能因为收到 contest list 见证而自动创建 session。

### 5.2 `armed → list-seen`

仅当全部满足时允许：

* 当前状态是 `armed`
* route 是 `contest-list`
* `frameId === 0`
* `tabId` 有效
* `documentId` 有效
* session 未过期
* build SHA 与当前构建一致
* schema 合法
* revision 为 0

写入：

```ts
{
  ...state,
  revision: 1,
  status: "list-seen",
  tabId,
  listDocumentId: documentId
}
```

### 5.3 `list-seen → ready`

仅当全部满足时允许：

* 当前状态是 `list-seen`
* route 是 `problem`
* `frameId === 0`
* `tabId === state.tabId`
* `documentId` 存在
* `documentId !== state.listDocumentId`
* session 未过期
* build SHA 一致
* revision 为 1

写入：

```ts
{
  ...state,
  revision: 2,
  status: "ready",
  problemDocumentId: documentId
}
```

### 5.4 非法转换

以下情况全部进入 `invalid` 或立即清理，并禁用导出：

* problem 先于 list
* list 重复
* problem 重复
* 跨 tab
* iframe 事件
* 缺少 documentId
* 两次 documentId 相同
* URL 不在精确白名单
* session 过期
* schema 不合法
* build SHA 不匹配
* 状态字段损坏
* READY 后又收到见证
* 导出后再次收到见证
* storage 读取或写入失败
* revision 不符合预期

错误原因必须使用受控枚举，不得包含原始 URL、页面内容或 sender 信息。

---

## 6. 并发控制

不能假设异步 `get → modify → set` 天然原子。

在 `background.ts` 中增加进程内串行队列：

```ts
let witnessTransitionQueue = Promise.resolve();

function enqueueWitness(
  witness: SanitizedNavigationWitness
): Promise<TransitionResult> {
  const operation = witnessTransitionQueue.then(() =>
    processWitnessTransition(witness)
  );

  witnessTransitionQueue = operation.then(
    () => undefined,
    () => undefined
  );

  return operation;
}
```

所有导航见证必须经过该队列。

单次转换必须保持顺序：

```text
读取状态
→ 校验状态
→ 执行纯转换
→ 写回状态
→ 返回结果
```

队列只用于避免同一 Worker 生命周期内的事件交错。

权威状态仍然必须保存在 `chrome.storage.session`。

---

## 7. 文件修改范围

### `extension/src/characterizationStorage.ts`

新增或调整：

* `B3WitnessState` schema
* 严格运行时校验
* `loadB3WitnessState`
* `saveB3WitnessState`
* `clearB3WitnessState`
* `invalidateB3WitnessState`
* `chrome.storage.session` adapter
* 测试用 memory adapter
* 过期状态清理

不得自动把损坏数据修复为合法状态。

遇到损坏状态必须 fail-closed。

### `extension/src/characterizationNavigationWitness.ts`

改为纯状态机模块。

输入：

```ts
type SanitizedNavigationWitness = {
  route: "contest-list" | "problem";
  tabId: number;
  frameId: 0;
  documentId: string;
};
```

主要函数：

```ts
transitionB3WitnessState(
  currentState,
  witness,
  context
): TransitionResult
```

该模块不得访问：

* Chrome API
* storage
* sender
* 原始 URL
* DOM
* 网络请求
* 日志系统

### `extension/src/background.ts`

负责：

* 顶层同步注册 `runtime.onMessage`
* 同步校验常量消息
* 同步净化 sender
* 精确 URL 白名单映射
* 丢弃原始 URL
* 调用串行转换队列
* 读写 `storage.session`
* 删除 Worker 初始化时无条件清理逻辑
* 在 invalid、export 和 timeout 后执行清理

监听器必须在模块顶层注册，不能等待异步初始化完成。

### `extension/src/popup.ts`

负责：

* 用户显式启动 B3 session
* 显示 `armed / list-seen / ready / invalid`
* 只有 `ready` 时启用导出
* 重新开始前清理旧 session
* 导出后刷新为无活动 session

popup 不得成为权威状态源。

### `extension/src/characterization.ts`

检查并调整：

* characterization 生命周期
* production observer guard
* diagnostic observer 初始化
* export 后清理
* restart 后读取 session 的行为

### `extension/manifest.json`

确认包含：

```json
{
  "permissions": ["storage"],
  "minimum_chrome_version": "106"
}
```

若项目已有更高 minimum version，则保持更高值。

不得调用：

```ts
chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
})
```

B3 状态不得向 content script 开放。

---

## 8. 导出规则

只有以下条件全部成立时允许导出：

* `status === "ready"`
* `revision === 2`
* build SHA 与当前构建一致
* session 未过期
* list 和 problem 使用同一 tab
* 两个 documentId 不同

fixture 中的 E0 URL 必须由代码中的允许常量生成，不得复制 sender.url。

导出结果必须：

* 正好 2 条 E0
* 顺序严格为 list → problem
* E1 为 0
* E2 为 0
* E3 为 0

导出成功后必须：

1. 删除 `chrome.storage.session` 中的 B3 状态；
2. 删除相关 alarm；
3. 清除诊断 observer；
4. 清除临时诊断缓存；
5. 恢复 production guard；
6. 禁用再次导出；
7. 保证重复导出失败。

---

## 9. 测试计划

### 9.1 状态机单元测试

新增或扩展测试，至少覆盖：

1. `armed → list-seen → ready`
2. problem 先于 list
3. list 重复
4. problem 重复
5. 跨 tab
6. iframe
7. 缺少 documentId
8. 相同 documentId
9. session 过期
10. build SHA 不匹配
11. schema 损坏
12. revision 错误
13. READY 后额外消息
14. invalid 后不能恢复
15. export 后状态清除
16. storage 读取失败
17. storage 写入失败

### 9.2 隐私边界测试

断言持久化状态和错误对象中不包含：

* `http`
* `https`
* `nowcoder`
* `ac.nowcoder.com`
* `url`
* `origin`
* `pathname`
* `query`
* `content`
* `code`
* `cookie`
* `token`

测试 content script 伪造消息：

```ts
{
  type: "CHARACTERIZATION_NAVIGATION_WITNESS",
  route: "problem",
  url: "forged",
  documentId: "forged"
}
```

background 必须忽略伪造字段，只使用可信 sender 信息。

### 9.3 并发测试

至少测试：

```ts
await Promise.all([
  sendListWitness(),
  sendListWitness()
]);
```

结果必须 fail-closed。

不得因为两个 handler 同时读取 `armed` 而产生合法状态。

再测试：

* list 与 problem 几乎同时到达
* 两个 problem 同时到达
* invalid 与合法事件交错

### 9.4 Worker termination 集成测试

必须加入真实 Worker 终止测试。

#### 场景 A：armed 后终止

```text
启动 session
→ Worker 终止
→ list
→ problem
→ ready
```

#### 场景 B：list 后终止

```text
启动 session
→ list
→ 确认 list-seen 已写入 storage.session
→ Worker 终止
→ problem
→ ready
→ 导出
```

这是本阶段最关键的测试。

#### 场景 C：ready 后终止

```text
启动 session
→ list
→ problem
→ ready
→ Worker 终止
→ popup 重新读取 ready
→ 导出
```

#### 场景 D：extension reload

```text
启动 session
→ list
→ reload extension
→ session 消失
→ problem 不得恢复
→ 导出禁用
```

extension reload 与普通 Worker restart 必须具有不同结果。

---

## 10. 质量门禁

完成实现后运行：

```powershell
npm run typecheck
npm run extension:check
npm run quality:gate
```

最终以完整：

```powershell
npm run quality:gate
```

退出 0 为准。

不得通过以下方式使门禁通过：

* 跳过测试
* 删除测试
* 降低断言
* 吞掉异常
* 忽略未处理错误
* 增加无理由的超长 timeout
* 禁用关键 E2E
* 降低 fixture validator 要求

记录真实测试数字。

---

## 11. Git 与提交纪律

当前工作区存在既有改动。

必须遵守：

* 所有 git 命令使用：

```powershell
$env:GIT_MASTER='1';
```

* 不得执行：

  * `git reset`
  * `git checkout --`
  * `git restore`
  * 删除用户已有改动
  * 覆盖未拥有文件
* 不得使用：

```powershell
git add .
```

提交前执行：

```powershell
$env:GIT_MASTER='1';
git status --short
git diff --check
git diff --stat
git diff
git log --oneline -10
```

只 stage 本次 B3.1 实际拥有的文件。

---

## 12. 提交结构

### 提交一：实现提交

建议提交信息：

```text
fix(v4): make B3 navigation witness restart-safe
```

该提交包含：

* `storage.session` 状态机
* sender 净化保留
* Worker restart 行为修复
* 并发队列
* schema 校验
* 单元测试
* Worker termination E2E
* 设计文档和交接状态更新

完整质量门禁通过后创建该提交。

记录完整 SHA。

该 SHA 是下一次真实 B3 观察唯一允许使用的构建来源。

不得继续使用旧 SHA：

```text
6862f462978352fda7ab1e90639a5c1fbd960810
```

### 提交二：观察证据提交

只有真实 B3 观察成功后才创建。

建议提交信息：

```text
test(v4): record successful NowCoder B3 observation
```

包含：

* 严格 E0 fixture
* fixture-driven test
* 观察报告
* 计划状态
* handoff
* README
* architecture
* runbook
* compliance 中的事实性更新

不得在没有 fixture 时创建伪造证据提交。

---

## 13. 重新观察前预检

在重新申请 browse-only 授权前，必须确认：

1. `localhost:3000/resources` 可访问；
2. extension/dist 确实来自新的实现 SHA；
3. popup 能创建 `armed` session；
4. 状态写入 `chrome.storage.session`；
5. Worker termination E2E 已通过；
6. extension reload 会清除 session；
7. 完整 `quality:gate` 已退出 0；
8. 当前构建 SHA 已记录；
9. popup、background、content build hash 已记录；
10. 不存在旧 session、alarm 或诊断 observer。

若 localhost 服务不可访问，不执行真实观察，先修复环境问题。

---

## 14. 真实 B3 观察流程

只有在用户重新明确授权 browse-only 后执行。

限制：

* 使用用户 Chrome 的 CDP
* 不启动无登录态替代浏览器
* 只创建本轮后台 tab
* 不操作用户现有标签
* 不读取页面正文
* 不读取用户代码
* 不输入、修改或提交代码
* 不点击提交按钮
* 不触发页面脚本提交
* 不保留账号、页面或网络原文

流程：

```text
确认 localhost 可访问
→ 从新 SHA 构建 extension
→ reload unpacked extension
→ popup 启动 authenticated characterization
→ localhost resources
→ 精确 contest list
→ 精确 problem
→ 确认等待判题为 0
→ 导出 fixture
→ 运行 fixture validator
→ 运行 fixture-driven test
→ 确认 session 和 observer 已清理
→ 关闭本轮所有 tab
```

验证命令：

```powershell
node scripts/validate-v4-network-transcript.mjs `
  tests/fixtures/nowcoder/network/<fixture>.json
```

---

## 15. B3 PASS 标准

只有同时满足以下全部条件，才允许将 B3 标记为 `PASS`：

* 新实现 commit SHA 已记录
* extension/dist 来源于该 SHA
* 完整质量门禁退出 0
* Worker termination 三个关键场景通过
* 真实授权浏览完成
* 路径严格为 list → problem
* 同一个 tab
* 均为 main frame
* documentId 不同
* fixture 正好两条 E0
* E1、E2、E3 均为 0
* fixture validator 通过
* fixture-driven test 通过
* 没有原始 URL、origin、path、页面内容或代码进入 storage、日志、错误、异步闭包或 fixture
* 导出后 session 被清除
* observer 被清除
* alarm 被清除
* production guard 恢复
* 本轮创建的浏览器 tab 全部关闭
* 报告、计划、handoff 和架构文档与实际事实一致

任何一项不成立：

```text
B3 = BLOCKED
```

---

## 16. 明确不做

本阶段不得：

* 进入 B4
* 执行自然提交观察
* 点击 NowCoder 提交按钮
* 读取或修改用户代码
* 放宽 E0 schema
* 伪造 fixture
* 使用旧构建继续观察
* 强制保持 Worker 存活
* 使用 `storage.local` 长期保存诊断状态
* 将 storage.session 暴露给 content script
* 自动启动诊断 session
* 将 B3 PASS 表述为 NowCoder production、RC、验收或发布通过
* push 到远程仓库

---

## 17. 最终汇报要求

最终汇报使用中文，并基于实际命令和证据，必须包含：

* B3.1 结果
* 分支
* 实现 commit SHA
* 观察证据 commit SHA
* 是否推送
* 工作区状态
* 修改文件范围
* 完整质量门禁结果和真实数字
* Worker termination 测试结果
* 真实浏览观察事实
* fixture 路径
* fixture validator 结果
* 当前能力边界
* 明确未完成项
* B3 最终是 PASS 还是 BLOCKED
* 是否允许进入 B4

若任何门禁失败，必须说明：

* 失败根因
* 失败命令
* 影响范围
* 当前阻断点

不得声称已完成未实际完成的步骤。

---

## 18. 执行收口（2026-07-28）

**结果：B3 PASS（仅限 NowCoder browse-only navigation witness）。**

### 实际验证方法

测试不再直接写入 `chrome.storage.session`，也不在 Worker restart 后
重新进入 Worker 执行 `chrome.storage`。`tests/extension-e2e/capture-v4-network.spec.ts`
中的四个 B3 测试使用以下黑盒路径：

1. Chrome DevTools Protocol 仅终止并观察 MV3 Worker；
2. 受 Playwright route 约束的精确 `ac.nowcoder.com` list/problem 页面加载真实
   production content script；
3. content script 的常量消息经真实 background sender 验证进入 B3 状态机；
4. popup 的真实 start/status/export UI 与 runtime message 路径验证状态和导出；
5. D 通过 `chrome://extensions` 的真实 Reload 控件验证 extension reload，随后
   用新的 popup 验证旧 session 未恢复且 export 禁用。

Bundled Chromium 的 `ExtensionDisableUnsupportedDeveloper` 实验特性会在 reload
后禁用命令行加载的 unpacked extension（`unsupportedDeveloperExtension`）。测试
fixture 显式传入 `--disable-features=ExtensionDisableUnsupportedDeveloper`，仅使
测试浏览器能完成真实 reload；该开关不进入 extension manifest、production source
或用户 Chrome。fixture 同时在冷启动没有 Worker 时通过实际 popup 唤醒它，避免将
启动竞态误报为产品失败。

### A–D 结果

| 场景 | 结果 | 证明 |
| --- | --- | --- |
| A `armed` 后终止 | PASS | list content ingress 唤醒后，list → problem，popup 为 `ready`。 |
| B `list_seen` 后终止 | PASS | problem content ingress 恢复为 `ready`，popup 导出成功。 |
| C `ready` 后终止 | PASS | popup 唤醒后仍为 `ready`，导出成功。 |
| D extension reload | PASS | Reload 后新的 popup 没有 active session，stop/export 均禁用；旧 problem 流程不能恢复。 |

### 质量证据

* `npm run typecheck`：PASS。
* B3 A–D focused Playwright：连续 3 轮，12/12 PASS。
* `npm run extension:e2e`：35 PASS、1 已知历史 skip。
* `npm run quality:gate`：EXIT 0；87 unit files / 1792 passed / 1 skipped，25 Web E2E
  passed，34 extension unit files / 1077 passed，35 extension E2E passed / 1 historical
  skip，20-page production build passed。

真实观察与 fixture 仍是 `tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json`
及 `work/reports/v4-nowcoder-b3-restart-safe-observation-2026-07-27.md` 所记录的同一
browse-only 证据；本轮没有操作用户 Chrome、NowCoder 真实页面、代码或提交控件。

本收口不代表 NowCoder production、Release Candidate、用户验收、公开发布，也不授权
进入 B4。
