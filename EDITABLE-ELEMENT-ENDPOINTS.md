# Editable element-boundary painting

Later empty-block continuation: `EDITABLE-EMPTY-CARETS.md` adds shared-font-strut
carets for empty focused block hosts and eligible empty direct p/div paragraphs,
without changing DOM, layout or public Range rectangles. This supersedes the
historical empty-editor painting limitation, not general container caret geometry.

Later September 4 update: `EDITABLE-PARAGRAPH-CARETS.md` extends the exact caret
profile to host outer slots through one direct p/div paragraph and that paragraph's
own outer slots. Shared source geometry still supplies the private text edge,
without changing public collapsed element Range geometry. The original captures,
counts and narrower profile below remain historical where superseded.

September 4, 2026 native continuation. This connects native select-all to visible
glyph highlights and a narrowly supported collapsed host-edge caret. It changes
neither public Range endpoints nor keyboard editing semantics, and does not
establish full browser editing or released-runtime compatibility.

## Selection highlights

The focused editable selection profile now accepts text and element endpoints.
Element offsets are child slots, not text offsets. Charged source-order traversal
starts and stops at those slots, preserving partial text intersections and fully
selected intervening text. Endpoint elements themselves and their ancestor paths
receive the same editable/protected/inert/hidden checks as selected descendants.
Protected selected nodes, including empty ones, suppress the entire highlight;
siblings outside the interval do not become selected by accident.

The renderer still uses the selected live Range's shared geometry, maps only
actual source glyphs and paints immediately before each source glyph. A selected
element rectangle is not filled wholesale. Background color, original text ink,
paint order, scrolling, clipping and existing mapping/raster caps are unchanged.
No new Range, persistent highlight cache or final raster overlay is introduced
for noncollapsed selection. Native Control+A and Meta+A now have visible results.

Detached selection requests still cannot install disconnected endpoints. If a
connected selection already exists, an ignored detached request leaves it intact.
Removing a selected subtree still repairs its live Range; the remaining connected
text can now remain highlighted when the repaired endpoint is an element slot.
Old tests that conflated unsupported element painting with absent selection are
updated to check those actual identities and repaired boundaries.

## Collapsed host-edge carets

Control+A followed by ArrowLeft or ArrowRight correctly collapses the existing
Range to the editing host's first or last child slot. The public collapsed
element Range still has no rectangles in current Range geometry. This checkpoint
does not change that public geometry or secretly rewrite the Range into text.

The caret renderer recognizes only a focused block editing host's outer boundary
with an exact first/last-child chain ending in nonempty text. Every intervening
wrapper must be static, nonfloating inline content with zero margins/padding and
no border styles. It does not search past empty, hidden or unsupported leaves.
Existing source eligibility and exact glyph-edge checks remain mandatory.

A scoped private Range obtains the equivalent text edge from shared geometry,
then is unregistered through `withTemporaryRange`, including exceptions. This
must produce one unambiguous zero-width, positive-height source rectangle that
matches the supplied layout. Source color and the existing glyph/caret paint
order are reused. No guessed element edge or line height is substituted.

Interior slots, descendant containers, non-block hosts, empty editors/text,
comments or breaks at the outer edge, atomic/block/positioned/decorated wrappers,
ambiguous whitespace and unsupported shaping remain unsupported. The capability
reports `focused-block-host-outer-plain-inline-text-chain`, not general element
caret geometry. CSS selection styling, control selection/carets, pointer drag,
IME, bidi/shaping and full visual selection remain open.

## Native validation

Two new explicit test files add 90 cases; four actual BrowserCommandHost cases
cover Control/Meta select-all, cancellation, fixed/root-scroll invariance,
replacement and subsequent collapsed-container editing. The initial parent
merged run passes 169 / five files. Final focused validation passes 384 / thirteen
files in both the isolated archive and working tree. Both project type checks and
explicit `--outDir dist` builds pass, as do strict checking of five changed test
files and seven-file Biome. The same 357-entry manifest is retained in both trees;
22 preexisting uncommitted test files are absent from the archive, not excluded
from the manifest. No full-suite result is inferred from these focused checks.

The parent host baseline has four expected failures and five existing passes:
two absent select-all highlights and two absent collapsed host-edge carets.
The earlier selection-only baseline has two failures/five passes in both trees.
Worker caret baselines reproduce both absent carets; its final focused run passes
209 / five files. Held private-Range tests repeat cleanup 4,100 times per failure
case without relying on GC or raising the live-Range cap.

The selection worker was handed off before final validation: its expanded run
had 215 passes/five failures, including a crop fixture reusing document y=30 after
root scroll=80. The parent uses equivalent document y=110 and updates four old
capability/endpoint/removal expectations without suppressing tests. A detached
selection no-op is also checked explicitly. Original worker logs remain intact;
their partial pass is not relabeled as final integration success.

Parent artifacts use `element-selection-integration-*`,
`element-selection-host-*` and `element-caret-host-*` under
`node_modules/.cache/native-validation/`. The integration snapshot is
`element-selection-integrated.Dg6udG`, initially based on `9e5578a`; the independent
one-line cookie fixture signature commit does not alter this rendering slice.
Worker source deliveries are the preserved `parallel-editable-selection-elements`
and `parallel-caret-elements-0d9a2ae` archives. No historical capture is overwritten.

## Fresh native host captures

Nine selection phases preserve DOM, public Range geometry, direction, element
bounds and scroll state exactly between before/after runs. Selected, backward,
canceled, scrolled and restored phases each change 1,412 pixels inside the shared
Range bounds, with ten glyphs and 1,920 highlight writes. The other four frames
are byte-identical. Forward/backward/canceled frames match, as do the scrolled and
restored frames. Protected intermediate content correctly suppresses painting.

Six caret phases preserve the same public state and independently obtained text
edge geometry. The new left caret changes two pixels; right/canceled/scrolled
carets each change sixteen. Each performs sixteen raster writes; existing text
ink already occupies most of the left edge. Initial and replacement frames are
byte-identical. Public collapsed container geometry stays empty. A fresh six-frame
replay against the combined build is byte-, state- and paint-identical to the
caret-only integration capture.

Key selection, protected, scroll and left/right caret PNGs were visually inspected.
The previously audited unfilled outline-offset gap remains unchanged; it is not
a newly corrected stacking defect. Every screenshot artifact is deleted after
export and its live artifact list verified empty. Geometry-work fields include
reserved limits, not measured elapsed time or proof of full CSS conformance.

The full-manifest approval denial recorded by `FETCH-RESPONSE-BUDGETS.md` still
applies. No full suite, denied route fixture or broad filtered substitute is run
for this checkpoint. Both explicit manifests retain all entries. Native fixtures
and software PNG inspection do not authorize SafeJS, live-site, actual socket,
real TTY/PTY or service/process probes. No dependency or alternative engine.
