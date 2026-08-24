# V4 Phase D Local Vault 传输方案研究报告（2026-08-24）

## 结论

隐藏的一键 localhost 握手**不是唯一方案，也不是无条件最佳方案**。它是在“继续保留 Next.js + localhost HTTP，并接受一次可见授权点击”的约束下，改动最小、最能复用现有代码的方案；如果必须抵御一个拥有 localhost host permission、会主动伪造请求甚至注入本地页面的恶意扩展，则应改用 Native Messaging。

原计划的 exact-Origin HTTP 路线不能仅把 GET 改成 POST 后继续。P1 的 Chromium 138 确实证明自然 JSON POST 会携带正确 Origin，但当前 Chrome 151 已允许有目标 host access 的扩展主动覆盖 `Origin`，而 Chromium 的官方测试明确覆盖了 POST 被覆盖的情形。因此 exact Origin 仍可阻止普通网页，却不能再证明“请求来自这个扩展”。

## 为什么 P1 会失败，以及为什么 POST-only 仍不能直接采用

WHATWG Fetch 规范规定，非 GET/HEAD 请求通常会附加 Origin，同时明确说明兼容性原因导致 Origin 并非出现在所有 fetch 中。这与本地实测完全吻合：GET 缺失，POST 正确。

如果威胁模型只包含普通网页，POST-only 会是最小方案。但本项目还要求拒绝其他扩展。Chromium 在 2026 年启用了“有目标 host access 的扩展可设置 Origin”能力，并在浏览器测试中验证显式值会覆盖 POST 原本由浏览器计算的 extension Origin。于是另一个扩展只要申请 localhost 权限，就可以发送与本扩展相同的公开 Origin。

因此以下三个看似简单的修补都被淘汰：

- POST-only + exact Origin：挡网页，挡不住能覆盖 Origin 的扩展。
- 固定自定义 Header：公开常量，其他扩展可直接复制。
- Chrome 150+ 显式给 GET 设置 Origin：恢复了 GET，但恰恰把 Origin 变成调用者可控字段。

## GitHub 可复用调查

没有找到能直接放入本项目的“Next.js + Chrome MV3 + localhost HTTP + 精确扩展身份 + 完全无配对”成熟组件。

| 项目 | 已验证模式 | 对本项目的价值 | 不能直接复用的原因 |
|---|---|---|---|
| Zotero Connector | localhost HTTP、POST ping、Host/DNS rebinding 校验 | 证明 POST 健康探测和 loopback Host 校验是成熟做法 | AGPL；服务端并不提供严格扩展身份 |
| Joplin Web Clipper | localhost API + 用户批准后 token | 可借鉴一次性授权状态机 | AGPL；本质仍是 token 配对 |
| KeePassXC-Browser | Native Messaging + 加密关联 | 强身份和恢复协议参考 | GPL；密码库协议与交互远重于本项目 |
| Browserpass | 扩展 + 独立 Native Host、精确 allowed_origins | 证明“安装一次、运行时不配对”的 Native 模式可行 | Host 强绑定 password-store，不能接入 Next.js 即用 |
| Chrome 官方 Native Messaging sample | MV3、host manifest、stdio framing、Windows 注册脚本 | 若选 Native Messaging，这是最干净的 Apache-2.0 起点 | 仅 echo 示例，没有业务、重试、升级、Vault 集成 |
| webExtNativeMsg | Node/TS Native Host framing 与多平台注册 | Native 路线可评估的小型 MIT 辅助库 | 规模小，仍需锁版本、审计并自行实现业务协议 |

许可证结论：Zotero/Joplin/KeePassXC 的代码不应复制进当前仓库；只能借鉴架构模式。隐藏握手应优先复用本仓库已有 credential hash、installation、rotation/revoke、storage cleanup 与 outbox 代码。Native Messaging 若被选择，优先从 Chrome 官方 Apache-2.0 示例开始，而不是搬运密码管理器协议。

## 方案比较

| 方案 | 普通网页 | 直接调用的其他扩展 | 能注入 localhost 页的恶意扩展 | 用户体验 | 工程成本 | 判定 |
|---|---:|---:|---:|---|---:|---|
| POST-only exact Origin | 阻止 | Chrome 151 可伪造 | 不阻止 | 无操作 | 最低 | 淘汰为身份门 |
| 固定自定义 Header | 阻止 | 可复制 | 不阻止 | 无操作 | 最低 | 淘汰 |
| WebSocket exact Origin | 大体可阻止 | 需额外证明 | 需额外证明 | 无操作 | 高 | 无明显收益，淘汰 |
| 隐藏一键 capability 握手 | 阻止 | 无 capability 时阻止 | 取决于授权仪式与边界 | 首次/重装后一击 | 中 | 纯 HTTP 约束下推荐 |
| Native Messaging | 阻止 | 浏览器按 allowed_origins 阻止 | 不依赖 localhost 页面 | 安装 Host 后自动 | 最高 | 强身份边界推荐 |

## Ponytail 结论

如果接受“恶意本机进程可信，恶意扩展不得直接调用，但不把已获 localhost 页面注入权限的扩展当作同级攻击者”，最懒且正确的方案是隐藏的一键 capability 握手：

1. 保留现有 HTTP capture API、bearer 验证、installation 与恢复链。
2. 删除复制/粘贴配对码，改成设置页一个“连接扩展”按钮。
3. 用固定扩展 ID 和 `externally_connectable.matches` 让 localhost 页面向该扩展发起一次消息；`ids` 留空，禁止其他扩展直接 messaging。
4. 使用单次 challenge、短 TTL、原子消费与随机 capability 完成授权；失败不建立 credential。
5. 后续 attempts/events 继续走现有 POST + bearer；Origin、Host、CORS 仅作纵深防御，不再宣称是身份认证。

这条路线不需要新 npm 依赖，能保留绝大多数已验证代码，也不会因为 GET Origin 或 Chrome 151 Header 行为再次改协议。

若“拥有 localhost host permission 并主动攻击”的其他扩展也必须被严格阻止，则不能把 hidden handshake 宣称为充分方案。此时应采用 Native Messaging：host manifest 的 `allowed_origins` 由 Chrome 执行，扩展通过 framed stdio 把 Bundle 交给一个本机 Host，再由 Host 调用现有应用服务或直接进入共享本地 ingest 层。

## 仍需用户决定的产品边界

1. 是否把“已获 localhost host/scripting permission、会主动攻击本地应用页面的扩展”纳入必须阻止的对手？
2. 若选隐藏握手，扩展卸载重装后需要再次点一次“连接扩展”是否可接受？
3. capability 应跟随 Vault（切 Vault 后重新连接）还是跟随本机应用安装（切 Vault 自动沿用）？后者需要把认证元数据放在 Vault 外的应用配置区。

在这三个答案确定前，条件式实施授权不应自动生效。

## 主要来源

- [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/)
- [Chrome Manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)
- [Chrome cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chromium：允许扩展设置 Origin 的实现提交](https://chromium.googlesource.com/chromium/src/+/0970f344c25faf5bb5bd0ba1bf6458a5d5c66f3e)
- [Chromium：默认启用该能力](https://chromium.googlesource.com/chromium/src/+/ed7bebf1ba4b290d758045529db1814b6b0941a5)
- [Chromium fetch browser tests](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/extensions/fetch_apitest.cc)
- [Chrome externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access)
- [Zotero Connector client](https://github.com/zotero/zotero-connectors/blob/e1a16c8ad2e17c6893554c3f376384e18182202d/src/common/connector.js) / [Zotero local server](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/server/server.js)
- [Joplin REST API](https://github.com/laurent22/joplin/blob/dev/readme/api/references/rest_api.md)
- [KeePassXC-Browser protocol](https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md)
- [Browserpass extension](https://github.com/browserpass/browserpass-extension)
- [Chrome official Native Messaging sample](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/nativeMessaging)
