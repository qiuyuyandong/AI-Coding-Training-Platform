# V4 Phase D D8-A `connection_preflight` 根因诊断报告

日期：2026-08-30

分支：`feature/v1-followup`

工作树 HEAD：`e6b197bed7e9f40bcb2897fcdfb3e109fa05c701`

冻结候选：`0c23fcacf18d2fe4113d803504e638c1aab887d3`

## 1. 结论

`D8-A-2026-08-30-LC1` 的 `connection_preflight` 失败已裁决为 localhost status
probe 的跨层 Origin 合同不一致，不是 localhost 不可达，也不是 capability、installation
identity、endpoint、provenance、recovery 或数据库状态错误。

真实 Chrome extension 能访问 `http://localhost:3000/api/capture/status`，但请求未满足
服务端的 exact-extension Origin 校验而收到 HTTP 403。extension 将这个 403 折叠为
`service_unreachable`，background refresh 将该状态写回 storage；action runner 随后从
`GET_CAPTURE_STATE` 读到它并返回 `connection_invalid`，因此在 observer arm 和任何 OJ
页面创建之前终止。

本轮只完成诊断，没有实施修复，没有恢复或新增真实动作授权。

## 2. 授权与禁止范围

用户授权的是一次非动作根因诊断。实际只复用了：

- current `yu` Chrome 与 fixed extension ID `oldmkbngfokmhlkjmlichccmbebipmei`；
- frozen exact dist、existing bounded connection receipt；
- 同一 disposable DB 和 localhost；
- exact extension popup 中一次 bounded `GET_CAPTURE_STATE`。

没有运行 `CHARACTERIZATION_STOP`、retry/reset、prepare/connect、storage/receipt 写入或
action runner；没有打开 LeetCode/NowCoder 页面，没有 click 或 submission。

## 3. Ponytail 与 Sentry

Ponytail 约束本轮复用既有状态读取和服务日志，不增加 runner、诊断代码、依赖或 SDK。
该约束避免为了定位一个 preflight 条件而制造新的持久化机制。

Sentry plugin 在当前任务中没有可调用的 MCP 工具；本机也没有
`SENTRY_AUTH_TOKEN`、`SENTRY_ORG` 或 `SENTRY_PROJECT`。结果记录为
`SENTRY_UNAVAILABLE_NO_LOCAL_AUTH`。未要求用户在聊天中粘贴 token，未安装 SDK，未
虚构任何远端 issue/event 证据。

## 4. 只读动态证据

一次 bounded snapshot 只保留以下闭合投影：

```json
{
  "preflightReason": "connection_invalid",
  "captureEnabled": true,
  "endpointExact": true,
  "provenanceExact": true,
  "connectionStatus": "service_unreachable",
  "recoveryState": "ready",
  "recoveryError": null,
  "waitingCount": 0,
  "outboxCount": 0,
  "quarantineCount": 0,
  "installationIdentityMatch": true,
  "capabilityVersionMatch": true,
  "configExists": true,
  "receiptMatch": false
}
```

`receiptMatch=false` 不是独立的 runner preflight 条件；它表示 runtime 的
`service_unreachable` 与 bounded receipt 记录的 `connected` 不一致，是同一状态覆盖
问题的结果。本轮未读取 raw installation capability、credential、storage、账号或其他
扩展数据。

localhost 在同一诊断窗口观察到：

```text
GET /                                      200
GET /api/capture/status                    401  (无 capability 的显式 warm-up)
GET /api/capture/status                    403  (extension probe)
GET /api/capture/status                    403  (extension probe)
GET /api/capture/status                    403  (extension probe)
```

三次 403 证明 extension 请求已经到达 localhost，排除“服务不可达”。

## 5. 静态因果链

1. `scripts/v4-live-observation.mjs:316-329` 的 preflight 通过
   `GET_CAPTURE_STATE` 读取 snapshot；只要 `captureConnectionStatus` 不是
   `connected`，即返回 `connection_invalid`。
2. `extension/src/localConnection.ts:89-104` 的 status probe 只显式设置 Bearer
   Authorization；401 映射为 `capability_rejected`，其他所有非 2xx（包括 403）映射
   为 `service_unreachable`。
3. `extension/src/background.ts:2048-2058` 将 probe 结果写回
   `captureConnectionStatus`，并失效 cached snapshot。worker 初始化也会触发 refresh。
4. `app/api/capture/status/route.ts:15-26` 依次校验 canonical localhost、exact
   extension Origin 和 bearer capability。
5. `lib/http/captureRequest.ts:85-107` 表明 host/origin 拒绝为 403，Bearer 形态拒绝为
   401；`captureRouteErrorResponse` 也把 capability authentication error 映射为 401。
6. 实际请求命中 canonical localhost:3000 且返回 403，因此失败条件是 exact Origin
   缺失或不匹配，不是 capability authentication。extension fetch 无法显式设置浏览器
   控制的 Origin，因此现有两层合同在真实 Chrome 中不能同时成立。

这也解释 preparation 后的时间差：connect completion 会立即写入 `connected`，但之后
的 background status refresh 会用 403 probe 覆盖为 `service_unreachable`；runner 的
warm-up 只证明服务启动，不会重建 connection 状态。

## 6. 测试与缺口

执行：

```text
npx vitest run tests/unit/extensionLocalConnection.test.ts tests/unit/captureConnectionRoutes.test.ts tests/unit/v4LiveObservationObserver.test.ts
```

结果：3 个文件通过，`63/63` tests passed。

D4 acceptance-profile、adapter-readiness、plan-authority validators、
plan-authority unit `3/3` 与 task-doc `git diff --check` 也全部通过。

现有单元测试分别覆盖 exact Origin route 和抽象 probe response mapping，但没有覆盖
“真实 extension fetch + valid capability + 浏览器未发送 exact Origin”的组合，所以
离线绿色没有发现该跨层行为。

## 7. 最小修复建议（未实施）

Ponytail 最小产品修复应只改 status GET：

- Origin 缺失时继续进入 canonical localhost + bearer capability 校验；
- Origin 明确存在但不是 fixed extension Origin 时仍返回 403；
- valid capability + missing Origin 增加 200 regression；
- hostile explicit Origin 增加 403 regression。

把 client-side 403 从 `service_unreachable` 拆为闭合 origin/config rejection 能改善诊断，
但不是恢复 status probe 的必要改动，应避免与最小功能修复捆绑。

这是产品 route 变更，会使冻结候选 `0c23fca` 失效。必须先取得单独修复授权，再运行
focused tests、完整候选验证、重冻 exact dist/receipt 和 preparation；只有这些全部通过
后，才可讨论一个全新具名、最多一次提交的动作。已消费的
`D8-A-2026-08-30-LC1` 永久不得重试。

## 8. 收尾证明

- disposable DB：attempts/events/sessions = `0/0/0`；
- candidate receipt SHA-256：
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`；
- connection receipt SHA-256：
  `54076AA16C16851B0B6C06467C18CF39D856A33B2B586821A773CF15A3F7412E`；
- terminal action evidence SHA-256：
  `344AFC12EF6374E60A4D638A2DF2EE5EE6ADD1FD2C77BE914089B69F2E7539D6`；
- default DB SHA-256：
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`；
- localhost stopped，port 3000 free，root pointer absent；
- original Chrome PID `45404` 与 9222 存活；
- exact web-access proxy restored to READY；
- candidate、exact dist、receipts、action evidence 与 default DB 未由本轮改写；本轮
  没有主动调用任何 extension-storage 写接口。

## 9. 终态

根因已经裁决，但修复尚未授权或实施。D4、RC、release、V0.5、push、PR 与任何新真实
动作保持停止。
