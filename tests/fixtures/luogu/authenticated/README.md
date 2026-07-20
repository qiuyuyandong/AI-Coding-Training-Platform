# Luogu DOM Fixture Corpus — Authenticated Characterization Subset

Acquired: 2026-07-20 for V0 domestic-OJ adapter characterization (Phase 0B4
follow-up). Lives under `tests/fixtures/luogu/authenticated/` so the existing
`platformCertification.test.ts` BLOCKED corpus under the parent directory is
not perturbed.

**Status:** authenticated-characterization. NOT certifying. NOT production.

## Retained fixtures (2 record fixtures)

| # | Fixture | Evidence Tier | Purpose | Detected Platform/ExternalId / Verdict |
|---|---------|---------------|---------|----------------------------------------|
| 1 | `record-287273601-p1001-ac` | authenticated-characterization | `detectProblemFromPage` + `detectVerdictFromDocument` | `luogu` / `P1001` / Accepted |
| 2 | `record-287272767-p1001-ce` | authenticated-characterization | `detectProblemFromPage` + `detectVerdictFromDocument` | `luogu` / `P1001` / Compile Error |

The problem-page submit-control DOM (`<a class="title" href="javascript:void 0">…</a>`)
is an inline minimized test case inside `extensionDomesticOjAuth.test.ts`; it is
**not** a separate verdict fixture file and is therefore not listed above.

## Extractor provenance

The Luogu record verdict cannot be reached through any CSS selector alone —
the observed DOM is an unlabeled semantic row of nested spans where only the
exact text "评测状态" pinpoints the verdict label. The semantic extractor
`extractLuoguRecordRowText` (defined in `extension/src/platforms.ts`):

1. Walks every leaf element whose `children.length === 0` (so wrapping
   nodes can never accidentally satisfy the matcher).
2. Trims `textContent` and requires an **exact** equality with "评测状态"
   (no substring, no surrounding whitespace).
3. Walks up via `Element.closest("div, tr, li, section")` and reads the
   full row text.
4. Returns the row text only when both the label leaf and a containing row
   are found; otherwise returns the empty string.
5. Empty string forces `verdictFromText` to emit `null` rather than guess.

The row text is then mapped by the existing `verdictFromText` heuristics so a
sibling colored span reading "Accepted" emits `Accepted` and one reading
"Compile Error" emits `Compile Error`. The extractor rejects:

- Comment boilerplate that mentions "评测状态" but is not a leaf element.
- Navigation/headline copy that mentions any verdict token outside the row.
- A row whose exact label is anything other than "评测状态" (e.g. "通过题目
  状态" is rejected).

## Submit control recognition

Luogu's submit control on the problem page is `<a class="title" href="javascript:void 0">…</a>`,
not a native `<button>`. The platform-specific anchor promotion in
`extension/src/submissionControl.ts` accepts `<a class="title">` *only* for
the Luogu platform, *only* when its `href` attribute is exactly the observed
contract `javascript:void 0`, and *only* when its visible label normalizes
to the exact allowlist entry "提交". Any other platform with a stray
`a.title` element, or a Luogu anchor with a different href, continues to be
rejected.

## Missing evidence

- Non-AC verdicts beyond Compile Error (Wrong Answer / Time Limit
  Exceeded / Memory Limit Exceeded / Runtime Error / Accepted) for
  Luogu: only two public records were observed during capture and they
  were AC and CE respectively. The evidence-matrix report records this
  honestly. Do not infer, fabricate or import further fixtures.

## Non-goals

- Production certification. authenticated-characterization is non-certifying
  by design; see `tests/helpers/platformFixtureMetadata.ts`.
- The original Phase 0B4 BLOCKED Luogu artifacts and the parent
  `tests/fixtures/luogu/{readme.md,*.html,*.meta.json}` remain untouched.
