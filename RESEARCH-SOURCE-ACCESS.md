# Advisory source-access declarations

The inert research reader retains a small amount of source metadata from eligible
`application/ld+json` script elements. It does not execute scripts or recover
article bodies, member components, passwords or authenticated content.

When present and within the extraction byte budget, `sourceAccess` accompanies
Markdown or JSON extraction:

```json
{
  "kind": "jsonld-free-access-declarations-v1",
  "scope": "document-source",
  "partial": true,
  "verified": false,
  "truncated": false,
  "entries": [
    { "source": { "offset": 123 }, "path": "$", "value": false },
    { "source": { "offset": 123 }, "path": "$.hasPart", "value": "False" }
  ]
}
```

These are **untrusted publisher declarations**, not a verified access verdict.
False can warn that an excerpt is not the complete article; true does not prove
that the requested content was delivered or that the user has access. Conflicting
declarations are retained separately, not combined into a document-level answer.
The boolean-looking string `"False"` stays a string, distinct from boolean false.
No declarations, or omitted metadata, do not mean the source is freely accessible.

The metadata does not change `contentSuccess`, outcome, challenge detection,
HTTP status, extraction content, fetch behavior or authorization. All existing
barrier checks still apply. It is neither a paywall bypass nor a completeness
classifier. The reader's absence of page-script execution remains unchanged.

## Source and scope

- Script type matching trims whitespace and ignores case. JSON is parsed as
  data only, without entity decoding, callbacks or remote-context fetching.
- Recognized contexts are exactly `http://schema.org`, `https://schema.org` and
  their trailing-slash variants. Context objects, arrays and aliases are not
  interpreted. An explicit unsupported context disables inherited recognition.
- Only root arrays, `@graph` and `hasPart` are traversed. Recognized context is
  inherited through those relationships. A child can declare its own context.
  Arbitrary recommendations, offers, reviews and member payloads are not walked.
- Only own `isAccessibleForFree` properties containing JSON booleans or exact
  case-insensitive `true`/`false` strings are retained. No ontology, `@type`, page
  identity or full JSON-LD validation is claimed. JSON.parse duplicate-property
  semantics apply; this metadata must not be used for security decisions.
- The offset is the opening script token's UTF-16 index in the decoded source
  after CRLF/CR normalization to LF. Paths identify the containing JSON object.
  They do not refer to the sanitized DOM or to fetched remote documents.
- Scripts within omitted ancestors, including template/foreign subtrees, are
  not collected. Selected source-hidden policies also exclude hidden scripts and
  hidden ancestors. This is the reader's bounded source model, not computed CSS.
- Metadata retains whole-document source provenance for focused, scoped or
  prefix extraction. It is not proof that a declaration describes that selection.
  Stored snapshots are deeply frozen and released when the document closes;
  later DOM edits do not rewrite original-source declarations.

## Bounds and compatibility

Per document: at most eight eligible blocks, 65,536 UTF-16 units per block,
262,144 aggregate raw units, 256 visited values, depth 16 (root depth zero), and
16 entries. Invalid and oversized blocks count toward block/aggregate budgets;
oversized blocks are not sliced or parsed. Invalid JSON is ignored without
failing otherwise valid reader content. Limit hits mark retained metadata
`truncated: true`; if no entries survive, there is no metadata envelope.

Existing raw-source reader limits and accounting still run first. Additional
JSON work is bounded separately. No source or extraction cap is raised.

The primary extraction and existing table metadata have byte-budget priority.
Then source-access metadata is fitted as a whole-entry prefix within the same
serialized UTF-8 `maxBytes` limit. A shortened prefix is marked truncated; if no
entry fits, metadata is omitted. Visible content is never shortened to make room.
Default content selection and explicit `main-content-v1`/`text-prefix-v1` behavior
are unchanged. This metadata is research-reader-specific; ordinary HTML parsing
does not automatically attach it. Saved-body replay derives it from supplied
source again rather than trusting a previous report's advisory values.

See `CONTENT-PAGE-WORKFLOWS.md` for source-mode/visibility choices, and
`reports/agent-citation-pages-2026-09-15.md` for the original 100-URL sweep.
The corpus is an agent-citation proxy, not a measured global agent-visit ranking.
