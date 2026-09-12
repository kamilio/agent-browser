# Native float layout foundations

This is a bounded geometry/sizing foundation, **not complete document float
layout**. The existing float and overflow formatting gates remain in force.
OpenBSD's static float still needs coordinated text/block layout and its overflow
blocks remain independent obstacles to the recorded fragment click.

## Placement and exclusion

`FloatLayoutContext` owns already placed physical margin boxes in exactly one
block formatting context. The caller supplies each containing block, measured
outer width/height and a source-order minimum top derived from preceding block
and line boxes. The helper does not determine those inputs from a DOM.

- `place` applies left/right placement, earlier-float/source floors, physical
  floating `clear`, same/opposite-side constraints and oversized-box rules.
  Highest feasible placement precedes lateral preference. Different containing
  blocks within the same BFC do not erase earlier float constraints.
- Sorted bottom-edge events and suffix extrema bound downward search without
  rescanning every suffix. Work is charged across all calls, sorting, placement
  snapshots and line traversal, not reset per request.
- `lineInterval` intersects the line's inclusive vertical span with each float's
  open vertical margin span. Zero-height floats do not shorten lines. Available
  width is zero when exclusions cross; `nextBottom` offers the earliest relevant
  obstruction-bottom event, not proof that a particular text run fits there.
- `placements` returns frozen copies; placements, limits, line results and
  metrics are immutable. `close` clears retained boxes/identifiers, is idempotent,
  and prevents further operations except reading final metrics.

Limits default to4096 floats and2,000,000 aggregate work and can only be lowered.
Coordinates use existing native numeric limits and cannot coerce arbitrary
objects. Outer width/height must be nonnegative. A rejected placement does not
commit a box/id, although consumed work remains charged.

This helper does not implement negative outer extents, source-undefined negative
vertical-margin placements, logical directions, shapes, fragmentation, nonfloating
block clearance, float contents, painting or hit testing. Separate BFCs require
separate contexts; the eventual document coordinator must assign them correctly.

## Shared shrink-to-fit width

`resolveShrinkToFitWidth` accepts native computed box lengths, containing width,
optional measured min/max-content widths, borders and an explicit scrollbar
allowance. Non-replaced auto width uses
`min(max(minContent, availableWidth), maxContent)`; available width derives from
the containing block minus edges/margins/scrollbar allowance, not merely the
space remaining beside earlier floats. Auto horizontal margins use zero;
explicit margins are not expanded to satisfy the ordinary block equation.

Explicit width bypasses intrinsic substitution. Maximum then minimum constraints
apply to used width, without rewriting computed style. Existing native content-
and border-box/percentage/min-width:auto behavior is retained; no complete modern
sizing-conformance claim follows from the CSS2.2 extracts. Caller-provided
scrollbar allowance is not automatic scrollbar or scroll-container support.

The existing atomic inline coordinator consumes this shared helper. Captured
CSS2.2 §10.3.9 explicitly gives non-replaced inline-blocks the same shrink-to-fit
rule and zero auto margins. Intrinsic measurement remains the native engine's
existing bounded measurement, not a supposedly complete algorithm supplied by
CSS2.2. Replaced-element ratio sizing is not implemented by this helper.

## Evidence and outstanding work

`FLOAT-FORMATTING-SOURCE.md`, `FLOAT-SIZING-SOURCE.md` and
`FLOAT-HEIGHT-SOURCE.md` retain native primary requirements and extraction
limits. The height source independently verifies percentage/constraint and
aligned line-box requirements without network activity. The new inline-block geometry,
raster and hit fixture passes both unchanged prior production and this refactor:
it is behavior-preservation evidence, not a reproduced float-layout fix.

The extended test run also retains two legacy assertions that grid layout must
be unsupported; both fail identically on unchanged clean HEAD. They remain
unfixed and outside the established release selection. A first release-preparation
attempt selected two manifest-listed but uncommitted legacy tests absent from
the clean snapshot and failed before executing a gate child. Their original
files are not bundled; corrected preparation checks every selected path exists.
No selected-gate pass means all repository tests pass.

Next: retain formatting/source anchors, size and lay out float contents, apply
per-line exclusion during text reflow across ordinary blocks, coordinate margins
and auto heights within BFCs, then validate paint/hit/scroll ownership. Keep real
float/overflow guards until that work is implemented. Native tests do not grant
live website, provider/credential, real SafeJS, device/TTY or CAPTCHA acceptance.
