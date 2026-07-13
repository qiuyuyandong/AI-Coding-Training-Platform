# Phase 1 Curriculum Graph and Resource Catalog Delivery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:brainstorming to confirm the first content slice, superpowers:writing-plans for atomic tasks, and superpowers:test-driven-development during implementation.

**Goal:** Publish a reviewed, versioned vertical slice of `Software Development Foundations v1`, plus nine shallow career-direction summaries, connecting direction, prerequisites, legal resources and concrete coding work.

**Non-goals:** Do not write full lessons, build nine complete career curricula, personalize plans, calculate mastery, or use AI to auto-publish resources.

**Dependency:** Phase 0 exit gate is green. Content research may start earlier, but import and UI work may not.

## First Content Slice

Show the complete foundation route as coarse `planned` stages so the learner can see the future, but limit the first truly usable slice to 12–18 `published` reviewed capability nodes and no more than 30 total visible nodes across:

- C++ language foundations needed for current practice;
- program decomposition, debugging, complexity basics, Git, build, and testing;
- arrays, strings, linked structures, stacks, queues, hashing, trees, and basic search/sort.

Each published node must state prerequisites, outcome, why it matters, one primary resource, one domestic-access alternative where needed, a stopping point, and at least one mapped code task. A node without this evidence remains `planned` or `draft` and is not eligible for recommendation. `deprecated` nodes keep historical references but are never newly recommended.

Also publish one reviewed summary for each adopted direction: frontend/Web, backend/server, client, data analytics/engineering, AI/ML, edge AI/embedded, cloud/platform engineering, security, and systems software. A direction summary contains purpose, representative roles, common-foundation dependencies, direction-specific modules, coarse order and one representative project. It is navigation content, not a claim that a complete route exists.

## Planned Data Contracts

At Phase 1 kickoff, assign the next available four-digit migration prefix to the semantic suffix `curriculum_catalog.sql`; do not reserve a number before Phase 0 has merged.

Tables:

- `curriculum_packages`: package ID, semantic version, checksum, source revision, installed time;
- `career_tracks` and `competency_domains`;
- `career_track_requirements`: node/domain target level and rationale; Phase 1 may store coarse requirements while later phases refine them;
- `knowledge_nodes`: stable ID, level, outcome, rationale, status, source metadata;
- `knowledge_edges`: typed relations supporting required/recommended prerequisite, composition, similarity, alternative, application and project verification; the default map exposes only prerequisite relations;
- `learning_resources`: source, author, URL, language, cost, access, license boundary, review status/date;
- `canonical_problems` and `canonical_problem_sources`: one conceptual problem identity mapped to one or more platform/external IDs so cross-platform duplicates are not automatically counted as transfer;
- `practice_tasks`: stable task ID and kind, initially limited to OJ/existing training targets;
- `node_resources` and `node_practice_mappings`; each practice mapping includes `measurement_role`, `variant_family_id`, and `difficulty_band` so Phase 2/3 can reason over it.

Domain and package files:

- `lib/domain/curriculum.ts`
- `lib/domain/resource.ts`
- `lib/curriculum/packageSchema.ts`
- `lib/curriculum/importPackage.ts`
- `content/tracks/software-development-foundations-v1/manifest.json`
- `content/tracks/software-development-foundations-v1/nodes.json`
- `content/tracks/software-development-foundations-v1/edges.json`
- `content/tracks/software-development-foundations-v1/resources.json`
- `content/tracks/software-development-foundations-v1/practice-mappings.json`
- `content/careers/career-directions-v1.json`

## Work Packages

### 1.1 Package schema and graph invariants

- [ ] Write failing tests in `tests/unit/curriculumPackage.test.ts` for stable node/task IDs, valid statuses, missing prerequisites, duplicate edges, cycles, orphan resources, unpublished mappings, missing variant families, and invalid difficulty bands.
- [ ] Add canonical-problem tests for duplicate platform mappings, conflicting identities, aliases and intentionally similar-but-distinct problems.
- [ ] Implement Zod schemas and a pure validator.
- [ ] Require every published node to have provenance, outcome, resource, and practice mapping.

### 1.2 Transactional import and versioning

- [ ] Write temporary-database tests for first install, idempotent reinstall, version upgrade, checksum mismatch, and rollback.
- [ ] Add migration, repositories under `lib/repositories/curriculum.ts` and `lib/repositories/resources.ts`, then implement transactional package import.
- [ ] Never mix package upgrade state with personal progress tables.

### 1.3 Reviewed foundation content

- [ ] Author the 12–18 published-node slice plus coarse planned stages from the references in `IDEA.md` and primary course/documentation sources.
- [ ] Author the nine career summaries without expanding them into separate task catalogs.
- [ ] Add an editorial checklist recording source authority, maintenance, difficulty, language, domestic access, legal linking, and last review date.
- [ ] Mark uncertain or inaccessible resources `draft`; AI-generated summaries cannot change review status.

### 1.4 Graph and resource query services

- [ ] Test and implement prerequisite closure, successors, node detail, learning outcomes, resource filters, and practice mappings as pure services over repository DTOs.
- [ ] Detect invalid cycles at import time instead of hiding them in the UI.
- [ ] Return explicit reason codes for unavailable or draft nodes.

### 1.5 Read-only `/map` and `/resources`

- [ ] Add server pages and small interaction components for track/domain filters and a node detail panel.
- [ ] Present an accessible layered graph plus a keyboard-readable list; the visualization cannot be the only navigation method.
- [ ] Use progressive disclosure: career/domain at far zoom, modules/themes at middle zoom, capability nodes only when requested; resources remain in node details.
- [ ] Show “current location” as unavailable until Phase 2 rather than faking personalization.
- [ ] Add Playwright paths from track → node → resource → original coding task.

### 1.6 Content QA and documentation

- [ ] Add `npm` scripts for offline package validation and deterministic import.
- [ ] Document how a resource becomes reviewed, how a package version is released, and how broken links are marked.
- [ ] Record the package version in architecture and runbook output.

## Verification Commands

Add `curriculum:validate` during this phase, then run:

```powershell
npm run curriculum:validate
npm run test -- tests/unit/curriculumPackage.test.ts tests/unit/curriculumImporter.test.ts tests/unit/curriculumGraph.test.ts tests/unit/resourceCatalog.test.ts
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

## Exit Gate

- [ ] One track, the full coarse planned route, and the agreed 12–18 published-node slice import transactionally on a fresh or upgraded database.
- [ ] All nine career-direction summaries are visible and explicitly label unavailable deep routes as future content.
- [ ] Graph validation rejects cycles, missing nodes, duplicate stable IDs, and published nodes without required evidence.
- [ ] 100% of published nodes have provenance, explicit outcome, reviewed resource, and practice mapping.
- [ ] Every published practice mapping has a stable task ID, primary/supporting role, variant family, and difficulty band.
- [ ] Cross-platform aliases share a canonical problem ID and are not represented as independent transfer tasks unless an editor explicitly marks them distinct.
- [ ] Core nodes have a domestic-access path or a visible accessibility warning and alternative.
- [ ] `/map` works with mouse and keyboard and does not require understanding an unlabelled visual graph.
- [ ] `/resources` exposes review state, last-check date, cost/language/access metadata, and stopping guidance.
- [ ] No copyrighted full lesson or commercial problem statement is copied into the database.
- [ ] Full phase gate passes.

## Risks and Controls

- **Content explosion:** enforce 12–18 published capability nodes and a 30-node total visible cap; breadth comes after one complete vertical slice.
- **False authority:** store sources and review state; “AI suggested” is never equivalent to “reviewed.”
- **Graph as decoration:** every edge must affect prerequisites or navigation, and every node must lead to action.
- **Broken domestic access:** provide alternatives and explicit access metadata instead of promising universal availability.
