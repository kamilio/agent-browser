# Native table-caption wrappers

Admitted captions now participate in real native layout instead of leaving the
table behind a caption-layout guard. An anonymous wrapper owns caption flow and
the table's transferred margins/relative offsets/float. The real table grid keeps
its DOM reference, border, padding, background, cells and row geometry.

## Ownership and sizing

- `tableGrid` identifies the real grid from its wrapper; `tableWrapper` points
  back, and `tableCaptions` retains actual caption IDs in source order.
- The wrapper has no DOM reference or painting. It contains top captions, the
  grid and bottom captions; captions retain their own box areas and descendants.
- Wrapper width equals the grid border-box width. Caption minimum outer widths
  constrain table sizing; caption maximum text width alone does not force a
  wider grid. Existing native table-column sizing remains in use.
- Table percentage width/padding uses the wrapper's original containing width;
  caption percentage width/padding uses the resulting wrapper width. The grid
  does not resolve its percentage width a second time against the wrapper.
- The wrapper's flow height includes captions; grid height and border painting
  do not. Normal, relatively positioned and floated wrappers use existing native
  coordinators, including following-flow and clear behavior.
- Captions reuse supported ordinary-block content alignment. Unsupported
  alignment remains an explicit diagnostic rather than silently becoming start.

The retained CSS22 source describes separate wrapper/grid ownership and property
distribution. Its CAPMIN/automatic-width recipe is explicitly non-normative;
the implementation does not claim that recipe is the only conforming algorithm.
Source and qualified interpretation:
`node_modules/.cache/native-validation/native-table-caption-source-september13/IMPLEMENTER-NOTE.md`.

## Geometry and bounded work

Table client rectangles include actual grid and caption boxes, not the anonymous
wrapper. Caption rectangles remain independently addressable; table bounding
rectangles union the retained boxes. Used table margins come from the wrapper,
while used border/padding/width/height remain grid-owned. No extra caption paint
or fabricated wrapper rectangle is added to the table's DOM reference.

This geometry behavior is covered by native fixtures, but the independent CSSOM
source check is incomplete: its native semantic-reader anchor query found no
match and retained no algorithm paragraphs. Do not treat this as full CSSOM
conformance verification. The failed check and possible reader-anchor loss are
recorded in the twelfth website inventory for follow-up.

New boxes, intrinsic traversal, geometry indexing and caption rectangle inclusion
use existing resource limits. Pages without captions skip the extra caption-table
scan. DOM bytes/references/revision remain unchanged during read-only layout;
style/content/reparenting changes invalidate retained geometry normally.

Absolute/fixed tables, inline-table and tables used as flex/grid items remain
guarded. Caption-wrapper admission requires in-flow captions; complete positioned
caption semantics and full HTML UA/theme defaults are not established here.
Existing unsupported descendants, CSS/resource requirements, table role heights
and other native profile limits can still prevent whole-page geometry or raster.

## Regression evidence

Two explicit-manifest suites add 65 cases: 48 layout and 17 geometry cases.
The original 61-case suite produces 7 pass/54 fail on unchanged production.
Review then finds missing caption `align-content` metadata. Four supplemental
cases fail against the initial caption implementation: center/end differential
offsets, mutation, and unsupported baseline alignment. The other 44 layout cases
are unselected/pending in that focused reproduction, not broad-gate exclusions.

After retaining the existing block-alignment metadata, focused validation passes
573 cases across 16 suites/16 strict roots, zero failures or exclusions. Build,
strict checking, formatting and source stability pass. Coverage includes wrapper
ownership, top/bottom/multiple/empty/nested captions, min-versus-max intrinsic
sizing, table/caption percentage bases, borders, paint/hit ownership, normal/
relative/floated flow, mutation, API geometry, used styles and resource ceilings.

Three related legacy test files now distinguish supported captions from still
unsupported positioned-table/role profiles. No exclusion is added to hide an
expectation change. Original red/precheck/focused attempts remain retained.

Focused evidence:
`node_modules/.cache/native-validation/table-caption-work-september13/fixed04/`.
Review and its isolated reproduction are in the same work lane. This is not
website rendering, speed, credentials, passkeys, SafeJS, TTY or challenge-handling
acceptance; those gates remain separate.

Clean broad round01 passes 18,111 tests, zero failures and two unchanged historical
exclusions across 352 suites/351 strict roots. The 730-entry manifest leaves 378
suites unrun. Build/strict/format/source integrity pass; 1,253 unchanged tracked
inputs, 1,265 source files and 2,100 compiled files are audited. The historical
snapshot strict-root omission remains. Root dist and unrelated work are untouched.

Audit:
`node_modules/.cache/native-validation/native-table-caption-september13-round01/AUDIT.json`.
The separately sealed unchanged-byte TestPages replay now creates a real caption
wrapper and clears both caption and inherited collapsed-border diagnostics. It
still returns no table rectangle because stylesheet/integrity/CSS requirements
remain unsupported. See the twelfth September 13 website inventory for exact
counts and hashes; this is diagnostic progress, not a full rendering pass.
