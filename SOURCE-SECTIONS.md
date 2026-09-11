# Bounded native source sections

`extractResearchSourceSection` in `scripts/research-source-headings.ts` projects
one identity-bound section directly from admitted HTML bytes using the native
token cursor. It shares heading discovery's traversal rather than building a
DOM, seeking to offsets, reparsing a substring or using another browser.

## Contract

Supply the existing `{ finalUrl, contentType, body }` native source input, an exact
selection and options with `method: "native-source-section-v1"` and
`projection: "normalized-source-prose-v1"`. Selection contains:

- `source`: the complete native byte/decoder/text identity from heading discovery.
- `headingPolicies`: `optional-end-tags-v2`, `explicit-body-boundary-v1`,
  `balanced-source-elements-v1` (or explicit `balanced-source-elements-v2`)
  and `bounded-non-entity-v1` under their respective
  `tableScopePolicy`, `headScopePolicy`, `headingInlinePolicy`, `rawDiscardPolicy` keys.
- `heading`: `ordinal`, `level` and the exact native start/end tag `anchor`.

The v2 heading policy omits images and all their attributes from lexical heading
text; it retains source ranges and discloses that omission in section reports.
See SOURCE-HEADING-IMAGES.md. Selecting v1 does not automatically enable v2.

Options and all nested selection records are strict own-data snapshots taken
before input access or an await. Proxies, accessors, unknown fields, coercion and
explicit undefined fail. Every source identity field is recomputed and compared;
the target's completed native heading must match its ordinal, level and all four
coordinates. Labels, IDs and nearby offsets are not matching authority.

The body begins after the target heading. Deeper eligible headings become full-text
heading blocks, independently of truncated metadata titles. The next equal/shallower
heading stops the section only after its complete heading validation; its opening
offset ends `bodyRange` and its closing offset ends `validatedThrough`. Clean native
EOF is the other boundary. No claim is made about an unvisited document tail.

Ordinary prose uses normalized whitespace and fixed block separators; inline text
remains adjacent. Link labels contribute text, not destinations or attributes.
Raw, table, foreign and other special-context text stays omitted with explicit
selected-body counters. Six nonentity raw names use bounded discard steps;
title/textarea retain their legacy entity-aware raw validation. Strings remain
untrusted data to render inertly, never HTML or agent instructions.

The deeply frozen `{ report, jsonl, outputBytes }` result contains blocks, exact
source/selection, native boundary/ranges/counters, omissions and limitation tuples.
`partial: true`, `contentSuccess: null` and `semantics: "lexical-not-dom"` remain
mandatory. Normalized text is not verbatim, visible DOM text, ordinary-container
balance, a character map, source authenticity or proof of normative meaning.

## Bounds And Failure

Limits can only be lowered. Existing ceilings remain:4M input bytes/sourceUTF16,
65536window,32M shared work,200000operations,1024issues,128tracked depth,
16384heading span,256title and120000ms deadline. Section-specific ceilings are
256eligible heading starts,262144sourceUTF16 from target start through validated
boundary,256blocks,4096UTF16 per block,32768retained text and65536JSON+LF bytes.

One deadline and shared native/scanner/projection work total cover the operation.
Raw progress and stopping-heading lookahead count toward extent. Projection uses
bounded256-unit chunks, whitespace/surrogate carry and pre-admission quotas. These
are bounded algorithmic units, not physical CPU or hard-real-time guarantees.

V1 has **error-only overflow**: no clipped prefix, streaming, retry or resume state.
Any later malformed native context, unmatched target, abort, deadline, quota or
serialization failure withholds all provisional prose. The cursor and collector
are released on every outcome. The API performs no file/network IO and has no
capture overload, CLI/index activation or exported traversal/callback API.

## Actual Validation

September 8, 2026,06:06:57.731135543–06:07:05.089920787Z:
**1732passed,0failed,0pending in exactly seven native test files**, including
217new section cases and all1515prior assertions. No full/near-full suite runs.
New coverage includes strict identity/anchor admission, native boundaries,
omissions/raw modes, Unicode, exact budgets, late failures/cancellation and finite
inactive discovery call/counter assertions. Existing test bytes remain unchanged.

Build, seven-file strict checking and scoped Biome pass in isolated round02.
Round01 build/strict pass but three test-only lint findings fail; that snapshot
and all logs are preserved. Equivalent namespace/template fixes change no fixture
values or runtime behavior. No native01 run occurs. Only format01 approval review
times out before execution; its one identical retry is authorized. Other feature
validation approvals pass first try.

Independent runtime/test reviews find no actionable defect. The test handoff's
separator count is corrected to21, with no fixture removed. Harness review fixes
ignored final input-check failures and discarded child diagnostics; a follow-up
requires historical test digests instead of comparing two mutable snapshots.
Those original reviews remain intact. Native child/input-check/aggregate statuses
are all0; retained output and no-clobber handling are not atomic-publication claims.

Audit at06:09:00.542Z passes2717current inputs,79prior-scanner artifacts,
92raw-core artifacts,640source10 artifacts and3refinement artifacts. All1515prior
ordered names and six root/historical/new-snapshot test hashes agree. The isolated
manifest gains only the new test; two pre-existing pending entries stay excluded.

Evidence: `node_modules/.cache/native-validation/native-source-sections/`.
Native result SHA-256:
`959b6f5f7b82d743a9ba9cb8ae9abd637fff6e9bc72fefb571f81690355fc9ee`.
Audit SHA-256:
`897d29f288b7e9790f2cb915f26a71d88c3a9d1bf3a86a4ca7e3f77be72f2e3c`.
All200files in `FINAL-SHA256SUMS` pass the final frozen inventory check.
Ledger SHA-256:
`6368738b33a48be287bb3a0777885248faf0d971625c2ddf8729ea280f391d77`.
Audit log: `/tmp/native-source-sections-final-audit.log`.

## Outstanding Gates

No real section prose or capture replay is validated by this feature. Source10's
230candidate outline remains separate evidence; its base64 stays opaque and its
historical replay-readiness flag remains false. Next is an exact tested-engine
freeze, one-target native byte-validation/section operation, bounded controls and
separate authorization. Omitted content may prevent answering a privacy question.
Current normative privacy and provider/vault/device/page/consent acceptance remain
pending; blocked research stays unresolved and denied gates stay closed. The
original browser improvement goal continues.
