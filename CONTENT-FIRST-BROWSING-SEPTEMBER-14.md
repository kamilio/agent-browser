# Content-first browsing — September 14, 2026

**Useful content obtained from six documents; Reddit access is blocked.**
The user explicitly prioritized getting content over perfect rendering. The
existing native semantic reader works without a layout pass, page JavaScript,
SafeJS, Chromium, Firefox or a remote browser. These are fresh observations on
audited runtime `5c7a882003df9a558397e4a8ece1220023baa83e`, not renamed old captures.

## Fresh reader results

| Public page | UTC start / elapsed | Result | Extracted Markdown bytes |
| --- | --- | --- | ---: |
| MDN `Document/querySelectorAll` | September 14, 17:27; 121ms | HTTP200; explanation, syntax, examples and links | 42,845 |
| Hacker News `/` | September 14, 17:27; 262ms | HTTP200; story titles, article and comment links | 35,762 |
| Python `/3/library/asyncio.html` | September 14, 17:27; 28ms | HTTP200; introduction, runnable example and documentation links | 8,741 |
| Python `/3/library/asyncio-runner.html` | September 14, 17:29; 89ms | HTTP200; runner APIs and parameter explanations | 13,273 |
| `nvartolomei.com/dist-sys-classics/` | September 14, 17:29; 125ms | HTTP200; distributed-systems reading list | 2,312 |
| Wikipedia `/wiki/Large_language_model` | September 14, 17:29; 313ms | HTTP200; whole-document output limit, followed by offline section recovery | 23,135 across three sections |
| Reddit `/r/PoeAI/` | September 14, 17:29; 36ms | HTTP403; native `access-denied` classification; stopped, no bypass | 0 |

Exact reader URLs are in the twenty-ninth website-inventory update. The first
batch runs17:27:17.297756–17:27:17.862383 UTC; the second runs
17:29:40.451795–17:29:41.166797 UTC. Per-page times above are the reader's own
elapsed counters, not benchmark comparisons or latency guarantees.

Seven reader requests produce six HTTP200 responses and one403, with no redirects,
mocked requests or auxiliary resource loads. Native counters total1,702,905 decoded
bytes and496,343 encoded bytes. Decoded body hashes match both primary-response
and captured-body records. Transport owners close with zero active requests;
both supervisor process groups exit and private HOME/TMP remain empty.

The Python runner URL is taken from the earlier native-reader Markdown. The
distributed-systems article URL is taken from the actual HN story link. Their
discovery receipts retain the source-observation hash. This is **semantic URL
following**, not a claimed geometry click. Wikipedia and Reddit are explicit
research seeds, not discovered-link claims.

The shipped reader records `extracted-unverified` and `contentSuccess:null` until
content is inspected. Separate parent checks confirm site-specific explanations,
code, titles and links without rewriting those original records. Useful content
does not mean complete page fidelity: this profile omits scripts/styles/SVG/math,
does not apply hidden-content semantics, and retains verbose table boundaries.
HN's layout-table markers and MDN navigation boilerplate are remaining usability
issues, but no longer prevent reading the content.

## Wikipedia: recover content without another request

The1,071,612-byte Wikipedia response is fetched, decoded and parsed successfully.
The failure is the256,000-byte Markdown extraction quota, not network access,
CAPTCHA, missing data or an input-parser failure. A separate source-level offline
probe reproduces the exact `Markdown extraction output limit exceeded` error.
It preserves the failed live report and original SHA-256-checked body, rather
than claiming the successful-receipt replay API accepted a failed receipt.

Using the same native reader tree and unchanged limits, native heading queries
and section extraction recover:

- `h2#History`:9,598 bytes.
- `h2#Evaluation`:7,868 bytes.
- `h2#Limitations_and_challenges`:5,669 bytes.

There are zero network attempts during recovery. The document and query owner
close; the original body remains byte-identical. This demonstrates practical
bounded reading, not recovery of the entire article. The next code increment
makes the output-limit dimension and observed byte count machine-readable so
agents can distinguish section-recoverable output limits from parser failures.

Reddit's response is a separate access restriction: classifier evidence is
`html-network-security-block`, provider `unspecified`, confidence `possible`.
No claim is made that Cloudflare caused it. No alternate endpoint, login,
fingerprint spoofing, CAPTCHA solving or retry is performed. Poe opinion
research is not complete from this blocked page.

## Earlier strict MDN flow, kept distinct

Before the user's content-first clarification, one full-resource native MDN
`querySelector` visit runs17:21:39.852–17:21:46.375 UTC. Its initial document
commits with2,731 nodes and the correct title. All26 real resources return200:
oneHTML,18CSS and7SVG, totaling298,668 decoded and45,128 encoded bytes. This
includes the SVG missing from the old19-response corpus. No mock, redirect,
local image rejection or access barrier occurs; minimum wire spacing is251.65ms.
SVG retrieval is not SVG rendering: the image owner's decoded-byte count is0.

The harness deliberately stops at its initial formatting census, before link
discovery or click. Four nonadvisory CSS categories and five non-CSS categories
are retained. The thrown assertion is the **harness's strict gate**, not a tested
native click failure; interactive/visual completion remains unproved. The later
reader runs are a newly selected content profile, not a rewrite of that outcome.

The original independent verifier passes14 of15 checks and fails on the initial
document's `Accept`: adapter provenance records null, while the pinned native
transport supplies its default `*/*`. The original failure and sealed verifier
remain unchanged. A separately recorded read-only parent reconciliation permits
only that document default, reruns all15 checks against the original evidence,
and passes. It does **not** make the full interactive flow pass. The original
seal covers128 files,129 including its ledger; empty private directories remain.

## Evidence and remaining gates

Durable copies are under:

- `node_modules/.cache/native-validation/mdn-live-flow-september14/`
- `node_modules/.cache/native-validation/content-browse-september14/`
- `node_modules/.cache/native-validation/content-links-september14/`
- `node_modules/.cache/native-validation/wikipedia-content-september14/`
- `node_modules/.cache/native-validation/content-review-september14/`

Reader evidence includes native primary summaries, decoded captures and extraction
records; it is not the strict MDN lane's raw-header/encoded-wire capture protocol.
Two local audit-marker mistakes are disclosed in the content-review
`POSTPROCESSING.md`; neither repeats a browser request or changes source evidence.
All sites use omitted credentials and the native public-address/TLS policy.
No new SafeJS, credential/provider/passkey, device or real-TTY gate is exercised.
The prior23,975 native pass count remains historical, not a test rerun here.

SafeJS0.1.599 is still staged, not activated. Static contract review found missing
staged dependencies and incompatible default legacy selection; explicit extension
selection and actual isolated SDK acceptance remain required. Callback lifetime
ownership also needs attention. The overall browser goal remains **ACTIVE**;
content-first browsing is the working default for ongoing research, while
interaction/rendering limitations are tracked separately.
