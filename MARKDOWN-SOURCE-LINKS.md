# Markdown source-link discovery

Requested link discovery can expose bounded link candidates from an unchanged
literal `text/markdown` document. This does not render Markdown, create DOM
anchors, follow links, or execute scripts. Ordinary extraction stays literal.

`discoverDocumentLinks(tree, query)` keeps real DOM links in `entries`. Eligible
Markdown adds optional `sourceMarkdown` with kind `markdown-source-links-v1`,
`partial: true`, source/scanned UTF-16 lengths, truncation, and source candidates.
Each candidate has a resolved HTTP(S) `url`, literal-source `label`,
`labelTruncated`, and one-based `startLine`/`column`; it has **no DOM `ref`**.
The query is a case-insensitive literal URL substring, not a label search.
No-match metadata is omitted unless the source scan was truncated.

Only the original registered text document is eligible. Changing its revision
or source structure disables source discovery. HTML and other literal MIME
types retain existing behavior. The ordinary DOM `scannedNodes` count is not
relabelled as a source-character count.

## Bounds and exclusions

The scanner is deliberately not CommonMark. It recognizes conservative
single-line inline links with literal labels, balanced destination parentheses,
angle-wrapped destinations, and HTTP(S) autolinks. Reference links, images,
titles, ambiguous escapes, malformed URLs and credential-bearing URLs are
excluded. Labels are source text, not rendered or confirmed clickable text.

Default limits: 2,000,000 source UTF-16 units, 8,000,000 work units, nesting 16,
32 entries, 256 label units and 4,096 URL units. Caller entry/label maxima are
256/1,024. URL limits never produce a truncated URL. The enclosing discovery
byte cap still includes all source metadata. Checkpoints propagate cancellation.

Fenced/indented code, inline code, leading bounded frontmatter and opaque HTML
regions are conservatively excluded. Unsupported or ambiguous syntax can hide
later candidates; absence is not proof that a rendered page has no links.
Indentation-based list continuations are omitted. Unsupported quote-in-list or
tab-delimited list regions, and unmatched container fences, can suppress the
remaining source through EOF rather than expose possible code as a link.

## Pinned replay

Explicit `research-replay-cli --links <url-substring>` accepts default-profile
Markdown captures as well as HTML. Supply the existing expected profile,
receipt SHA-256, body SHA-256 and body-byte pins. `selection.matches` counts DOM
links plus source candidates. An empty result retains the ordinary exit-1
empty-extraction outcome; a nonempty result remains `extracted-unverified`.

Other non-HTML MIME, DOM selectors/sections on Markdown, and long-profile
Markdown remain unsupported for this operation. Failed captures are not
promoted into replay admission. Source/body pins, raw/visibility provenance,
classification calls, cleanup and zero-network replay remain required.

Textual challenge classification currently has HTML-specific rules. Markdown
classification wiring does not imply equivalent natural-language challenge
detection. HTTP/header/recorded barriers still apply; no bypass is implemented.

## Evidence

See `reports/source-redirect-runtime-2026-09-15.md` for isolated validation and
saved-source comparisons. The complete original 100-site attempt matrix remains
in `reports/top100-websites-2026-09-15.md`; it is not rewritten as a new run.
