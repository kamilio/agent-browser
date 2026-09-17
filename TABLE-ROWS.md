# Readable native table rows

Opt in to `tableRows: true` with `extractDocument`, or `--table-rows` in the
research browser and captured-HTML replay CLI. The default Markdown and JSON
formats stay unchanged. The preference is disclosed as `tableRows: true` in the
extraction metadata, even when the selected content has no convertible table.

## Output contract

Simple native tables use physical source row/cell order:

```text
**Native table begin (selected structure only; associations unspecified)**
- Row 1
  - Cell 1: Feature
  - Cell 2: Support
- Row 2
  - Cell 1: Quantization
  - Cell 2: Available
**Native table end**
```

This is a row list, not a layout grid or inferred accessible table. The first
row is not promoted to a header. `td` and `th` preserve their original content
order; row/column spans do not create synthetic cells, repeated values or column
associations. Empty rows and cells remain explicit. Use structured table source
metadata when source attributes are needed, rather than deriving them from this
presentation.

Single-line inline content, links, inline code and image alternatives retain
the existing Markdown escaping and empty-link behavior. A sole paragraph in a
cell can be rendered inline. Captions, multiple paragraphs, lists, preformatted
blocks, hard breaks and other complex cell content keep the original boundary
format. An outer table containing a nested table falls back; an independently
simple inner table can still use row lists. Partial row/cell selections retain
their original context warnings. ARIA roles do not manufacture native tables.

`compactTables: true` / `--compact-tables` can coexist with this preference in
the core/live research API and captured-HTML replay API/CLI. It shortens fallback
row/cell boundaries within a table; it is not required for row lists. In the
replay CLI, combine `--format markdown --table-rows --compact-tables` with the
existing capture pins and selection. See `RESEARCH-COMPACT-REPLAY.md` for the
replay contract. Existing unsupported-structure checks and source/node/depth,
intermediate and output budgets remain in force: no truncation or wider caps.

## Live and captured reading

The live research CLI defaults to Markdown, so `--reader --table-rows` is enough
to request the format. A unique article `--selector` can remove unrelated page
chrome. `ResearchExecutionOptions.tableRows` forwards the same preference through
single navigation and research batches. Navigation remains a counted HTTP visit.

The replay CLI defaults to JSON, so it requires both `--format markdown` and
`--table-rows`, alongside the existing expected profile, receipt/body hashes,
body byte count and an explicit `--selector` or `--section`. It still emits a
JSONL provenance envelope containing the Markdown string, not raw Markdown.
The selector/section object in `extractResearchReplayJson` and output-limit section
recovery accepts `tableRows`; the existing explicit Markdown format argument
is also required. Admitted local replay makes no HTTP requests.

JSON extraction, link/headings discovery and table-source metadata cannot use
the row-list preference. CLI flags are unique and take no boolean value;
invalid combinations fail before replay input is consumed. API values must be
booleans. `false` preserves the existing extraction behavior; replay link
discovery rejects even an explicitly false `tableRows` property.
Long-profile HTML captures
can be selected offline with this preference; long-profile live acquisition
still requires reader/capture/headings and cannot become a full live extraction.

This improves text readability, not visual table fidelity, scripting support,
challenge handling or proof that the whole page was recovered. Preserve partial
flags, inspect actual content, and retain captured evidence for comparisons.
