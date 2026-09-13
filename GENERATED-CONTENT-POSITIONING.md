# Native CSS-generated content positioning

Supported `::before` and `::after` formatting boxes participate in the native
relative, absolute and fixed positioning paths. The engine reuses its existing
formatting, static-position, out-of-flow and relative-offset coordinators rather
than inventing CSS pseudo-elements as DOM nodes or separate action references.

## Computed style and formatting

- Actual absolute/fixed pseudo boxes receive CSS display blockification. Their
  optional computed `unpositionedDisplay` retains the display needed for
  hypothetical static placement; actual flex/grid-parent item context is also
  accounted for when formatting that static display.
- Float computes to `none` for an actual out-of-flow box. `clear` does not create
  clearance for it. In-flow generated floats remain unsupported; physical
  clearance on supported normal-flow block boxes is covered separately in
  `GENERATED-CONTENT-CLEAR.md`.
- Formatting records carry position, static display/flex data and applicable
  z-index into the same native coordinators used for ordinary boxes.
- Relative positioning retains normal-flow space and shifts the resulting
  boxes/fragments/glyphs. Absolute and fixed boxes do not occupy normal-flow
  space; existing containing-block, physical-inset and static-position rules
  determine their placement.
- Generated boxes and glyphs retain source-owner metadata without gaining DOM
  references, generated-control targets or editable source text ranges.
- Hit testing resolves generated paint to its actual originating DOM element,
  including a `display:contents` origin without its own layout box. Existing
  origin pointer-event and inertness filtering still applies.

## Limits

This extends supported inline, inline-block and block/flow-root pseudo formatting;
it does not implement generated flex/grid/table layouts or sticky positioning.
Existing coordinator restrictions—including inline containing blocks, positioned
Grid containing boxes, Grid-area static placement and transformed containing
blocks—remain explicit failures. A static flex/Grid owner can have an
explicit-axis out-of-flow pseudo box with a supported block containing box;
that does not enable positioned Grid-area coordination.
`display:contents` is not silently turned into an out-of-flow pseudo box.

Unsupported generated overflow, clipping, outlines, decorations, vertical
alignment, in-flow floats and logical block clearance retain explicit issues.
An out-of-flow box uses the coordination marker until the native positioning
stage consumes it; removing a generated-position error is not evidence that
an otherwise unsupported page can render. Source, CSS, formatting, layout,
positioning, raster and work limits remain in force.

The motivating retained TestPages stylesheet produces 26 absolutely positioned
inline-block label pseudo-elements. Their source declarations and native
formatting records are checked without modifying the site's HTML or CSS.
Other full-page layout/CSS blockers remain separate from this feature.
Actual geometry and paint require the independent native regression gate;
the retained full-page formatting check alone does not prove final rendering.

## Regression coverage

The manifest-listed `src/generated-content-positioning.test.ts` covers 67 cases:
boxification, relative offsets and retained flow, absolute insets/stretching,
ordinary-element geometry parity, before/after static positioning, the synthetic
26-label layout pattern, containing boxes, fixed viewport pixels across scroll
and resize, flex/static placement, unsupported guards, stacking pixels, bounded
formatting, mutations, DOM reference conservation, origin hit targets and
exclusion from editable source ranges. Layout boxes use document coordinates;
fixed painting is separately checked in viewport pixels.

The focused 11-suite run also includes existing hit-testing, pointer-event and
positioning regression/performance cases. Broad native results and the exact
retained TestPages formatting proof are recorded separately in
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-FOURTH-UPDATE.md`. Passing these
checks does not close rendering, SafeJS, device, credential or live-site gates.
