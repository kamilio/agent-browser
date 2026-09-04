# Native editable selection highlighting

Mixed-node continuation: EDITABLE-SELECTION-MIXED.md now supports bounded text
endpoints across multiple editable source nodes, with intermediate protection
checks and fresh native evidence. The original same-text checkpoint below retains
its original captures/counts; element/control endpoints and full visual editing
remain open.

September 4, 2026. Noncollapsed shared selections can now paint a bounded native
background inside one focused editable text node. This composes with native
Shift+Arrow, replacement typing, paragraph editing and caret painting; it does not
introduce a second Range owner, runtime dependency or final screenshot overlay.

## Supported subset

Both endpoints must belong to the same connected text node inside the actual
focused editable root. Hidden, inert, protected, control and unfocused selections
are skipped. Existing Range geometry must establish the source interval, and each
selected glyph must fit the returned rectangles. Missing or ambiguous evidence
fails closed rather than guessing coordinates.

The background is opaque native pale blue, RGB (179,215,255). Source text color
is unchanged; this is not CSS ::selection or a universal contrast guarantee.
Each selected glyph's advance and font-height rectangle paints immediately before
that glyph. Spaces, tabs and transparent ink can therefore have a background,
while later opaque content covers it normally. Partial UTF-16 surrogate selection
covers its whole mapped glyph. Zero-advance breaks do not invent a highlight area.
No new glyph, line, persistent cache or source mutation is introduced.

Prepared rasterization reads current selection state on every paint. A collapsed
selection skips highlight geometry entirely and leaves the independent caret
path active. Crops and fixed/root-scroll projection use the existing layout path.

## Resource and evidence boundaries

Mapping allows 250,000 work units, including a reserved Range geometry allowance
of at most 200,000, with depth 256, 4,096 glyphs and 1,024 rectangles. Painting
allows at most one million clipped pixel writes and also charges the existing
raster budget. These are hard limits, not elapsed-time or process-memory claims.
Mapping failure discards all anchors. Reaching a paint-side limit can leave an
already-painted prefix; exhausting the raster budget uses its existing error.

paintedSelectionGlyphs counts paint operations, not final visibility.
selectionPixels counts clipped pixel-center writes, not distinct changed pixels.
selectionWork includes local work plus the reserved geometry cap;
selectionGeometryWork is that reservation, not a measured internal operation count.
The later-cover fixture deliberately reports painting with zero visible blue.

Mixed-node and element-gap selection, input/textarea selection, bidi/shaping,
ambiguous wrapping/affinity, break-only backgrounds, full visual navigation,
selection events, CSS selection styling, IME and general rich editing remain open.

## Integrated native validation

The worker supplies 31 tests. Parent adds an actual-host integration case covering
Shift+Arrow selection, canceled input, replacement, terminal Enter and fixed crop
invariance across root scrolling. The old caret-only noncollapsed assertion now
expects zero carets and bounded highlight paint, then verifies that blur restores
the exact original pixels. It is not removed or weakened to avoid a regression.

Focused validation passes 209 tests / ten files in both working and isolated trees.
Both project typechecks and builds, strict checks of three tests, five-file Biome
and raster format checks pass. The existing raster parameter-assignment lint
diagnostic is not folded into this feature. Explicit native suites pass 11,007
tests / 326 isolated files. Working validation reports 12,138 passes and the same
fifteen pending failures / 348 files: thirteen positioning assertions in six extra
pending test files, one pending command-capability assertion, and the preserved
Window-onload assertion. The working manifest has the same 22 extra uncommitted
test files; none is selectively excluded or bundled into this commit.

All ten fresh module PNGs were visually inspected: collapsed caret, native shift
selection, spaces/multiline, crop, replacement, relative before/after scroll,
fixed before/after scroll and later opaque cover. The first five PNG sizes are
3,885 / 4,125 / 4,040 / 1,514 / 3,863 bytes. Their visible blue counts are
0 / 800 / 2,200 / 1,516 / 0, while actual highlight writes are
0 / 1,152 / 3,072 / 2,048 / 0. The two fixed frames are byte-identical at 2,947
bytes; relative content moves with root scroll. The covered image has zero visible
blue despite seven glyph paint operations and 1,344 writes.

An independent eleven-phase actual native-host showcase is generated on both
the previous terminal-caret archive and the integrated selection archive. It
combines rich paragraph merging, plaintext edits, native file selection,
double-click, root scroll and canceled defaults. DOM, Range geometry, file
metadata, click counts and upload reservations remain identical. Only selected
and selected-canceled frames differ: 740 pixels each, all inside the selected
Range rectangle. Both paint five glyphs with 960 writes and reserve 199,996
geometry work units. Raster-work increases equal those writes exactly; all other
nine frames are pixel-identical, with no highlight geometry reservation. Before
and after selection, canceled selection, replacement and terminal-after-replace
frames were visually inspected. Screenshot metrics come from the actual exported
host artifact, not a second renderer.

The initial showcase attempt hit the existing eight-artifact quota; its partial
outputs are preserved. The v2 fixture deletes each owned artifact after export
through the native artifact-delete command and verifies an empty artifact list.
No quota was raised. Transport and upload bytes are injected native fixtures,
not evidence of a socket, real service process, website or guest runtime.

## Reproduction and retained history

scripts/capture-editable-selection.ts writes the module fixture into a new
exclusive directory. Fresh logs/captures use editable-selection-integration and
browser-sprint-before/after-selection-v2 prefixes under
node_modules/.cache/native-validation. browser-sprint-selection-comparison.json
records exact pixel comparisons. The integrated archive is
editable-selection-integrated.tAl6cr; the independent before archive is
caret-break-integrated.FBuGrJ.

Original worker evidence remains in parallel-editable-selection, including
EDITABLE-SELECTION-HANDOFF.md, and at
/tmp/editable-selection-capture-9751201-v2-2026-09-04. Its original full run's
10,964 passes and superseded caret assertion failure remain historical, not
relabeled as the current combined result. Earlier caret-only PNGs and counts
remain unchanged. EDITABLE-CARET.md and EDITABLE-CARET-BREAKS.md describe those
separate checkpoints.

No SafeJS, live-site, socket, real TTY/PTY or real service-process probe ran for
this feature. Native success does not close those gates or the original full
browser/playground outcome retained in TASKS.md.
