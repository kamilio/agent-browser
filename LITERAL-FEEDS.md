# Read XML feeds as literal text

The native browser and semantic reader accept `text/xml`, `application/xml`,
`application/rss+xml` and `application/atom+xml` as bounded literal-text documents.
This covers common RSS/Atom responses without adding a parser or page-runtime
dependency. The native CLI advertises these four document formats.

This is deliberately a practical content fallback, **not an XML or feed parser**:

- Source text lives in the existing registered `pre` text document. Item titles,
  descriptions, links, dates, CDATA and markup remain readable as source.
- XML elements do not become DOM elements or clickable links. Scripts, DTDs,
  entity declarations, external entities and XML stylesheets are never evaluated,
  expanded or fetched. This does not add article retrieval or subscriptions.
- Existing `--find` and `--lines` operations locate and select literal lines. They
  do not query XML paths, decode feed entities or automatically follow links.
- Markdown fences the source; JSON extraction retains text nodes. Existing
  extraction normalization/escaping applies; the response capture, not Markdown,
  remains the byte-exact archive.
- Existing HTTP charset/BOM decoding remains in place, with UTF-8 fallback. XML
  encoding declarations are ordinary source text, not encoding instructions.
- Exactly one explicit Content-Type remains required. Generic `*+xml`, SVG,
  XHTML, JavaScript, HTML-as-text and binary MIME types are not newly admitted.
- Network, decoding, source, document, line-scan and output limits remain intact.
  The separate `long-v1` reader profile remains HTML-only.

For example, the native research CLI can extract a public feed with its existing
`--reader --format markdown` options, find `<item>` with `--find '<item>'`, or
select a known line range with `--lines START:END`. Each CLI invocation is a new
navigation unless an existing offline-capture workflow is used; these examples
do not imply automatic reuse or grant permission to repeat restricted requests.

## Why this change

The September 14, 2026 BBC technology-feed test retrieved HTTP 200 and 15,186
decoded bytes, but failed in the loader because the server sends
`text/xml; charset=utf-8`. The captured body contains 21 RSS item markers.
An offline same-body comparison reproduces the rejection in both native and
reader loaders before the change. The original failed website receipt remains
unchanged; subsequent native tests, replays and website observations are separate.

Both patched loaders recover 15,195 Markdown bytes with all 21 item markers from
that same saved response, without network access. A fresh post-fix native-reader
visit also extracts 15,195 bytes and all 21 literal item blocks. Its body hash
differs from the original response, so it is not the identical-input comparison.
All 38 new feed tests pass; the broader 16-file run records 1,199 passes and five
unchanged baseline failures, detailed in the inventory rather than hidden.

See `WEBSITE-TEST-INVENTORY-SEPTEMBER-14-THIRTY-SIXTH-UPDATE.md` for actual outcomes
and limitations. Evidence begins at
`/dev/shm/agent-browser-literal-feed-september14/`; durable copies use
`node_modules/.cache/native-validation/literal-feed-september14/`.

## September 15 discovery and bounded windows

`sourceFeeds` now exposes eligible RSS/Atom links from an HTML document head,
without automatically fetching them. See `SOURCE-FEEDS.md` and the new 24-target
matrix in `reports/source-feeds-2026-09-15.md`. The September 14 measurements above
remain their original run; the new source-advertised feed visits are separate.

The ordinary native text loader and HTML reader have different existing source
bounds. On a retained BobVila RSS response, the reader rejects 1,089,570 code units,
while the ordinary native loader accepts it under its existing 2M limit. Full
extraction still exceeds 256KB. Native literal `<item>` discovery and a selected
three-line window retain 2,479 Markdown bytes of first-item metadata and teaser;
they do not recover the full item or substantive article body. The probe's original
closing-fence-newline assertion remains failed; an independent artifact check
verifies the enclosed 2,471 source bytes exactly. No website was refetched.

For smaller admitted sources, existing default-reader Markdown `text-prefix-v1`
can retain a bounded prefix after an output limit. It does not work around source
or network caps, and the research CLI rejects it in ordinary native mode. New
offline checks retain partial Wikipedia/Reviewed feed prefixes while preserving
the original live failures. A cut XML tag, item or URL is not a complete entity.
