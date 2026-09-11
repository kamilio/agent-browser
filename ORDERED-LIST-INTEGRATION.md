# Native ordered-list integration — September 11, 2026

## Scope

The native engine now generates real decimal and decimal-leading-zero markers.
HTML ordered lists default to decimal. Numbering uses rendered list items in tree
order, bounded start/value parsing, reversed direction and independent rendered
owners. Markerless items still advance the sequence; nonrendered items do not.
Nested unordered lists retain disc defaults. Alphabetic/Roman hints and arbitrary
CSS counters remain explicit unsupported boundaries, not decimal substitutes.

Generated labels remain formatting metadata, not DOM text. Inside labels use their
actual glyph advance; outside labels preserve the principal box and baseline while
extending for additional digits. Painting uses the existing Agent Mono bitmap
glyphs. Formatting text, box, work and raster limits remain enforced. No runtime
dependency, global budget increase or weakened actionability guard is introduced.

Implementation and reference details are in `NUMERIC-MARKERS.md` and
`ORDERED-LISTS-REFERENCE.md`. Documentation lookups are not website test coverage.

## Targeted evidence

The clean pre-integration baseline retained in
`node_modules/.cache/native-validation/native-ordered-list-work-september11/baseline/`
ran at 18:04:09.463–18:04:11.378 UTC: 128 passed and eight new integration
regressions failed. The fixed01 lane ran at 18:08:56.626–18:09:00.795 UTC:
338 passed, zero failed, with unchanged inputs throughout both executions.

The independent numeric primitive lane has 115 passing tests, including 68 numeric
marker cases and unchanged symbolic pixel/work pins. Parent verification checked
its receipt ledger and all four returned source/document pins. An independent
source-only review found no concrete supported-scope regression; the parent checked
all twelve final inspected source/reference hashes. That review executed no tests
and is not a separate browser-validation result.

The added BrowserSession regression uses a fake transport and real native document
loading, pointer events and navigation. Its link sits beside ordinal ten in an ol
starting at nine; assertions cover event order, destination, request count, commit
state and stale-reference rejection. It makes no wire request.

## Broader gate

The candidate is isolated from pre-existing uncommitted work: clean `4ad75d8` plus
eleven owned source/test paths and two explicit native-manifest entries. The
candidate manifest contains 558 entries, not the 560-entry dirty working manifest.
Only the HTML list-default edits in `src/styles.ts` are included.

Round01 build and strict compilation passed, then formatting stopped on one quote
style difference in the new navigation test. That failed attempt is retained at
`node_modules/.cache/native-validation/native-ordered-list-integration-september11-round01/`.
The quote-only correction passed a fresh round02 gate at
18:16:53.200–18:19:03.743 UTC: build, strict compilation, formatting and
**9,188 native tests passed; zero failed and two existing exclusions remained**.
All 153 selected test files belong to the explicit manifest; strict checking used
152 roots. The new genuine ordered-list link-navigation test passed.

The parent audit at 18:19:32.700 UTC verified 1,015 unchanged tracked inputs,
the eleven owned paths, the isolated manifest, and stable before/after source
inventories. The snapshot has 1,027 source/input files and 1,836 compiled files.
The unchanged dirty style edits and two unrelated manifest additions are excluded.

Evidence is retained at
`node_modules/.cache/native-validation/native-ordered-list-integration-september11-round02/`.
SHA-256 pins:

| Artifact | SHA-256 |
| --- | --- |
| Source inventory | `e505785cb68f8dfd308fde286cb03432b399200fb99c6709ede8414ab3d1a8fd` |
| Compiled inventory | `d94d18213ade7f115c590b583a4f42d157d9e2f64c04606077f8fc49344da4ea` |
| Native results | `0e6e087938496c10e7b87cea15cd3d0a15e463d88de2daa73d84dc89180bf440` |
| Gate summary | `5e2c6c81d583f9f302c2de2d6c9e7db4cc02e09ea86a1a6d3d0eb8ae23b63681` |

Two previously documented exclusions remain unchanged: the separate total host-
object ceiling assertion and the stale Grid unsupported-display expectation.
Strict checking continues to omit `src/snapshot.test.ts`. These are not fixed by
numeric-marker support.

## Website boundary

The preceding Test Pages replay found three ordered-marker warnings, alongside
table-row-group, clear, overflow, presentation and unsupported CSS limitations.
This change does not remove those other guards. A new unchanged-capture replay is
a separate acceptance step; native fixture success is not a website interaction
pass. Attempted-host count remains 61, not 61 working websites.
