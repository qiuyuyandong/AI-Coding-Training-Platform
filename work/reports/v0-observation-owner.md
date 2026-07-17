# V0 Owner Observation Report

Status: PENDING — requires ≥7 calendar dates of owner self-use starting at implementationSha.

implementationSha: d6c0f14aafb663c8746ad5e30d968508d539ec07

## Required fields (per Todo 28 spec)

For each ACTUAL session, record:

| Field | Description |
|-------|-------------|
| date | ISO date (YYYY-MM-DD) |
| implementationSha | Git HEAD at time of session (verify frozen) |
| effort_boundary_minutes | 15 / 30 / 60 / 90 |
| primary_task_stable_id | task stable_id from the daily plan |
| started | true if feedback action='started' recorded |
| completed | true if feedback action='completed' recorded |
| skipped | true if feedback action='skipped' recorded |
| replaced | true if feedback included successor_daily_plan_id |
| next_decision_visible_changed | true if successor daily plan id != current daily plan id |
| reason_understood | true if learner reported understanding the reason codes |
| choice_friction_note | free-form: did the default primary reduce choice friction? |
| failure_bug_id | free-form: any failure or bug observed |
| ai_source | "off" | "on" | "fallback" depending on whether AI was invoked and its outcome |

## Minimum requirements

- ISO dates span ≥7 calendar days
- ≥3 effective sessions on distinct dates
- At least one full loop: map → plan → today → completion → next-decision
- Every observed failure linked to a disposition
- Missing days are allowed but not fabricated

## How to fill

1. Use the V0 app daily: navigate /map → /plan → /today → complete a task → observe next-day plan.
2. Record each session in the table above.
3. After ≥7 days, run `node scripts/validate-v0-observation.mjs --owner work/reports/v0-observation-owner.md` to validate.
4. Validator exits 0 when minimum requirements are met.

## Disposition

PENDING — no sessions recorded yet.