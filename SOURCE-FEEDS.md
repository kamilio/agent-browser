# Discover source-advertised RSS and Atom feeds

Native HTML and research-reader extraction can expose optional `sourceFeeds`:

```json
{
  "kind": "html-feed-links-v1",
  "scope": "document-head",
  "partial": true,
  "verified": false,
  "truncated": false,
  "entries": [
    { "type": "application/rss+xml", "url": "https://example.invalid/news.xml" }
  ]
}
```

This is an advertised resource, **not verified feed content, an equivalent full
article, authorization, or an instruction to fetch**. Feeds can contain excerpts,
comments, empty envelopes or different topics. An advertised MIME can differ
from the eventual response MIME. No feed, item, pagination or subscription is
followed automatically. Existing network policy, credentials isolation, size
limits and challenge handling still apply to a separately authorized navigation.

## Discovery rules

- Inspect at most 256 direct children of the HTML document head, accepting only
  HTML `link` elements with an ASCII-whitespace-separated `alternate` rel token.
- Supported advertised MIME tokens are exactly `application/rss+xml` and
  `application/atom+xml`, after ASCII trimming and case normalization. No MIME
  parameters, generic XML, JSON Feed, arbitrary anchors or guessed endpoints.
- Reuse the Markdown-alternative URL validation: no `http-equiv`, missing/empty
  URLs, credentials, unsupported schemes or control/format characters. Rel/type
  are capped at 256 UTF-16 units; raw and resolved URLs at 4096 units. Never
  truncate a URL into a different destination.
- Resolve using existing document-base rules; this is not DNS resolution or
  navigation approval. Source URLs may contain query data and are not a privacy
  boundary. Native research receipts may redact query strings independently.
- Retain at most eight entries in source order, including duplicates. A scan or
  entry cap marks retained metadata truncated. No retained entry means no field,
  not proof that the page offers no feeds.
- Entries and envelopes are frozen snapshots. Fresh extraction recomputes them
  from the current DOM; they are not original-source offsets or subscriptions.
  Head discovery/base lookup remain governed by document bounds, not a promise
  that the entire operation visits only 256 nodes.

`sourceAlternates` remains Markdown-only. RSS/Atom links do not masquerade as
Markdown or change the contract documented in `SOURCE-ALTERNATES.md`.

## Reader, extraction and replay

The inert reader preserves eligible head links with only `rel`, `type` and `href`.
Existing source-hidden policies and omitted/foreign/body boundaries apply before
discovery. Preserved links change reader output/omission accounting and can change
DOM references/revisions; existing source/document caps still apply. They never
inject visible body text or execute a script.

Extraction attaches feed metadata after primary content and existing table/access
metadata, fitting a whole-entry prefix within the existing serialized UTF-8
`maxBytes` budget. A shortened prefix is truncated; if no entry fits, omit the
field. Feed metadata itself does not displace primary content or raise a cap.
Its scope remains `document-head` for focused/manual/text-prefix extraction.
Literal text/XML documents do not generate feed discovery metadata.

Pinned replay derives feed links from captured source, not a previous report's
claims. Altered receipt pins fail, and challenge/failed-receipt admission remains
unchanged. See `LITERAL-FEEDS.md` for the existing inert XML fallback and its
limitations: XML markup, CDATA and entities remain literal source, not a parsed
feed DOM, validated item list or automatically clickable feed links.

## Using an offered feed

After checking an exact source-advertised target and its authorization, the
existing native research CLI can read supported literal feed responses:

```sh
node dist/scripts/research-browser.js \
  --capture-body --format markdown \
  --min-request-interval-ms 1000 "$SOURCE_VERIFIED_FEED_URL"
```

The HTML reader is not required for a declared literal XML/feed response. Its
source limits differ from the ordinary native text loader; neither is increased
by feed discovery. In default-profile reader Markdown mode, a separate explicit
`--reader --output-limit-policy text-prefix-v1` can retain bounded text after an
extraction-output limit, but cannot fix a network/source limit. The research CLI
does not accept that policy in ordinary native mode. Such output is partial
literal text and can cut an item,
tag or URL: do not treat it as a complete feed or follow an incomplete URL.

These command examples are separate navigations, not permission for retries or
an automatic fallback sequence. Preserve original receipts and distinguish fresh
loads, saved-body configuration checks, and completeness/access claims.

## Fresh feed-to-article validation

On September 16, 2026, three fresh source-advertised feeds from PCMag, RTINGS and
IGN each supplied a complete literal first-item link. Manual inspection preceded
one separate native navigation to each same-origin article URL. This is not a
new XML parser, automatic item-following feature or native rendered-link click.

All six GETs returned complete HTTP200 responses with no redirects or retries.
All three feeds were item-bearing. PCMag and IGN yielded substantive article
prose; RTINGS yielded only navigation/membership text around an unhydrated review
component. Its feed introduction is not evidence of a readable full review.
Unverified access metadata and null serialized scores do not authorize or
establish subscriber content. No scripts, credentials or access bypass were used.

Article requests explicitly selected the existing `long-v1` profile initially;
none retried a default-limit failure. Captured bodies happened to be below the
default network cap, but other default-profile limits were not exercised by
those requests. Full media, interactive content and rendered equivalence remain
unverified. See `reports/feed-article-workflows-2026-09-16.md` for every URL,
measurement, separate content verdict and evidence hash. Original feed and
100-entry reports retain their original results.
