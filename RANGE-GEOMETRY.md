# Bounded native Range geometry

September 4, 2026. Native Range client rectangles now use the existing shared
layout and source-indexed glyphs. Guarded page Range objects publish
getClientRects/getBoundingClientRect with immutable snapshots. This is a bounded
horizontal LTR implementation, not full CSSOM View or released-runtime acceptance.

## Geometry and ownership

DOM boundary order, not allocation IDs, determines selected content. Selected
elements contribute existing border rectangles; selected and partially selected
text contributes per-line glyph advance/font-metric rectangles. Partial surrogate
intervals include the complete glyph. Text is not remeasured by another renderer.
Bounding rectangles retain the empty, degenerate and union cases. Root scrolling
projects flow/absolute rectangles; fixed descendants keep viewport coordinates.

Empty, inert, disconnected and genuinely boxless ranges have empty geometry.
Visibility-hidden content retains layout geometry. Unsupported source mappings
and layouts reject rather than fabricate successful zero rectangles. Shared live
Range/Selection mutation ownership is unchanged; later edits/reflow do not mutate
previously returned snapshots. Saved getters, methods, indexed lists and toJSON
are revoked with their publication/document owners.

Limits are 2,000,000 work units, 50,000 source nodes, depth 256 and 4,096 result
rectangles; native options can only lower these ceilings. Script Range geometry
publication has independent limits of 16,384 host objects and 4,096 list items.
Other layout/runtime owners retain their own limits. Failed or reentrant
publication does not authorize stale capabilities or unlimited retries.

## Preserved source breaks

The shared text layout retains frozen sourceBreak metadata for LF, CR, CRLF and
FF in pre/pre-wrap/pre-line: exact source references and UTF-16 spans, the existing
break position/font metrics, and the calculated following-line anchor. Split-node
CRLF retains both spans. Consecutive and terminal preserved breaks therefore have
deterministic geometry without introducing painted glyphs or fabricated line boxes.
The terminal strut position was already calculated; retaining it does not change
layout height. New metadata work is charged, not described as free or unchanged.

This supports line-crossing text ranges and collapsed boundaries after terminal
breaks, including supported relative/absolute/fixed contexts. Conflicting split
CRLF owners and ambiguous soft-wrap affinities still reject. A br element is not
a source-text newline. Collapsed element gaps, shaping/bidi, transforms, general
Unicode caret affinity, selection highlights and painted carets remain separate.

## Integrated native evidence

The two worker deliveries add 59 tests. Parent adds three actual native-host
editing/geometry cases for plaintext Enter/typing, fixed-versus-flow root scroll,
and rich paragraph split/merge with Range identity and immutable old rectangles.
The flex regression normalizes only cross-document source-break references using
its existing sourcePath scheme; all metadata/geometry comparisons are retained.
Both focused runs pass 158 tests / seven files. Working typecheck, three builds
(working, integrated archive and before-break archive), strict checks of five test
files and eight-file Biome checks pass.

Final explicit native suites pass 10,900 tests / 321 isolated files. Working
validation reports 12,031 passes and the same fifteen pending failures across
343 files: thirteen obsolete positioning expectations, one pending host capability
assertion and the unchanged Window-onload assertion. The same 22 preexisting
uncommitted test files are absent from the HEAD archive, not excluded from the
working manifest. No pending work was bundled into this feature.

The fresh 27-fixture comparison independently builds the current integrated
archive and its before-break snapshot. All prior layout geometry and raster hashes
are identical; comparison excludes only the new sourceBreak metadata and reported
work counters. Metadata/work remain recorded separately. Cases cover preserved
modes and separators, partial/blank/terminal/astral/split-node text, alignment,
relative/absolute/fixed positioning, flex, collapsed modes, soft wrapping and br.
At 40px root scroll the flow terminal caret moves 40px while fixed Range rectangles
remain identical. Two updated 320-by-180 native PNGs were visually inspected and
are byte-identical to their independently generated baselines. They show text,
not a painted caret or selection overlay.

All new logs, comparison script/JSON and captures use the
range-geometry-integration prefix under node_modules/.cache/native-validation.
The integrated archive is range-geometry-integrated.GHd8sp; the before-break
archive is range-geometry-before-breaks.d9Qiun. Original worker handoffs, patches,
counts, captures and their bases remain unchanged in parallel-range-geometry,
parallel-range-break-mapping and their documented /tmp paths. Earlier worker
overlays were diagnostics, not native caret painting or a new parent live run.

Primary design reference: W3C CSSOM View Module, September 16, 2025 Working Draft,
section 9, Range client rectangles and bounding rectangles. Parent reviewed that
published specification alongside the source; this subset does not claim its full
conformance. No dependency, live website, socket, real TTY/PTY or SafeJS probe was
added or run. TASKS.md retains the original browser outcome and outstanding gates.
