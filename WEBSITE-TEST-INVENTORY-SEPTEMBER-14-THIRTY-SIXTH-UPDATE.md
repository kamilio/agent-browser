# Website inventory: September 14, 2026, thirty-sixth update

This round prioritizes obtaining useful content without perfect rendering.
It makes **five real native HTTP requests to four URLs on three hosts**. Two
initial failures remain failures; a later BBC request separately validates the fix.
There are no redirects, mocks, challenge retries, credential actions, page scripts,
SafeJS calls, service listeners or real TTY/PTY use. All browser processes finish
without timeout; transports close with zero active requests and private HOME/TMP
remain empty. Native counts are not independent packet captures.

## Fresh observations

| Requested URL | UTC start | Native result | Useful content / limit |
| --- | --- | --- | --- |
| `https://ourworldindata.org/artificial-intelligence` | 23:26:58.594922 | HTTP 200; 103,368 decoded bytes; 18,053 Markdown bytes | Explanatory AI article and explicit chart links, not just navigation. |
| `https://www.swebench.com/` | 23:27:07.324949 | Network decoded-byte limit; no primary response/status or body capture | 2,009,430 observed bytes against the default 2,000,000 limit. No benchmark content recovered in this run. |
| `https://ourworldindata.org/grapher/test-scores-ai-capabilities-relative-human-performance` | 23:27:42.581724 | HTTP 200; 64,836 decoded bytes; 19,163 Markdown bytes | Benchmark definitions, source and methodology text. Interactive chart values/controls were not tested. |
| `https://feeds.bbci.co.uk/news/technology/rss.xml` | 23:28:30.125158 | HTTP 200; 15,186 decoded bytes; unsupported loader | The feed is served as `text/xml`; captured source contains 21 item blocks, but the original loader rejects it. |
| `https://feeds.bbci.co.uk/news/technology/rss.xml` | 23:36:31.612822 | Fresh post-fix HTTP 200; 15,186 decoded bytes; 15,195 Markdown bytes | All 21 literal item blocks, including titles, descriptions and link source, are present. No XML parsing or article-link following. |

Successful final URLs equal requested URLs. The failed SWE-bench report has no
final URL. Its 342,899 encoded and 2,009,430 decoded bytes are partial transfer
accounting at failure, not a verified complete body size. The earlier explicit
`long-v1` observation in `SWE-BENCH-READER-RECOVERY.md` retains its original scope;
this default-profile visit is not a like-for-like regression or proof that the
larger profile now succeeds. No automatic profile escalation or second visit.

The chart URL is followed from the successful article's actual extracted link.
Its explanatory text is readable, although some skeleton lists remain empty and
image alternatives run into adjacent labels. Those rough rendering edges do not
prevent obtaining the text. No chart data download or hidden API is requested.

## Feed fix and same-body comparison

`LITERAL-FEEDS.md` describes the exact four XML/feed MIME types now accepted by
the native text loader. Source is inert, registered literal text: no entity
expansion, resource loading, feed DOM, autodiscovered links or new dependency.
Native CLI capability declarations and their tests advertise these types.
SVG, XHTML and other unrecognized XML types remain rejected; limits are unchanged.

Socket-denied offline replays use the original BBC body and headers unchanged.
Both baseline loaders reject it; both patched native/reader loaders recover
15,195 Markdown bytes with all 21 item markers. Existing text-line discovery
finds the first item on line 17, and bounded selection retrieves its source.
These four loader executions make **zero HTTP requests**. They do not rewrite the
original failed website receipt. The fresh post-fix response has a different hash,
so only the offline before/after comparison is a byte-identical-input experiment.

Decoded body SHA-256:

- AI article: `dc2a9b6f68a907bf2977c386ed1f7736758218a50f434dc496b5abdcbd9a1fad`.
- Benchmark chart: `8cb4209d2c20c21aa56e96723cd78a12711b97d60f1d9dc6c3f2cd65233eef2c`.
- Original BBC feed: `9537aa5ebb571b8c5537e2d1e7de324f76d9d5ace4e9fd4325db9ff4f468c830`.
- Fresh post-fix BBC feed: `24ab2c9edb24b42349c144bc2d738b996fe06ae653a0f21f8b64807fc8b50af2`.

The first four requests use the prior native candidate anchored to commit
`9f83a389f0a1d48421feb2f1b6af1c9d1f23c870`. The fifth uses the isolated literal-feed
overlay on that commit. Each executable has a verified 2,208-file compiled ledger.
Source pins, original receipts, classification and null/false `contentSuccess`
fields are retained; independent content checks are additive, not promotions.

## Validation and remaining work

The explicit 16-file native selection runs 1,204 cases: **1,199 pass and five
fail**. All 38 new feed cases pass. Fifteen selected files pass completely
(1,015 cases).
The five failures are in unchanged `research-find.test.ts`; a separate run against
the previous candidate reproduces the same five failures out of 189 cases. One
expects fragment URLs to be rejected; four expect text-line discovery on HTTP 429
despite the existing early rate-limit stop. They are preserved, not fixed or
silently excluded from the reported selection. This is **not an all-green run**.

Production build, 16 strict test roots, five-file formatting and lint pass.
The source candidate comes from a clean Git archive plus the focused patch,
without adopting existing uncommitted work. No full native release, live service,
SafeJS, device or credential acceptance gate is claimed. No push in this increment.

Evidence starts at `/dev/shm/agent-browser-literal-feed-september14/`, with sibling
`agent-browser-data-article-september14`, `agent-browser-data-chart-september14`,
`agent-browser-benchmark-revisit-september14`, `agent-browser-news-feed-september14`
and `agent-browser-news-feed-fixed-september14` directories. Durable copies retain
these scope names without the `agent-browser-` prefix under
`node_modules/.cache/native-validation/`. See `LIVE-VERIFICATION.json`,
`BASELINE-COMPARISON.json`, replay receipts, native logs and per-site
`PARENT-VERIFICATION.json`; the benchmark agent's original verification is retained.

Hardware/model/benchmark/Poe research is still incomplete. Larger-page admission,
interactive charts and JavaScript-only pages, pointer/rendering gaps, restricted
sites and the broader performance/compatibility goal remain outstanding.
