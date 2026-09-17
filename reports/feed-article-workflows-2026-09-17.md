# Two additional native feed-to-article workflows — September 17, 2026

## Fresh observations

Four fresh anonymous native GETs retrieve two source-advertised feeds and the
first admissible article link from each. All return HTTP 200 with complete bodies;
both articles contain substantive prose, not just navigation or introductions.

| Request | UTC start, September 17 | Decoded bytes | Markdown bytes |
| --- | --- | ---: | ---: |
| Tasting Table feed | 03:47:26.184 | 39,155 | 39,164 |
| ScienceInsights feed | 03:47:28.713 | 13,469 | 13,477 |
| Tasting Table article | 03:48:57.528 | 60,111 | 3,372 |
| ScienceInsights article | 03:49:00.080 | 190,895 | 14,834 |

Exact native request targets:

- `https://www.tastingtable.com/category/news/feed/`
- `https://www.tastingtable.com/2260615/costco-delivery-uber-eats-expanded-states/`
- `https://scienceinsights.org/feed/`
- `https://scienceinsights.org/does-medicaid-cover-plastic-surgery-cosmetic-vs-reconstructive/`

Feed advertisements come from saved September 15 native HTML, with original
tags/offsets and receipt/body hashes retained. The feeds themselves are freshly
fetched. Article selection uses the first literal, same-host, query-free HTTPS
item link. No guessed endpoint, tracking-URL rewrite or replacement request is
used. Link selection is an offline XML inspection, **not native automatic feed
parsing or clicking**; all website acquisition uses this browser's native engine.

## What was checked

Native feed Markdown matches the complete decoded XML plus its code fence.
For articles, independent saved-source review matches **5/5 Tasting Table** and
**27/27 ScienceInsights** article-descendant paragraphs longer than 80 normalized
characters, including body paragraphs beyond the introduction. Early, middle
and final selected evidence retains source offsets and paragraph hashes.

This is bounded source-content verification, not an exhaustive visibility,
rendering or factual-accuracy audit. Article medical/legal coverage claims and
commercial offers are not independently verified. Captured outcomes stay
`extracted-unverified` with `contentSuccess: null`. No concrete extraction defect
was found in these two article outputs.

## Runtime and cleanup

Live navigation uses the prior sealed source-heading runtime, matching the
committed runtime sources at `e4f565d`. It does **not** live-test the subsequent
raw-scan performance patch. Separate final-candidate, zero-network controls
preserve these four captures' exact Markdown, reader metadata, classifications
and outcomes; see the adjacent performance report.

Corrected exact-command offline proofs precede live use. There are exactly four
GETs, zero retries and zero redirects under the test-only guard. All requests,
TLS sockets and child groups close; HOME/TMP remain empty. No credentials, page
scripts, SafeJS, alternate browser/client, identity changes or CAPTCHA solver
are used. The inherited native test gate is prior evidence, not a new suite.

Failed offline proofs remain recorded: a guard syntax error and a Markdown
escaping expectation. An independent review-script naming collision is corrected
separately. The original feed-admitted harness snapshot remains hash-verifiable
after the article-proof expectation changes. None adds a live request.

Detailed review, lifecycle results, source comparisons and exact commands:
`node_modules/.cache/native-validation/public-feed-workflows-september17/RESULT.md`
and its JSON sibling. The public JSON report records evidence hashes. Historical
100-entry verdicts remain unchanged; broader browser and research goals stay open.
