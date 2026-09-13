# Native ARIA table source metadata

ARIA tables made from `div` elements can contain important row labels and column
declarations without using HTML headings, `table`, or `th`. The native reader
preserves a bounded set of these source attributes, and the existing opt-in JSON
extraction can expose them without a separate full-DOM reload.

```sh
agent-browser extract '#specifications' --format=json --table-metadata
```

The equivalent API remains `extractDocument(tree, { format: "json",
tableMetadata: true, root: reference })`. Existing research selector and retained
JSON-replay paths pass this option through. No new runtime dependency is needed.

## Source-only contract

An eligible selected element gains an optional `ariaTableSource` field:

```json
{
  "kind": "native-aria-table-source-v1",
  "tag": "div",
  "role": "cell",
  "attributes": {
    "role": "cell",
    "aria-colspan": "2",
    "aria-labelledby": "power-label"
  }
}
```

`tag` is the actual native element name. `role` classifies one explicitly
declared supported token; `attributes.role` retains its original value, including
ASCII edge whitespace. This is not a computed accessibility role. Missing,
invalid, conflicting or unresolved source declarations are not repaired.

- Supported single role tokens: `table`, `rowgroup`, `row`, `cell`,
  `columnheader`, `rowheader`. They are case-sensitive in this source profile.
- Common attributes: `id`, `role`, `aria-label`, `aria-labelledby`,
  `aria-describedby`, `aria-owns`.
- `table` additionally retains `aria-colcount` and `aria-rowcount`.
- `row` additionally retains `aria-colindex` and `aria-rowindex`.
- Cells and both header roles additionally retain `aria-colindex`,
  `aria-rowindex`, `aria-colspan`, and `aria-rowspan`.
- Role lists, fallback-role resolution, `grid`, `treegrid` and `gridcell` are
  outside this profile. No metadata is fabricated for them.

Values are native attribute strings after normal HTML decoding, not literal
source slices. They are untrusted data, not commands or instructions. Malformed
numbers, duplicate/missing ID references, and declaration order survive without
normalization, truncation, lookup or execution. In particular, `aria-owns` is
retained as evidence; it does not reparent the native tree. No header assignment,
column grid, reading order, label text, accessible name, or span coverage is
inferred. Consumers must not treat sibling proximity as proven association.

Literal source CR/CRLF receives the native HTML newline preprocessing before
reader tokenization. Decoded carriage-return references are re-escaped for the
reader's second parse, so they are not silently normalized into line feeds.
The source-size counter still measures the original input, and emitted escapes
consume the existing reader output allowance.

HTML `tableSource` metadata remains a separate unchanged contract. A source
element can carry both records; conflicting HTML and ARIA declarations remain
visible rather than one silently replacing the other. Source metadata does not
change the extracted node's native HTML type or produce Markdown table markers.

## Reader and extraction boundaries

The semantic reader retains these attributes only when the source tag itself is
preserved. It does not attach a table role to manufactured placeholders for
unwrapped custom elements or to tags replaced with another name. Omitted
subtrees remain omitted. Styles, event handlers and arbitrary data attributes
are not admitted by this feature. No script or resource loading is introduced.

The reader still reports `hiddenContentSemantics: false`: preserving structural
ARIA metadata is not CSS, visibility or accessibility-tree equivalence. The
reader does not newly preserve `hidden`, `inert` or `aria-hidden`. Full-DOM
extraction retains its existing hidden-subtree and visibility checks before
metadata admission. Heading-section context containers do not gain source
metadata from outside the selected section.

Metadata is emitted only with JSON and `tableMetadata: true`. Default JSON,
explicit `false` and Markdown do not emit either new field or inferred ARIA
table structure. Empty selected ARIA source metadata counts as structured
research content, as existing HTML table metadata does; it is not proof of
nonempty cell text or complete table coverage.

## Budgets and ownership

Each selected metadata attribute is limited to **4,096 UTF-16 code units**.
Exceeding this throws `resource-limit`; no partial value is returned. Attribute
values also consume existing intermediate and final extraction byte budgets.
Selected-node and depth limits still apply.

The reader preserves otherwise admitted source values rather than truncating
them to the metadata limit. Escaped retained attributes count against its
existing output budget, so adding useful structural evidence is not free and
does not raise source, output, token, text or depth ceilings. Opt-in extraction
can therefore reject an oversized attribute after a successful reader load.

Metadata records own copied attribute maps. Later DOM mutations, separate
extractions and document closure cannot rewrite an earlier returned record.
Queries and native references remain tied to their document and revision; no
cross-document association is synthesized.

## Scope

This capability addresses the previously observed Apple non-heading row-label
gap as reusable source preservation, not a site-specific selector workaround.
Historical title-only and full-DOM follow-up reports remain unchanged. Website
before/after receipts are recorded in the twenty-first September 13 inventory.
Full-site rendering, automatic table interpretation, hardware performance,
credential/passkey devices, SafeJS, real TTY and challenge handoff remain separate
acceptance gates.

## Verified coverage

On September 13, 2026, all **108 new regressions pass**; 62 failed on the
unchanged baseline and 46 were passing controls. The expanded native run records
**19,269 passed, three baseline-confirmed failures and two unchanged skips**.
It is not an all-green suite: the newly exercised existing table-source and
research-section suites retain their three older failing assertions unchanged.

Exact retained Apple bytes now expose **81 source metadata records**, including
one table and 18 row headers, through the production reader/extractor. Three
complete row-text hashes match the prior native full-DOM evidence. The 2,426
native nodes and 1,475 extracted nodes are unchanged; stripping only the new
metadata from JSON leaves identical content. This check needs no new GET and no
full-DOM reload. Retained WHATWG coverage still yields 10,816 nodes, depth 17,
19 headings and nine tables, with unchanged admitted heading text.

Details, preserved failed runs, original capture times and evidence hashes:
`WEBSITE-TEST-INVENTORY-SEPTEMBER-13-TWENTY-FIRST-UPDATE.md`.
