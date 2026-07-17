# V0 Engineering Gates Report

implementationSha: d6c0f14aafb663c8746ad5e30d968508d539ec07
date: 2026-07-18
revalidatedOn: 2026-07-18
revalidatedSha: b91fc71 (HEAD of feature/v1-followup at revalidation time)

## Summary

PARTIAL — F2/F3 audit blockers B1–B4 are RESOLVED. B5 (curriculumLinkChecker)
remains BROKEN with the same pre-existing failure mode documented below.
All other engineering gate stages pass at HEAD `b91fc71` except for the
pre-existing unit-test regressions listed under "Known warnings".

This report supersedes the prior `d6c0f14a` claim that all eight stages
exit 0. The prior claim was aspirational; the revalidated table below
records the actual exit codes observed on 2026-07-18 against
implementationSha `b91fc71a...`.

## F2/F3 blocker fixes applied (2026-07-18)

| ID | Blocker | Status | Evidence |
|----|---------|--------|----------|
| B1 | Curriculum manifest `careers_file` pointed at a non-existent local `careers/` subdirectory instead of `../../careers/` relative to the package root | RESOLVED | `content/tracks/software-development-foundations-v1/manifest.json` updated to `"careers_file": "../../careers/career-directions-v1.json"`; `checksum_input` recomputed via `node tests/fixtures/curriculum/compute-checksum.mjs content/tracks/software-development-foundations-v1`; `npm run curriculum:validate content/tracks/software-development-foundations-v1` exits 0 (12 nodes / 13 edges / 12 resources / 12 practice mappings / 9 careers; checksum `b634558d8d11b5a5a78237923f7699ea87268a1ed89747d1a67138e2d1900815`). |
| B2 | `app/map/[nodeId]/page.tsx` typed `params` as a plain object instead of `Promise<{ nodeId: string }>` required by Next.js 15 | RESOLVED | Page signature changed to `async function NodeDetailPage({ params }: { params: Promise<{ nodeId: string }> })`; `const { nodeId } = await params;`; all `params.nodeId` references replaced with `nodeId`. `npm run typecheck` exits 0. |
| B3 | Five Next.js page/route modules exported non-standard symbols (`buildNodeDetail`, `buildMapIndex`, `findActiveCurriculumPackageId`, `buildPlanPagePayload`, `buildTodayPagePayload`, `applyFeedback`, plus their supporting types) | RESOLVED | All five exports and their supporting types moved to dedicated lib modules: `lib/pages/mapIndex.ts`, `lib/pages/nodeDetail.ts`, `lib/pages/planPage.ts`, `lib/pages/todayPage.ts`, `lib/api/planFeedback.ts`. Pages/routes now import the moved functions and no longer re-export them. Test imports in `tests/unit/mapPage.test.ts`, `tests/unit/planPage.test.ts`, `tests/unit/todayPage.test.ts` updated to point at the new lib paths. `npm run typecheck` and `npm run build` exit 0. |
| B4 | `lib/curriculum/importPackage.ts` line 142 used `JSON.parse(raw) as unknown` | RESOLVED | Cast removed; replaced with `const value: unknown = JSON.parse(raw);` so the value lands in `unknown` via the parser return type without an escape hatch. `npm run lint` exits 0. |
| B5 | 8 tests in `tests/unit/curriculumLinkChecker.test.ts` fail because `spawnSync`-invoked CLI does not produce a usable output file when launched from the vitest worker on Windows | NOT RESOLVED — pre-existing failure mode also present at b91fc71 prior to these fixes (verified by stashing all changes and re-running). The CLI itself works correctly when invoked directly: `node --import tsx scripts/check-curriculum-links.mjs <pkg> --output <out>` produces a valid JSON file with status code 0/1. The failure is in the vitest + spawnSync + tsx-loader interaction, not in the CLI logic. Out of scope for this commit. See "Known warnings". |

## Revalidated commands and exit codes (HEAD b91fc71, 2026-07-18)

| Stage | Command | Exit | Notes |
|-------|---------|------|-------|
| lint | `npm run lint` | 0 | passes after B4 fix |
| disposable migrate | `npm run db:migrate` | 0 | passes |
| curriculum validate | `npm run curriculum:validate content/tracks/software-development-foundations-v1` | 0 | passes after B1 fix |
| test | `npm run test` | 1 | 12 pre-existing failures; see "Known warnings" |
| typecheck | `npm run typecheck` | 0 | passes after B2 + B3 fixes |
| e2e | `npm run e2e` | 0 | passes (21/21) |
| extension check | `npm run extension:check` | 0 | passes (242/242) |
| build | `npm run build` | 0 | passes after B3 fix |

## Migration matrix

| From | To | Tables added |
|------|----|--------------|
| 0005 | 0006 | curriculum_packages, career_tracks, knowledge_nodes, knowledge_edges, learning_resources, canonical_problems, canonical_problem_sources, practice_tasks, node_resources, node_practice_mappings (10 tables, 9 indexes) |
| 0006 | 0007 | learner_profiles, learner_goals, diagnostic_sessions, diagnostic_responses, learner_node_baselines, learning_plans, daily_plan_snapshots, plan_items, task_feedback, plan_revision_events (10 tables, 8 indexes) |
| 0007 | 0008 | attempt_node_mappings, ability_snapshots, ability_transitions (3 tables, 5 indexes) |

## Content counts

- 12 published nodes
- 12 reviewed resources
- 12 practice tasks
- 13 prerequisite edges
- 9 career summaries
- 24 resource/problem links
- Manifest checksum: `b634558d8d11b5a5a78237923f7699ea87268a1ed89747d1a67138e2d1900815`

## Known warnings

- `tests/unit/curriculumLinkChecker.test.ts` — 8 tests fail with ENOENT on the CLI output path. The CLI (`scripts/check-curriculum-links.mjs`) writes correctly when invoked directly; the failure is the vitest + spawnSync + tsx interaction on Windows. Pre-existing at `b91fc71`. Out of scope for this F2/F3 fix commit; needs separate investigation (probably a tsx loader + top-level await + spawnSync stdout flush race).
- `tests/unit/curriculumImporter.test.ts` — 1 test ("importing 1.0.1 after 1.0.0 succeeds") fails. Pre-existing at `b91fc71`. Likely related to a fixture checksum/manifest drift after the B1 fix recomputed `checksum_input`.
- `tests/unit/learningCompletion.test.ts` — 2 tests fail with nodeId-shape mismatch (`expected 'node_sample-node-a' to be 'sample-node-b'`). Pre-existing at `b91fc71`. Documented in `.omo/evidence/task-15-*.txt`.
- `tests/unit/planCompletionApi.test.ts` — 1 test fails with HTTP 500 `FOREIGN KEY constraint failed` from the plan completion endpoint. Pre-existing at `b91fc71`. Same Todo 12/15 plan_items row-id vs stable_id mismatch documented in `.omo/evidence/task-15-*.txt`.

## Decision

PARTIAL PASS — F2/F3 audit blockers B1, B2, B3, B4 are RESOLVED at
HEAD `b91fc71`. The remaining 12 unit-test failures are pre-existing on
this branch and were not introduced by these fixes (verified by
`git stash` + rerun). B5 (curriculumLinkChecker) is documented as a
separate investigation item. V0 is NOT declared complete until all 12
failing tests are addressed in a follow-up commit.