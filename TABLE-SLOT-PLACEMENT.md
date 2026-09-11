# Bounded native table slot placement

`src/table-slot-placement.ts` exports `placeTableCells(groups, options?)`, readonly
input/result interfaces and frozen `tableSlotPlacementLimits`. This is a pure,
standards-informed table-model primitive, not CSS Grid and not website rendering.
It has no page-runtime dependency and imports only the existing native error type.

## Contract

The caller supplies already ordered, normalized groups `{ id, rows }`, explicit
rows `{ id, cells }` and cells `{ id, columnSpan, rowSpan }`. Arrays are readonly.
Group IDs may be null; other IDs must be nonnegative safe integers, bounded by
`Number.MAX_SAFE_INTEGER`. Nonnull IDs are globally unique across all three kinds.
Column spans are integers from 1 through 1000; row spans are integers from 0 through
65534. Missing, sparse or malformed entries are rejected, not repaired.

Results are detached and deeply frozen: `cells` contain
`{ id, columnStart, columnEnd, rowStart, rowEnd }`, `rows` contain `{ id, index }`,
and `groups` contain `{ id, rowStart, rowEnd }`. Coordinates are zero-based with
exclusive ends. Cell order follows input order. Implied rows have null IDs;
explicit empty rows retain their IDs. Empty groups retain zero-height ranges.
`columnCount` is the maximum occupied column end across every group; `rowCount`
includes explicit and implied rows. Empty input has zero rows and columns; tables
with only explicit empty rows have rows but no occupied columns.

## Placement

Validation snapshots bounded inputs and computes final group extents before slot
allocation. Positive spans may create implied rows beyond the last explicit row;
they are never truncated to the explicit-row count. The next group starts after
the previous group's final extent, so positive spans never cross a group boundary.

For each explicit row, extend existing zero-rowspan cells first. Reset the column
cursor to zero, skip occupied anchor slots, and allocate each cell's entire span
rectangle. Advance by its colspan. An occupied interior slot is an unsupported
table-model overlap, not a reason to search for another rectangle. Zero spans
start one row high and grow through subsequent explicit and implied rows of their
own group, then stop. A zero span alone does not invent additional rows.

## Bounds and errors

- 4096 total rows, including implied rows, and 4096 columns.
- Independent totals of 4096 cells and 4096 groups.
- 262144 occupied slots across all groups, including zero-span growth.
- 4000000 deterministic work units by default. `options.maxWork` may only be a
  positive integer at or below that ceiling; null is not an omitted option.

Array sizes and per-cell extents are checked before expanding them. Placement
checks row, column and remaining slot capacity before filling each rectangle.
Occupancy uses a bounded sparse set rather than a row-by-column matrix. Validation
copies only bounded metadata; placement/output storage is bounded by the row,
group, cell and occupied-slot caps. There is no unmetered sorting or fit search.

`metrics.work` meters input traversal and ID checks, snapshot construction,
group/row/cell traversal, anchor probes, rectangle row traversal and slot probes
and fills, zero-span growth, and output copying/freezing. Rectangle work is charged
before expansion. Output work is charged before returning a result, including for
empty input. The same input has deterministic work: its exact reported budget
succeeds, and a lower budget fails without exposing a partial result. Work units
are bounded logical operations, not elapsed time or JavaScript-engine instruction
counts. Inputs are ordinary data records; hostile accessors/proxies are not a
sandbox boundary.

Errors are `AgentBrowserError`: `invalid-input` for malformed data, duplicate IDs,
bad spans or invalid work options; `resource-limit` for exhausted caps or work;
`unsupported` for table-model overlap encountered during bounded placement.

## Unvalidated integration gates

Tests in `src/table-slot-placement.test.ts` cover form rows, spans, empty and
multiple groups, implied rows, overlap rejection, malformed input, immutability,
independent caps and deterministic work limits. They are authored but not executed
by this worker. Parent owns formatting, compilation, isolated validation and any
native-manifest integration. No validation result is claimed here.

This helper does not parse raw HTML span attributes, reorder thead/tbody/tfoot,
process colgroups, repair CSS anonymous boxes or perform header association.
Numerical column sizing belongs to the separate column-sizing primitive. DOM/CSS
integration, intrinsic measurement, row sizing, captions, CSS table layout,
collapsed borders, geometry, paint and page acceptance remain outstanding.

The parent's September 11, 2026 observation of five deferred W3C tables and a Test
Pages tbody remains deferred evidence: this worker has not revisited those pages.
Actual native layout/geometry/paint integration and separately authorized page
validation are required before those live limitations can be considered resolved.
