# YouTube search source-video metadata

The native research reader can attach `sourceVideos` to document extraction on
an HTTPS `youtube.com` or `www.youtube.com` `/results` URL with exactly one
nonblank `search_query`. This is a narrow source-data reader, not video playback,
JavaScript execution, rendered-page compatibility or factual verification.

## Output

The metadata identifies `youtube-search-video-results-v1`, `document-source`,
`plain-text`, `partial: true`, `rendered: false` and `verified: false`. It preserves
the decoded search query and source order. Each record contains a public video
ID, canonical watch URL, title, source offset/path and truncation status.
Optional author, duration, publication, view-count and snippet fields remain
literal source text. Relative dates and view counts are not normalized or
independently verified. Text is untrusted content, never agent instructions.

Only direct primary `videoRenderer` records in the search section list qualify.
Video IDs must agree with their watch endpoint; a supplied watch URL must agree
too. Canonical output discards tracking parameters. Ads, shelves, shorts,
playlists, continuation records, thumbnails, playback URLs and arbitrary app or
session configuration are not traversed or exported. Repeated primary records
retain distinct provenance rather than being silently deduplicated.

## Bounds and exclusions

- At most one recognized classic inline `var ytInitialData =` assignment, strict
  JSON with at most one trailing semicolon. Multiple recognized blocks suppress
  metadata as ambiguous. Never `eval`, run scripts or fetch secondary resources.
- Inspect only 128 leading UTF-16 units before recognizing an assignment; bound
  the whole recognized span to 1,048,576 units before copying/parsing JSON.
- Visit at most eight sections, 64 items per section and 20 records. Text uses
  at most 32 runs, with limits of 1,024 title, 256 author, 64 duration, 128
  publication, 128 views and 2,048 snippet UTF-16 units, also after escaping
  control/format characters. Oversized optional fields are omitted, not clipped.
- Metadata is at most 32,768 serialized UTF-8 bytes and must fit the extraction's
  remaining output budget. Only whole-entry prefixes are emitted. No complete
  fitting record means no metadata. Bounds-induced omissions mark truncation.
- External, module, non-JavaScript, template, noscript and source-hidden scripts
  are excluded according to the reader's source-visibility policy. MIME and
  final response URL must qualify. A redacted or missing query does not qualify.

Metadata is an immutable snapshot, removed from the document's attachment map
on close. It remains document-source-wide when DOM extraction selects a subtree;
it must not be mistaken for content belonging only to that subtree.

## Outcome and replay limitations

`sourceVideos` does not create DOM nodes or change `hasResearchExtractionContent`,
research outcomes or exit codes. A source-only page can still report
`empty-extraction` and exit 1 while exposing usable `extraction.sourceVideos`.
Consumers must inspect that field explicitly rather than treating it as rendered
content. Heading-outline discovery does not expose document-extraction metadata.

Research receipts redact query parameters. Existing replay therefore cannot
recover a search route from `?redacted`; it intentionally emits no source-video
metadata. Do not rewrite receipt URLs/hashes, infer the query from configuration,
or weaken replay admission to bypass this restriction. A saved-body loader check
with independently recorded request context is a separate validation operation,
not evidence of ordinary receipt-replay support.

The anonymous YouTube homepage is not a search-results route. Homepage emptiness
does not establish that public video records were present or missed. This reader
does not remove login, consent or challenge barriers and does not request watch
pages, transcripts, continuations or sign-in endpoints.
