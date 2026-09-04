# Native mixed-node editable selection

September 4, 2026. Native highlighting now follows a shared Range whose text
endpoints are in different nodes inside one focused editable root. This extends
EDITABLE-SELECTION.md without changing raster paint order, Range geometry, editing
mutation rules, dependencies or resource ceilings.

## Exact source mapping

Both endpoint ancestor chains must reach the actual focused, connected editable
root. A bounded source-order walk collects partial endpoint intervals and complete
intermediate text intervals. Intermediate elements, including empty ones, are
checked for protected controls/noneditable content, inertness and hidden state.
Any selected protected or hidden crossing skips the entire highlight; unrelated
siblings outside the selected DOM interval do not block painting.

One existing Range geometry query validates the mapped glyphs. Only actual source
glyph intervals paint, not selected element-box backgrounds. Source-specific
advances, font heights and ink colors remain intact across inline and block
contexts. Spaces and tabs can have backgrounds, source breaks do not invent a
region, and partial surrogate intervals select whole mapped glyphs. Normalized
backward ranges paint identically while preserving native selection direction.

No temporary Range, observer, persistent selection cache or final overlay is
created. Prepared paints read the current selection; existing stale-source layout
rejection remains intact. Mapping and paint use the previous 250,000-work,
200,000-reserved-geometry, depth-256, 4,096-glyph, 1,024-rectangle and one-million
pixel ceilings. Traversal work is charged; exhausted mapping drops all anchors.
Paint metrics retain their existing operation-versus-final-visibility distinction.

Element/container endpoints, general document selection, native input/textarea
selection, CSS ::selection, pointer-drag selection, bidi/shaping, ambiguous source
mapping and full visual editing remain open. In particular, this does not imply
that every container-based select-all range has a painted highlight.

## Native integration evidence

The worker supplies 39 tests. Parent retains the old element-gap/detached checks
and changes only the superseded mixed-node rejection into four-glyph painting
with zero carets. One new actual-host case clicks to focus, extends selection with
two Shift+Arrow commands across b/i text nodes, cancels replacement, scrolls the
fixed editor and replaces the selected text. Source element/text identities and
the selected Range survive replacement; highlights collapse back to the caret.
This also composes with the scoped editing lifetimes in EDITABLE-RANGE-LIFETIME.md.

The quick working check passes 84 tests / four files. Focused runs pass 271 tests
/ ten files in both trees. Both project typechecks/builds, strict checks of three
tests and five-file Biome pass. Explicit native suites pass 11,056 tests / 328
isolated files; working validation reports 12,187 passes with the same fifteen
pending failures / 350 files. The two 350-entry manifests are identical; the same
22 preexisting uncommitted test files are absent from the archive, not removed
from its allowlist. None of those pending source/assertion changes is bundled.

The staging preservation check caught different placement of the new host test in
the isolated copy. Its pre-correction file and initial logs are preserved. After
matching the working test order exactly, the five-case file passes again and a
fresh final isolated full run passes all 11,056 tests. Final evidence uses the
mixed-selection-integration-final-native-isolated log, not a status-only inference.

All twelve fresh module PNGs were visually inspected. Native forward/backward
selection frames are byte-identical at 2,524 bytes: two glyph operations, 384
pixel writes and 288 visible blue pixels. Widened prepared selection and its crop
paint seven glyphs with 1,344 / 1,248 writes. Replacement returns to a caret and
zero highlighted glyphs. Intermediate mixed-font/space and multiline fixtures
paint seven/four glyphs with 2,544/768 writes. Protected-intermediate selection
has zero paint; later opaque cover hides all blue despite four operations and
768 writes. Mixed flow/fixed content keeps the fixed selection visible after
scroll while the flow glyph clips out.

An independent eight-phase actual native-host fixture is generated on both the
previous committed source and the integrated archive. DOM, selection text/direction,
Range/element geometry and scroll remain identical. Only selected, backward,
canceled and scrolled frames change: 268 pixels each, all within the selected
Range. Each paints two glyphs and 384 writes; raster-work increases equal exactly
those writes. selectionWork is 200,217, including 199,987 reserved geometry units,
not measured elapsed time or exact internal Range work. The other four PNGs are
byte-identical. Forward, backward and canceled selected frames also remain
byte-identical to one another. Replacement restores the caret, and protected
crossing skips geometry/highlights entirely.

The parent inspected the host before/after selected frames and updated scrolled,
replacement and protected frames. An apparent lower-edge overlap was investigated
independently rather than accepted from visual similarity. Both original PNGs
retain all 278 opaque bottom-border pixels at y=187 and all 572 opaque outline
pixels at y=190–191. The parent independently rechecked these colors. Visible flow
text occupies the unfilled outline-offset gap at y=188–189 and space below, not
the opaque border. Bare and explicit markup both have one html formatting root.
No production stacking/parser fix or fixture rewrite is justified by this case.
The independent 19-test pixel/order/hit delivery remains recorded separately in
/tmp/positioned-root-stacking-delivery-2026-09-04.json; those tests are not counted
in this feature's suite. This is not full CSS or external/runtime acceptance.

## Reproduction and retained history

scripts/capture-editable-selection-mixed.ts writes exclusive module image files.
Fresh evidence uses mixed-selection-integration-captures and mixed-selection-host
prefixes under node_modules/.cache/native-validation. The integrated archive is
mixed-selection-integrated.5YWVt0; the independent before source is
temporary-ranges-integrated.qNjTkx. Host exports use artifact-read/delete and check
an empty artifact list after every frame; no artifact quota is raised.

The worker's original 11,007-pass baseline and 11,045-pass/one-superseded-assertion
follow-up remain separate in its original logs. Its patch, twelve original
captures and delivery record remain at the paths in
/tmp/editable-selection-mixed-delivery-2026-09-04.json and the
parallel-editable-selection-mixed archive. Earlier same-text measurements and
images in EDITABLE-SELECTION.md remain historical, not relabeled as this run.

No SafeJS, live-site, socket, real TTY/PTY or service-process probe ran. TASKS.md
retains the original complete browser/playground objective and its open gates.
