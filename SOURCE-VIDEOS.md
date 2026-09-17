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
too. Canonical output discards tracking parameters from the structured video URL.
Literal snippets may themselves contain promotional, shortened or other URL-like
text; those strings are untrusted source text, not validated or followed links.
Ads, shelves, shorts,
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

## Explicit source-search command

Agents that need the public source records, rather than a rendered-page or DOM
success verdict, can use the dedicated command:

```sh
node dist/scripts/research-video-search.js --query 'local llm hardware'
```

It constructs one HTTPS YouTube search URL from the query and uses the existing
native reader, source-video adapter and transport. Redirects are manual: a
redirect response is a stopped HTTP result, not permission to follow another
endpoint. There are no retries, scripts, SDK calls, credentials, watch-page,
transcript, playback, asset or continuation requests. No other browser or runtime
is involved. The API-only `researchNavigation` option `redirectMode: "manual"`
supports this restriction without changing the generic command's defaults.

The command emits one `native-video-search-v1` JSONL report. A nonempty eligible
`sourceVideos` projection on an HTTP-success response without a native failure
or semantic barrier yields `outcome: "source-results-unverified"` and exit 0.
The report retains `nativeOutcome`, which may still be `empty-extraction`, plus
the source response's hash, byte counts, timestamp and redacted URL. It never
creates DOM content or changes the generic research command's outcome. Its
`contentSuccess` stays null, and `partial: true`, `rendered: false`, and
`verified: false` remain explicit.

An ordinary DOM page without eligible video records yields `empty-source` and
exit 1; nonempty page text or a title is not a video-search success. HTTP failures,
semantic barriers and execution failures also exit 1 and omit `sourceVideos`.
Rate-limit/backoff advice from the native reader is retained without retry.
Malformed command arguments exit 64; `--help` exits 0 without a request.

The query must be nonblank, at most 256 UTF-16 units, and contain neither Unicode
control/format characters nor malformed surrogate sequences. Valid text and
whitespace are preserved, not normalized. URL metacharacters are encoded as part
of the sole `search_query` value; they cannot supply another host or query key.
The explicit query is included in the result and sent to YouTube: do not put
passwords, tokens or other secrets in it.

Existing 2,000,000-byte response and source-video limits remain unchanged. The
JSONL output, including its newline, is bounded to 65,536 UTF-8 bytes. The command
has a 120-second overall deadline covering retrieval and output; it uses the
shared cancellable writer and does not end or destroy a caller-owned output
stream. Abort and output failure stop work rather than triggering another request.
Network/resource closure still depends on the native transport's cancellation
contract; this is not a claim that every operating-system I/O operation has a
universal hard deadline.

The imported APIs are `parseResearchVideoSearchArguments`,
`researchVideoSearch(query, signal?)`, and
`runResearchVideoSearchCli(args, output, signal?)`. Results are literal public
source records, not verified search quality, current recommendations or evidence
that a listed video can be played. Existing query-redacted receipt replay limits
remain unchanged.
