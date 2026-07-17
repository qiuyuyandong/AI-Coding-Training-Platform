# Content Editorial Policy

## Scope and Authority

This document is the single source of editorial truth for all curriculum content, resources, career summaries and practice mappings in this repository. Every content file imported into the training platform must comply with the rules defined here before it reaches `reviewed` status.

Source authority follows a strict hierarchy. Official documentation from language or tool maintainers, such as cppreference.com or git-scm.com, ranks highest. Permissive open resources with clear authorship, such as OI Wiki articles, rank second. Deep-link-only references to commercial problem platforms rank third, and they must point to public canonical URLs without copying full problem statements or verdict data.

When a source is known to be regionally restricted from mainland China networks, the curriculum package must either provide an accessible mirror alternative or clearly label the resource with a mainland-access warning. The curriculum must remain navigable from mainland networks using mirrors where available. No resource may be marked `reviewed` while its primary URL is unreachable from the target network profile.

This policy applies to all content under `content/tracks/` and `content/careers/`. Editorial decisions are versioned alongside the curriculum package; an editorial change that alters a resource's review status or URL must produce a new package version.

## Source Authority and Maintenance

Every cited source in a curriculum package must carry the following metadata: authority name and URL, retrieval date in ISO 8601 format, and a review date that must not be older than the retrieval date. The review cycle is quarterly. Resources whose review date is more than 90 days past the current date must be rechecked before the next package release. A resource whose URL returns a non-2xx status, a login gate, or an interstitial page during review must be downgraded to `broken` and either replaced or removed before the release is published.

The `provenance` field on every knowledge node, resource and career summary must cite at least one identifiable source authority. Placeholder text, AI-generated summaries or unattributed editorial notes are not accepted as provenance for any `published` or `reviewed` item. Editorial notes such as "Editorial note 2026-07-17" are acceptable only for navigation content, such as career direction summaries, where the content represents the editorial team's own synthesis of publicly available role descriptions and industry practice.

## Language

English is the primary language for all curriculum content. Every node title, outcome, rationale, stopping guidance and resource title must be authored in English. Optional zh-CN summaries may accompany English text as a supplementary field, but they must never replace the English primary text. Full translation of technical content into zh-CN is out of scope for V0. Technical terms, such as data structure names, algorithm names, programming language keywords and platform names, must be preserved in their original form and never translated or transliterated.

## Mainland Access Warning

Some referenced sources, including GitHub repositories, LeetCode problem pages and Codeforces contest tasks, may be regionally restricted from mainland China networks. The curriculum package must account for this: every external link is classified with an `access` metadata field set to one of `open`, `registration` or `regional_restricted`. Resources classified as `regional_restricted` must carry an explicit mainland-access warning in their metadata and, wherever possible, an alternative domestic mirror URL.

The link checker script (`scripts/check-curriculum-links.mjs`) runs a `mainland-local` profile that validates reachability from the target network. A resource that fails the `mainland-local` check may still be published but must be downgraded to `regional_restricted` access and labelled with a visible warning. Resources that fail all profiles, including open-internet checks, must be marked `broken` and excluded from the published corpus.

## Legal Deep-Linking

The platform only deep-links to public canonical URLs. It never copies full problem statements, sample inputs or outputs, editorial solutions or verdict data from any online judge platform. For AtCoder problems, links must use the direct task URL format: `https://atcoder.jp/contests/<contest>/tasks/<task>`. For other platforms, links must point to the publicly accessible problem description page without mimicking authenticated session state or embedding tokens.

No commercial problem statement, proprietary test case, official solution editorial or hidden platform data may be mirrored, cached or stored in this repository. The `canonical_problem_sources` table stores only stable external identifiers and public URLs; it never stores scraped content.

## Stopping Guidance

Every resource and every knowledge node must include stopping guidance. Stopping guidance tells the learner when they have completed enough work on a node or resource to proceed to the next item. It defines a concrete, observable exit condition, not a time budget or a vague "understand the topic" directive. For example: "You can stop when you can write a program that reads two integers from standard input and prints their sum without consulting the reference." Stopping guidance is a required field on every `published` node and every `reviewed` resource. The importer rejects any package where a published node or reviewed resource lacks a non-empty stopping guidance string.

## Review Status and Deprecation

Every resource carries a `review_status` field with one of four values: `draft`, `reviewed`, `broken` or `deprecated`. The `draft` status indicates content that has been authored but not yet reviewed against its source. The `reviewed` status indicates content whose source has been checked, whose URL is reachable and whose stopping guidance has been confirmed. The `broken` status indicates content whose source is no longer reachable or whose content has diverged from its cited authority; broken resources must be removed or replaced before the next package release. The `deprecated` status indicates content that has been superseded by newer material; deprecated resources remain available for one release cycle with a visible deprecation notice, then are removed.

Knowledge nodes use a parallel status field with values `planned`, `draft`, `published` and `deprecated`. A `published` node must have a `reviewed` primary resource and a mapped practice task. A node without both cannot be `published`.

## Change Control

Content changes go through curriculum package versioning. Every change to a content file under `content/tracks/` or `content/careers/` must produce a new package version identified by a bumped semantic version and a new checksum. Migrations must never contain content INSERTs; content is imported through the package importer only. The standard flow is: Todo 4 and Todo 5 produce content files, Todo 3 imports them into the database, and Todo 24 gates the final package before release.

Content files are the source of truth. The database is a derived artifact. If a discrepancy exists between content files and database rows, the content files are authoritative and the database must be re-imported.

## V0 Specifics

The V0 release includes exactly 12 published knowledge nodes, 24 reviewed resource and problem links, and 9 career direction summaries. No more, no less. Deep career routes, including direction-specific modules, project sequences and role-specific practice tasks, are not available in V0. Every career summary carries `unavailable_in_v0: true` to signal that the full route is planned but not yet built. The career summaries provide navigation and orientation only; they do not represent complete curricula and must not be presented as actionable training paths.

This document is the single source of editorial truth for V0 content. Any exception to these rules must be recorded as an amendment to this policy, versioned alongside the affected curriculum package and reviewed before the next release gate.
