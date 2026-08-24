# V4 Phase D Local Vault D4 Route H 安装级连接实施报告

日期：2026-08-25
分支：`feature/v1-followup`
范围：仅 D4 离线产品实现与验证；未访问 OJ，未执行真实动作，未 push、未创建 PR。

## 结论

D4 通过。可见六码配对、Vault 内认证表和旧配对 API 已从可达产品面删除；
固定 ID 扩展现在通过本地设置页的一次点击、60 秒单次 challenge 和 256-bit
安装级 capability 连接本地服务。扩展只在 `chrome.storage.local` 保存 capability
原值，Vault 外配置只保存 SHA-256，页面、SQLite 和观察证据均不接触原值。

## 产品行为

- 首次安装或重装后，用户在 `/settings` 点击“连接扩展”；页面只持有 challenge，
  扩展直接向 completion endpoint 提交 capability。
- 浏览器重启、扩展重载和 Vault 切换沿用同一扩展安装 capability；fresh profile
  不复制旧 `captureCredential`，必须重新点击。
- capture status/events/attempts 同时要求规范 `http://localhost:3000` host、固定
  extension Origin 和精确 Bearer；认证发生在解析 capture body 或打开 SQLite 前。
- 缺失、错误或旧 capability 返回 `401` 且数据库保持 `0/0/0`；正确 Bundle
  仍按原事务和幂等 ACK 语义写入。
- 新事件 provenance 恒为 `extension_local`；历史 `extension_paired` /
  `extension_unpaired` 行和已完成 outbox bundle 保持兼容，不批量改写。
- popup 只显示 `connected`、`connection_required`、`service_unreachable`、
  `capability_rejected` 四态并打开设置页，不再显示或接收配对码。

## 删除与迁移

- 删除 `/api/capture/pairing-codes`、`/api/capture/pair`、安装撤销 API、旧认证
  repository/service、扩展 pairing 模块和可见配对 UI。
- V4 初始化定向删除 `captureCredential`、`captureCredentialVersion`、`pairedAt`，
  但绝不把旧值复制为 `captureCapability`。
- 删除训练页上依赖旧 status 响应形状的客户端面板；保留真正的 attempt 状态面板。
  这同时消除了固定健康响应上线后访问不存在 `recentEvents[0]` 的客户端崩溃。

## 失败关闭与边界证据

- 固定 manifest key、固定 extension ID 和最窄 `externally_connectable.matches`；
  不声明其他 extension ID，不增加 `<all_urls>`、`tabs`、`activeTab` 或 allFrames。
- external message 要求精确 settings sender 与四字段闭合 schema；challenge 过期、
  重放、nonce 错误和竞争 completion 全部拒绝。
- completion 只接受固定 extension Origin；普通网页不能直接完成连接。已接受的较窄
  恶意扩展边界不被夸大为对同一页面注入攻击的保证。
- 隐私审计发现 `0 findings`；没有新增第三方依赖或外部服务。

## 验证证据

- Route H Chrome 151 D1 spike：`1 passed (12.1s)`（已冻结于 D1 报告）。
- exact production Route H E2E：`1 passed`，覆盖一键连接、页面零 capability、
  storage 遗留键清除、reload 和数据库 `0/0/0`。
- root unit：`2597 passed / 1 skipped`。
- App E2E：`24/24`。
- extension check：`53` files，`1671/1671`，dist parity PASS。
- extension E2E：`55 passed / 1 skipped`，含 Route H、NowCoder full chain、D1
  restart/upgrade 和 production dist；两条必须独占 3000 端口的冻结 spike 从共享
  webServer 套件排除，源码与既有独立证据保留。
- lint、typecheck、production build 均 PASS；build 输出 20 个静态/动态入口。
- `node scripts/audit-v4-extension-privacy.mjs`：`0 findings`。
- 默认数据库：479232 bytes，mtime
  `2026-07-23T15:56:38.8411343Z`，SHA-256
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`，不变。

## 阶段边界

D4 仅恢复并验证 Route H 产品写入链，不代表 READY、D4 平台验收、RC 或发布。
下一且唯一可执行阶段是 D5：对齐 READY observer/runner/profile 与用户文档，且
runner 不得读取或复制 raw capability。D7 真实站点 READY-only 仍需另行授权。
