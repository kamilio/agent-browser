# Standalone CSS length-math integration

September 4, 2026 checkpoint in the native TypeScript browser.

## Scope and provenance

This checkpoint promotes the existing pending `src/css-math.ts` helper unchanged
and connects it to committed box declarations, computed styles and used layout.
The font-relative box support it needs is promoted at the same ownership seams.
It is a rendering prerequisite for the pending coordinate implementation, not a
claim that the entire pointer/rendering dependency closure is now committed.

The working math, box, declaration, style, layout-value, replaced-box and index
files remain byte-for-byte unchanged. Focused adapters are staged from an
isolated HEAD tree so pending borders, physical insets, CSS custom properties,
flex, scrolling, relative positioning, stacking and pointer changes are not
bundled into this commit. The existing box test's expectation for em/calc support
is promoted alongside the feature, as is the pending block-width calc regression
that replaces an obsolete rejection expectation. Existing `src/css-math.test.ts` and
`src/font-relative-box.test.ts` remain pending because their broader integration
cases also exercise features outside this committed slice.

`CSS-MATH.md`, `FONT-RELATIVE-BOX.md` and their historical reports retain their
original evidence. The checks here are new standalone native runs.

## Behavior

- The finite box-length profile supports `calc`, `min`, `max` and three-argument
  `clamp`, typed length/percentage arithmetic, numeric scaling/division, nested
  functions, parentheses and ordinary precedence. Parsing never evaluates page
  JavaScript.
- Stylesheet and inline dimension, min/max dimension, margin and padding paths
  admit the same expressions. Shorthand splitting preserves nested functions.
  Invalid syntax remains rejected; declaration statement splitting is distinct
  from validation of a single expression.
- Computed styles resolve physical, viewport, em and rem leaves. Only font bases
  actually used by a declaration are requested from the existing text owner.
  Inherited computed expressions keep parent-computed font terms but resolve
  percentages in the child's containing block.
- Used layout owns percentage bases and nonnegative clamping. Margins preserve
  signs, and nested negatives are not prematurely clamped. Height calculations
  containing percentages retain the existing indefinite-basis fallback, even
  if percentage terms cancel or multiply by zero. Replaced sizing uses the same
  rule without inventing a zero-height basis.
- Native geometry and software rasterization consume the same used box values.
  Existing document revisions invalidate font, viewport, containing-block and
  inline-style changes; no second layout tree or persistent expression cache is
  introduced.

The CSS Values math-function, typing and range-checking sections were reviewed
on September 4 at `https://www.w3.org/TR/css-values-4/`. The supported profile is
explicitly narrower than general CSS Values conformance: dimensional products,
nonfinite constants, additional math functions/units and standard serialization
remain unsupported. Native source, computed-source, depth, node, argument and
used-coordinate limits remain enforced.

## Validation

The new allowlisted `src/css-math-core.test.ts` exercises this exact committed
slice without requiring pending borders/flex/custom-property code. With only
the existing helper present on pre-promotion HEAD, 31 of its 63 cases fail.
All 63 pass after the adapters and font ownership are promoted. An initial test
incorrectly treated a semicolon-separated declaration list as one expression;
it was corrected to assert the separate parser contracts rather than changing
the implementation to reject a valid declaration list.

- Working-tree focused checks pass 391 tests across eight allowlisted files.
- Isolated focused checks pass 250 tests across six allowlisted files.
- Production typecheck/build, strict new/updated-test checks and ten-file lint
  pass in both trees.
- Full native checks pass 9,115 tests across 250 allowlisted working-tree files.
- The isolated promotion tree passes 6,345 tests across 189 available files,
  including the promoted block-width regression. Pending broader rendering and
  pointer tests are absent from that tree.

Software pixel equality here compares native math-sized boxes with native boxes
using explicit lengths. It is not a live reference-browser comparison, custom
select presentation, physical pointer input or released page-runtime execution.

## Remaining work

Continue reviewing/promoting custom-property substitution and border
cascade/geometry, followed by flex/inline layout, paint ordering and scrolling
dependencies. Then promote the corrected coordinate adapters with their full
closure and validate custom select descendants against actual native layout.
Custom picker behavior, complete multiple selection, modal/flat-tree inertness,
broader site compatibility and all independent runtime/live/socket/TTY gates
remain open. The overall browser goal is not narrowed to this math profile.

No gated probe ran, the previously denied SafeJS probe remains unrun, no runtime
dependency was added, nothing is pushed, and the seven-day goal remains active.
