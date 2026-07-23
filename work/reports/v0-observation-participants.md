```json
{
  "type": "v0-observation-participants",
  "schemaVersion": "v0-observation-participants-1",
  "implementationSha": "2f4f5d895ea8d965fb64d19dc784ca5514480688",
  "status": "HOLD",
  "participants": []
}
```

# V0 Participant Observation Report

Status: HOLD — P1 and P2 observation windows have not started.

Record P1 and P2 separately. Each real window must span at least fourteen
calendar days and include a completed loop, a choice-friction answer, a
reason-comprehension answer, and dispositions for every observed failure. Both
participants must use the unchanged implementation SHA above.

Do not pre-fill dates or synthesize evidence. When both windows complete, set
`status` to `PASS` and run:

```powershell
node scripts/validate-v0-observation.mjs --participants work/reports/v0-observation-participants.md
```
