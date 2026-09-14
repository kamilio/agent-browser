# Native sticky positioning

The native presentation path projects sticky boxes after normal-flow, relative,
and out-of-flow layout, before the existing fixed-position projection. Sticky
offsets do not change sibling allocation or root scroll extents. Root scroll,
viewport changes, and DOM/style mutations invalidate presentation through the
existing document revision owners.

## Implemented profile

- Physical left/right/top/bottom insets in horizontal LTR layout, including
  auto and percentage values resolved against the root viewport.
- Border-box sticky view rectangles, including reduced end insets for boxes
  larger than the available viewport rectangle.
- Containing-block constraints and used margins; grid items retain their used
  grid-area bounds through nested container placement and positioning.
- Independent sticky siblings and nested sticky offsets. Every sticky box
  establishes a stacking context, including auto z-index.
- Positioned descendants use a sticky ancestor as an absolute containing block.
  Viewport-fixed descendants escape its displacement; sticky descendants inside
  a fixed subtree use that subtree's viewport coordinate convention.
- Shared projections for element geometry, paint/capture, hit testing and range
  geometry. Scroll targeting reads current offset geometry rather than an
  artificial unshifted target. Work remains bounded by the caller's limits.

## Limits

Nearest non-root scrollports and nested overflow are not implemented; existing
overflow guards remain. This change does not bypass those guards. Table sticky
positioning, block-in-inline fragmentation, multiline inline sticky fragments,
transformed containing blocks, vertical writing modes, bidi positioning and
pagination are not claimed. Existing table/positioning guards remain explicit.
Single-line inline fragments and atomic inline boxes are distinct from these
unsupported fragmented cases.

Margin replacement uses the smaller of the used margin and the geometric
distance from the normal margin edge to the containing-block edge. The retained
draft does not define signed outside-containing-block distance algebra. This
implementation uses absolute distance and direction-preserving constraints;
outside-containing-block cases are not a separately validated conformance claim.

## Source and validation discipline

The authorized native source capture returned **CSS Positioned Layout Module
Level 3, W3C Working Draft, 7 October 2025** on September 14, 2026. Its complete
sticky and sticky-scroll sections are retained in
`node_modules/.cache/native-validation/native-sticky-source-september14/EXCERPTS.json`;
the source receipt and limitations are in that lane's `REQUIREMENTS.md` and
`HANDOFF.md`. This records the returned edition, not a latest-edition assertion.
The source read is not implementation validation.

Native regression fixtures are in `src/sticky-positioning.test.ts`. Test runs
must use an isolated snapshot and the explicit native manifest, with socket,
credential, SafeJS and TTY gates kept separate. Captured-site replay is not a
fresh live website test; any remaining layout blockers must still be reported.

The September 14 final focused snapshot passes **1,003 tests**, including **56
new sticky regressions**. The final selected native gate
`native-sticky-september14-round01` passes **21,706 tests with two unchanged
skips**, across 424 selected files and 423 strict roots from 776 manifest entries.
Build, strict checking and scoped formatting pass; 352 manifest entries remain
unselected. The gate runs 01:09:31.649–01:14:33.945 UTC, with 1,325 source and
2,156 compiled files inventoried unchanged during execution.

The earlier full round00 retains ten obsolete sticky-rejection failures; the
corresponding fixtures now retain real overflow guards or positively test
supported sticky behavior. No tests are silently removed to conceal those
failures. Separately, the previously unselected `scroll-core.test.ts` baseline
has 25 passes and three pre-existing failures (grid rejection and two table-cell
offset expectations), identical to the supplemental feature run. That suite
remains outside the successful selected gate and is not claimed passing.

Terminal LF/CRLF inside an inline creates multiple fragments and remains an
explicit rejection. Positive range/caret checks cover sticky blocks and
single-line sticky inlines with a following owner's preserved break. Grid-area
relocation is tested through relative, flex, sticky, atomic-inline and float
ancestors. None of these synthetic results establishes complete website flows,
all fragmentation behavior, performance or the separate acceptance gates.
