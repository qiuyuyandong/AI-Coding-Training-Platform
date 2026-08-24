# V4 Phase D Local Vault 传输决策修订计划

**状态：APPROVED。用户已选择 Route H-安装级，接受较窄的恶意扩展边界，并授权 D0–D6 离线实施、验证和必要本地提交；D1 失败即停。真实 OJ、动作验证、推送、PR 和发布仍未授权。**

**前置状态：** 原 Local Vault 计划 P0 已提交于 `da3991a`；P1 失败证据已提交于 `c7f638e`。原 exact-Origin-only P2–P6 永久停止；后续只能按本计划的 Route H D0–D6 执行。

## 1. 修订原因

P1 已证明 bundled Chromium 138 的 JSON POST 自然携带固定扩展 Origin，而 GET 不携带。后续研究又确认，当前 Chrome 151 所属的新 Chromium 行为允许有目标 host access 的扩展显式设置并覆盖 `Origin`，包括 POST。

因此：

- exact Origin 可作为普通网页 CSRF 防护；
- exact Origin 不再能作为“其他扩展不可伪造”的身份认证；
- POST-only、自定义公开 Header、显式 GET Origin 均不能完整满足原计划第 2.3 节；
- 原计划 P2–P6 不得在未修订身份边界的情况下恢复。

研究依据见 `work/reports/v4-phase-d-local-vault-transport-research-2026-08-24.md`。

## 2. 必须由用户选择的威胁边界

### Route H — 保留纯 localhost HTTP，隐藏一键 capability 握手

适用前提：

- 必须阻止普通网页和没有 capability 的其他扩展直接写入；
- 本机进程仍在信任边界内；
- 不把“已获 localhost host/scripting permission 且主动注入本地应用页面”的恶意扩展宣称为完全可阻止；
- 接受首次安装或扩展重装后的一次可见“连接扩展”点击，不复制/粘贴代码。

实现原则：

1. 保留现有 HTTP attempts/events、credential hash、installation、rotation/revoke、outbox/retry 与隐私边界。
2. 删除数字配对码 UI，新增设置页单按钮授权；按钮创建单次 challenge，TTL 最长 60 秒，只能原子消费一次。
3. manifest 增加 `externally_connectable.matches`，只允许 loopback 应用页面；`ids` 留空，禁止其他扩展直接连接。
4. 扩展只接受闭合消息 schema，核对 `sender.url`、challenge、过期和重放；生成 256-bit capability，完成后继续用 bearer POST。
5. Origin、Host、Content-Type、CORS、无重定向仍做纵深防御，但文档不得把 Origin 叫做认证。
6. 优先复用现有仓库代码，不新增运行时依赖；Joplin/Zotero 只借鉴状态机和 Host 校验，不复制 AGPL 代码。

用户已选择 **安装级 capability**：

- capability 与本机应用安装绑定，认证元数据保存在 Vault 外的操作系统用户配置目录；
- Vault 切换自动沿用，无需重新连接；
- 扩展卸载重装后 capability 丢失，用户在本地设置页重新点击一次“连接扩展”；
- capability 不写入 Vault、SQLite、日志、证据或仓库。

### Route N — Native Messaging 强扩展身份

适用前提：

- 必须阻止拥有 localhost host permission、会主动伪造 HTTP Origin/Header 的其他扩展；
- 接受安装并注册一个 Native Messaging Host；
- 接受 Windows 注册表、macOS/Linux host manifest、升级/卸载与浏览器差异测试成本。

实现原则：

1. manifest 增加 `nativeMessaging`，Host manifest 的 `allowed_origins` 只列固定扩展 ID，禁止 wildcard。
2. 使用 Chrome 官方 Apache-2.0 sample 作为 framing/注册骨架；不复制 KeePassXC/Joplin/Zotero 的 GPL/AGPL 业务代码。
3. Native Host 只负责闭合 JSON framing、来源/版本检查和转交本地 ingest；不读取 OJ 页面、cookie、token、代码或原始题面。
4. 优先抽取现有 capture ingest 服务供 Next route 与 Native Host 共用，避免 Host 重写事务、幂等和 projection。
5. Vault 仍由 launcher/应用进程独占选择与迁移；Host 不持有任意路径能力。
6. 只有经过依赖、安装、权限和卸载审计后，才可考虑小型 MIT helper；默认先用官方示例和 Node 标准能力。

## 3. 被明确淘汰的路线

- POST-only exact Origin：当前 Chrome 允许其他扩展覆盖 Origin。
- 固定自定义 Header：公开且可复制。
- Chrome 150+ 显式 GET Origin：解决 GET 语义，却主动放弃 Origin 的不可伪造性。
- WebSocket：新增 server transport、连接恢复与 LNA 回归面，且没有形成比 Route H/N 更清晰的安全收益。
- 直接复用 Zotero/Joplin/KeePassXC 代码：许可证、业务模型和威胁边界均不匹配。

## 4. 获批后的共同执行顺序

### D0 — 决策 ADR 修订

- 修订 ADR 0004 与原计划，把 Origin 从“身份门”降为 CSRF/纵深防御。
- 精确记录 Route H 或 Route N 的对手模型、用户动作、重装和 Vault 切换行为。
- 通过门：文档一致性检查；无运行时变化。

### D1 — 新路线最小真实 Chrome 151 spike，失败即停

Route H 必须证明：

- 设置页到固定扩展的 external messaging 可达；其他扩展 ID 直接 messaging 被拒绝；
- challenge 单次、过期、重放、并发竞争全部失败关闭；
- 成功后 bearer POST 幂等落入 disposable DB，错误/缺失 capability 为 DB `0/0/0`；
- fresh profile、restart、reload、uninstall/reinstall 按批准的 UX 契约执行。

Route N 必须证明：

- 当前 Chrome 151 只允许固定 ID 调用注册 Host；错误扩展 ID 被 Chrome 拒绝；
- Windows 当前用户级注册、framing、进程退出、worker restart 与卸载清理闭合；
- 一条 sanitized fake Bundle 进入 disposable ingest，错误 framing 和 oversized message 失败关闭。

真实 Stable 无法通过命令行侧载的场景，必须使用用户已安装的 unpacked/测试扩展或 Chrome for Testing；不得拿 Chromium 138 代替 Chrome 151 背书。

### D2–D6 — 继承原计划 P2–P6

- Vault 核心、launcher、数据库采用/迁移、设置页、READY 契约、隐私审计和候选冻结继续沿用原计划。
- 捕获身份与 storage 清理按被批准路线替换，不允许同时长期保留 H/N 双栈。
- D1 失败立即停止，不进入 D2；不得静默回到 missing Origin、公开 Header 或可见配对码。

## 5. 授权与停止门

- 已批准：Route H-安装级；D0–D6 离线实施、验证与必要本地提交。
- D1 是首失败即停的真实 Chrome 151、零 OJ、disposable SQLite 门；失败不得进入 D2。
- 未批准：Route N、真实 OJ、动作授权、V4 acceptance D4 交付及其后 D5、
  RC、发布、push 与 PR。
- 不得把 exact Origin、自定义公开 Header 或缺失 Origin 重新提升为身份认证。

## 6. D0 执行结果（2026-08-25）

- ADR 0004 已修订为 Route H 安装级 capability 决策，保留历史 P1 失败事实；
- 原 Local Vault 计划已增加 Revision 2 规范优先级、D0–D8 映射和 D1 硬停止门；
- capability 的 Vault 外 hash、extension-local 原值、重装一击、Vault 切换沿用、
  challenge 和 Bearer 语义已冻结；
- 本阶段没有运行时、manifest、SQLite、extension storage 或浏览器变化；
- 下一阶段只能是 D1；D1 失败不得进入 D2。
