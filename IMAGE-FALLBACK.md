# Bounded native broken-image alternatives — September 11, 2026

## Implemented policy

`src/image-fallback.ts` recognizes HTML `img` elements only when all of these
conditions hold:

- The document is in `no-quirks` mode.
- `alt` is present and nonempty. Its value is literal text, not parsed markup;
  whitespace is handled by the existing text formatter, not trimmed here.
- A nonempty `src` has selected a nonempty native `currentSrc`. The native image
  state is `broken`, `complete` is true, natural dimensions are both zero, and
  no decoded image exists.
- There is no `srcset`, `crossorigin`, or `referrerpolicy` attribute, and the
  immediate HTML parent is not `picture`. These remain conservative selection
  boundaries, not assertions that such attributes normatively forbid fallback.

`src/formatting-tree.ts` supplies one formatting-only text child with the image's
reference, visibility, typography and paint. Existing non-replaced inline,
block, flow-root and atomic inline-block coordination then handles wrapping,
whitespace, sizing, edges, backgrounds, glyph rasterization and hit identity.
Supported display spellings are `inline`, `inline flow`, `block`, `block flow`,
`flow-root`, `block flow-root`, `inline-block` and `inline flow-root`.
The generated child consumes formatting depth, boxes, text-code-unit and work
budgets. Existing raster budgets also apply. Unsupported CSS still reports or
throws its existing diagnostics; this is not a diagnostic-suppression path.

There are no added DOM nodes, reparenting, image-control surrogate, mandatory
broken-image icon, fixed 300×150 fallback, or invented decoded pixels. Glyphs
retain the image owner reference; native pointer events bubble to the actual
ancestor link. A routed, in-memory `BrowserSession.click` regression navigates
to a second document through the visible alternative, not merely a fabricated
navigation result.

Loaded PNG/JPEG resources retain replaced geometry and pixels. Text painting
does not change broken state, natural dimensions, decoder rejection, shared
resources or error/load events. Native source/alt mutation invalidation remains
in force. `visibility:hidden` retains text geometry without ink/hits;
`display:none` creates no formatting nodes.

## Explicit boundaries and source choices

**Empty `alt` remains deferred**, including when width/height, padding or borders
are authored. No styled geometry is silently erased or claimed as supported.
Genuine zero-natural-size replaced support needs coordinated ratio handling:
the current replaced-size resolver rejects zero intrinsics, while
`src/intrinsic-widths.ts`, `src/flex-main.ts` and `src/flex-column.ts` divide by
intrinsic height or a derived ratio. Those changes exceed this worker's clean
scope. Neither the resolver nor those coordinators were modified.

Missing alternatives, empty/unselected resources, loading images, quirks and
limited-quirks documents, responsive/picture selection, and the excluded request
attributes retain existing boundaries. Other display models are not added by
this change. Existing `display:contents` handling of unusual elements is
unchanged. Native image-owner failures are not caught and reclassified as text.

The primary-source extraction in `BROKEN-IMAGE-SOURCE.md` records WHATWG HTML
rendering §§15.4.2–15.4.3: first-applicable branching, stable text as non-replaced
phrasing content, and stable no-content as replaced with zero natural dimensions
whose authored styles still matter. It also records that the full represented-
content/current-pending algorithms and chapter-wide prelude were not extracted.
Treating the native terminal broken state plus present nonempty alternative as
stable text is this implementation's bounded policy, not a complete normative
mapping. No full HTML image lifecycle, new dimension-hint/aspect-ratio algorithm,
SVG decoder, cross-browser equivalence or chapter-wide conformance is claimed.

## Synthetic validation and retained evidence

Lane: `node_modules/.cache/native-validation/image-fallback-worker-september11/`.
Snapshot baseline: `f74b7a1713ea7a4bf594c8cb62a49607da579cab`.
Only the owned `src/formatting-tree.ts`, `src/image-fallback.ts` and
`src/image-layout.test.ts` are overlaid on the clean archived source. The other
two selected suites remain archived and unchanged. The native manifest,
configuration, dependencies, session and networking implementations are not
edited or copied from unrelated dirty work.

Selected manifest suites: `src/image-layout.test.ts` (68 tests),
`src/formatting-tree.test.ts` (81), and `src/replaced-box.test.ts` (45).

- `baseline-red`: **154 passed / 6 failed**, before implementation. All six
  new display cases retain the original `element-layout-not-supported` evidence.
- `implementation-first`: **160 passed / 0 failed**.
- `regressions-first`: **191 passed / 2 failed**. The tests incorrectly selected
  the image-owned text child instead of its wrapper and required a semantic
  snapshot to stay identical after a click changed focus. Both failed artifacts
  remain; assertions were corrected, without an extra production change.
- `regressions-second` and `tests-final`: **194 passed / 0 failed**, including
  the additional actual session-navigation regression.
- Final tests on September 11, 2026: **16:18:09.054–16:18:12.626 UTC**;
  strict no-emit compilation **16:18:12.664–16:18:15.752 UTC**, no diagnostics;
  existing Biome format check **16:18:15.791–16:18:15.830 UTC**, exit zero.

Tests compare real glyph pixels and owner rectangles against equivalent native
text elements across whitespace and styled display cases. They cover authored
dimension hints versus CSS auto sizes, hidden/absent formatting, broken versus
pending resources, PNG/JPEG invariants, error/decode semantics, alt/source
transitions, explicit excluded predicates, CSS errors and resource limits.

The reused native guard and tool-child seccomp deny sockets; Vitest uses one
thread worker and the explicit three-file list. Execution has private HOME/TMP,
stripped environment, ignored stdin, a 120-second timeout with 5-second kill
grace, 6 MiB output/file caps, source-before/after inventories, and process-group
cleanup checks. `AUDIT.json` verifies baseline isolation and identical final
validated sources; `source-final.sha256` pins the three owned sources and this
document. Baseline and intermediate failures remain at their original paths.

## Python capture applicability is not a new live result

The parent reports 35 verified offline checks in
`native-python-image-predicates-september11-round02`: all three actual images
have present `alt="Python logo"`, no dimension attributes, computed auto/auto,
and no-quirks mode; e283/e759 are displayed/deferred, e103 is undisplayed without
formatting nodes; all are final broken/unsupported with zero decoded pixels.
These reported predicates match the nonempty-alternative policy. The synthetic
three-image fixture verifies the corresponding text/hidden/shared-resource
behavior, but does not replay or measure the actual captured document.

No metadata inspection, live retrieval, SafeJS, credentials, TTY/device or
network probe was run by this worker. Existing historical image reports remain
unchanged. Other Python CSS/layout barriers and full-page acceptance remain
separate; the parent owns broad native validation and any unchanged-site replay.
