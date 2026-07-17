# V0 Two-User Observation Report

Status: PENDING — requires two pseudonymous users (P1, P2) each completing ≥14 calendar days of observation starting at implementationSha.

implementationSha: d6c0f14aafb663c8746ad5e30d968508d539ec07

## Required fields (per Todo 29 spec)

For EACH participant (P1 and P2), record:

| Field | Description |
|-------|-------------|
| participant_code | P1 / P2 (pseudonymous) |
| window_start | ISO date (YYYY-MM-DD) |
| window_end | ISO date (YYYY-MM-DD) |
| implementationSha | Git HEAD at time of window |
| at_least_one_full_loop | true if map → plan → today → completion → next-decision was observed |
| default_primary_reduced_choice_friction | true | false |
| recommendation_understood | true | false |
| ability_reason_understood | true | false |
| setup_failures | free-form list |
| resource_failures | free-form list |
| wrong_recommendation_failures | free-form list |
| blocking_failures | free-form list |
| dispositions | free-form: how each failure was handled |

## Minimum requirements

- Two distinct participants (P1, P2)
- Each window spans ≥14 calendar days
- Each participant completed at least one full loop
- Each participant answered both `default_primary_reduced_choice_friction` and `ability_reason_understood`
- Every observed failure has a disposition

## How to fill

1. Recruit two pseudonymous participants.
2. Each participant uses the V0 app daily for ≥14 days.
3. Record each participant's window in the schema above.
4. After both windows complete, run `node scripts/validate-v0-observation.mjs --participants work/reports/v0-observation-participants.md` to validate.
5. Validator exits 0 when minimum requirements are met.

## Disposition

PENDING — no participant windows recorded yet.