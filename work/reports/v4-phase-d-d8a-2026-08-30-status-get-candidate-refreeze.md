# V4 Phase D status GET 新候选重冻报告

日期：2026-08-30

分支：`feature/v1-followup`

新候选：`ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`

## 1. 结果

status GET 最小修复、`AGENTS.md` 与全部 D8-A evidence 已精确提交；累计候选所有权
收口后，新候选 `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0` 通过 exact candidate
validator。新 exact dist 与 strict candidate receipt 已冻结并逐字节核验。

## 2. 提交链

- `fd49a8fce87eb05ad1ef6ff8ab94b73c3e57169d`
  (`fix(v4): repair local capture status probe`)：14 个授权路径，包含 product fix、
  tests、`AGENTS.md`、计划、handoff 和 7 份 D8-A reports。
- 首次以 `fd49a8f` 运行 exact validator，在质量门前以两个 explicit-ownership checks
  失败。未知项仅为 6 份已提交的累计 D7–R4 reports；没有生成候选产物。
- `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`
  (`chore(v4): own cumulative refreeze evidence`)：只为这 6 个历史报告增加精确 path，
  无目录通配；validator regression `22/22`，累计 133 paths 全部明确拥有。

## 3. Exact candidate validation

执行：

```text
node scripts/validate-v4-candidate.mjs --candidate ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0
```

结果：exit 0，`V4 candidate commit PASS`。

- root unit：`2607 passed / 1 skipped`；
- App E2E：`24/24`；
- extension unit：`1671/1671`；
- extension E2E：`55 passed / 1 skipped`；
- production build：PASS；
- extension privacy：`0 findings`；
- adapter readiness：PASS；
- candidate cumulative paths、clean HEAD、single parent、post-gate identity：PASS；
- 默认数据库 size/mtime preservation：PASS。

root skip 是既有 Windows file-symlink capability；extension skip 是既有
service-worker restart harness limitation。

## 4. Frozen artifacts

Exact dist：

```text
.tmp/v4-route-h-exact-dist-ee0e1f5
```

共 10 个文件，与 exact gate 结束后的 `extension/dist` 逐文件 SHA-256 一致。

| Artifact | SHA-256 |
|---|---|
| `manifest.json` | `DE980FDBBE42EE293C154435716FCE7B5AF384BFB435BACD774AFFD17FB76B8F` |
| `background.js` | `0311DEF015A0292AAF80A8015283C488C23FA39631EC4E1CE7852571B0A83264` |
| `content.js` | `FF56222167EFB0904AC50F2175BFD24C1C2711E9966E879A8099427C16339D8D` |
| `popup.js` | `2AA3FC47953AEC4505D89736DEA93F49E226BE817ADEEE024B1A35D917AB06E1` |
| `main-world-bridge.js` | `4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943` |

Strict candidate receipt：

```text
.tmp/v4-route-h-candidate-receipt-ee0e1f5.json
```

Receipt SHA-256：

```text
A46B79F64F4A9373D134EA918D67959BBECDD89172B7EB37B4DC7E4706188E7C
```

receipt schema 1 的 candidate SHA、exact-dist path 和五项 hashes 全部与冻结产物一致。

## 5. 数据库与边界

- 默认数据库：479232 bytes；
- mtime UTC：`2026-07-23T15:56:38.8411343Z`；
- SHA-256：`2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`；
- observation DB：events/sessions/attempts = `0/0/0`。

本轮只运行 quality-gate 的 localhost/Fake OJ 浏览器测试。未操作 current `yu` Chrome，
未执行 connection preparation、真实 OJ、action runner、click、submission 或 NowCoder。

## 6. 终态

旧候选 `0c23fca`、旧 exact dist 和旧 candidate/connection receipts 只保留历史
provenance。新候选尚未进行 connection preparation 或 READY；任何浏览器阶段都需要
用户基于新 SHA、exact dist 与 receipt 另行授权。D4、RC、release、push 和 PR 继续停止。
