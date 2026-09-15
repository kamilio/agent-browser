# Source-backed data tables

The native research reader recognizes a bounded labeled-table schema inside
`data-json` attributes. These values are often already present in public HTML
even when a page's visible table requires JavaScript. Extraction exposes them as
optional `sourceDataTables` metadata, without running page scripts, fetching
another resource or injecting attribute values into visible Markdown/JSON content.

## Contract

- `kind: "html-data-json-tables-v1"`, `scope: "document-source"`, `partial: true`
  and `rendered: false` identify an original-source snapshot, not verified rendered
  content or a complete specification set.
- Each table identifies the source attribute, tag, optional id and normalized
  UTF-16 token offset. Rows retain the source title and declared field order.
- Each field retains its key, label and supplied `formatValue` as `value`.
  Optional `prefix`, `suffix` and `hidePrefix` remain separate source properties.
  No numeric unit conversion, HTML rendering or frontend flag interpretation is
  performed. For example, `value: "5.1 GHz"` and `prefix: "Up to "` must not be
  replaced with the raw stored number `5100.0` or treated as measured performance.
- The recognized JSON shape is an object containing `items`; each useful item
  has a string title, an `elements` object and an `elementsOrder` array. Only
  labeled string `formatValue` fields are returned. Unknown bootstrap fields,
  raw values, product URLs and tooltips are not copied.

The HTML tokenizer decodes the attribute once. The codec uses bounded JSON parsing,
not evaluation, and does not decode it again. Strings remain literal data with
control characters escaped. Prototype-sensitive keys are ignored. This is not
general JSON-LD, arbitrary application-state extraction or a script runtime.

## Visibility and lifecycle

Collection follows the research reader's existing omission and selected visibility
policy. Data in omitted raw/legacy subtrees or source-hidden markup is not collected
when that policy excludes it. CSS class-based visibility is not inferred.

Metadata describes the original document source even when extraction selects a
smaller subtree or the document later changes. It is not a live DOM table reference.
Snapshots are immutable and released from the document store on close. Non-reader
HTML loading and text/Markdown input do not acquire this metadata automatically.

## Bounds and output budgets

Fixed codec limits are 16 encountered attributes, 65536 decoded units per input,
262144 inspected input units, 8 tables, 64 total rows and 32 fields per row.
Titles/labels/ids allow 256 units, keys 128, values 1024 and qualifiers 128.
The complete source metadata is limited to 65536 serialized UTF-8 bytes.
Oversized strings are skipped rather than clipped through a qualifier; resource
truncation is identified separately from the always-partial schema coverage.

Ordinary body extraction runs and passes its existing byte limit first. Metadata
then fits into the remaining serialized-output budget using whole rows in source
order. A shortened result is explicitly truncated. If no row fits, an empty
truncation marker may be returned; if even that cannot fit, the field is omitted.
This optional feature must not turn a previously fitting body into a limit failure.
Consequently, missing metadata is not proof that the source contains no data.

## Evidence

The motivating saved AMD Ryzen AI response contains five product tables, 31 rows
and 276 formatted fields. The source inventory includes units and qualifiers
which were absent from the original Markdown. Results, validation and remaining
limitations are recorded in `reports/source-data-tables-2026-09-15.md` and its JSON
companion. This feature does not close JavaScript-site, credentials/passkeys,
interactive/service/TTY, CAPTCHA or general browser-compatibility gates.
