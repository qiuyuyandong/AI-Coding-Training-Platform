# V4 Phase D P7F6 新候选 READY-only 预执行阻断报告

## 结论

状态：`BLOCKED_BEFORE_LIVE_LANE`。

用户已授权候选 `34916705712cac1ef2e5d8816cd8e40fa4e29ca7` 的新候选
READY-only，范围为 LeetCode `merge-two-sorted-lists` → NowCoder
`acm/contest/18839/1001`，首失败即停，且不提供 `--authorize-action`。
预执行审计发现当前 runner 无法让一个合规全新 profile 同时满足“不可复用”
与“导航前必须已配对”两个条件。为避免烧掉首条 lane 身份并制造已知必败的
非证据运行，本轮没有启动服务器、浏览器或平台导航。

## 冻结资产复核

- candidate 类型：`commit`。
- candidate：`34916705712cac1ef2e5d8816cd8e40fa4e29ca7`。
- exact dist：`.tmp/p7f6-exact-dist-3491670`。
- candidate receipt：`.tmp/p7f6-candidate-receipt-3491670.json`。
- receipt SHA-256：`986EC5E4456BA60AC9918CB105691F2A8D70BC76FCB02375D09F75EF9630E1EE`。
- 观察工具相对提交 `9cf79268840870398165974376a322095bcea602` 的受控文件差异：空。
- 观察工具组合 SHA-256：`EB564C529595F5F168FE1300EBCA431340135F48C21AA132829A863C0F44DF19`。
- acceptance profile SHA-256：`D35892A2FADDB8B8F4313684E96C261F6C256A3E9FEE79D34C5DB531678D6069`。

五项 dist 实际哈希与 receipt 完全一致：

```text
manifest.json          45F7CF9C66A77B10FE49252FEC7D3F941D535B9E36F85F6BDC16117591D605CC
background.js          41347B02C232D6648FCFF67862DECFE8E0BE2C6971AA89FAA008266B2CAD6064
content.js             7BD8D4414261338940FA8D9A71EDDFEBD57A0441468B9EB3518FEBFB71DEF324
popup.js               9C1431DBD591C4C329EEEF35F6642469B572A882306ED9FABBF8C035F94B7025
main-world-bridge.js    390E14403830EEB27BC3925E7136C27A2303499303428316123549B9BF54DF5B
```

## 不可满足的执行链

当前 `scripts/v4-live-observation.mjs` 的执行顺序是：

1. `fixedProfilePath`（第 134–144 行）拒绝任何已经存在的 profile，然后创建
   一个空 profile 目录；静默复用被明确禁止。
2. runner 在第 311 行取得该新 profile，并于第 315 行启动 persistent Chromium。
3. `assertCaptureReadyPreflight`（第 189–207 行）要求
   `provenanceLevel === "extension_paired"`；否则返回 `pairing_invalid`。
4. 第 611 行先执行该前置检查；平台 page 直到第 639 行才创建，平台导航在其后。
5. 提交 `9cf7926` 删除了原 runner 的 `pairExtension` 与本地 pairing-code 调用；
   `tests/unit/v4LiveObservationStorageKeyDiagnostic.test.ts` 第 371–388 行还明确
   要求 runner 不包含 `pairExtension` 和 `/api/capture/pairing-codes`。

因此，空 profile 没有机会在 READY 检查前通过合法本地配对获得新的凭证；旧
profile 又会在浏览器启动前被拒绝。复制浏览器 profile、凭证或 storage 值违反
隔离与隐私边界；放宽 `pairing_invalid` 则会把无法投递的扩展错误标成 READY。

## 未执行与环境状态

- 拟用 LeetCode profile：`p7f6-leetcode-ready-3491670`，不存在。
- 同名数据库目录：不存在。
- READY evidence：不存在。
- storage-key diagnostic：不存在。
- `.tmp/server-db-path.txt`：不存在。
- `localhost:3000`：未监听。
- Next.js/Chromium/OJ 导航：未启动。
- NowCoder lane：未准备、未运行。
- 点击、提交、action authorization、配对、API 写入、数据库迁移、重试：均为 0。
- 默认数据库只读取元数据，仍为 `479232` bytes，mtime
  `2026-07-23T15:56:38.8411343Z`。

## 建议修订与用户决策

推荐保留“已配对才可 READY”的产品安全门，并对观察器 harness 做两阶段修订：

1. **prepare**：创建全新 profile/零行业务数据库，只允许本地配对；不访问 OJ，
   不读出或复制 credential，输出绑定 candidate/dist/tool/profile/database 的有界准备凭据。
2. **READY-only**：只允许用匹配准备凭据重开该 profile；先验证规范端点、配对、
   recovery ready、空队列和数据库 `0/0/0`，再按 LeetCode → NowCoder 导航；仍无
   `--authorize-action`，首失败即停。
3. 为新身份/凭据协议补 RED/GREEN、隐私审计、契约验证和独立审查，重新冻结工具
   哈希；产品 candidate、exact dist 和 candidate receipt 保持不变。

此修订会改变观察器执行协议，必须由用户明确批准后才能实施。不得选择“允许未配对
READY”或“复制/复用旧 profile/credential”作为捷径。

## 后续处置（2026-08-24）

用户后续没有批准上述两阶段配对修补，而是确认了 Local Vault + 无可见配对码的
产品方向。因此本报告的阻断事实继续有效，但本节此前的两阶段建议已被取代，不得再
作为执行入口。新的待拍板计划是
`docs/superpowers/plans/2026-08-24-v4-phase-d-local-vault-no-pairing-revision.md`：
先以零 OJ、零 SQLite spike 证明稳定扩展 ID 和精确非空 Origin，再决定是否删除
bearer/配对面并冻结新产品候选。候选 `3491670` 的 READY-only 授权不转移。
