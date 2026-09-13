# Native dashed borders

Native CSS parsing accepts `dashed` in border-style longhands and border
shorthands. Used widths follow the same computed-width path as solid borders;
`none` and `hidden` remain zero-width. Author styles override HTML image border
hints normally, including inline styles, without discarding the declaration.

Box, replaced-image and inline-fragment raster paths use the same border painter.
Dashed sides paint rectangular, square-ended dashes with a native policy of
three side-widths of ink followed by three side-widths of gap. Each side anchors
its pattern to the unclipped box origin. Horizontal inline slices accumulate
their owner's prior fragment widths so wrapping does not restart every dash.
Clipping changes the visible window, not the pattern's phase.

This length/gap policy is an implementation choice, not a numeric rule prescribed
by CSS. Different widths can yield different periods on adjacent sides. Short
edges and corners use the same nearest-side ownership partition as solid borders;
there is no extra phase adjustment promising symmetrical corners. Alpha corners
are painted once, not by overlapping independent rectangles.

## Bounds and compatibility

The existing `paintSolidBorders` API remains available with its original pixel
behavior and ten-unit clipped-pixel charge. The new `paintBorders` path accepts
side styles and an optional horizontal slice offset. Dashed painting charges
sixteen units per clipped pixel before painting; it does not allocate one object
per dash or iterate through unbounded offscreen dash sequences. Unknown nonzero
side styles fail explicitly rather than rendering as solid.

Inline offset storage is local to text layout and charged only for horizontal
dashed borders. Existing fragment limits and numeric checks bound it. Style and
width mutations rebuild geometry/patterns through existing invalidation. No new
runtime dependency, device operation or script runtime is required.

The capability profile is `normal-flow-solid-dashed-borders`. Supported styles
are `none`, `hidden`, `solid` and `dashed`; `dashes` identifies the rectangular
three-width policy. This does not establish dotted/double/groove/ridge/inset/
outset, rounded corners, border images, cloned decorations, arbitrary writing
modes, or complete fragmentation conformance. Collapsed-table dashed conflict
and segment painting remain explicitly guarded; separate-table and caption
borders use the normal supported path.

## Verification

There are 23 document-level cases and 32 primitive cases, including actual
TestPages declarations, used geometry, all four sides, mixed styles, clipping,
alpha corners, synthetic decoded images, HTML hints, width mutation, inline
slices, transparent/suppressed borders, resource failures and collapsed guards.
The existing 43-case border-core suite is newly included in the selected gate.

The unchanged-production baseline gives 45 pass/21 fail: all 43 existing border
cases pass, while 21 of 23 new document cases reproduce the missing feature.
The first integrated run gives 751 pass/two failures: one new assertion expects
an internal collapsed-border error rather than the public formatting diagnostic,
and one old text-layout assertion still expects dashed borders to be unsupported.
The assertion now checks the precise public collapsed diagnostic; the old guard
uses still-unsupported dotted borders. Existing image-hint guard cases similarly
retain unsupported dotted/double styles instead of rejecting newly valid dashed.

The first corrected focused validation passes 753 cases across 18 suites/18
strict roots. Broader validation then exposes one stale `CSS.supports()`
expectation for dashed borders: 18,246 pass/one fail/two historical exclusions.
That expectation now requires support, without changing the production query.
Expanded final focused validation passes 829 cases across 19 suites/19 strict
roots, with zero failures or exclusions. Build, strict checking, formatting and
source stability pass. Original failures remain in their original lanes under
`node_modules/.cache/native-validation/dashed-border-work-september13/`.
Separate source, broad-gate and website replay evidence is recorded in the
fourteenth September 13 website inventory; fixtures alone are not website or
full-rendering acceptance.
