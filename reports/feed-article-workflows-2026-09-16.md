# Native feed-to-article content validation

## Result

**Three useful feeds, two useful article outputs, one article-content failure.**
Six fresh native GETs returned HTTP200 and complete bodies. HTTP success is not
content success: RTINGS produced navigation and membership boilerplate, not the
review. No production code changed in this step.

The original 100-entry validation is complete and unchanged: 100 navigations,
108 GETs, 96 complete captures, 33 useful-source judgments and 67 other judgments.
Its complete checklist is `reports/agent-citation-revalidation-v2.md`, with JSON
and CSV siblings. It is a reproducible citation-derived root-page proxy, not a
measured global ranking of pages most visited by agents. These six new deep/feed
requests neither replace those entry-page outcomes nor establish such a ranking.

## Exact fresh targets

| Publisher | Feed URL | Items | Decoded bytes | Markdown bytes |
| --- | --- | ---: | ---: | ---: |
| PCMag | `https://www.pcmag.com/feeds/rss/latest` | 100 | 56007 | 56015 |
| RTINGS | `https://www.rtings.com/latest-rss.xml` | 30 | 45071 | 45079 |
| IGN | `https://www.ign.com/rss/v2/articles/feed` | 20 | 111120 | 111129 |

| Publisher | Exact first-item article URL | Decoded bytes | Markdown bytes | Reviewed result |
| --- | --- | ---: | ---: | --- |
| PCMag | `https://www.pcmag.com/news/i-tested-canons-first-retro-camera-and-it-proves-throwback-gear-doesnt` | 885038 | 23840 | Useful article prose, with ancillary material |
| RTINGS | `https://www.rtings.com/projector/reviews/jmgo/n1s-4k` | 237561 | 3640 | No article content: navigation-only JavaScript shell |
| IGN | `https://www.ign.com/articles/wo-long-2-wings-of-ember-gets-release-date-demo-available-now` | 226776 | 4345 | Useful article prose, with ancillary material |

Feed request starts: `2026-09-16T05:25:22.431Z` through
`2026-09-16T05:25:27.213Z`. Article starts:
`2026-09-16T05:32:25.876Z` through `2026-09-16T05:32:31.008Z`;
last child process exit: `2026-09-16T05:32:31.094Z`. Sequential requests are
spaced at least two seconds apart. Supervised individual child durations are
0.365–0.615 seconds, including execution overhead; this is not a benchmark or
comparison with another browser, and the feed/article review interval is not
network latency. Exact measurements and hashes are in the JSON sibling.

## What content actually worked

- **PCMag:** Full Markdown inspection and a bounded source comparison retain all
  19 editorial paragraphs plus the biography and six section headings. This is
  substantive preproduction hands-on reporting, not a completed laboratory
  review. Broad main selection also retains unrelated recommendations, repeated
  labels and placeholders. Images, audio and other rendered media were not tested.
- **RTINGS:** Full Markdown contains no substantive review. The source has an
  empty review component whose entity-encoded attributes hold an introduction
  and other data, not populated article text. There is no literal main/article
  landmark to establish selector loss. Offline attribute inspection is not
  native extraction success. Unverified paywall metadata, false access flags and
  nine null rating scores do not establish full review/measurement availability;
  no paid material was unlocked. This is a hydration capability gap, not a
  newly isolated ordinary-paragraph parser defect.
- **IGN:** All four editorial paragraphs and the biography match the bounded
  source comparison; three paragraphs beyond the introductory metadata overlap
  establish useful article content. Recommendations, joined labels and a game
  card remain. Comments, images, video, hidden and dynamically loaded material
  were not validated. Publisher claims were not independently verified.

All readers declare partial capability. Normalized paragraph comparisons are
not visual/DOM equivalence or unrestricted completeness claims. The original
workflow receipts keep `contentSuccess: null`; independent reviews provide the
separate content judgments. No new parser defect was isolated, so this step
does not make speculative production changes.

## Provenance and safety

The runtime is the clean compiled `69d799d7e2d682bb9434147acf9ec314ab1c8a11`
source set: all1514 committed source/script/config inputs match its sealed
build. Dirty root runtime is not used. Feed advertisements and historical
fixtures come from existing pinned September15 receipts, not a new ranking
fetch. All three feeds were then freshly requested before article selection.

Each chosen URL is the first item's complete literal `link`, same-origin HTTPS,
without a query, userinfo or fragment. The main agent inspected whole blocks;
an independent offline reviewer checked well-formed saved RSS and item/link
identity. That reviewer-side XML check does not add an XML parser to the native
browser. No guessed suffix, rewritten tracking URL, embedded media or secondary
link was followed. Article selection is manual, not native link clicking.

Every navigation uses `BrowserSession`/`NodeNetworkTransport`, one GET per child,
zero redirects/retries, credentials omitted, the ordinary native headers and
unchanged public-address/TLS policy. No SafeJS/page scripts, subresources,
alternate browser/client, credential/passkey access, real TTY, account actions,
identity evasion or challenge solver. Each task would stop at a failure,
redirect, challenge or login gate rather than synthesize an alternative URL.

Feeds use the default2MB response bound; articles explicitly choose existing
`long-v1`4MB on the initial request. All extraction caps are256KB. Bodies were
below the default network cap, but this does not test every default-profile
reader bound. Deadlines are15s network/20s navigation/60s supervisor, heap256MiB,
stdin closed, empty HOME/TMP. All six requests show authorized TLS and request/
socket closure; all native subsystems and child groups close. Receipt, body,
Markdown, selected-source, helper and runtime hashes match.

## Validation and retained failures

- Fresh selected native tests: **598 passed/0 failed in9 files**, plus a separate
  **60 passed/0 failed response-prefix file**. Ten distinct files from the native
  manifest, not the full937-file committed manifest. The prefix tests use mocked
  DNS/HTTP/HTTPS and are not separate live transport acceptance.
- Final version02 fixture checks: three historical-feed replays and three
  synthetic article workflows, all under kernel-denied network, pass and close.
  Synthetic article fixtures are not proof of actual article content.
- Final policy checks: **62 cases per phase**, each passing in isolation. These
  are the same62 checks against two corpora, not124 unique behaviors. They cover
  exact requests, admission/one-shot negatives, source supervision and synthetic
  prefix handling. The unchanged build/types/format/lint gate is reused, not
  rerun. No production or native-manifest changes occur in this step.
- Initial helper review found missing partial-prefix retention and insufficient
  dependence on source-feed supervisor success. Version02 resolves both before
  live requests. Prior three fixture checks,38 policy cases and the changes-
  required review remain archived, not substituted for the final checks.
- The first version02 pin attempt hit exclusive-write `EEXIST` on an old pin
  filename. It wrote no live claim or request; corrected version02 paths then
  passed. The failure artifact remains. A completed feed run whose terminal
  output was truncated was recovered from existing receipts/process state,
  not restarted. Live claims total exactly six.
- Optional4096-byte decoded-overflow capture preserves an incomplete diagnostic
  prefix when the transport provides one. All six requests succeeded, so **no
  live prefix failure path was exercised**. Prefix absence cannot be called a
  complete response, and a prefix never authorizes a follow-up URL.

## Evidence and remaining work

Private raw bodies, extracts, reviewed helpers, claims, policy/kernel checks,
execution/HTTP events, content reviews and audits are under
`node_modules/.cache/native-validation/feed-article-workflows-september16/`.
The JSON sibling contains exact report inputs, per-request fingerprints and
content judgments. Raw copyrighted page bodies are not added to git. A final
artifact seal records the local evidence after the focused report commit.

RTINGS hydration, cleaner article focus, joined ancillary labels, dynamic
search/content, challenge handoff, SafeJS callback admission, credentials,
passkeys and real-input gates remain open. No full-browser compatibility or
full rendered-content claim. Original historical evidence stays unchanged;
unrelated uncommitted work is preserved. No push; overall browser goal active.
