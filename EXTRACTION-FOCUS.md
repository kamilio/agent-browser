# Explicit content-landmark focus

`extractDocument(tree, { contentFocus: "main-content-v1" })` can reduce navigation
and footer text without fetching anything or running page scripts. It is opt-in:
ordinary extraction keeps the whole document. Markdown and JSON are supported.

```sh
agent-browser extract --content-focus main-content-v1
agent-browser extract --format json --content-focus main-content-v1
node dist/scripts/research-browser.js --reader --content-focus main-content-v1 https://example.com/
```

## Selection contract

The bounded scan uses existing native HTML roles and extraction visibility rules:

1. Select the unique nonempty outermost `main` role, including HTML `<main>`.
2. If there are no nonempty mains, select the unique nonempty outermost `article`
   role, including HTML `<article>`.
3. If mains are ambiguous, do not resolve the ambiguity by selecting an article.
   Multiple articles, or no nonempty landmark, also fall back to the document.

Nested landmarks of the same role count once. Nonempty means admitted visible
non-whitespace text or image alternative text, not a usefulness judgment. Empty
landmarks and hidden/inert/omitted subtrees do not become candidates. Existing
omissions include input, textarea, select and datalist subtrees; admitted button
labels can establish nonemptiness, including on a button with a landmark role.
A visibility-hidden landmark is not a candidate, though an explicitly
visible descendant can still contribute to ordinary extraction. Foreign-namespace
elements are not landmark candidates. Roles use the browser's existing supported
semantic subset, not a new accessibility implementation.

The extraction's `scope` identifies the actual root. The frozen
`contentSelection` metadata records `policy`, `selected`, `reason`,
`mainCandidates`, `articleCandidates` and `scannedNodes`. Reasons are
`unique-main`, `unique-article`, `ambiguous-main`, `ambiguous-article` or
`no-nonempty-landmark`. Candidate counts are nonempty outermost counts, not total
matching elements. Document fallback is explicit, not an error or truncated scan.

## Bounds and limitations

- Manual `root`, `section` and `lines` conflict with automatic focus. Research
  `--selector`, `--section`, `--lines`, `--headings` and `--find` also conflict.
- Scanning and extraction retain their existing node/depth bounds. A scan limit
  throws rather than choosing from an incomplete scan. Output, metadata and any
  explicit `text-prefix-v1` fallback still fit the existing byte budget.
  The added scan counts encountered nodes before admission, pruning excluded
  descendants; it can hit a limit even when ordinary extraction would fit.
- Source descriptions, alternates and source-data-table metadata retain their
  existing document-level provenance; focusing does not make them scope-local.
- Research reports retain full captured bodies and record the requested policy
  separately as `contentFocus`. Header, bounded document-diagnostic and optional
  unfiltered reader-visibility checks still run before focused extraction.
  Focusing neither removes an established challenge nor authorizes a bypass.
- Literal Markdown/plain text falls back to the document. HTML served as Markdown
  still requires the separate explicit reader MIME policy to become an HTML tree.
- Replay does not automatically inherit focus. An explicit replay selector or
  section continues to select from the retained source rather than focused output.
- Landmark markup can be misleading. A unique main may contain a login shell or
  promotion, and useful content may live outside it. Keep ordinary extraction or
  use an explicit scope when that matters. Nonempty research output remains
  `extracted-unverified`, never proof of access, completeness or factual accuracy.
- The added scan is bounded and does not fetch. Smaller output is not a measured
  latency improvement: focus adds traversal work and may omit relevant context.
