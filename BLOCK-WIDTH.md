# Normal-flow block width resolution

September 2, 2026. The package now exports `resolveBlockWidth` to turn supported
computed box values into a used horizontal size **when the caller already knows
the definite containing-block width and the applicable formatting context**.
This is a layout building block, not a document layout engine or client rectangle.

## Scope and API

```ts
const outer = resolveBlockWidth(
  page.styles.box(containerId),
  page.styles.viewport.width,
);
const inner = resolveBlockWidth(
  page.styles.box(panelId),
  outer.contentWidth,
);
```

This example is valid for the known normal-flow fixture relationship, not an
algorithm for inferring containing blocks by walking arbitrary DOM parents.
`FORMATTING-TREE.md` now supplies a conservative display decomposition and
document-derived horizontal pass for an issue-free supported profile. This
low-level function itself still requires an explicit containing width, and no
CLI geometry command is enabled.

The supported case is a non-replaced block in normal flow with horizontal
writing mode and a definite containing width. Inline/inline-block shrink-to-fit,
floats, positioning, tables, flex/grid items, intrinsic/replaced content and
vertical writing modes require other algorithms; callers must not apply this
solver to them. `min-width:auto` is treated as zero for this supported context,
not as the automatic intrinsic minimum of a flex/grid item.

Inputs are the width/min-width/max-width, box-sizing and horizontal
margin/padding fields from `BoxStyle`. An optional `BlockWidthOptions` supplies
the **containing block's** direction (`ltr` by default) and already-computed
left/right border widths (zero by default). Border parsing and page direction
cascade are not implemented by this function.

The frozen result includes `contentWidth`, `borderBoxWidth`, horizontal padding,
borders, used margins, `contentOffset`, the input `containingWidth`, and
`clampedBy` metadata. The offset is relative to the containing block's content
edge, not the viewport, screen or a browser client rectangle. There is no Y
coordinate, height, scroll offset, line fragment or paint result.

## Horizontal constraints

The implementation maintains the normal-flow width equation:

```text
containing width = left margin + left border + left padding
                 + content width
                 + right padding + right border + right margin
```

- Pixel and percentage inputs resolve against the definite containing width;
  horizontal padding and margin percentages use that same basis.
- Automatic width fills available space with automatic margins initially zero.
  Content cannot become negative when fixed edges/margins overfill the container.
- For specified width, automatic margins absorb free space. Two automatic
  margins split it equally when the fixed sizes fit.
- Over-constrained cases absorb the remaining difference into the end margin
  determined by the containing direction. Used margins can therefore be negative
  or differ from their specified values. Overflow is not silently clipped away.
- Min/max constraints recompute the equation, including automatic margins.
  Minimum size wins a conflict with maximum size.
- Border-box constraints apply to the padding/border edge; content floors at
  zero rather than shrinking padding/borders to fit a smaller specified size.

For example, in a 400px container, a 50% content-box width with 10% padding on
each side and auto margins produces 200px content, a 280px border box and 60px
margins. Changing max-width to 160px requires solving the margins again.

The original computed style record is never rewritten. Percentages remain in
the style API, and used numeric values live only in the solver's return value.

## Limits and failures

`layoutValueLimits` is exported. Individual resolved lengths, aggregate border
box/edge sizes and returned offsets/margins are bounded to an absolute
16,777,216 CSS pixels. Length source strings have at most 128 UTF-16 code units.
These are our implementation safety limits, not a claimed browser standard.

Inputs must be finite. Unsupported/uncomputed units, functions and CSS-wide
keywords fail rather than receiving guessed values. Nonzero unitless values,
negative widths/padding/borders, invalid direction/box-sizing, numeric overflow
and oversized outputs also fail. Signed margins are supported. No input is
silently clamped to satisfy resource limits.

This arithmetic does not execute source, access the network, retain documents,
install page APIs or allocate a cache. A rejected calculation does not close or
poison the independently owned page/runtime. No dependency is added.

## Evidence

The selected safe suite passes 1,566 tests across 69 files, including 59 width
cases. Package build, strict changed-test checking, focused formatting and diff
checks pass. Final experimental-core runs pass 39 checks: thirteen width fixture
checks and 26 existing CSS-box/locator-generation regressions.

`block-width.test.ts` includes explicit LTR/RTL cases, percentages, sizing edges,
min/max conflicts, negative margins, immutability, validation and resource limits.
A deterministic 2,000-configuration sweep checks width conservation, min/max
bounds and mirrored-direction invariants. This is mathematical/fixture evidence,
not a reference-browser pixel comparison or complete CSS conformance result.

`check-block-width.ts` passes thirteen actual experimental-SafeJS checks over an
in-memory page. A known two-level normal-flow fixture supplies containing widths;
interpreted handlers change width/constraints/box-sizing and ancestor sizes.
Native resize changes percentage resolution, overflow respects the explicit
direction, oversized lengths fail recoverably, diff state is preserved and
owned runtimes close. The fixture does not infer general containing blocks.

Build and run the package's `check:block-width` command, or:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/approved/experimental/safe-js \
  node packages/browser-agent/dist/scripts/check-block-width.js --trace
```

Evidence is recorded in `reports/block-width-*.json`. Released-SDK, actual CLI,
public-site, real-terminal and client-geometry acceptance remain open.

## Remaining integration

The bounded formatting layer in `FORMATTING-TREE.md` now derives containing
widths under a strict partial profile and rejects unresolved modes. User-agent box/font
defaults, intrinsic text/control measurement, block heights, margin collapse,
inline fragments and vertical positioning remain necessary before client
rectangles, coordinate actions, scrolling and paint/export can be connected.
`CSS-BOX.md` tracks the broader pending layout milestones.

Primary algorithm reference reviewed September 2, 2026:

- https://www.w3.org/TR/CSS22/visudet.html#blockwidth
- https://www.w3.org/TR/CSS22/visudet.html#min-max-widths
- https://www.w3.org/TR/css-sizing-3/#box-sizing
