# Explicit reader MIME interpretation

The native research reader can interpret an HTML document mistakenly served as
`text/markdown` with the opt-in policy `markdown-html-document-v1`:

```sh
node dist/scripts/research-browser.js --reader --format markdown \
  --reader-mime-policy markdown-html-document-v1 https://example.com/
```

Use the repository's normal build before invoking the compiled CLI. This is a
reader policy, not a network-header override, generic MIME sniffer, page runtime,
CAPTCHA bypass, or permission to access an authenticated page.

## Contract

- The default behavior is unchanged. Only the default reader profile and one
  explicitly declared `text/markdown` Content-Type are eligible.
- Original source decoding, charset/BOM handling, and resource limits run first.
  Recognition inspects at most 4,096 code units and 64 tokenizer tokens for an
  HTML5 doctype, an HTML root, and a head/body start tag.
- Fragments, fenced or indented code, prose, YAML frontmatter, missing or
  conflicting MIME types, and other declared types do not trigger interpretation.
  Recognition establishes a prefix, not complete-document validity or intent:
  an unfenced complete HTML example can be ambiguous. Opt in deliberately.
- Matching text passes through the existing inert HTML sanitizer/parser. No
  scripts, subresources, forms, credentials, or additional requests are executed.
- Response headers, captured bytes, hashes, charset evidence, and reported
  Content-Type remain unchanged. A temporary effective-MIME view is used only
  for challenge classification; diagnostics disclose `reader-mime-interpretation`.
- Existing source-hidden checks inspect an unfiltered interpreted tree first.
  Hiding a challenge with source attributes must not turn it into readable content.
- DOM extraction, headings, selectors, and sections support this policy; literal
  `--lines`, `--find`, non-reader mode, and `long-v1` reject it. JSON and Markdown
  DOM extraction retain their existing output limits.

`ResearchExecutionOptions.readerMimePolicy` exposes the same option to native
research callers. The CLI report records the requested `readerMimePolicy`.
Only an actual interpretation adds `reader.mimePolicy` and an immutable
`reader.mimeInterpretation` containing the policy, declared and effective MIME,
`html5-doctype-root-prefix` basis, and recognized prefix length. Unmatched reader
metadata remains unchanged.

## Replay and output limits

Validated capture replay checks policy declarations and interpretation evidence,
re-recognizes the original bytes, and rejects contradictory MIME or prefix
claims. Converted documents use DOM operations, not literal-text selections.
Genuine Markdown retains its existing literal-text and source-link behavior.

This policy does not enable partial output or raise a cap. The separate
`text-prefix-v1` output policy is documented in `EXTRACTION-PREFIX.md`. Recovery
from an extraction limit still requires its own explicit contract. The existing
output-limit capture recovery gate requires declared `text/html` and therefore
continues to reject interpreted Markdown captures. This change does not widen
that admission gate; successful interpreted captures support ordinary DOM replay.

## Evidence

The motivating input is a saved Kateminimalist response from the September 15,
2026 citation-derived 100-page sweep: HTML bytes declared as Markdown. Follow-up
fixture and saved-body checks are offline validation, not a fresh visit or proof
that the site's current prices, inventory, scripts, login, or checkout work.
Historical live measurements remain in their original reports.
