# Source control text boundaries

The semantic source reader unwraps `select`, `optgroup` and `option` instead of
creating native controls. Their literal child text is retained, but dropping the
tags previously joined adjacent labels: `2550100200` or `20 items50 items`.

The reader now emits an ASCII space at each admitted opening boundary and each
matched closing boundary for those three elements. Source visibility and omitted
subtrees are handled first. Unmatched closing tags add no whitespace, and
ordinary adjacent inline text keeps its existing behavior.

This is text separation, not control emulation:

- No selected-only value, `label`/`value` attribute text, input value or invented
  option is added. The existing literal child-text order is retained.
- No `select`, `option` or other interactive control is created in the reader
  document. Native full-parser/form behavior is unchanged.
- Generated spaces count toward the existing output limit, not the source-text
  limit. Source, text, token, depth, omission and cancellation bounds remain.
- Raw and source-visibility policies stay explicit. Hidden controls do not gain
  boundaries or leak text under the policy that omits them. This is not an
  external-CSS or rendered-visibility guarantee.
- Optional-end stack semantics, group-label interpretation and choice-state
  presentation are unchanged. The output is not a faithful rendered select UI.

The fix is in `src/research-loader.ts`, with119 focused cases in
`src/research-option-text.test.ts`. The clean selected suite passes717 tests;
the same final new tests against old production have96 expected failures and23
passes. This is not a full native-manifest claim.

Old/new offline replay of captured arXiv and Wikipedia search results separates
the previously joined labels. Python's focused asyncio documentation Markdown
remains byte-identical. All non-whitespace Markdown, link destinations and
source/omission report fields except output length are unchanged across all
three fixtures. No live requests or new content-retrieval rate are claimed.

See `reports/reader-option-text-2026-09-16.md` for exact URLs, provenance, byte
counts, initial test corrections, guards and remaining limitations.
