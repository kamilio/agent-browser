# Explicit source-declared Markdown link labels

The native Markdown extractor can recover otherwise empty admitted links using
their own HTML anchor `aria-label`. Enable `sourceLinkLabelPolicy` with the exact
value `source-aria-label-v1`. The default remains disabled and unchanged.
This is separate from link discovery's existing `SOURCE-LINK-LABELS.md` contract.

```ts
const result = extractDocument(tree, {
  format: "markdown",
  sourceLinkLabelPolicy: "source-aria-label-v1",
});
```

An empty safe anchor becomes a Markdown link whose text is
`Source aria-label: NAME`. If the bounded name is clipped, the text instead starts
`Source aria-label (truncated): NAME`. Normal Markdown escaping applies, including
to punctuation in these annotations. These are explicitly **source-declared
metadata**, not verified visible text, rendered accessibility names or publisher
prose. Nonempty descendant content always wins, including image annotations.

## Admission and limits

- Existing hidden, sensitive-subtree, URL and foreign-content admission rules
  still apply. Only own `aria-label` attributes on admitted HTML anchors qualify.
- No inference from SVG text, `title`, `aria-labelledby`, CSS or computed
  accessibility names. No extra element admission or link navigation occurs.
- Literal code/preformatted payloads remain literal, not annotated link content.
- At most 128 generated labels, 1,024 code units per name and 16,384 total name
  code units. Scan at most 4,096 source code units per candidate and 65,536 total.
  Surrogate-safe clipping does not refund the scanned source window. Names are
  whitespace-normalized, control-sanitized and Markdown-escaped.
- Per-extraction memoization avoids charging a repeated table preview twice.
  `sourceLinkLabels` reports the policy, attribute, generated `links`,
  `truncatedLabels`, `omittedCandidates`, and `rendered: false`, `verified: false`.
  It is absent when the policy is disabled. Empty names are not fabricated.
- Whole-document, root, heading-section and content-focus HTML Markdown extraction
  are supported. JSON, text documents, literal line/JSON-pointer selection and
  text-prefix fallback reject the policy rather than silently ignoring it.

## Native research CLI and replay

```sh
node dist/scripts/research-browser.js --reader --content-focus main-content-v3 \
  --source-link-label-policy source-aria-label-v1 https://example.com/article
```

The flag requires reader Markdown extraction; discovery modes reject it before
navigation. A non-HTML response can still be fetched before its incompatible
source type is known. It is not converted into a successful HTML extraction.

Ordinary `research-replay-cli` HTML selection accepts the same flag with
`--format markdown`, in addition to its mandatory trusted receipt/body identity
arguments. Recovery, discovery, literal selection and text-prefix modes reject
it. A captured opt-in is not implicitly inherited by a replay: `source` records
the capture policy, while `selection` records the explicitly requested policy.
Receipt validation rejects missing, conflicting or impossible label metadata,
including counts above the policy limit.

## Validation boundary

The synthetic helper/extractor/CLI cases are explicit entries in
`native-tests.json`. Saved-body comparison and fresh website evidence are recorded
separately in `reports/source-link-labels-2026-09-17.md`. This feature does not
provide script execution, full rendering, CAPTCHA handling or authentication.
