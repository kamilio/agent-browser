# Bounded selector extraction pages

`extract-page` reads a window of matching elements from the current native
document. It is useful for discussions, result cards, or other repeated content
that cannot fit in one ordinary whole-document extraction.

```text
extract-page '.commtext' --limit=20 --max-bytes=64000
extract-page '.commtext' --cursor '<nextCursor from the preceding result>' --limit=20 --max-bytes=64000
```

The command returns a JSON page envelope. `entries` contains ordinary extraction
objects, whose `content` fields are Markdown by default. `--format=json` selects
structured extraction inside those entries, not a different pagination protocol.
`--table-rows` and `--compact-tables` retain their existing Markdown semantics.

## Continuation and completeness

- Entries follow selector matches in native DOM order. Their `scope` references
  identify the source elements. Nested or overlapping matches are not deduplicated.
- Pass `nextCursor` back unchanged with the same selector. It identifies the first
  unreturned match, never an already-emitted match. Cursors are data, not commands.
- A cursor is bound to the current native document reference and revision. A DOM
  edit or replacement invalidates it. This is not a durable cross-process resume
  token, an authentication token, or permission to load another page.
- `selectionExhausted: true` and `nextCursor: null` mean all matching source
  elements have been consumed. They do not establish complete website content,
  hydrated content, visible rendering, factual accuracy, or complete discussion
  context. Every page remains `partial: true`.
- An empty match set is terminal. An item that fails extraction is not skipped.
  Its error propagates; use a narrower selector or an appropriate explicit bound
  rather than interpreting an incomplete sequence as complete.

## Limits

Prefer one ordinary `extract` selection when the desired article already fits
its output budget. Pagination is for bounded windows of repeated content, not
automatic output compression: by default each entry retains its own extraction
metadata.
Across many small entries, that metadata can outweigh the content. The build-guide
revalidation in `reports/llama-build-revalidation-2026-09-18.md` demonstrates this
tradeoff. A per-page cap does not cap the aggregate bytes of every page.

Use `--reader-metadata=page` (library option `readerMetadata: "page"`) to share
the document-level reader report once per page. The result then contains
`readerMetadata: "page"` and, when a reader report exists, `reader`; entries omit
only their duplicate `reader` field. Other entry metadata and content remain
unchanged. Restore that shared field when a downstream consumer needs complete
individual extraction records. Raw/native documents without reader metadata do
not acquire a fabricated reader report.

Default or explicit `--reader-metadata=entry` preserves the original output
representation. Sharing is opt-in, not removal of provenance, and does not change
ordinary per-item extraction limits. The shared report and placement marker
count toward the page byte cap, including for an empty result. This can reduce
serialized output and let more entries fit; it is not a network or CPU benchmark.

| Option | Default | Allowed range |
| --- | ---: | ---: |
| `--limit` | 20 entries | 1–100 |
| `--reader-metadata` | `entry` | `entry` or `page` |
| `--max-bytes` | 256,000 | 1,024–1,048,576 |
| `--item-max-bytes` | min(65,536, page limit) | 256–page limit |
| `--max-nodes` | 10,000 per item | 1–50,000 |
| `--depth` | 128 per item | 0–1,024 |

The page byte cap covers UTF-8 encoding of compact `JSON.stringify(page)`, including
every entry, its metadata and the continuation cursor. It does not count the outer
command transport envelope or presentation whitespace. An entry that would exceed
the remaining page capacity is left for the next page. If the first entry or even
the empty page envelope cannot fit, extraction fails instead of returning a
nonterminal empty page.

Selectors are limited to 4,096 UTF-16 units; cursors to 32,768. Existing selector
query work, indexing and match-count limits still apply. The node/depth limits are
per item; this command does not claim an aggregate traversal budget equal to a
single extraction. Limit entries and page size for bounded agent consumption.

No request, navigation, retry, script, SDK, credential or device operation is
performed by extraction. Load a document through its separately authorized
workflow first. This command does not bypass access restrictions or make an
incomplete body admissible. Existing `extract` behavior is unchanged.

The library equivalent is `extractDocumentPage(tree, selector, options)`, exported
with `ExtractionPageOptions` and `DocumentExtractionPage` from the package entry.
