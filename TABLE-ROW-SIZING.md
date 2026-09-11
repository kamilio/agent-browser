# Native table row sizing

`TABLE-DOCUMENT-INTEGRATION.md` records the subsequent real cell/row document
integration and its separately executed parent validation gates.

`src/table-row-sizing.ts` exports `sizeTableRows(rowCount, contributions, options)`
and frozen `tableRowSizingLimits`. This is a deterministic bounded row solver,
not a mandated cross-browser algorithm or a percentage-height cycle solver.
It introduces no runtime dependency and does not measure DOM or infer text heights.

## Contract

Each `TableRowContribution` contains a unique nonnegative safe-integer `id`, a
zero-based `row`, a positive integer `span` within the row count, a nonnegative
natural cell border-box `height`, a signed finite `baseline` or `null`, and
`verticalAlign: "baseline" | "top" | "middle" | "bottom"`. Baselines are measured
from the natural cell border top. Null baselines on baseline-aligned cells fall
back to natural height; the caller owns the quality of that conservative fallback.
Baselines on other alignments are validated but do not affect row ascent.

`TableRowSizingOptions` requires nonnegative `borderSpacing` and `tableHeight`
(nonnegative or `null`). Optional `rowHeights` contains exactly `rowCount`
nonnegative minimum hints or `null`; sparse arrays are invalid. Optional `maxWork`
is a positive safe integer no greater than the default limit.

The detached, deeply frozen `TableRowSizing` result contains:

- `sizes`: final row heights, including explicit table-height expansion.
- `offsets`: row tops, starting at `borderSpacing` for nonempty tables.
- `baselines`: offsets relative to each row top, or `null` when no baseline-aligned
  cell is anchored there. A row whose supplied baselines are all negative has zero
  ascent, not a negative baseline.
- `cells`: `{ id, areaHeight, offset }` records in original contribution order.
  `areaHeight` includes covered row sizes and internal spacing. `offset` moves
  natural cell content down within that area; it is not an absolute row offset.
  Parent keeps the cell border box stretched and translates its content.
- `naturalHeight`: extent after hints and cell constraints, before explicit growth.
- `usedHeight`: maximum of natural height and specified table height.
- `metrics.work`: deterministic charged work for this execution path.

## Sizing policy

1. Validate bounded input shapes, hints and every cell before span expansion.
   Snapshot inputs and collect each anchored row's maximum baseline, clamped to
   nonnegative ascent. Seed row minima from hints and these ascents.
2. Baseline-aligned cells require `height + rowBaseline - cellBaseline`, using the
   null fallback. Other cells require their natural height. Apply all single-row
   minima before processing longer spans.
3. Visit longer spans in increasing span order using bounded buckets, preserving
   contribution order for ties. Subtract internal spacing from each requirement,
   then spread any uncovered deficit equally over its covered rows. Later spans
   only grow rows. Overlapping equal-span constraints can be order-dependent.
4. Natural extent is the row sum plus `(rowCount + 1) * borderSpacing` when
   nonempty. Specified height never shrinks it; spread extra height equally over
   all rows. This growth does not change baselines.
5. Cell offsets are zero for top, half of nonnegative free space for middle,
   all free space for bottom, and the anchored baseline difference for baseline.
6. Zero rows require no contributions and omitted or empty hints. All output
   arrays are empty, natural height and spacing contribution are zero, and an
   explicit height may remain as an empty-table extent.

## Bounds and precision

Rows and contributions are each capped at 4,096, with at most 4,000,000 work units.
Validation/traversal, initialization, bucket insertion and traversal, each row
visited in span sums and growth, final sizing, offset construction, cell output
and freezing are charged. Exact reported work is sufficient to repeat a call;
less fails without returning partial geometry. Empty tables still incur work.
Storage is linear in rows plus cells. There is no comparison sort, prefix-sum
cancellation for small cell areas, or repeated full-table rescan per contribution;
each contribution scans only its covered rows under the meter.

Lengths use existing `layoutNumber` validation, including signed validation for
baselines and the native 16,777,216 absolute-length limit. Combined requirements,
spacing and computed extents can exceed this limit even when each input fits.
Malformed values throw `AgentBrowserError("invalid-input", ...)`; input caps,
length caps and exhausted work throw `AgentBrowserError("resource-limit", ...)`.

Arithmetic uses IEEE-754 numbers, compensated sums and growth based on remaining
representable additions. Deficits and free space are clamped nonnegative; row
sizes never shrink. No pixel snapping or exact decimal/subnormal precision is
promised. For nonempty tables, extent and cell constraint accounting allow
`32 * Number.EPSILON * max(1, usedHeight) * max(1, rowCount)` tolerance for rounding
residuals or overshoots. Empty tables intentionally need no track accounting.

## Parent-owned integration and validation

`src/table-row-sizing.test.ts` supplies mixed-height, baseline, signed/fallback
baseline, spanning, spacing, hints, expansion, empty-table, immutable/detached
output, malformed-input, cap/work and numeric-scale cases. Tests, compilation,
formatting checks and native-manifest integration are not executed by this worker;
parent owns isolated validation. No live acceptance claim follows from this work.

Parent separately owns table document layout and wiring, CSS roles, normalized
slot placement, actual cell measurement and reflow, border models, row/group
geometry, rendering, percentage-height cycles and live acceptance. This worker
does not edit those sources, the native test manifest or `TASKS.md`.
