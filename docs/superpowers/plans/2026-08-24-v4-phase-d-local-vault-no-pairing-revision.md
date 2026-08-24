# V4 Phase D Local Vault 与无配对码捕获边界修订计划

**状态：用户已于 2026-08-24 最终批准；授权 P0–P6 仅离线实施、验证及必要本地提交。P1 失败即硬停止；P7、真实 OJ 浏览、点击、提交、推送、PR、发布均未授权。**

**替代范围：** 本计划一旦获批并实施，将成为 V4 Phase D 后续产品修订、候选冻结和新候选 READY-only 的唯一执行入口。它取代“为新 profile 增加两阶段配对准备”的建议，并在本地 V0/V1 范围内取代 Phase 0B3 的可见配对码/长期 bearer 方案；Phase 7 云端账户、远程同步和服务端认证不受影响。

## 1. 结果目标

把用户心智从“扩展要先和数据库配对”改为“本地应用打开一个 Vault，扩展自动连接当前 Vault”：

```text
Chrome 扩展（固定 ID）
        │ 精确 chrome-extension://<id> Origin
        ▼
http://localhost:3000（唯一写入者和事务所有者）
        │ 进程启动时绑定
        ▼
用户选择的 Local Vault 文件夹 / training-platform.sqlite
```

最终产品行为必须满足：

- 用户不再创建、复制、粘贴、轮换或撤销配对码/捕获凭证。
- 用户通过本地 launcher 选择一个文件夹作为 Vault；无图形选择器时可传绝对路径。
- 扩展重载、浏览器重启、扩展卸载后重装，均自动连接当前运行中的本地应用和活动 Vault。
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

- 任意普通网页从自己的 `https://...` / `http://...` Origin 调用捕获写接口；
- ID 不同的其他 Chrome 扩展调用捕获写接口；
- 缺失、畸形、`null`、任意 `chrome-extension://...` 或 localhost 网页 Origin 被宽松接受；
- 浏览器页面通过 CORS 通配、缺少 Origin 降级或遗留 bearer 分支绕过精确扩展身份门。

本轮明确不阻止：

- 能直接构造 HTTP 请求并伪造 Header 的本机进程；
- 能读写 SQLite、Vault 配置、Chrome profile、扩展源码或应用进程的主机控制者；
- 恶意操作系统、浏览器二进制或被篡改的本地构建。

因此精确扩展 Origin 是本地浏览器边界，不宣称是主机级密码学身份。`installationId` 继续用于关联、重放和幂等诊断，不再参与授权。

## 3. 不可先验假定的可行性门

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

### 5.1 精确 Origin 门

- 在共享配置中冻结唯一扩展 ID / Origin，并用测试证明其与 manifest `key` 一致。
- `POST /api/capture/attempts` 与兼容 `POST /api/capture/events` 在读取 body、打开数据库之前要求精确 Origin。
- 新增只读 `GET /api/capture/status`，同样要求精确 Origin，仅返回固定协议信息：服务 ready、`captureApiVersion`、`storage: local_vault`、Vault schema version；不返回路径、vaultId、行数或学习数据。
- 缺失或错误 Origin 统一 `403` 且零数据库写入。生产代码不再接受 missing Origin；Node/Playwright 测试必须显式传精确 Origin。
- 如 spike 证明需要 CORS 预检，只实现精确 Origin、精确 method/header 的最小响应；永不使用 `*` 或回显任意 Origin。

### 5.2 删除配对产品面

实施后删除：

- `/api/capture/pairing-codes`、`/api/capture/pair`、`/api/capture/installations/:id/revoke`；
- pairing code、credential hash、rotation/revocation 服务与 repository；
- 设置页安装列表与创建/轮换/撤销 UI；
- 扩展 popup 配对表单、`PAIR_CAPTURE_INSTALLATION` 消息、bearer header 和配对状态文案；
- `captureCredential`、`captureCredentialVersion`、`pairedAt` 的生产读写和观察器白名单。

升级初始化通过既有版本化 storage 迁移幂等删除这三个遗留键；不删除 `installationId`、confirmed、outbox、quarantine、capture error、endpoint 或恢复证据。`RESET_CAPTURE_ENDPOINT` 只恢复规范 localhost 端点，不再清凭证，也不再要求重新配对。

### 5.3 新连接状态与失败行为

- 当前捕获 provenance 恒为 `extension_local`；`installationId` 继续随扩展安装生成，并进入事件/Bundle 身份。
- 扩展启动、重载、重新启用和手动恢复时调用 status endpoint，形成闭合状态 `ready | service_unreachable | extension_identity_rejected` 与有界时间戳。
- 服务未运行/网络失败时保留 FIFO outbox，沿用有界网络重试并提示“启动本地应用”；不得提示配对。
- `403` 表示构建身份不匹配：保留队首、不消费普通网络重试预算、显示固定 `extension_identity_rejected`，禁止自动改 Origin 或退回无认证。
- App 只展示当前活动 Vault 的规范路径、健康状态和切换说明；切换动作回到 launcher，不增加浏览器端任意文件系统能力。

## 6. 数据库与历史兼容

新增前向迁移 `0009_local_vault_extension_origin.sql`，不得修改历史 `0004_capture_credentials.sql`：

- 重建 provenance 有 CHECK 约束的 `training_sessions` / `capture_events`，允许 `extension_unpaired | extension_paired | extension_local`；
- 保留全部历史行的原 provenance、ID、指纹、时间和外键关系；不得把历史 paired/unpaired 改成 local；
- 先删除 `capture_pairing_codes`，再删除 `capture_installations`；两表只含失效认证元数据，不含学习记录；
- 恢复既有索引，并对每个历史迁移前缀、真实形状 fixture、空库和重复迁移运行行数、身份、`quick_check`、`foreign_key_check` 证明；
- 新 App/扩展代码不得查询已删除的两表。

回滚语义不是“把迁移后的 Vault 降级”。安全回退是切换到另一份未修改 Vault，或使用显式采用前仍保留的源数据库与旧版本应用；计划不实现 schema down migration。

## 7. 分阶段实施计划与停止门

### P0 — 冻结基线与 ADR 0004

**目标：** 把本次已确认决策变成可审计契约，不触碰运行时代码。

- 记录当前 branch/HEAD、dirty paths、默认数据库 size/mtime/hash和候选资产哈希，保护用户自有 Sentry 修改。
- 新增 `docs/decisions/0004-local-vault-extension-origin-trust.md`，明确本地信任边界、稳定 Origin 的适用范围、Vault 所有权和 Phase 7 非适用范围。
- 在 Phase 0B3 spec 顶部追加“本地 V0/V1 方案被 ADR 0004 前向取代”的历史标记，保留原正文作为已实施历史。
- 在本计划获得最终批准前，P0 也不得开始。

**通过门：** 文档一致性检查通过；没有产品代码、数据库、扩展 storage 或浏览器变化。

### P1 — 纯 localhost 稳定 ID / Origin spike

**目标：** 用真实 Chrome 证明第 3 节必要条件。

主要资产：`extension/identity.json`（公开 key 与预期 ID）、临时 dist 注入器、`tests/extension-e2e/capture-local-origin-spike.spec.ts`、对应纯函数单测和证据报告。

**通过门：** 两个全新 profile + restart/reload 全部精确 Origin 断言通过；零 OJ、零 SQLite、零配对。失败即结束本计划执行并返回用户。

### P2 — Vault 核心与 launcher

**目标：** 先建立可测试的目录、配置、选择、采用和启动边界，再接 UI。

主要范围：

- 新增 `lib/vault/**` 纯路径/schema/配置/采用服务和 `scripts/local-vault.ts`；
- 新增 `local`、`vault:create`、`vault:switch`、`vault:adopt` 脚本入口；
- Windows 使用无额外依赖的系统文件夹选择器；macOS/Linux 有可用系统选择器时启用，否则明确降级到绝对路径参数，禁止静默选择 cwd；
- launcher 以非 shell 子进程启动 Next.js，设置活动 Vault 环境，监听退出并给出固定错误；
- `/settings` 改为 Local Vault 状态页，不提供运行中切换 API。

**通过门：** 临时目录单测覆盖创建、取消、绝对路径、配置原子性、collision、symlink/junction、未知版本、端口占用和停止后切换；默认仓库数据库完全不变。

### P3 — 前向数据库迁移与旧库采用

**目标：** 新增 `extension_local` 并证明复制采用绝不伤害源库。

主要范围：`lib/db/migrations/0009_local_vault_extension_origin.sql`、迁移/采用测试、E2E 数据库 fixture 和设置页历史标签。

**通过门：** fresh apply、0008→0009、每个历史前缀、重复运行、故障注入、源/目标同路径、复制后 hash mismatch、迁移失败均通过；成功和失败路径都证明源 size/mtime/hash 不变。

### P4 — 精确 Origin 写入与移除配对面

**目标：** 在 P1 已证实的边界上替换 bearer，不保留双认证长期分支。

主要范围：

- `extension/manifest.json`、`extension/build.mjs` 和身份一致性检查；
- `lib/http/captureRequest.ts`、capture attempts/events/status routes；
- 删除 pairing/credential routes、services、repositories、domain types 和 UI；
- `extension/src/{background,backgroundOrchestrator,installation,captureTransport,outboxDrain,popup}.ts`、popup HTML、storage 隐私清单及相关测试；
- provenance 域、Bundle/materializer fixture 和 ACK 测试。

**通过门：** 精确扩展 Origin 能写入一次幂等 Bundle；错误/缺失 Origin 与其他扩展均 `403`、DB `0/0/0`；请求不含 Authorization；重装后的 fresh profile 无人工步骤即可 status ready；遗留 credential keys 被定向删除而队列/证据保留。

### P5 — READY 观察契约与文档对齐

**目标：** 消除当前“fresh profile 但必须预先 paired”的矛盾，让 READY 验证新产品契约。

- READY 必须确认 exact dist/manifest key/extension ID/Origin、规范 localhost endpoint、活动 disposable Vault、fresh `captureConnectionStatus=ready`、`captureRecoveryStatus=ready`、空 waiting/outbox/quarantine 和数据库 `0/0/0`。
- provenance 前置值改为 `extension_local`；删除 credential/pairing storage key 白名单和 pairing 诊断，不允许 runner 创建或复制认证状态。
- fresh profile 由 runner 单次创建并直接完成 status handshake；READY 前不发送 Bundle、不访问 OJ API、不清队列。
- 更新 `docs/superpowers/specs/v4-d4-acceptance-profiles.json`、observer/diagnostic/validator、候选所有权清单、README、COMPLIANCE、architecture、runbook 和相关计划/交接状态。

**通过门：** observer 纯投影、runner 源码契约、acceptance profile、adapter readiness、隐私审计全部通过；测试只用 fake localhost，不打开真实 OJ。

### P6 — 离线终门与新候选冻结

**目标：** 在隔离 Vault/数据库中完成 RED→GREEN→全量验证并冻结全新产品候选。

顺序：

1. 定向 RED：Origin、Vault、采用迁移、配对面删除、storage cleanup、READY 契约。
2. 定向 GREEN：对应 Vitest、App E2E、extension unit/E2E 和浏览器 origin spike。
3. `npm run quality:gate`，全过程使用 OS 临时 Vault/数据库。
4. `npm run extension:check`、`npm run extension:e2e`、隐私审计、readiness/profile validators 和 `git diff --check`。
5. 经独立代码/隐私/计划检查后，只有在用户授权本地提交时创建单一候选 commit。
6. 运行 `node scripts/validate-v4-candidate.mjs --candidate <new-sha>`，冻结 exact dist、receipt、manifest/background/content/popup/bridge 哈希和默认数据库未变证据。

任何产品、manifest、迁移、观察器契约修订都会使 `34916705712cac1ef2e5d8816cd8e40fa4e29ca7` 对本方案失效；其既有证据只保留为旧配对产品的历史记录，不得重新标记。

### P7 — 新候选 READY-only（另行授权）

**前置：** 用户必须在候选 SHA、exact dist、receipt 和新工具哈希冻结后，重新明确授权该候选的 LeetCode → NowCoder READY-only。此前对 `3491670` 的授权不可转移。

- 每个平台使用全新 profile、全新 disposable Vault/数据库和唯一 lane identity；
- 不传 `--authorize-action`，不点击、不提交；
- 每条必须是 `OBSERVER_ARMED=1`、`BROWSE_ONLY=1`、`READY=1`、`ACTION_AUTHORIZED=0`、数据库 `0/0/0`；
- LeetCode 首失败立即停止，不准备或运行 NowCoder；成功才进入 NowCoder；
- 两条通过后立即停止并返回用户，D4 仍未因 READY 自动交付。

### P8 — 返回用户决定动作验证

真实平台点击/提交、每平台单动作观察、D4 交付、D5、RC、release、push 和 PR 都需要新的、分别命名范围的授权。本计划不自动进入任何一项。

## 8. 测试矩阵

| 边界 | 必须通过 | 必须失败关闭 |
|---|---|---|
| Chrome 身份 | 固定 key 在 fresh/reload/restart 得到同一 ID/Origin | ID 漂移、Origin 缺失、通配 CORS |
| 捕获写入 | 精确 Origin + 合法 Bundle 一次写入/精确重放 ACK | 网页、其他扩展、missing/null/malformed Origin，DB 零写入 |
| Vault 创建 | 空真实目录，原子 descriptor/config | 非空目录、冲突文件、相对路径、symlink/junction、未知版本 |
| Vault 切换 | 旧服务停止、目标校验、pointer 更新后重启 | 端口占用、运行中热切、无效 DB、路径逃逸 |
| 旧库采用 | copy hash 相等、迁移/完整性通过、源不变 | 同源目标、复制漂移、迁移失败、半成品被采用 |
| 历史数据 | paired/unpaired 原值和行身份保留，新行为 local | 历史批量提升、学习行丢失、外键/索引漂移 |
| 扩展升级 | 只删 3 个 credential key，自动 status ready | 删除 outbox/confirmed/quarantine、要求用户输入码 |
| READY | fresh profile + active empty Vault + exact Origin | 自动配对、复制旧 profile、缺失 Origin 降级、非空 DB |

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
