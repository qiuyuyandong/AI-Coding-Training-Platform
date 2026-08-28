# V4 Phase D Local Vault 与无配对码捕获边界修订计划

**状态：Revision 3 / Route H-安装级 D0–D7 已完成；首次 D8-A 已在动作前失败关闭。用户已授权 D8-A-R 根因修订，并在修订离线门通过后重新授权候选 `0c23fca` 的 LeetCode `merge-two-sorted-lists` 单动作观察。今后真实提交只允许当前远程调试 Chrome 的用户指定 `yu` profile；该绑定不读取或留存账号身份。NowCoder、额外动作、D4 交付裁决、推送、PR、RC 和发布均未授权。**

**替代范围：** 本计划与
`2026-08-24-v4-phase-d-local-vault-transport-decision-revision.md`
共同构成 V4 Phase D 后续产品修订、候选冻结和新候选 READY-only 的唯一执行入口。它取代“为新 profile 增加两阶段配对准备”的建议，并在本地 V0/V1 范围内取代 Phase 0B3 的可见配对码方案；隐藏 bearer 仍作为 Route H 的安装级 capability。Phase 7 云端账户、远程同步和服务端认证不受影响。

## 0. Revision 2 规范优先级

本节是 2026-08-25 获批的 Route H 修订；与后文历史
exact-Origin-only 文字冲突时，以本节、ADR 0004 和传输决策修订为准。

- Origin 只做普通网页 CSRF/CORS 与构建漂移的纵深防御，不做扩展身份认证。
- 用户在首次安装或扩展重装后于本地设置页点击一次“连接扩展”；不显示、
  复制或粘贴任何代码。
- capability 跟随本机应用安装，服务端只保存 Vault 外的 hash 元数据，扩展只
  在 `chrome.storage.local` 保存原值；切换 Vault 自动沿用。
- 连接使用 60 秒内存 challenge、固定扩展 ID 的 external messaging、闭合
  schema、精确 sender URL、单次原子消费和 256-bit capability。
- 后续 attempts/events/status 继续使用 Bearer；错误或缺失 capability 在读取
  capture body、打开 SQLite 前失败关闭。
- `externally_connectable.matches` 只允许规范 localhost 应用页面，且不声明
  其他 extension ID。它是连接入口约束，不是对页面注入型恶意扩展的保证。

阶段映射如下：D0 修订契约；D1 是新的 Chrome 151 Route H spike；D2–D6
分别继承并修订原 P2–P6；原 P7 变为 D7，仍需另行授权。

## 1. 结果目标

把用户心智从“扩展要先和数据库配对”改为“本地应用打开一个 Vault，扩展自动连接当前 Vault”：

```text
Chrome 扩展（固定 ID + 安装级 capability）
        │ Bearer POST；Origin/Host/CORS 纵深防御
        ▼
http://localhost:3000（唯一写入者和事务所有者）
        │ 进程启动时绑定
        ▼
用户选择的 Local Vault 文件夹 / training-platform.sqlite
```

最终产品行为必须满足：

- 用户不再创建、复制、粘贴、轮换或撤销配对码/捕获凭证。
- 用户通过本地 launcher 选择一个文件夹作为 Vault；无图形选择器时可传绝对路径。
- 扩展重载和浏览器重启自动连接；扩展卸载后重装需要在本地设置页重新点击一次“连接扩展”，不输入代码。
- Vault 切换允许重启本地应用；运行中不热切数据库。
- 现有 `training-platform.sqlite` 永不自动移动或删除。用户只能显式选择“创建空 Vault”或“复制、校验后采用现有数据库”；原文件保留到用户自行确认处理。
- 新捕获事件使用 `extension_local`；历史 `extension_unpaired` / `extension_paired` 原值保留，不批量改写。

## 2. 已确认的产品与信任边界

### 2.1 用户已确认的四项方向

1. V0/V1 保留 Next.js + localhost + SQLite，不引入桌面壳。
2. 能读取本机应用源码、Chrome profile 或 SQLite 的本地进程视为本地信任边界内；本轮主要阻止普通网页和其他扩展伪造捕获写入。
3. Vault 切换可以停止并重启本地应用。
4. 删除用户可见的一次性配对码及其长期 bearer 凭证流程。

### 2.2 用户已确认的默认细节

- 第一次创建 Vault 和后续切换 Vault，优先由本地 launcher 打开操作系统文件夹选择器；无 GUI/自动化环境使用显式绝对路径参数。
- 旧数据库迁移是显式动作：复制到目标目录的临时文件，逐字节校验复制结果，再运行数据库完整性/迁移校验，最后原子采用；源文件不移动、不删除、不改写。
- 新事件写 `extension_local`，历史两种 provenance 只读兼容。

### 2.3 新威胁模型

本轮必须阻止：

- 任意普通网页在没有 capability 时调用捕获写接口；
- 未被 `externally_connectable` 允许的其他扩展直接发起连接消息；
- 缺失、畸形、过期、错误或重放的 challenge/capability；
- 通配 CORS、任意 Origin 回显、公开固定 Header 或可见配对码形成绕过。

本轮明确不阻止：

- 已获得 localhost host/scripting 权限并能主动注入或控制本地应用页的恶意扩展；
- 能读取 Chrome storage、应用配置、SQLite、Vault、扩展源码或应用内存的本机进程；
- 恶意操作系统、浏览器二进制或被篡改的本地构建。

Origin 是普通网页边界与纵深防御，不是认证。`installationId` 参与 capability
记录、关联、重放和幂等诊断；真正的写入授权来自安装级 bearer。

## 3. 历史 exact-Origin gate 与新的 Route H gate

第 3.1–3.3 节记录 Revision 1 的已失败 gate，只保留为历史证据，不再是后续
实现入口。

删除 bearer 之前，必须先完成一个纯 localhost、零 OJ、零数据库写入的 Chrome MV3 spike。稳定 Origin 是本方案的必要条件，不是实施中的可选优化。

### 3.1 Spike 资产

- 生成并冻结一份公开的扩展 manifest `key`；它不是秘密，不保存任何私钥或用户凭证。
- 由 `key` 确定预期的 32 字符扩展 ID，并在测试中独立计算/核对，禁止手抄漂移。
- Spike 使用临时复制的 production dist 和临时 manifest 注入 `key`；在本门通过前不得删除现有配对实现。
- 本地探针只监听 `127.0.0.1:3000`，端口已占用即失败关闭；不启动 Next.js，不打开任何 OJ 页面。

### 3.2 必须实际观察的 Chrome 行为

在两个全新 user-data-dir（模拟卸载后重装）和同一 profile 的浏览器重启/扩展 reload 中：

- 扩展 ID 始终等于冻结 ID；
- service worker 对 localhost 的真实 `GET` 和 JSON `POST` 均到达探针；
- 探针观察到的 `Origin` 始终精确等于 `chrome-extension://<冻结ID>`，不得缺失；
- 若 Chrome 发起预检，`OPTIONS` 也只允许精确 Origin，响应不得使用 `Access-Control-Allow-Origin: *`；
- 任意网页 Origin、错误扩展 ID、任意其他合法格式扩展 ID、缺失 Origin、`Origin: null` 和畸形 Origin 均被相同策略拒绝；
- 测试请求和证据不得包含 OJ URL、页面数据、代码、cookie、token 或现有数据库内容。

### 3.3 硬停止门

只有全部断言稳定通过，才可进入 P2。若 Chrome 在任一目标生命周期省略 Origin、改变扩展 ID，或必须依赖宽松 CORS 才能送达：

- 立即停止；
- 保留 spike 证据，撤销任何尚未进入产品 manifest 的临时注入；
- 返回用户重新选择“隐藏的一键 localhost 握手”或 Native Messaging；
- 不得静默恢复可见配对码、复制旧 credential、接受 missing Origin，或让扩展直接写文件。

### 3.4 Route H D1 硬停止门

D1 使用真实 Chrome 151、两个 fresh profile、临时扩展副本、临时应用配置和
disposable SQLite，不打开 OJ，不接触默认数据库。必须证明：

- 固定扩展 ID 的 `externally_connectable` 页面消息可达，错误 extension ID
  被浏览器拒绝；
- extension 只接受规范 `http://localhost:3000/settings` sender URL 和闭合
  消息 schema；
- challenge 最长 60 秒、只消费一次；过期、重放和并发 loser 均失败关闭；
- 扩展生成 256-bit capability，页面永远看不到原值，服务端只持久化 hash；
- 正确 bearer 的 sanitized fake Bundle 幂等写入 disposable SQLite；错误或
  缺失 bearer 保持数据库 `0/0/0`；
- reload/restart 保持连接，fresh profile 初始 disconnected，卸载/重装后要求
  一次新点击；Vault 切换模拟不改变安装级 capability。

若当前 Chrome 151 不能在不降低安全契约的情况下完成任一断言，立即停止，不进入
D2，不使用 Chromium 138 代替，不回退 exact Origin、自定义公开 Header、可见
配对码或 Native Messaging。

## 4. Local Vault 产品契约

### 4.1 Vault 目录

每个 Vault 是用户选择的一个真实本地目录，包含两个应用所有文件：

- `.ai-coding-training-vault.json`：`format`、`version: 1`、随机 `vaultId`、`createdAt`；不含 token、账户、OJ 信息或数据库摘要。
- `training-platform.sqlite`：唯一业务数据库。

创建空 Vault 时，目标必须是现有空目录。选择已有 Vault 时，descriptor 与数据库必须同时存在且通过 schema、`PRAGMA quick_check` 和 `PRAGMA foreign_key_check`。存在冲突文件、未知 descriptor 版本、符号链接、junction/reparse 跳转、非普通文件或路径逃逸时失败关闭。

### 4.2 活动 Vault 配置

launcher 在操作系统用户配置目录保存一个小型、非秘密的原子 JSON pointer，只记录配置版本和规范化后的活动 Vault 绝对路径：

- Windows：`%APPDATA%/AI-Coding-Training-Platform/vault.json`
- macOS：`~/Library/Application Support/AI-Coding-Training-Platform/vault.json`
- Linux：`${XDG_CONFIG_HOME:-~/.config}/ai-coding-training-platform/vault.json`

写入采用同目录临时文件 + rename。配置文件不得进入仓库、浏览器 storage、SQLite 或日志证据。读取时重新 realpath 并校验 descriptor/数据库，不能只信任保存的字符串。

同一操作系统用户配置目录还保存独立的
`capture-installation.json`：仅含 schema version、`installationId`、
`credentialVersion`、capability password hash 和有界时间戳。它不属于
`vault.json`，不含 raw capability、Vault 路径/ID 或业务数据，并以相同的
安全文件类型检查和原子写入规则维护。

### 4.3 Launcher 与切换

新增单一产品入口 `npm run local`：

- 已有合法活动 Vault：验证后将规范数据库路径仅通过子进程环境传给 Next.js，并固定监听 localhost:3000；
- 首次运行：在终端明确选择“创建空 Vault”“采用现有数据库”或“使用已有 Vault”，随后打开 OS 文件夹选择器；
- GUI 不可用：相同操作接受 `--vault <absolute-path>`，采用旧库另要求 `--source <absolute-sqlite-path>`；相对路径被拒绝；
- 取消选择不修改配置、不创建文件、不启动服务；
- 端口 3000 已被占用或应用仍运行时拒绝切换；切换只发生在旧服务停止后，更新 pointer 后再启动新服务。

保留现有 `TRAINING_DB_PATH` 给测试和工程命令。正常产品入口由 launcher 验证并注入该值，同时注入只读 `TRAINING_VAULT_PATH` / `TRAINING_VAULT_ID` 供设置页显示；浏览器页面没有任意路径写 API，也不能要求服务运行中切库。

### 4.4 显式采用旧数据库

采用流程必须满足以下事务式顺序：

1. 要求服务停止，规范化源/目标，拒绝同一路径、目录逃逸、symlink/junction、非普通文件和非空目标。
2. 记录源文件 size、mtime、SHA-256 和关键业务表行数；以只读方式运行 `quick_check` / `foreign_key_check`。
3. 复制到目标同目录唯一临时文件；核对临时副本 SHA-256 与源完全一致。
4. 只在临时副本上执行迁移到最新 schema，再次运行完整性、外键和关键行数/身份校验。
5. 写临时 descriptor，原子采用数据库和 descriptor，最后原子更新活动 Vault pointer。
6. 任一步失败只清理本次创建且已验证位于目标内的临时文件；不改源文件、不更新 pointer、不留下半成品 Vault。
7. 成功后再次核对源 size、mtime、SHA-256 未变化，并向用户明确“原数据库仍保留，未自动删除”。

不得提供“移动”“覆盖源”“迁移后自动清理”快捷选项。

## 5. 捕获 API 与扩展契约

### 5.1 隐藏连接端点

- 设置页同源 POST 创建一次 challenge；challenge 只存在内存、最长 60 秒、
  固定长度、不可列举并最多成功消费一次。
- 页面通过固定 extension ID 发送闭合 external message，但不接收 raw
  capability。
- 扩展核对 `sender.url` 后生成 256-bit capability，直接向 localhost
  completion endpoint 提交 challenge、`installationId` 和 capability。
- completion 原子消费 challenge，把 capability 交给现有 password-hash
  边界，并原子替换 Vault 外安装记录；成功后扩展才把 raw capability 写入
  `chrome.storage.local`。
- 页面轮询的连接结果只返回
  `connected | pending | expired | failed`，不返回 secret、hash、Vault ID、
  路径、行数或业务数据。

### 5.2 捕获认证与纵深防御

- `POST /api/capture/attempts`、兼容 events route 和 extension status route
  在读取 capture body、打开 SQLite 前校验 Bearer。
- Host、method、content type、body size、CORS 与精确 extension Origin 继续
  失败关闭；Origin mismatch 可统一拒绝，但不得作为 credential 的替代。
- 正确 Bearer + sanitized Bundle 只执行现有事务式 ingest；错误、缺失、旧
  version 或已旋转 Bearer 均零写入。
- 浏览器页面使用同源设置端点；extension status 只返回固定协议、连接和服务
  健康字段，不返回 Vault path/ID 或学习数据。

### 5.3 删除可见配对产品面并复用认证核心

实施后删除：

- `/api/capture/pairing-codes`、旧 `/api/capture/pair` 和数据库驱动的
  installation revoke 产品面；
- pairing code UI、复制/粘贴流程、数字码文案和旧 popup 表单；
- Vault 数据库中的 pairing-code/installation 认证 repository。

保留并重定向复用：

- credential hash、constant-time verification、credential version、原子 rotation
  和 revoke 语义；
- `installationId`、Bearer transport、outbox/retry、ACK 和事务式 capture
  ingest；
- `captureCredential`、`captureCredentialVersion` 与 `pairedAt` 可在
  一次版本化扩展迁移中重命名为 Route H 语义；不得复制旧值作为新连接。

### 5.4 新连接状态与失败行为

- provenance 恒为 `extension_local`；历史 provenance 不改写。
- 闭合状态为
  `connected | connection_required | service_unreachable | capability_rejected`。
- reload/restart 在 raw capability 存在时自动 status；扩展重装后显示
  `connection_required` 并要求本地设置页一击。
- 服务未运行/网络失败保留 FIFO outbox并沿用有界网络重试。
- `401` capability failure 保留队首、不消费普通网络重试预算，禁止自动改
  Origin、复制旧 credential 或退回无认证。
- App 只展示当前 Vault、连接健康和重新连接按钮；Vault 切换回到 launcher。

## 6. 数据库与历史兼容

新增前向迁移 `0009_local_vault_extension_origin.sql`，不得修改历史 `0004_capture_credentials.sql`：

- 重建 provenance 有 CHECK 约束的 `training_sessions` / `capture_events`，允许 `extension_unpaired | extension_paired | extension_local`；
- 保留全部历史行的原 provenance、ID、指纹、时间和外键关系；不得把历史 paired/unpaired 改成 local；
- 先删除 `capture_pairing_codes`，再删除 `capture_installations`；两表只含失效认证元数据，不含学习记录；
- 恢复既有索引，并对每个历史迁移前缀、真实形状 fixture、空库和重复迁移运行行数、身份、`quick_check`、`foreign_key_check` 证明；
- 新 App/扩展代码不得查询已删除的两表。

回滚语义不是“把迁移后的 Vault 降级”。安全回退是切换到另一份未修改 Vault，或使用显式采用前仍保留的源数据库与旧版本应用；计划不实现 schema down migration。

## 7. 分阶段实施计划与停止门

### Historical P0 — 冻结基线与 ADR 0004

**目标：** 把本次已确认决策变成可审计契约，不触碰运行时代码。

- 记录当前 branch/HEAD、dirty paths、默认数据库 size/mtime/hash和候选资产哈希，保护用户自有 Sentry 修改。
- 新增 `docs/decisions/0004-local-vault-extension-origin-trust.md`，明确本地信任边界、稳定 Origin 的适用范围、Vault 所有权和 Phase 7 非适用范围。
- 在 Phase 0B3 spec 顶部追加“本地 V0/V1 方案被 ADR 0004 前向取代”的历史标记，保留原正文作为已实施历史。
- 在本计划获得最终批准前，P0 也不得开始。

**通过门：** 文档一致性检查通过；没有产品代码、数据库、扩展 storage 或浏览器变化。

### Historical P1 — 纯 localhost 稳定 ID / Origin spike

**目标：** 用真实 Chrome 证明第 3 节必要条件。

主要资产：`extension/identity.json`（公开 key 与预期 ID）、临时 dist 注入器、`tests/extension-e2e/capture-local-origin-spike.spec.ts`、对应纯函数单测和证据报告。

**通过门：** 两个全新 profile + restart/reload 全部精确 Origin 断言通过；零 OJ、零 SQLite、零配对。失败即结束本计划执行并返回用户。

### D0 — Route H 契约修订

**目标：** 修订 ADR 0004、本计划、传输决策和 handoff，冻结安装级 capability、
较窄恶意扩展边界、重装/Vault UX 与 D1 停止门；不修改运行时。

**通过门：** 文档不再把 Origin 称为认证；Route H 与 Native Messaging 不并存；
授权与未授权边界一致；`git diff --check` 通过。

### D1 — Route H Chrome 151 spike

**目标：** 按第 3.4 节证明最小 external messaging、challenge 和 bearer
闭环。Spike 可新增测试/探针/临时 manifest，但不得修改生产捕获路径。

**通过门：** 两个 fresh profile、restart/reload、错误 extension ID、过期/
重放/竞争、正确/错误 capability、disposable DB 写入与 `0/0/0` 断言全部通过。
任一失败立即停止并返回用户。

### D2（继承 P2）— Vault 核心与 launcher

**目标：** 先建立可测试的目录、配置、选择、采用和启动边界，再接 UI。

主要范围：

- 新增 `lib/vault/**` 纯路径/schema/配置/采用服务和 `scripts/local-vault.ts`；
- 新增 `local`、`vault:create`、`vault:switch`、`vault:adopt` 脚本入口；
- Windows 使用无额外依赖的系统文件夹选择器；macOS/Linux 有可用系统选择器时启用，否则明确降级到绝对路径参数，禁止静默选择 cwd；
- launcher 以非 shell 子进程启动 Next.js，设置活动 Vault 环境，监听退出并给出固定错误；
- `/settings` 改为 Local Vault 状态页，不提供运行中切换 API。

**通过门：** 临时目录单测覆盖创建、取消、绝对路径、配置原子性、collision、symlink/junction、未知版本、端口占用和停止后切换；默认仓库数据库完全不变。

### D3（继承 P3）— 前向数据库迁移与旧库采用

**目标：** 新增 `extension_local` 并证明复制采用绝不伤害源库。

主要范围：`lib/db/migrations/0009_local_vault_extension_origin.sql`、迁移/采用测试、E2E 数据库 fixture 和设置页历史标签。

**通过门：** fresh apply、0008→0009、每个历史前缀、重复运行、故障注入、源/目标同路径、复制后 hash mismatch、迁移失败均通过；成功和失败路径都证明源 size/mtime/hash 不变。

### D4（修订 P4）— Route H 写入与移除可见配对面

**目标：** 在 D1 已证实的边界上以隐藏安装级 capability 替换可见配对码，
不保留 exact-Origin-only 或双认证长期分支。

主要范围：

- `extension/manifest.json`、`extension/build.mjs`、
  `externally_connectable` 和固定 ID 一致性检查；
- challenge/complete/status routes、Vault 外安装记录和
  `lib/http/captureRequest.ts`；
- 删除 pairing-code routes、数据库认证 repository 和可见码 UI；
- `extension/src/{background,backgroundOrchestrator,installation,captureTransport,outboxDrain,popup}.ts`、popup HTML、storage 隐私清单及相关测试；
- provenance 域、Bundle/materializer fixture 和 ACK 测试。

**通过门：** 正确 Bearer 能写入一次幂等 Bundle；错误/缺失/旧 Bearer 均
`401`、DB `0/0/0`；普通网页和错误 extension ID 不能完成连接；重装后的
fresh profile 要求一次点击，Vault 切换无需点击；遗留可见配对状态被定向迁移，
队列/证据保留。

### D5（修订 P5）— READY 观察契约与文档对齐

**目标：** 消除当前“fresh profile 但必须预先 paired”的矛盾，让 READY 验证新产品契约。

- READY 必须确认 exact dist/manifest key/extension ID、规范 localhost endpoint、
  活动 disposable Vault、合法安装级 capability、fresh
  `captureConnectionStatus=connected`、`captureRecoveryStatus=ready`、空
  waiting/outbox/quarantine 和数据库 `0/0/0`。
- provenance 前置值改为 `extension_local`；删除 pairing-code 白名单和诊断；
  runner 不创建、读取或复制 raw capability。
- fresh profile 先通过本地测试专用 connection preparation 形成有界 receipt，
  READY 只验证同一 profile/config/Vault 绑定；READY 前不发送 Bundle、不访问
  OJ API、不清队列。
- 更新 `docs/superpowers/specs/v4-d4-acceptance-profiles.json`、observer/diagnostic/validator、候选所有权清单、README、COMPLIANCE、architecture、runbook 和相关计划/交接状态。

**通过门：** observer 纯投影、runner 源码契约、acceptance profile、adapter readiness、隐私审计全部通过；测试只用 fake localhost，不打开真实 OJ。

### D6（继承 P6）— 离线终门与新候选冻结

**目标：** 在隔离 Vault/数据库中完成 RED→GREEN→全量验证并冻结全新产品候选。

顺序：

1. 定向 RED：Origin、Vault、采用迁移、配对面删除、storage cleanup、READY 契约。
2. 定向 GREEN：对应 Vitest、App E2E、extension unit/E2E 和 Route H browser spike。
3. `npm run quality:gate`，全过程使用 OS 临时 Vault/数据库。
4. `npm run extension:check`、`npm run extension:e2e`、隐私审计、readiness/profile validators 和 `git diff --check`。
5. 经独立代码/隐私/计划检查后，只有在用户授权本地提交时创建单一候选 commit。
6. 运行 `node scripts/validate-v4-candidate.mjs --candidate <new-sha>`，冻结 exact dist、receipt、manifest/background/content/popup/bridge 哈希和默认数据库未变证据。

任何产品、manifest、迁移、观察器契约修订都会使 `34916705712cac1ef2e5d8816cd8e40fa4e29ca7` 对本方案失效；其既有证据只保留为旧配对产品的历史记录，不得重新标记。

### D7 — 新候选 READY-only（已授权并完成）

**前置：** 用户必须在候选 SHA、exact dist、receipt 和新工具哈希冻结后，重新明确授权该候选的 LeetCode → NowCoder READY-only。此前对 `3491670` 的授权不可转移。

- 每个平台使用全新 profile、全新 disposable Vault/数据库和唯一 lane identity；
- 不传 `--authorize-action`，不点击、不提交；
- 每条必须是 `OBSERVER_ARMED=1`、`BROWSE_ONLY=1`、`READY=1`、`ACTION_AUTHORIZED=0`、数据库 `0/0/0`；
- LeetCode 首失败立即停止，不准备或运行 NowCoder；成功才进入 NowCoder；
- 两条通过后立即停止并返回用户，D4 仍未因 READY 自动交付。

### D8 — 返回用户决定动作验证

真实平台点击/提交、每平台单动作观察、D4 交付、D5、RC、release、push 和 PR 都需要新的、分别命名范围的授权。本计划不自动进入任何一项。

## 8. 测试矩阵

| 边界 | 必须通过 | 必须失败关闭 |
|---|---|---|
| Chrome 连接 | 固定 ID external message、精确 sender URL、单次 challenge | 错误 ID、过期/重放/竞争、宽松 sender |
| 捕获写入 | 正确 Bearer + 合法 Bundle 一次写入/精确重放 ACK | 错误/缺失/旧 Bearer，DB 零写入 |
| Vault 创建 | 空真实目录，原子 descriptor/config | 非空目录、冲突文件、相对路径、symlink/junction、未知版本 |
| Vault 切换 | 旧服务停止、目标校验、pointer 更新后重启 | 端口占用、运行中热切、无效 DB、路径逃逸 |
| 旧库采用 | copy hash 相等、迁移/完整性通过、源不变 | 同源目标、复制漂移、迁移失败、半成品被采用 |
| 历史数据 | paired/unpaired 原值和行身份保留，新行为 local | 历史批量提升、学习行丢失、外键/索引漂移 |
| 扩展生命周期 | reload/restart 自动连接；重装后一击；Vault 切换沿用 | 复制旧 secret、删除 outbox/confirmed/quarantine、要求输入码 |
| READY | 已准备 fresh profile + active empty Vault +合法 capability | runner 读取/复制 raw capability、Origin-only 降级、非空 DB |

## 9. 明确非目标

- 不让 Chrome 扩展直接持有/写入用户文件夹或 SQLite。
- 不引入 File System Access handle 作为主存储，不引入 `fileSystemProvider`。
- 不引入 Electron、Tauri、Native Messaging 或后台常驻原生 host。
- 不引入账户、云同步、远程 API、第三方分析、外部 LLM 或生产 Sentry 数据。
- 不改变 OJ 捕获语义、平台 promotion 状态、五秒相关窗口或真实动作授权门。
- 不自动移动/删除旧数据库，不实现 down migration，不释放、不推送、不创建 PR。

## 10. 官方能力依据

- Chrome manifest `key` 与稳定扩展 ID：<https://developer.chrome.com/docs/extensions/reference/manifest/key>
- 扩展跨域请求与 host permissions：<https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>
- Chrome extension storage 生命周期：<https://developer.chrome.com/docs/extensions/reference/api/storage>
- File System Access 权限模型（用于说明为何不作为 SQLite 主存储）：<https://developer.chrome.com/docs/capabilities/web-apis/file-system-access>
- Native Messaging（仅为 spike 失败后的待选方案，不在本计划范围）：<https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>

## 11. 授权记录

用户于 2026-08-24 明确批准本计划作为后续唯一执行入口，并授权：

- 按 P0→P6 仅离线实施与验证；
- P1 失败时硬停止并返回，不自动选择 fallback；
- 为 P0–P6 建立必要的本地提交及最终候选提交；
- P7 真实站点 READY-only 必须在新 SHA 冻结后另行授权，当前不包含。

用户于 2026-08-25 进一步批准 Route H-安装级，接受较窄的恶意扩展边界，
授权 D0–D6 离线实施、分阶段验证和必要本地提交，并重申 D1 首失败即停、
D7 另行授权、不创建 worktree、不 push、不创建 PR。

## 12. 执行结果（2026-08-24）

- P0 通过并已在提交 `da3991a` 固定：基线、ADR 0004、0B3 历史标记和授权记录完成，默认数据库未变化。
- P1 冻结了公开 manifest key、期望扩展 ID
  `oldmkbngfokmhlkjmlichccmbebipmei`、独立 ID 推导测试、精确 Origin
  matcher 和纯 localhost Playwright spike。
- 单测 `11/11` 与 TypeScript 检查通过。真实 Chromium 首个 fresh profile
  中 service worker/runtime ID 与冻结 ID 一致；JSON POST 返回 `200`，证明
  精确 Origin 分支可达；同一 worker 的 GET 返回 `403`，而探针只在 Origin
  不精确时返回该状态，因此未满足本计划要求的 GET/POST 双方法稳定 Origin。
- 按第 3.3 节立即停止。未测试 restart/reload/第二 fresh profile，未进入
  P2–P6，未修改生产 manifest，未启动 Next.js，未创建或打开 SQLite，未访问
  OJ。临时 dist/profile 已清理，端口 3000 已释放。
- 详细证据：
  `work/reports/v4-phase-d-local-vault-p1-origin-spike-stop-2026-08-24.md`。
  该决策门随后已由用户选择 Route H-安装级而关闭；后续执行从 Revision 2 D0
  开始，不得接受 missing Origin、宽松 CORS、Origin-only 认证或静默切换到
  Native Messaging。

## 13. Revision 2 D0 执行结果（2026-08-25）

- ADR 0004、传输决策、本计划和 handoff 已对齐为 Route H-安装级；
- Origin 已从身份认证降为纵深防御，Native Messaging 保持未授权；
- 安装级 capability、Vault 外 hash、extension-local 原值、60 秒单次
  challenge、重装一击和 Vault 切换沿用语义已冻结；
- 没有产品运行时、manifest、数据库、扩展 storage 或浏览器变化；
- D1 是下一且唯一可执行阶段，失败即停。

## 14. Revision 2 D1 执行结果（2026-08-25）

- 使用官方 Chrome for Testing `151.0.7922.138`、两个 fresh profile、固定 ID
  目标扩展、独立 key 的攻击者扩展、两个 disposable SQLite 和 Vault 外临时安装
  配置完成 Route H spike；Chromium 138 未作为证据。
- 最终权威运行 `1 passed (12.1s)`：规范 settings sender 与闭合 schema、
  60 秒单次 challenge、过期/重放/并发失败关闭、256-bit capability、页面零
  原值、配置仅 hash、错误/缺失 Bearer 数据库 `0/0/0`、正确 Bundle `4/1/1`
  与幂等重放、restart/reload、Vault 切换、fresh reinstall 一击重连和其他扩展
  直接调用拒绝全部通过。
- 首次运行仅在全部功能断言后的 Windows 临时目录 teardown 返回 `EISDIR`；该次
  不计证据。测试助手改用空目录专用 `rmdirSync` 后，从 fresh profiles 完整重跑
  通过，没有放宽任何 Route H 断言。
- 默认数据库 size/mtime/hash 保持不变；未修改生产 manifest、捕获路径、数据库
  schema 或 extension storage；没有 OJ、真实动作、push 或 PR。
- 证据：
  `work/reports/v4-phase-d-local-vault-route-h-d1-spike-2026-08-25.md`。
- D1 硬停止门已通过；D2 是下一且唯一可执行阶段。

## 15. Revision 2 D2 执行结果（2026-08-25）

- 新增无第三方依赖的 Local Vault 核心、系统选择器和单一 launcher；四个 npm
  入口为 `local`、`vault:create`、`vault:switch`、`vault:adopt`。
- Vault descriptor、活动 pointer 和绝对路径/realpath/file-type/SQLite
  完整性边界已实现；symlink/junction、collision、未知版本、相对路径和被占用的
  localhost:3000 均失败关闭。取消选择零写入，停服后才能切换。
- 旧库采用只复制并迁移目标临时副本，复制前后核对 hash，保留历史表行数，并
  再次证明源 size/mtime/hash 不变；不提供 move、overwrite 或自动删除。
- `/settings` 已成为只读 Local Vault 状态页，不提供运行中切库 API；可见配对码
  组件和对应 UI/E2E 测试已删除。旧认证 API/表仍留到 D4/D3 按阶段移除。
- 验证：聚焦 `17/17`；lint PASS；typecheck PASS；root unit
  `2590/1`；App E2E `24/24`；build `20/20`。默认数据库 size/mtime/hash
  不变，无新增依赖。
- 证据：
  `work/reports/v4-phase-d-local-vault-d2-core-launcher-2026-08-25.md`。
- D3 是下一且唯一可执行阶段；D7 和所有真实 OJ 动作仍未授权。

## 16. Revision 2 D3 执行结果（2026-08-25）

- 新增前向迁移 `0009_local_vault_extension_origin.sql`，历史 0001–0008
  文件未修改；sessions/events 的 provenance 闭合集合新增
  `extension_local` 并逐列复制历史行。
- 两张 Vault 内旧认证元数据表按 pairing codes → installations 顺序删除；历史
  paired/unpaired、IDs、fingerprints、时间、attempt/correction 外键关系不改写，
  索引、quick check 和 foreign-key check 全部恢复。
- 迁移器仅对带固定 marker 的父表重建，在事务外暂时关闭 FK、事务内完成重建和
  全量 `foreign_key_check`，并在 `finally` 恢复原 FK 状态；故障注入证明完整
  回滚。
- fresh、0008 populated、0001–0008 每个历史前缀、重复运行、采用同路径、复制
  hash mismatch 和迁移失败全部覆盖；成功和失败路径均证明源库
  size/mtime/SHA-256 不变。
- 聚焦 `27/27`、lint PASS、typecheck PASS、diff check PASS；默认数据库
  size/mtime/hash 不变。
- D3 是不可发布的过渡提交：旧认证表已删除，遗留 pairing/capture-auth 调用必须
  由紧接的 D4 Route H 实现替换后才能恢复仓库级产品门。
- 证据：
  `work/reports/v4-phase-d-local-vault-d3-migration-adoption-2026-08-25.md`。
- D4 是下一且唯一可执行阶段；D7 和所有真实 OJ 动作仍未授权。

## 17. Revision 2 D4 执行结果（2026-08-25）

- 可见六码配对、旧 pairing API/repository/service、扩展 pairing 模块和配对 UI
  已从可达产品面删除；新的 `/settings` 一键连接只向页面暴露单次 challenge。
- 固定 ID 扩展生成 256-bit capability 并直接完成 challenge；原值只存
  `chrome.storage.local`，Vault 外配置仅存 SHA-256。首次安装/重装需要一次点击，
  restart/reload/Vault 切换沿用，遗留 credential 只删除、不复制。
- status/events/attempts 在解析 capture body 或打开 SQLite 前验证规范 host、固定
  extension Origin 和 Bearer；错误/缺失/旧 capability 均 `401`、DB `0/0/0`，
  正确 Bundle 保持事务写入与幂等 ACK。
- 新 provenance 恒为 `extension_local`；历史 paired/unpaired 行和完成 outbox
  兼容保留。popup 收敛为四态状态与打开设置页，不再处理可见码。
- 验证：root unit `2597/1`、App E2E `24/24`、extension unit `1671/1671`、
  extension E2E `55/1`、lint/typecheck/build PASS、隐私审计 `0 findings`；默认
  数据库 size/mtime/hash 不变，无新增依赖。
- 两条独占 localhost:3000 的冻结 spike 保留为独立证据并从共享 webServer 套件
  排除；exact production Route H、NowCoder full chain 和 D1 upgrade/restart 均在
  共享套件通过。
- 证据：
  `work/reports/v4-phase-d-local-vault-d4-route-h-installation-2026-08-25.md`。
- D5 是下一且唯一可执行阶段；D7、真实 OJ、push、PR、RC 和 release 仍未授权。

## 18. Revision 2 D5 执行结果（2026-08-25）

- READY 工具收敛为显式两步：先以 `--prepare-connection=true` 创建 fresh 固定
  profile，只打开 localhost settings 完成 Route H 一击连接并证明 disposable DB
  `0/0/0`；后续 READY 必须复用同一 profile 和严格收据。
- 收据绑定 candidate、五个 exact-dist 哈希、candidate receipt 哈希、extension ID、
  canonical profile/database/Vault-config identity、installation identity hash 和
  capability version；任一漂移均在 OJ 导航前失败关闭。
- runner/observer 不读取、复制或输出 raw capability。扩展独占其生成和存储；工具
  只验证公开连接状态及 Vault 外配置文件的预期存在性。
- observer 只忽略当前 Route H 公共键；旧 `captureCredential`、
  `captureCredentialVersion`、`pairedAt` 不再豁免，遗留键漂移会失败关闭。
- acceptance profile/validator、候选路径白名单和用户文档均完成对齐。候选验证改为
  检查 `6c0e1d7..candidate` 的完整累计路径，保留分阶段提交下的显式边界。
- 聚焦 `138/138`、lint、typecheck、extension check `1671/1671`、隐私审计
  `0 findings`、acceptance-profile validator 和 adapter-readiness validator
  全部通过；默认数据库 size/mtime/hash 不变。
- 冻结 observation-tool hash：
  `309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35`；
  acceptance-profile hash：
  `D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`。
- 证据：
  `work/reports/v4-phase-d-local-vault-d5-ready-contract-2026-08-25.md`。
- D6 全量离线终门与新候选冻结是下一且唯一授权阶段；D7、OJ 导航、真实动作、
  RC、release、push 和 PR 仍未授权。

## 19. Revision 2 D6 执行结果（2026-08-25）

- Route H 新产品候选冻结为
  `0c23fcacf18d2fe4113d803504e638c1aab887d3`；旧 `3491670` 仅保留为旧配对
  产品历史证据，不能重新标记。
- 候选前 `npm run quality:gate` 与候选绑定验证器内的真实 quality gate 均通过：
  root `2599/1`、App E2E `24/24`、extension `1671/1671`、extension E2E
  `55/1`、build `20/20`、privacy `0 findings`、acceptance profile PASS、
  adapter readiness PASS。
- `node scripts/validate-v4-candidate.mjs --candidate 0c23fcacf18d2fe4113d803504e638c1aab887d3`
  返回 `V4 candidate commit PASS`；HEAD/clean/commit replay、Route H 累计路径
  白名单、secret/generated/raw-transcript 排除和默认数据库不变均通过。
- exact dist：`.tmp/v4-route-h-exact-dist-0c23fca`；strict receipt：
  `.tmp/v4-route-h-candidate-receipt-0c23fca.json`；receipt SHA-256：
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`。
- 五个产物哈希分别为 manifest `DE980FDB...FB76B8F`、background
  `30866672...68452EB`、content `FF562221...6339D8D`、popup
  `2AA3FC47...7AB06E1`、bridge `4D89A80F...CEE3943`；完整值见 D6 报告和
  candidate receipt。
- 默认数据库仍为 `479232` bytes / `2026-07-23T15:56:38.8411343Z` /
  `2485DBEA...54666C3`。没有 OJ、READY lane、真实动作、push 或 PR。
- 证据：
  `work/reports/v4-phase-d-local-vault-d6-candidate-freeze-2026-08-25.md`。
- D0-D6 授权范围已全部完成并停止。D7 必须由用户基于新 SHA、exact dist、
  receipt、tool/profile hashes 另行授权；LeetCode 首失败仍必须阻止 NowCoder。

## 20. Revision 2 D7 执行结果（2026-08-26）

- 用户明确授权 D7；执行严格绑定候选
  `0c23fcacf18d2fe4113d803504e638c1aab887d3`、exact dist、candidate receipt、
  observation-tool hash `309B3772...22C35` 和 acceptance-profile hash
  `D8C348F1...3225`。
- LeetCode 使用 fresh identity `d7-route-h-leetcode-ready-0c23fca`，目标
  `merge-two-sorted-lists`。localhost-only 连接准备通过，随后 READY-only 返回
  `OBSERVER_ARMED=1 / BROWSE_ONLY=1 / READY=1 / ACTION_AUTHORIZED=0`，
  baseline/final DB 均为 `0/0/0`。
- LeetCode 通过后才创建 NowCoder fresh identity
  `d7-route-h-nowcoder-ready-0c23fca`，目标 `acm/contest/18839/1001`；其准备和
  READY-only 返回同样四个标志与 DB `0/0/0`。
- 两份 schema 3 evidence 均为 `ready_only` / `browse_only`，且 DOM、cookie、
  source code、problem statement、response body、headers、query retention 全部
  为 false。没有 submit-control click、submission、capture event、session 或
  attempt。
- LeetCode evidence SHA-256：
  `F1396D21859569EB952F410546D16D4A3D57904431FD84E09D211B1F6C1F0601`；
  NowCoder evidence SHA-256：
  `74A626BB5C7F0E7F04A1D782521E2F8BAFD829583664988A9CB7AE79C764A7C0`。
- 两条 local server 已停止，临时 root DB pointer 已删除，端口 3000 空闲；默认
  数据库 size/mtime/hash 不变。
- 证据：
  `work/reports/v4-phase-d-local-vault-d7-ready-only-2026-08-26.md`。
- D7 完成即停止。READY-only 不证明真实动作因果与 exactly-once delivery，不能
  自动交付 D4；D8、真实点击/提交、D4 交付裁决、RC、release、push 和 PR 均需
  新授权。

## 21. Revision 2 D8-A 执行结果（2026-08-28）

- 用户仅授权候选 `0c23fcacf18d2fe4113d803504e638c1aab887d3` 的 LeetCode
  `merge-two-sorted-lists` 单动作观察，最多允许一次真实提交；无论结果如何立即
  停止，明确禁止运行 NowCoder。
- 执行复用 D7 已准备的固定 profile、disposable database 和 Route H 连接收据，
  并严格绑定 exact dist、candidate receipt、observation-tool hash
  `309B3772...22C35` 与 acceptance-profile hash `D8C348F1...3225`。
- runner 在观察器建立任何阶段前失败关闭：没有返回 `OBSERVER_ARMED=1`、
  `BROWSE_ONLY=1`、`READY=1` 或 `ACTION_AUTHORIZED=1`，没有向用户请求动作，
  没有 submit-control click 或真实提交。
- schema 3 失败证据记录 `outcome=not_delivered`、空 `stageHistory`、
  `finalStage=observer_capture_error`，裁决为
  `ENVIRONMENT_BLOCKED / UNRESOLVED / observer_unexpected_failure`；pre-action 与
  final 的候选、工具、profile、candidate-receipt 和五个 exact-dist 哈希一致，
  `noRawData=true`。
- 执行时本地服务首次 `/api/capture/status` 探测伴随约 24.6 秒冷编译，而 runner
  约 28.6 秒后退出；这只形成“冷启动状态探测延迟可能参与失败”的诊断线索，不能
  替代证据中的 `UNRESOLVED` 根因分类。
- LeetCode disposable database 最终仍为 capture events / training sessions /
  training attempts `0/0/0`。NowCoder lane 未启动；本地服务已停止，root DB
  pointer 已删除，端口 3000 空闲，默认数据库 size/mtime/SHA-256 不变。
- 失败证据：
  `output/playwright/v4-observation/0c23fcacf18d-leetcode-d7-route-h-leetcode-ready-0c23fca-real-observation-failed.json`；
  SHA-256：
  `A57D562042A3F1DFBCCF07F28787AE4BC3E4A3D19FE74B1C9D3FB907914A7F84`。
- 收口报告：
  `work/reports/v4-phase-d-local-vault-d8a-leetcode-pre-action-stop-2026-08-28.md`。
- D8-A 授权已消费并停止，不能重试，不能以本次失败交付 D4。下一步仅可先做
  离线/只读诊断并形成经审查的修订；任何新的真实动作都需要新的明确授权。

## 22. Revision 3 D8-A-R 根因修订与复测授权（2026-08-28）

### 22.1 授权与唯一动作边界

- 用户规定：未来所有真实提交测试只走当前远程调试连接对应的 Chrome `yu`
  profile，不再用工具新建的 fresh Chromium/Chrome profile。
- `yu` 是用户指定的本地浏览器别名；工具只能绑定正式 Google Chrome、当前
  DevTools endpoint 和 profile path 的 SHA-256，不读取、输出或保存 Google /
  LeetCode 昵称、邮箱、账号 ID、cookie、token、localStorage 或其他账号数据。
- 用户授权先完成 D8-A-R 离线修订；全部修订门通过后，授权候选
  `0c23fcacf18d2fe4113d803504e638c1aab887d3` 在 LeetCode
  `merge-two-sorted-lists` 上执行一次单动作观察，最多一次真实提交；无论结果
  如何立即停止。NowCoder 明确禁止运行。
- 任一离线门、Chrome/profile/exact-dist/extension ID、连接收据、零数据库、
  READY 或动作前置条件失败，都消费本次执行机会并在真实动作前停止；不得静默
  回退到 fresh profile 或自动重试。

### 22.2 已确认事实与根因等级

- 首次 D8-A 的 schema 3 evidence 证明：`stageHistory=[]`，最终为
  `observer_capture_error`，没有 `OBSERVER_ARMED`、`READY`、点击或提交；数据库
  `0/0/0`。这是动作前环境失败，不是产品候选失败。
- 当次本地服务第一次 `/api/capture/status` 编译约 24.6 秒，runner 约 28.6 秒
  后退出。现有 runner 只预热 `/`，扩展启动任务却同步探测
  `/api/capture/status`；冷编译超过其 20 秒 worker/READY 窗口是最强现有因果
  解释，但在修订验证前仍标记为 `PROBABLE`，不伪装成已证明根因。
- runner 的顶层 `catch` 把所有动作前异常压成
  `observer_unexpected_failure`，使证据无法区分 app warm-up、CDP、extension、
  connection receipt 和 observer arm 阶段。这是已证明的诊断制度缺口。
- 旧 D5/D7 合同把 READY 绑定到工具创建的 fresh profile；它与用户最新的
  `yu` Chrome 真实动作政策冲突。当前远程调试实例是正式 Google Chrome，
  profile path hash 为
  `C1CF71DEEA82DD059F08A27CEA2190CF26D040108C757527AB55870B46135242`；候选固定
  ID 扩展在检查时尚未安装。该事实要求显式 CDP exact-dist 装载门，不能假定。

### 22.3 最小修订设计

本修订只改观察工具、机器合同、测试和文档；冻结产品候选与 exact dist 不改：

1. 在启动/连接扩展前，以无 capability 的闭合请求预热
   `/api/capture/status`，只接受预期的认证拒绝；它不得打开默认 SQLite 或读取
   raw capability。随后才允许扩展用其私有 capability 做真实健康探测。
2. 从用户明确指定的 `DevToolsActivePort` 读取 localhost WebSocket endpoint，
   拒绝非 loopback、畸形、非浏览器 endpoint；用已安装 Playwright 连接当前
   Chrome，不启动第二个浏览器，不增加依赖。
3. 通过 Chrome DevTools Protocol `Extensions.getExtensions` /
   `Extensions.loadUnpacked` 装载 exact dist，要求固定 extension ID、规范 exact
   dist 路径和启用状态一致；已有同 ID 不同路径时失败关闭，不卸载或覆盖。
4. 通过本轮自建 `chrome://version` 页取得 profile path，仅计算并比对冻结 hash；
   evidence/receipt 不记录原路径或账号字段。只关闭本轮自建的 settings、popup、
   LeetCode 标签页，绝不关闭现有用户标签页、context 或 Chrome。
5. 准备模式在同一 `yu` profile 完成一次 localhost Route H 连接并写新绑定收据；
   动作模式复用该收据。真实动作授权只在 `OBSERVER_ARMED / BROWSE_ONLY /
   READY / ACTION_AUTHORIZED` 全部出现后生效。
6. 用闭合的动作前阶段码区分 `app_route_warmup`、`cdp_connect`、
   `profile_binding`、`extension_binding`、`connection_preflight` 和
   `observer_arm`；不得写异常消息、stack、URL query、账号或原始平台数据。
7. CDP 动作模式以 ACK 或闭合超时结束；不再把“关闭整个浏览器 context”作为
   停止信号。超时只写 bounded failure evidence 并关闭本轮自建页。

Ponytail 裁决：复用现有 runner、observer、Playwright 和 Node 标准库；不新增
browser manager、账号系统、依赖、重试框架或通用 CDP 抽象。

### 22.4 分阶段执行与硬停止门

| 阶段 | 内容 | 必须通过 | 停止条件 |
|---|---|---|---|
| R0 | 冻结本节、首次失败证据、`yu` profile hash 与 Sentry 可用性 | plan authority；默认 DB 不变 | 事实或授权不闭合即停 |
| R1 | RED：机器合同与观察器测试覆盖 CDP-only action、route warm-up、profile/exact extension 绑定、owned-tab closure、闭合阶段码 | 新测试必须先失败 | RED 不落在预期缺口即停 |
| R2 | 最小实现并 GREEN | focused tests、syntax、targeted lint、typecheck、privacy `0 findings` | 任一失败即停，不触网 |
| R3 | 冻结新 tool/profile hashes，Ponytail 复核 | acceptance/readiness validators、diff check、secret/generated scan | 有非必要依赖/抽象或 hash 漂移即停 |
| R4 | 当前 `yu` Chrome localhost-only 准备与 READY 前置 | official Chrome、profile hash、exact extension ID/path、收据、DB `0/0/0`、无 OJ 动作 | 任一不符即消费机会并停 |
| R5 | 新 D8-A：LeetCode 单动作观察 | 最多一次提交；bounded evidence；最终 DB 裁决 | 无论成功失败立即停；不运行 NowCoder |

Sentry 插件仅允许 GET 型只读取证。当前环境没有 `SENTRY_AUTH_TOKEN`、org 或
project，因此 R0 记录为 `SENTRY_UNAVAILABLE_NO_LOCAL_AUTH`，不创建 token、不发送
事件，也不把 Sentry 作为 R1–R5 的伪门。若用户以后在本机设置只读 token，可在
不延迟本修订的前提下补充查询；任何输出仍须去标识化且不得包含 raw stack。

### 22.5 复测后的裁决

- 只有同一候选、同一 exact dist、同一 `yu` profile hash 下，从单一动作得到
  E0 → E1 → E2 → E3/outbox → ACK，且 disposable database 从 `0/0/0` 精确变为
  `4/1/1`，才能记录该 LeetCode lane 为 delivered。
- READY、环境失败、观察器失败、产品失败或 delivered 都在本次 D8-A-R 结束后
  停止；不得运行 NowCoder，不得自动裁定聚合 D4、RC 或 release。
