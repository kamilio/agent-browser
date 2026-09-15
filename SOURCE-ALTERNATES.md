# Source-advertised Markdown alternatives

HTML extraction can expose an optional `sourceAlternates` field:

```json
{
  "kind": "html-alternate-representations-v1",
  "partial": true,
  "truncated": false,
  "entries": [
    {"type": "text/markdown", "url": "https://example.invalid/guide.md"}
  ]
}
```

This is **source metadata**, not visible body text, verified content, permission
to fetch, a redirect or proof that the advertised URL works. It does not turn an
empty document or JavaScript notice into successfully retrieved documentation.
The engine never fetches an alternative automatically. A separate authorized
navigation still applies the normal network policy, response budgets and barrier
checks. Credential-provider, page-runtime and device authorization are unchanged.

## Selection and limits

- Inspect HTML `link` elements that are direct children of the document head.
- Require an ASCII-whitespace-delimited `alternate` rel token and the exact
  normalized MIME token `text/markdown`; MIME parameters are not supported yet.
- Reject `http-equiv`, empty hrefs, control/format characters, unsupported schemes
  and credential-bearing URLs. Rel/type are each capped at 256 code units.
- Raw and final resolved URLs must each fit 4096 code units. URLs are rejected,
  never truncated into another destination. Explicit absolute authority URLs
  also receive serialized-length validation before reader retention.
- Resolve relative references using existing document-base rules. Metadata URL
  validation is not DNS resolution or a substitute for navigation's network
  policy. Source URLs may contain query data; this is not a privacy boundary.
- Retain at most eight entries in source order, including duplicates. Inspect
  at most 256 direct head children, reporting `truncated` when either scan or
  entry capacity is exceeded. A capped scan may return an empty entries list.
- Entries, their array and the containing metadata object are immutable.

Head discovery and existing document-base lookup remain governed by document
limits; the 256-child cap is not a promise that the entire operation accesses
only 256 DOM nodes. Existing extraction metadata/output budgets still apply.

## Reader and replay

The semantic reader preserves eligible head links with only `rel`, `type` and
`href`. Advertised RSS/Atom links are handled separately as `sourceFeeds`;
see `SOURCE-FEEDS.md`. Other link declarations remain omitted. Known unsafe URL
syntax is
rejected before retention, with final base-aware validation during discovery.
Base-dependent validity is not inferred from a placeholder origin. Explicit
source-visibility policies can omit a link or its ancestor before discovery.
Foreign, omitted and body content is not promoted into head metadata.

`extractDocument(tree).sourceAlternates` works for native HTML and reader trees.
Markdown body text is not changed or injected with a suggestion. A retained head
link can change DOM references and reader node/output/omission accounting, while
extraction JSON metadata gains the optional field. Literal Markdown/text is not
interpreted as HTML link declarations.

Pinned replay can discover this metadata from an old successful HTML capture
without refetching or rewriting it. Its result is a new extraction with original
source provenance. Failed/challenge receipts remain subject to existing admission
rules; alternatives cannot authorize replay or bypass a barrier.

## September 15 evidence

Apple's Metal HTML page returned a JavaScript notice with an explicit head and
body link to a public Markdown representation. The separate native navigation
retrieved 12844 bytes of literal Markdown extraction instead of the original
285-byte notice. The original outcome stays unchanged. Ten saved-source controls
compare visible output and reader accounting; an actual offline CLI replay checks
the original Apple receipt. No JavaScript, credentials or GPU code was executed.

See `reports/scientific-docs-content-2026-09-15.md` for measurements, native
validation, review findings and remaining browser limitations.
