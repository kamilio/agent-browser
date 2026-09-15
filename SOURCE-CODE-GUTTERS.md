# Source-code line-number gutters

Native Markdown and JSON extraction omit a narrowly recognized Rustdoc source
line-number anchor instead of prepending its label to the source code. This
does not execute code, change the DOM, or remove ordinary numeric text/links.

Recognition requires all of the following:

- An HTML `a` at the beginning of a source line under HTML `code` inside the
  nearest HTML `pre` with a case-sensitive `rust` class token.
- Empty `data-nosnippet`, a canonical positive decimal `id` of at most nine
  digits, raw `href` exactly `#` plus that ID, and exactly one text child equal
  to the ID. External links, padded labels and nonempty markers do not qualify.
- At most 128 ancestor steps to establish that context; at most 1,024 code
  units in the `pre` class attribute. Foreign namespaces fail recognition.

Line position is tracked during normal extraction traversal through nested
syntax-highlighting spans. A nonempty text node leaves the position at line
start only when it ends in LF. Leading indentation, a mid-line anchor, or an
intervening leaf element conservatively prevents omission. No sibling rescans
or document mutation are used. `pre`/`code` extraction roots are supported;
an explicitly selected anchor root retains its original label and link.

When at least one anchor is omitted, extraction includes:

```json
{
  "sourceCodeGutters": {
    "kind": "rustdoc-line-number-anchors-v1",
    "anchors": 709
  }
}
```

The count is per extraction, not a claim that every source line was recovered.
The example count comes from the saved Tokio source validation. The field is
absent when no anchor qualifies. Omitted anchor/text nodes still consume node
and depth budgets. Output budgets include the returned metadata. Existing DOM
references, revisions, source text, numeric literals and code whitespace remain.

The reader now preserves only empty `data-nosnippet` attributes on anchors so
that native and reader extraction can apply the same rule. Reader attribute
omission/output-size diagnostics can therefore change on matching source HTML.
This is an extraction behavior change, not a generic visibility rule.

It does not reconstruct JavaScript-only source, solve access challenges, infer
arbitrary gutter layouts, or make GitHub's flattened source display code-faithful.
See `reports/developer-content-paths-2026-09-15.md` for separate mocked, saved-body
and fresh-live evidence. Historical receipts and the 100-page sweep are unchanged.
