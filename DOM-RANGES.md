# Native live Range and Selection

September 4, 2026. This checkpoint integrates the parallel native Range/Selection
delivery with active-page document, Window and unqualified getSelection bindings.
It is a partial DOM implementation with native host-object fixtures, not released
SafeJS, live-site, clipboard or visual-selection acceptance evidence.

## Supported surface

Document.createRange publishes guarded live ranges: boundary containers/offsets,
collapsed/common ancestor, setters and before/after variants, selectNode and
selectNodeContents, collapse, cloneRange, comparisons, containment/intersection,
toString and legacy detach. cloneContents/extractContents/deleteContents preserve
partial ancestor wrappers; fully extracted nodes preserve their identities.
Doctype extraction/cloning rejection happens before source mutation.

Each native document has one shared selection owner. Document.getSelection,
window.getSelection and the unqualified global function expose the same binding
object. Auxiliary/inert and template-owner documents return null while retaining
createRange support. A native-created selected range is published lazily, not
copied into another selection owner. addRange retains its range by reference;
getRangeAt preserves that reference until an operation replaces the selection.

Selection supports anchor/focus, direction/type/collapse state, single-range
add/remove/clear, collapse/setPosition/endpoints, extend, setBaseAndExtent,
selectAllChildren, deleteFromDocument, containsNode and text stringification.
Foreign/forged capabilities, reentrant publication and use after binding/document
close reject. Closing one binding does not close the native document's owner.
Primitive numeric conversion is bounded; object/symbol/bigint coercion is not
implemented. Live native registrations use weak references and a 4,096 limit.

Published CharacterData edit methods use interval-aware replacement and split
helpers. Supported tree mutations adjust registered boundaries, and direct range
changes remain visible through the selection. Native editors should use the
same domRangeOwner helpers instead of maintaining unrelated numeric selections.

## Evidence

The worker delivered 39 tests across three explicit native files. Parent adds
five page-binding tests for shared Window/global/document identity, native edit
reflection, auxiliary documents, foreign ranges and retained-capability teardown.
The persistent page-realm fixture's expected global list now includes getSelection.

Focused checks pass 448 / sixteen isolated files. Working checks report 453 passes
and the preexisting Window-onload assertion failure / sixteen files; that file is
unchanged. Typecheck/build, strict new-test checks and seven-file scoped lint pass.
Authorized full native runs pass 9,809 / 283 isolated files. Working validation
reports 10,954 passes and the unchanged pending Window-onload assertion failure
/ 305 files. Its source still matches the preexisting backup. Logs use the
`ranges-integration-*` prefix under node_modules/.cache/native-validation.
The original worker handoff remains at /tmp/dom-ranges-integration.md, with its
original narrower validation results intact.

## Explicit limitations

Current lifetime continuation: `EDITABLE-RANGE-LIFETIME.md` releases private
synchronous collapse ranges used by native deletion/extraction and editing.
Public ranges remain live and detach remains a no-op; the original quota is not
raised and original checkpoint evidence is not rewritten.

Current highlight continuation: `EDITABLE-SELECTION.md` paints bounded same-text
editable selection and composes with native editing and terminal caret painting.
This does not change Range ownership or close mixed-node/control, general visual
editing or external/runtime gates. Original checkpoint evidence remains unchanged.

Current painting continuation: `EDITABLE-CARET.md` supports bounded focused
glyph-edge carets without creating a new selection owner. Original Range evidence
below is not rewritten as a painting run; highlights and full visual editing
remain open.

Current continuation: `RANGE-GEOMETRY.md` supplies bounded shared-layout Range
rectangles, including preserved source breaks, with guarded immutable publication.
The geometry item in the original checkpoint below is superseded only for that
documented subset. Later keyboard/paragraph/merge documents cover native editing;
full geometry, caret/highlight painting and external/runtime gates remain open.

Raw native replaceData/splitText/normalize lack the detailed interval metadata
used by the owner helpers; generic character-data notifications use whole-value
adjustment, and normalize does not transfer merged endpoints to the survivor.
Mutation callbacks occur after native mutation; arbitrary reentrant collectors
are not evidence of standard pre-mutation timing. Resource exhaustion or external
collector effects can interrupt content operations without a transaction rollback.

insertNode, surroundContents, contextual fragments, Range/Selection constructors
and prototype graphs, geometry, shadow/composed ranges, multiple ranges,
Selection.modify, selectionchange/selectstart scheduling, rendered-text selection,
input-control selection integration and caret/highlight painting remain open.
Rich keyboard editing is a separate in-progress lane, not part of this checkpoint.
No absent method is advertised as a successful stub. No gated probe ran.

Primary references: the WHATWG DOM Standard's ranges, replacement and split-text
algorithms, and the W3C Selection API's shared-reference and boundary rules.
The full browser outcome and original acceptance gates remain in TASKS.md.
