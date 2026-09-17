# Source-only index queries

`searchSourceIndex` reads an inert `Search.setIndex(strict JSON)` asset without
executing JavaScript. It provides a bounded way to find document names in a
captured Sphinx-style index when the site's scripted search UI is unavailable.
This is **literal stored-term lookup, not equivalent to the site's search**.

## CLI

After building, query a saved raw response body with its verified SHA256:

```sh
node dist/scripts/research-source-index.js \
  --url https://docs.python.org/3/searchindex.js \
  --content-type application/javascript \
  --sha256 YOUR_CAPTURE_SHA256 \
  --profile long-v1 \
  --term asyncio --term timeout < searchindex.js
```

The command reads stdin and emits one JSONL record. It performs no network
requests, imports no downloaded code, and does not invoke SafeJS. The URL, MIME
and hash identify caller-supplied source bytes; they are not a successful HTTP
receipt. Output remains explicitly partial, unrendered and unverified. The CLI
does not reinterpret a blocked/rate-limited navigation as successful browsing.

The source URL must be canonical HTTPS without credentials, a query or fragment.
Supported MIME types are `application/javascript` and `text/javascript`, with
only an optional UTF-8 charset. Decoding is strict UTF-8. Hash mismatch, malformed
source or resource/cancellation errors produce no query record. `--help` does not
consume stdin. An invalid command exits 64; a processing failure exits 1.

## Matching and results

- Supply one to eight literal terms; duplicate terms count once. No lowercasing,
  tokenization, stemming, stopword removal, substring/fuzzy fallback or exclusions.
- Each term matches the union of its `terms` and `titleterms` document IDs. A
  document must match every distinct term. Missing postings are empty sets.
- Order by the count of matching title-term postings descending, then source
  document ID ascending. This is deterministic ordering, not site relevance.
- `--limit` accepts 1–100, default 20. `totalMatches` describes all matches;
  `truncated` indicates whether the requested limit omitted any.
- Results retain `docId`, `docname`, `title` and `titleMatches`. Titles are inert
  **index-source strings**, which may contain HTML, not rendered/plain titles.
- No destination URL or symbol anchor is guessed. Establish the document base
  and suffix from captured site configuration before separately navigating.

Stored terms can be stems: a query for `loads` is not automatically a query for
`load`. A zero result proves only no match under the declared literal semantics.
Other index structures, such as object/symbol catalogs and all-title entries,
are not searched. The original search UI may use those structures, language data,
different matching rules and additional scripts.

## Bounds and provenance

| Bound | Default | Explicit `long-v1` |
| --- | ---: | ---: |
| Source envelope UTF-16 units | 2,000,000 | 4,000,000 |
| CLI input bytes | 2,000,000 | 4,000,000 |
| JSON values | 100,000 | 1,000,000 |
| Container depth | 128 | 128 |

Both modes allow at most 10,000 document names/titles, 4,096 UTF-16 units per
document string, eight input terms and 128 UTF-16 units per term. CLI output is
bounded to 256,000 bytes, input to 65,536 chunks, and the operation to 30 seconds.
The executable tears down its own failed stdio and allows at most another 100 ms
for its error message before forcing exit, including when stdout is blocked.
The library helper does not destroy caller-owned streams. On cancellation it
retains a narrow error guard for an outstanding write until its callback or close;
a reported callback error retains protection through deferred error delivery.
The larger profile does not change existing browser or single-pointer defaults.

Only the exact inert call envelope is accepted, with optional surrounding JSON
whitespace and one trailing semicolon. The entire JSON payload must be valid,
including unselected fields; duplicate decoded object keys are rejected anywhere.
Selected document arrays and postings are then decoded and checked. Postings
must be in-range safe integer IDs or arrays of such IDs without duplicates.
Unused fields receive syntax validation, not semantic validation.

`jsonRange` identifies the payload within the complete asset in UTF-16 units.
`provenance.selections` contains exact spans relative to that JSON payload, not
the full JavaScript envelope or UTF-8 bytes. Missing selections are `null`.
Offsets do not establish source truth, rendered visibility or current deployment.

## Library API

`src/source-search-index.ts` exports `searchSourceIndex(source, terms, options)`.
Options select the explicit profile, result limit and synchronous cancellation
checkpoint. The result declares `source-only-literal-term-intersection`,
`selected-fields-only` semantic validation and `index-source` title format.

`src/json-source-selection.ts` also exports `selectJsonSourceSpans(source,
pointers, options)`. It validates the whole JSON once and returns metadata for
1–32 distinct pointers in input order, without materializing a tree or copying
selected values. Overlapping selections are supported; missing paths are `null`.
Pointer size/segment limits remain unchanged. The existing `selectJsonSource`
API still returns an exact text slice and throws `not-found` for a missing path.

## Outstanding acceptance

This component does not execute the site's UI, implement full Sphinx or Pagefind
search, resolve arbitrary module/data dependencies, or complete SafeJS acceptance.
Anonymous document retrieval, rendered interaction, credentials/passkeys and
access challenges remain separate gates. See `TASKS.md` for the broader goal.
