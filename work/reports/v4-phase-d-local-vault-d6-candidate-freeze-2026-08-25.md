# V4 Phase D Local Vault Route H D6 Candidate Freeze Report

Date: 2026-08-25

Branch: `feature/v1-followup`

Verdict: PASS

## Result

Route H D0-D6 offline engineering is complete and frozen as immutable product
candidate `0c23fcacf18d2fe4113d803504e638c1aab887d3`. The prior paired candidate
`34916705712cac1ef2e5d8816cd8e40fa4e29ca7` remains historical only and cannot
be relabelled under Route H.

The candidate contains the full approved phased range from the ADR/transport
decision through Local Vault, provenance migration, installation capability,
legacy-pairing removal and the READY preparation contract. No D7 or real-site
activity is included.

## Exact candidate gate

`node scripts/validate-v4-candidate.mjs --candidate
0c23fcacf18d2fe4113d803504e638c1aab887d3` exited `0` with
`V4 candidate commit PASS`.

The candidate-bound gate re-ran the actual repository quality gate and verified:

- root unit: `2599 passed / 1 skipped` across 117 files;
- App E2E: `24/24`;
- extension unit: `1671/1671` across 53 files;
- production extension E2E: `55 passed / 1 skipped`;
- Next.js production build: `20/20` routes;
- V4 extension privacy audit: `0 findings`;
- D4 acceptance profile: PASS;
- V4 adapter readiness: PASS;
- candidate is HEAD at validation time, worktree clean and commit unchanged
  after the real gate;
- candidate descends from Route H base
  `6c0e1d7e2184ac928f609cf94038aa00322f75e7` and every cumulative changed path
  is in the explicit candidate allowlist;
- generated/secret/raw-transcript paths are absent from the candidate;
- the default SQLite size and mtime are preserved.

An immediately preceding independent full `npm run quality:gate` returned the
same counts. Explicit privacy, acceptance-profile, adapter-readiness and diff
checks also passed. The expected Windows file-symlink capability test and one
documented service-worker-restart harness case remain skipped; all mandatory
junction and production restart/reload paths passed.

## Frozen artifacts

Exact production dist:

`.tmp/v4-route-h-exact-dist-0c23fca`

Strict candidate receipt:

`.tmp/v4-route-h-candidate-receipt-0c23fca.json`

Receipt SHA-256:

`4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`

Artifact hashes:

| Artifact | SHA-256 |
|---|---|
| `manifest.json` | `DE980FDBBE42EE293C154435716FCE7B5AF384BFB435BACD774AFFD17FB76B8F` |
| `background.js` | `30866672C557BFF1DB878988A81A12193A6FC36E4E7CAAEE87C45601A68452EB` |
| `content.js` | `FF56222167EFB0904AC50F2175BFD24C1C2711E9966E879A8099427C16339D8D` |
| `popup.js` | `2AA3FC47953AEC4505D89736DEA93F49E226BE817ADEEE024B1A35D917AB06E1` |
| `main-world-bridge.js` | `4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943` |

Frozen extension identity:

`oldmkbngfokmhlkjmlichccmbebipmei`

Frozen D5 observation-tool hash:

`309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35`

Frozen D4 acceptance-profile hash:

`D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`

## Database preservation

The default `training-platform.sqlite` remains:

- size: `479232` bytes;
- mtime UTC: `2026-07-23T15:56:38.8411343Z`;
- SHA-256:
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

Both full gates used disposable database state. No default-database migration,
Vault switch, browser profile preparation or OJ navigation occurred.

## Scope review

The final Route H shape remains deliberately small: existing Next.js owns
SQLite; the existing MV3 extension gains one installation capability; Local
Vault uses platform pickers plus CLI fallback; no new dependency, desktop shell,
Native Messaging host, File System Access primary store, cloud API or second
database writer was introduced. The narrower malicious-extension boundary
accepted by the user remains explicit in ADR 0004 and compliance documentation.

## Stop gate

D6 is complete. D7 is not authorized. The only possible next action is a fresh
user decision on sequential new-candidate READY-only preparation and observation
for LeetCode followed by NowCoder, bound to the exact SHA, dist, receipt and
tool/profile hashes above. A LeetCode failure must stop before NowCoder. Real
clicks/submissions, D4 delivery adjudication, RC, release, push and PR remain
separately gated.
