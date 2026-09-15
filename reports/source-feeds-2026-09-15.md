# Advertised feed discovery and validation — September 15, 2026

## Outcome

Native/reader extraction now exposes bounded RSS/Atom sourceFeeds metadata,
separate from Markdown-only sourceAlternates. It surfaces advertised resources
without automatically fetching a feed/item or changing access/barrier decisions.
See SOURCE-FEEDS.md for exact URL, scope, entry and byte-budget rules.

The native survey found26 head-feed links on16 of103 saved pages (22 distinct
URLs); all were previously rejected by the Markdown-only discovery helper.
Three non-HTML sources were skipped. One bounded head window was not exhaustive;
the survey is not a complete inventory of every possible feed on these sites.
Two explicit RSS anchors supplied two more test targets; no endpoint was guessed.
The unrelated deer-feeding article found by a text heuristic was not a feed target.

## Fresh native checks

24 initial navigations on15 hosts produced25 GETs including one Wikipedia redirect,
zero automatic retries and23 captured complete responses. All request/socket and
child groups closed. Native identity and ordinary Accept were observed; no page
scripts, SDK, cookies/credentials, alternate clients, listeners or TTY probes.
The fixed2,000,000-byte response and256,000-byte extraction limits stayed intact.
This phase uses the pinned681400c pre-change runtime; it tests existing feed
reading, while the later saved-body comparisons validate new feed discovery.

20 native outputs are nonempty, but content review distinguishes **16 useful
item-bearing literal feeds and four empty feed envelopes**. Four other targets
fail limits. Review scans all available text for lexical markers, samples item
blocks in16 extracted feeds and three failed captures, reads four small envelopes
fully, and has only receipt/header evidence for WhoWhatWear. It is not a conformant
XML parse, exhaustive article review or subscriber/full-content access proof.

| # | Exact source-advertised target | Native HTTP status | Outcome | Markdown bytes | Content review |
| --- | --- | --- | --- | ---: | --- |
| 1 | `https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=potd&feedformat=atom` | 200 | extracted-unverified | 77293 | useful-item-bearing-literal-feed |
| 2 | `https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=featured&feedformat=atom` | 200 | extracted-unverified | 86517 | useful-item-bearing-literal-feed |
| 3 | `https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=onthisday&feedformat=atom` | 200 | extracted-unverified | 103531 | useful-item-bearing-literal-feed |
| 4 | `https://en.wikipedia.org/w/index.php?title=Special:RecentChanges&feed=atom` | 200 | failure | 0 | output-limit |
| 5 | `https://feeds.businessinsider.com/custom/all` | 200 | extracted-unverified | 216409 | useful-item-bearing-literal-feed |
| 6 | `https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml` | 200 | extracted-unverified | 58877 | useful-item-bearing-literal-feed |
| 7 | `https://www.tastingtable.com/category/news/feed/` | 200 | extracted-unverified | 39055 | useful-item-bearing-literal-feed |
| 8 | `https://www.tastingtable.com/feed/` | 200 | extracted-unverified | 38111 | useful-item-bearing-literal-feed |
| 9 | `https://www.pcmag.com/feeds/rss/latest` | 200 | extracted-unverified | 56256 | useful-item-bearing-literal-feed |
| 10 | `https://www.bobvila.com/feed/` | 200 | failure | 0 | loader-source-limit |
| 11 | `https://www.rtings.com/latest-rss.xml` | 200 | extracted-unverified | 44775 | useful-item-bearing-literal-feed |
| 12 | `https://scienceinsights.org/feed/` | 200 | extracted-unverified | 13477 | useful-item-bearing-literal-feed |
| 13 | `https://scienceinsights.org/comments/feed/` | 200 | extracted-unverified | 732 | empty-feed-envelope |
| 14 | `https://engineerfix.com/feed/` | 200 | extracted-unverified | 13077 | useful-item-bearing-literal-feed |
| 15 | `https://engineerfix.com/comments/feed/` | 200 | extracted-unverified | 721 | empty-feed-envelope |
| 16 | `https://biologyinsights.com/feed/` | 200 | extracted-unverified | 25741 | useful-item-bearing-literal-feed |
| 17 | `https://biologyinsights.com/comments/feed/` | 200 | extracted-unverified | 733 | empty-feed-envelope |
| 18 | `https://www.whowhatwear.com/feeds.xml` | no complete response (200 headers) | failure | 0 | network-decoded-response-limit |
| 19 | `https://www.reviewed.com/articles.atom` | 200 | failure | 0 | output-limit |
| 20 | `https://www.ign.com/rss/v2/articles/feed` | 200 | extracted-unverified | 146094 | useful-item-bearing-literal-feed |
| 21 | `https://www.ign.com/rss/v2/videos/feed` | 200 | extracted-unverified | 77645 | useful-item-bearing-literal-feed |
| 22 | `https://www.ign.com/rss/wikis/feed` | 200 | extracted-unverified | 687 | empty-feed-envelope |
| 23 | `https://www.kbb.com/feed/` | 200 | extracted-unverified | 127750 | useful-item-bearing-literal-feed |
| 24 | `https://www.caranddriver.com/rss/all.xml/` | 200 | extracted-unverified | 36998 | useful-item-bearing-literal-feed |

Wikipedia RecentChanges and Reviewed exceed the extraction cap. BobVila's complete
RSS body exceeds the reader's1,000,000-code-unit limit. WhoWhatWear supplies200
headers but exceeds the2,000,000 decoded-byte network limit, leaving no complete
primary response/body. Header receipt alone is not a successful load.

Query-bearing Wikipedia URLs are intentionally redacted in ordinary receipts.
The exact targets and final request context above are separately pinned from
source links and observed redirect/request paths. Historical receipts are never
rewritten. Initial audit assumptions about redaction and null failed-response
fields are retained as failed checks; no website was rerun to fix the audit.

## Existing recovery workflows

Separate guarded checks use the retained complete bodies, without new requests.
The existing reader text-prefix policy yields251,910 Markdown bytes for Wikipedia
and247,157 for Reviewed, with explicit truncation/source-prefix provenance. These
can cut XML tags, item bodies or URLs and are not complete feeds. Original live
failure receipts stay unchanged.

The broader three-mode recovery harness is **not all green**: all three attempted
ordinary-native text-prefix calls are rejected by existing option validation
before any mock request. Six actual mocked navigations occurred, not nine.
BobVila still fails the reader source cap. An additional three-navigation native
find/lines experiment loads the source under the ordinary existing2M text cap,
finds42 literal item-marker lines, and selects lines1–3. The2479-byte output
contains the first item's title/teaser/metadata and disclosure, not substantive
article-body paragraphs. Its original assertion incorrectly omits the closing
fence's final newline; an independent read-only comparison proves the enclosed
2471-byte source window exact. The harness remains failed and no complete item
or article-body recovery is claimed. Failed artifacts are never rewritten.

## Feature regression validation

- Clean baseline:3829pass/four existing failures in53 selected native files.
  Candidate:3896pass/the same four failures in55 files; all67new tests also pass
  separately. Build, new-test types, formatter and lint pass. Broad test types
  retain the existing snapshot.test.ts:83 error; this is not an all-green suite.
- Initial67new tests already passed; five lint findings in test number constants
  were corrected. Both compiled production versions are byte-identical.
-126 retained responses (103 prior plus23 fresh feeds), document/focused modes,
  baseline/candidate:504 mocked navigations and252 paired comparisons. Every
  visible Markdown hash and outcome/barrier/contentSuccess stays unchanged.
-26 entries appear on16 pages (32 policy cases). Reader accounting changes on17
  pages, reflecting27 newly preserved links; source limits and text/raw accounting
  stay in force. Metadata fitting preserves the256,000-byte extraction cap.
- CNET's additional Atom link ends up in the parsed body, so no head-feed metadata
  is emitted. Two extra children/four mocked navigations verify unchanged content
  and other normalized metadata while the focused scan counter changes4506->4508.
  The link was not promoted to manufacture head discovery.
- Pinned replay tests derive feeds from source despite forged prior metadata and
  still deny challenge admission. Source URL advertisements never authorize
  browsing, subscriptions, item requests, script execution or credential use.

The JSON companion retains all URLs, provenance, MIME/header distinctions,
reviews, body/output hashes, checks and evidence pins. Across standalone survey,
live, replay and recovery experiments:385 closed children and517 actual mocked
navigations, excluding native-test workers; only25 actual GET requests. Failed
pre-navigation API calls are counted separately. No push or historical report
rewrite. The original100-URL corpus remains an agent-citation proxy, not measured
global agent traffic. Broader browser/interaction, SafeJS, provider/passkey and
challenge gates stay open; bounded failed-network-prefix recovery is only a
documented design assessment, not an implemented oversized-response fix.
