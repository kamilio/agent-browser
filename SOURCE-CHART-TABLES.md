# Native source-backed chart tables

The research reader can expose chart matrices already present in an Infogram
document without running its scripts or loading viewer/tracking resources.
Values appear in optional `sourceChartTables` extraction metadata, not in visible
Markdown or fabricated DOM nodes.

This addresses the captured PCMag iframe documents whose ordinary text extraction
is empty even though their inline source contains specification and benchmark
matrices. It does not automatically discover or navigate every embedded chart in
an article. Fetch only public URLs justified by source links or advertised loader
behavior; access restrictions still require handoff.

## Use

With the normal build available, supply an advertised public chart URL:

```sh
node dist/scripts/research-browser.js \
  --reader --capture-body \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  --reader-fallback-encoding utf-8 \
  "$PUBLIC_CHART_URL"
```

The supported route is an exact HTTPS `e.infogram.com` origin and a single
lowercase UUID path. Query and fragment do not change the chart identity; other
hosts, credentials, ports and route shapes are not recognized. Recognition is not
an authorization check and does not fetch another resource.

Research outcomes recognize source-table content when a scalar data cell beyond
header/model-label positions contains nonempty text, a finite number or a boolean.
Numeric zero and boolean false are retained. Header-only, empty and null data
alone do not establish content. Successful source-only retrieval is still
`extracted-unverified` with `contentSuccess:null`; its Markdown may remain empty.
Source values do not enter challenge-diagnostic text, and visible access-barrier
text and HTTP failures retain their existing priority.

## Source and value fidelity

- The envelope identifies `kind: "infogram-chart-tables-v1"`,
  `scope: "document-source"`, `partial:true`, `rendered:false`, `verified:false`
  and the chart ID. It is not a rendered or independently verified table.
- Collect only a complete direct `window.infographicData = <literal>` assignment
  inside an eligible inline script on the matching route. The payload must match
  that chart ID and the recognized published-style schema. Its `public:true`
  field is a schema requirement, not permission to bypass access controls;
  `publicAccess` is not interpreted.
- Use the maintained bounded literal parser. Do not evaluate code, comments,
  declarations, aliases, extra statements, formatters, getters or expressions.
  Multiple matching assignments are ambiguous and do not select a stale version.
- Follow declared block/entity order, deduplicate references and omit explicit
  hidden blocks/entities. Ignore orphan chart objects and unrelated application
  state. No CSS, layout or icon meaning is inferred.
- Each matrix retains its source sheet index/name, row/column positions, optional
  chart-type number/modifier and the sheet's explicit x-axis label. No inherited
  format settings or unit conversions are inferred.
- A literal null cell is `{kind:"null-cell"}`. An object with an explicit scalar
  `value` becomes `{kind:"value-cell",value:...}`. Thus null-cell, null-value,
  empty string, numeric zero, boolean false and textual missing-value tokens remain
  distinct. Strings are not trimmed, decoded again, converted or interpolated.
- Source paths refer to the original matrix. Offsets identify the script start
  tag in LF-normalized UTF-16 source, not raw response byte coordinates.

Metadata follows existing source-hidden and legacy-subtree omission decisions.
External scripts, unsupported script types and scripts inside excluded or
`noscript` subtrees do not supply it. Raw-script omission and visible-body
accounting remain unchanged. Plain non-reader HTML parsing and non-HTML inputs do
not acquire this metadata automatically.

## Bounds and lifecycle

The codec bounds route length, recognized assignment size, block/entity visits,
matrix count, rows, columns, cell strings and serialized metadata. Existing
`parseSourceLiteral` depth/value/string limits remain in force; no limit is raised
to accommodate these captures. Unsupported cells never become guessed values.
Strings, cells and matrices are not clipped into plausible partial records.
Unsupported optional chart-type numbers, modifiers and axis labels are omitted
with `truncated:true`; an absent qualifier is not evidence that values have no
units or require no scaling. Consumers must not infer missing qualifiers.

Limits are 4,096 route UTF-16 units, 65,792 assignment-span units, 32 block IDs,
32 entity references (including repeats), 16 matrices and 64 aggregate rows per
document, 2–64 rows and 2–8 columns per matrix, 256 UTF-16 units per cell string,
sheet name or axis label, and 65,536 serialized UTF-8 metadata bytes. The existing
literal parser separately limits literal input to 65,536 UTF-16 units.

Optional chart metadata uses only the byte budget remaining after ordinary output
and existing metadata. Whole leading matrices fit or are omitted; an explicit empty
truncation envelope may fit when no whole matrix does. This must not make an
otherwise fitting ordinary extraction fail. JSON escaping and UTF-8 bytes count.

Snapshots are immutable, describe original document source even after selection
or DOM edits, and leave the document unchanged. Document close removes the stored
metadata association; this is not a whole-heap erasure guarantee.

See `reports/source-chart-tables-2026-09-16.md` for synthetic regression tests,
captured-page comparison, actual CLI checks and remaining integration limits.
