# Target captured articles with source classes and roles

Native reader mode preserves `class` and `role` as inert strings on elements
whose source tag is retained. This allows observed article selectors such as
`.body[role="main"]` without restoring page styles or executing JavaScript.
Existing native selector syntax and exact-one-match requirements still apply.

For a successful, independently pinned HTML capture:

```sh
node dist/scripts/research-replay-cli.js --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" --body-sha256 "$BODY_SHA256" \
  --body-bytes "$BODY_BYTES" --selector '.body[role="main"]' \
  --format markdown < captured-page.jsonl > article.jsonl
```

Inspect the actual captured source first. This example is not a universal
selector, a fallback search or permission to navigate again. The result remains
a JSONL provenance envelope with Markdown in `extraction.content`. Replay uses
no network. Live `--reader --selector` uses the same reader and does navigate.

## Retention boundaries

- Retained tags keep raw class/role values, including whitespace, unknown role
  tokens and case. Attribute values are escaped before native HTML parsing.
- `[role="main"]` tests the attribute string; `[role~="main"]` tests a token.
  This does not implement ARIA fallback-role resolution or accessibility-tree
  semantics. Existing explicit ARIA-table metadata validation remains separate.
- Unwrapped unknown/control elements and remapped elements do not transfer their
  class/role to synthetic wrappers or point anchors. Existing source-ID handling
  is unchanged. Omitted subtrees do not reappear.
- CSS, inline styles, event handlers, resource URLs and hidden-content semantics
  are not restored. A `.hidden` class is selectable inert data, not proof that
  its content is visible or hidden on the original site.
- Source, escaped-reader-output, document and extraction limits still apply.
  Additional retained attributes consume existing output/document budgets;
  they do not receive a separate unbounded storage channel.
- Whole-document challenge checks still precede selection. Zero or multiple
  matches fail explicitly rather than silently selecting some other material.

Article selection intentionally omits surrounding content. Verify substantive
paragraphs, headings, code indentation and tables. A successful extraction stays
partial and unverified; it does not establish visual or interactive fidelity.
See `CAPTURED-ARTICLE-MARKDOWN.md` for the output contract and the forty-first
website inventory for captured-page regression measurements.
