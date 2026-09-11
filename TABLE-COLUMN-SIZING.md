# Native auto-table column sizing foundation

## Scope and handoff

`src/table-column-sizing.ts` is a standalone bounded numerical primitive. It is
not a Grid alias and is not connected to the native document, formatting tree,
DOM, style resolver, measurement, or paint pipeline. It prepares for the observed
table-row-group blocker; it does not establish table layout or page acceptance.

The worker read local source on September 11, 2026. The resolved parent baseline
is `128636ee0ee113fc0af9170b7a50c46c7908f34d`. Parent-owned isolated validation must
use that clean baseline plus the owned files, rather than the shared dirty tree.
The private worker lane is
`node_modules/.cache/native-validation/table-column-sizing-worker-september11/`.
No tests, builds, gates, network, browser, SafeJS, credentials or device probes
were executed by this worker. Test cases are supplied, not reported as passing.
No manifest, shared source, TASKS, historical evidence or commits are changed.

## API and units

`sizeTableColumns(columnCount, contributions, options)` exports its readonly
`TableColumnContribution`, `TableColumnSizingOptions`, `TableColumnSizing`
interfaces and frozen `tableColumnSizingLimits`.

- Contributions contain an integer zero-based `column`, positive integer `span`,
  and finite nonnegative `minContent <= maxContent` cell border-box widths.
- Required options are finite nonnegative `availableWidth`, `borderSpacing`,
  `captionMinWidth`, and `tableWidth` (a nonnegative number or `null` for auto).
- Optional `columnWidths` is an array of exactly `columnCount` nonnegative widths
  or `null` entries. Hints constrain minimum and preferred width, not fixed tracks;
  content and spanning deficits can grow hinted columns.
- Optional `maxWork` is a positive safe integer no greater than the hard ceiling.
- Widths describe the table content/grid area including outer and inter-column
  spacing, but excluding table borders and margins. Caption width uses the same
  extent convention. Spanned cell widths include their internal spacing only.
- The caller must measure cells, resolve CSS units/percentages, determine column
  count, and place DOM spans before calling. No DOM or percentage inference occurs.

The detached result and its `sizes`, `offsets`, and `metrics` are frozen. Intrinsic
widths describe column constraints plus spacing; caption constraints affect only
`usedWidth`. The first column offset equals `borderSpacing`.

## Deterministic auto-layout policy

This is the requested min/max-content auto-layout policy, not a claim of one
mandatory CSS2.2 automatic algorithm or equivalence with other browser engines.

1. Seed each column's minimum and maximum with its hint or zero. Apply all
   single-column contributions by taking per-column maxima across rows.
2. Bucket spanning contributions by increasing span length, preserving input
   order for equal spans. This is a stable bounded counting-bucket ordering, not
   an unmetered native comparison sort. Equal-span order is part of the contract;
   overlapping contributions need not produce an order-independent solution.
3. For each span, subtract `(span - 1) * borderSpacing` from each cell constraint
   and clamp the resulting target to zero. Distribute any uncovered minimum
   deficit equally among covered columns. Raise each maximum to its minimum,
   then distribute any uncovered maximum deficit equally among covered columns.
   Later contributions only grow constraints, preserving earlier requirements.
4. For a nonempty table, intrinsic widths are the respective sums of tracks plus
   `(columnCount + 1) * borderSpacing`.
5. Auto width is
   `max(captionMinWidth, minContentWidth, min(maxContentWidth, availableWidth))`.
   Specified width is `max(tableWidth, captionMinWidth, minContentWidth)`; available
   width does not cap an explicitly sized table or force content truncation.
6. Between minimum and maximum width, allocate spare space in proportion to each
   column's `maximum - minimum` slack. Zero-slack columns do not grow in this phase.
   At or above maximum width, start from maximum tracks and spread excess equally.
7. Zero columns require no contributions and omitted or empty hints. Intrinsic
   widths and spacing contribution are zero; sizes and offsets remain empty.
   Explicit or caption width remains an empty table extent, not fabricated tracks.

For example, two form columns measured across several rows might have minima
`[70, 100]` and maxima `[90, 220]`. With zero spacing and 240 available units, the
result is `[80, 160]`: 70 spare units are allocated in the slack ratio `20:120`.
A full-width form explanation or heading instead contributes a real colspan
constraint; it is not treated as another standalone column.

## Limits, numerical precision and errors

There are at most 4,096 columns, 4,096 contributions and 4,000,000 work units.
Input dimensions and computed lengths use existing `layoutNumber` and the native
16,777,216 absolute-length limit. Individually valid inputs can exceed the length
limit when summed or combined with spacing, and are rejected in that case.

Input validation, hint/track initialization, bucket insertion/traversal, span
targets, each visited track in sums or distributions, result copying, offsets
and freezing are charged. Work is deterministic for the same input and execution
path; requesting exactly the reported work succeeds, while less fails rather
than returning partial results. Sorting/storage is linear in columns plus cells;
span processing is bounded by the work meter, with linear auxiliary storage.
Even an empty table has input/output bookkeeping work. No ceiling is raised.

Arithmetic uses IEEE-754 numbers without pixel snapping. Compensated sums reduce
loss across mixed scales. Distributions carry remaining space using actual
representable growth, clamp remaining deficits to zero, and never subtract from
track minima. Proportional allocation uses suffix slack totals to avoid unstable
repeated subtraction of a large denominator, and clamps growth at each maximum.
Floating-point additions can leave small residuals or overshoots; for nonempty
tables, accounted extent and span constraints are compared with tolerance
`32 * Number.EPSILON * max(1, usedWidth) * max(1, columnCount)`. This is not exact
decimal or subnormal relative precision. Empty tables intentionally have extent
without track accounting. Representable native length overflows remain errors.

Malformed shapes, missing required values, nonfinite/negative dimensions,
unordered cell constraints, invalid spans, mismatched/sparse hints and invalid
work ceilings throw `AgentBrowserError` with `invalid-input`. Column/contribution
caps, length overflow and exhausted work throw `resource-limit`. Inputs are never
mutated or sorted in place; no runtime dependency is added.

## Outstanding validation and integration

`src/table-column-sizing.test.ts` supplies form-row, colspan, overlapping-span,
spacing, hints, shrink-to-fit, expansion, empty-table, frozen/detached data,
invalid-input, cap/budget, scale and rounding cases. Parent owns formatting,
strict compilation, isolated execution and native-manifest integration as needed.
DOM table placement, row/group geometry, captions, CSS table style resolution,
collapsed borders, percentages, measurement integration, rendering and genuine
page/table acceptance remain outside this worker's implemented scope.
