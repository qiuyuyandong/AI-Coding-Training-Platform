# V4 Phase D status GET 最小产品修复报告

日期：2026-08-30

分支：`feature/v1-followup`

基线 HEAD：`e6b197bed7e9f40bcb2897fcdfb3e109fa05c701`

失效候选：`0c23fcacf18d2fe4113d803504e638c1aab887d3`

## 1. 结果

已完成 `connection_preflight` 根因的最小离线产品修复。status GET 现在接受浏览器未发送
Origin 的真实 extension health probe，但仍强制 canonical localhost 与 bearer
capability；任何明确存在但不是 frozen extension Origin 的请求仍返回 403。

本轮没有修改 extension、runner、Vault 或 receipt，也没有执行 real-browser
preparation、OJ、click、submission 或 NowCoder。

## 2. 实现边界

产品代码只有一个条件分支：

```ts
requireCanonicalLocalCaptureHost(request);
if (request.headers.has("origin")) requireExactCaptureExtensionOrigin(request);
authorizeLocalCaptureCapability(readBearerCapability(request));
```

因此安全边界保持为：

- URL 必须是 canonical `http://localhost:3000`；
- Origin 缺失可以进入只读 health authentication；
- Origin 明确存在时必须完全等于 fixed extension Origin；
- bearer capability 缺失、格式错误或认证失败仍返回 401；
- `OPTIONS` 仍无条件要求 exact extension Origin；
- connect、attempt、event 和其他 routes 完全不变。

## 3. 回归测试

新增两个 route cases：

1. valid capability + missing Origin 必须返回 200 和固定 healthy body；
2. valid capability + explicit hostile Origin 必须返回 403。

TDD 证据：

- RED：`1 failed / 5 passed`，missing-Origin case 实际为 403；
- GREEN：`6/6`；
- connection/probe/runner focused suite：`65/65`。

## 4. 完整质量门

第一次 `npm run quality:gate` 在 extension E2E 的 Route H production case 出现一次
worker 初始化竞态：test helper 在 `chrome.runtime` 注入前读取 `.id`，失败发生在产品
assertion 之前。未修改 harness；同一 case 原样单独重跑 `1/1` 通过。

第二次完整九阶段 `npm run quality:gate` exit 0：

- root unit：`2605 passed / 1 skipped`；
- app E2E：`24/24`；
- extension unit：`1671/1671`；
- extension E2E：`55 passed / 1 skipped`；
- typecheck、lint、migration、curriculum validation 与 production build：PASS。

两个 skip 都是既有环境/测试限制：Windows file-symlink capability 和 extension
service-worker restart harness limitation。

## 5. 候选影响

`app/api/capture/status/route.ts` 已偏离 commit `0c23fca`。因此旧候选、candidate
receipt、exact dist 与 connection receipt 只能保留历史 provenance，不再组成可执行的
修复后候选。

本修复完成时尚未获授权 commit 或重冻 candidate。用户随后在同日通过计划 23.11
单独授权精确提交与候选重冻；该后续授权仍不包含 connection preparation、READY、
真实动作、D4、RC、release、push 或 PR。

## 6. 下一门

后续执行必须先精确提交本修复与 D8-A 证据，再基于新 commit 执行完整 candidate
validation 和新 exact dist/receipt 冻结。实际新 SHA、hashes 与 gate 结果写入独立
refreeze report；在这些结果全部通过前，不得进入 preparation 或任何新真实动作。
