```json
{
  "type": "v0-observation-owner",
  "schemaVersion": "v0-observation-owner-1",
  "implementationSha": "b5166320768355666a5c4ff3f466c29c240ea8cf",
  "status": "HOLD",
  "windowStart": "",
  "windowEnd": "",
  "effectiveSessions": [],
  "loopEvidence": [],
  "failures": []
}
```

# V0 Owner Observation Report

Status: HOLD — real owner sessions have not started.

Record at least three effective sessions on distinct dates spanning at least
seven calendar days. At least one session must cover map → plan → today →
completion → next decision. Every session and failure disposition must describe
what actually happened against the unchanged implementation SHA above.

Do not pre-fill dates or synthesize evidence. When complete, set `status` to
`PASS` and run:

```powershell
node scripts/validate-v0-observation.mjs --owner work/reports/v0-observation-owner.md
```
