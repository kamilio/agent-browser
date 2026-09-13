# Native dialog display defaults

September 13, 2026. HTML dialog elements without the boolean open attribute
now default to display:none; open HTML dialogs default to block. This corrects
the native user-agent display baseline, not modal/top-layer rendering.

## Behavior

- Boolean attribute presence matters: open="false" is still an open attribute.
- Closed dialog descendants remain queryable DOM nodes, but no longer appear
  in native formatting or visible snapshots under the default cascade.
- Adding/removing open, moving children and author style changes invalidate
  cached visibility/geometry through existing document revision handling.
- Author declarations, including inline/important and CSS-wide display values,
  retain normal cascade behavior. This is not an unoverrideable hidden flag.
- Foreign SVG/MathML nodes named dialog do not receive HTML defaults.
- Visible/open dialog layout remains explicitly deferred. No show/showModal,
  close algorithm, modal focus trap, backdrop or top-layer support is implied.

The legacy special-element rendering test now uses an explicitly open dialog,
so it continues to test unsupported visible-dialog layout rather than expecting
a default-closed dialog to create a box.

## Evidence and tests

The new23-case native regression suite first runs on unchanged audited17840
production source:12pass/11fail. Failures establish the missing defaults and
their visibility, formatting and geometry effects; they are not an assertion
that all dialog behavior was broken.

The corrected focused run passes373tests/0failures/0exclusions across eight
explicit manifest suites, including all23 new cases. Build, formatting, source
immutability, complete suite selection and seven strict roots pass. The snapshot
suite runs behaviorally but retains its historical strict-root omission: its
pre-existing heterogeneous attribute-record typing error is not changed here.
The first fixed attempt stopped on that same strict error before native tests;
the failed lane is preserved rather than reported as a code regression.

Focused evidence:
`node_modules/.cache/native-validation/fieldset-dialog-work-september13/baseline00/`
and `fixed01/` under the same parent. The new manifest entry is
src/dialog-display.test.ts; unrelated uncommitted source/manifest work is not
included in the validated snapshots.

The clean broad snapshot passes17863tests/0failures with two unchanged native
exclusions, across345 selected suites and344 strict roots. The723-entry manifest
leaves378 entries outside that broad run. The total-host-object ceiling and
unsupported-display/advisory-media exclusions remain open. Build/strict/format,
1249 unchanged tracked inputs and source immutability are audited;1253 source
and2080 compiled files. Root dist was not rebuilt. An initial broad config import
retained a stale722-entry assertion and stopped before execution; that setup
failure is preserved separately from the successful round01.

Audit: `node_modules/.cache/native-validation/native-dialog-display-september13-round01/AUDIT.json`.

## Real website and standards context

The captured Wikipedia portal contains an actual dialog.frb-iad-dialog without
open. Before this change it is incorrectly displayed inline and becomes one
of three deferred formatting subtrees. The fieldset search owner is another,
independent deferred subtree; fixing the dialog does not implement fieldsets.

Two separate offline native replays confirm the change on unchanged portal
bytes: audited17840 at06:55:10.956–06:55:11.254 and audited17863 at06:58:07.653–
06:58:07.943UTC. The dialog remains queryable with the same attributes but its
formatting node disappears. Deferred subtrees3→2 and boxes2208→2207; all issue
counts except element-layout-not-supported remain identical. The search input
still lacks fieldset formatting ownership, so geometry stays unsupported. No
HTTP, actions or raster are performed. Evidence:
`node_modules/.cache/native-validation/native-wikipedia-dialog-display-september13/RESULT.json`.

These operation counts do not establish comparative browser speed. Raw native
visibility is distinct from the research reader's deliberate inert projection;
its dialog-to-div fragment-retention tests remain passing.

One native GET of the WHATWG rendering chapter on September13,05:51:45.745–
05:51:46.114UTC returns200 and supplies the source context. One offline native
reader load and three queries retain6767 excerpt code units. The captured UA
stylesheet distinguishes closed-dialog display from ordinary/modal/backdrop
rules; open/modal geometry is not established by a closed-dialog default.

The same source confirms why fieldset/legend cannot safely become ordinary div
wrappers: their formatting content box, used display, padding transfer, intrinsic
sizing and legend/border behavior require explicit implementation. That work
remains open rather than weakening the existing deferred-element guard.

Standards evidence:
`node_modules/.cache/native-validation/native-whatwg-rendering-september13/RESULT.md`
and IMPLEMENTER-NOTE.md / EXCERPTS.json. This is bounded source reading, not
browser conformance or rendered-diagram validation. It uses the native browser
only, without scripts, external assets, credentials, devices or real TTY.
