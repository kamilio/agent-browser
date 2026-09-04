# Shared intrinsic, flex, atomic-inline and painting core

September 4, 2026 checkpoint in the seven-day standalone browser plan.

## Coherent integration

This promotes the pending shared layout pipeline, not another renderer or DOM.
Intrinsic measurement, flex main/cross sizing, item reflow, nested placement,
atomic-inline layout, relative translation and paint ordering form a connected
dependency set. The committed page-layout entry now coordinates these phases and
feeds the existing geometry, raster and PDF owners. Numeric flex resolution is no
longer the only committed flex capability.

The isolated integration includes software control sizing/painting because those
replaced-box constraints participate in the same measurement and reflow owners.
It adds only the required placeholder predicate and control display rules, not
the unrelated pending control-action, selector, pointer or scrolling changes.
All original source/test worktree bytes are preserved. Existing historical
intrinsic/flex/inline/relative/control documents and reports retain their contents,
paths and original measurements.

## Implemented connections

- Used and intrinsic text layout share tokenization, whitespace, font advances,
  breaks, inline edges and resource accounting. Min/max-content measurement does
  not manufacture enormous viewports or substitute a character-count estimator.
- Measured contributions feed flexible bases, automatic minimums, line allocation
  and actual item-local reflow. Nested rows, columns, wrapping, reverse directions,
  gaps, cross sizing and baseline placement merge into page coordinates before
  following normal-flow siblings are placed.
- Inline-block and inline-flex become independently sized atomic inline boxes.
  Their descendant contexts are merged once, with the supported last-line and
  first-baseline rules respectively. Geometry excludes duplicate atomic fragment
  rectangles, and PDF glyph collection does not duplicate descendant text.
- Physical relative insets shift the completed subtree without changing following
  flow positions. Percent heights use definite containing-block bases rather than
  natural-height guesses. Computed insets expose used opposite values; the core
  static computed-property enumeration grows from 61 to 65.
- One content iterator orders ordinary boxes, atomic scopes, flex items, inline
  fragments, images and glyphs. Root/relative/static-flex-item stacking contexts
  use this order, so zero-offset positioning and z-index affect painting as well
  as geometry. Root/body background propagation avoids boxless body backgrounds.
- Software controls retain independent dimensions rather than image aspect-ratio
  sizing. Native checked/value/placeholder state changes update presentation;
  password text is masked in formatting records. This is not platform appearance,
  rich-button/custom-select content or popup implementation.
- Phase, nesting, text, coordinate, raster and capture quotas remain enforced.
  Prepared captures reject mutated revisions and closed owners. No new runtime
  dependency is introduced.

The baseline, relative-flow and reverse-wrap rules were reviewed on September 4
against `https://www.w3.org/TR/CSS2/visudet.html`,
`https://www.w3.org/TR/CSS2/visuren.html` and
`https://drafts.csswg.org/css-flexbox-1/`. This is a bounded native profile, not a
claim of complete CSS conformance or live reference-renderer equivalence.

## Validation provenance

The new explicit native suite has 33 cases covering row/column reverse wrapping,
nested reflow and translation, intrinsic flex bases, atomic baselines, PDF glyph
uniqueness, relative/stacking pixels, control state/privacy, decoded image origins,
revision/close safety and resource/recovery boundaries. All 33 fail on unmodified
pre-integration HEAD and pass in both integrated trees. The image case injects
bytes through the existing image owner's fetch option; it performs no network
request.

Six unchanged existing suites add 439 intrinsic, atomic-inline, flex main-size,
reflow, container-layout and inline-flex intrinsic checks to the isolated tree.
The seven-file focused run passes all 472 tests. The broader control-rendering
suite remains pending: three of its cases need the unpromoted mouse adapter.
It is not rewritten to turn injected state changes into pointer acceptance.
Separate new core cases cover software control presentation via native state.

The first full isolated run found 13 obsolete enumeration, rejection and deferred
child expectations. Matching existing layout tests are promoted with the feature;
unsupported grid/absolute cases retain explicit rejection/recovery checks. Two
old control-rejection parameter cases are replaced by the new positive control
coverage, and two existing boxless-body raster regressions are included.

- Final full native validation passes 9,314 tests across 255 allowlisted
  working-tree files and 7,144 across 201 available isolated-core files.
- Expanded checks pass 652 tests across 14 working-tree files and 651 across
  the corresponding 14 isolated files. The difference is a pre-existing pending
  computed-style test, not an omitted layout failure.
- Production typechecks/builds, strict checks of all 14 new/promoted/updated
  test files and 42-file lint pass in both trees.
- Source import and preservation audits pass. The committed snapshot is compared
  with the tested isolated tree; unrelated pending changes remain separate.

## Remaining scope

Scrolling origins are not promoted: isolated raster clips still start at the
document origin and client rectangles retain the committed unscrolled behavior.
Pointer routing, offsets, scroll models and broad command capability wiring remain
separate. The pending mixed coordinate/scroll integration suites are not treated
as isolated-core evidence.

Full positioning, clipping, floats/clearance, grid/table layout, writing modes,
broader vertical alignment, Unicode/font shaping and real-site compatibility remain
unfinished. Wrapped-column intrinsic minimums retain the documented largest-child
heuristic. Rich control content, custom-select presentation, pickers and complete
multiple-selection behavior also remain open.

No live website, socket, real TTY/PTY or SafeJS acceptance probe ran. Native host
and pixel evidence does not close those independent gates; the previously denied
SafeJS probe remains unrun. Nothing is pushed. Next integrate scrolling/offset
ownership and corrected coordinate adapters against this shared pipeline, then
continue the remaining browser and runtime/site/UI acceptance work. The full
browser scope and seven-day goal remain active.
