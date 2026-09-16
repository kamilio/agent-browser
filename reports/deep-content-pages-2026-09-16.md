# Source-linked content pages — September 16, 2026

## Result

Tested eight additional URLs with the native browser: **six substantive content
pages, one navigation-only shell and one confirmed challenge**. These are actual
links from the previously captured citation-proxy homepages, not guessed URLs or
a new global traffic ranking. Manuals+ is explicitly a weaker brand-index
fallback: its homepage provided no individual HTML manual link.

No production change was justified by this batch. It establishes deeper content
coverage and tested task-specific extraction workflows without weakening limits
or converting HTTP200/navigation output into a content-success claim. Earlier
100-entry verdicts and measurements remain unchanged.

## Every tested URL

| # | Exact URL | HTTP | Markdown bytes | Reviewed result |
| ---: | --- | ---: | ---: | --- |
| 1 | https://en.wikipedia.org/wiki/Grace_Coolidge | 200 | 212991 | Substantive biography; citations and navigation remain |
| 2 | https://www.pcmag.com/news/why-is-the-internet-archive-blocking-users-blame-the-bots | 200 | 15353 | Substantive article; recommendations and author material remain |
| 3 | https://www.rtings.com/projector/reviews/jmgo/n1s-4k | 200 | 3640 | Navigation shell, not the requested review |
| 4 | https://scienceinsights.org/when-do-wasps-leave-their-nest-for-the-year/ | 200 | 3067 | Substantive article |
| 5 | https://manuals.plus/category/samsung | 403 | 0 | Confirmed Cloudflare challenge; stopped |
| 6 | https://dictionary.cambridge.org/dictionary/english/patronize | 200 | 20400 | Definitions, examples and translations plus site extras |
| 7 | https://www.outdoorgearlab.com/reviews/camping-and-hiking/soft-cooler/yeti-daytrip-9l | 200 | 26223 | Review narrative, verdict and comparison-table content |
| 8 | https://runrepeat.com/brooks-revel-max | 200 | 19465 | Review narrative, test tables and construction details |

The reviews assess content availability, not the accuracy of historical,
scientific, product-testing, dictionary, financial or purchasing claims. No
article citations or source claims were independently fact-checked. Short outputs were read
fully; long outputs were checked at their beginning, actual content body, middle
and end. Per-page inspection limits and hashes are retained in the JSON report.

## Findings and narrower workflows

**RTINGS:** its matching title and 237561-byte body are not a review. Both the
source-filtered and unfiltered native reader produce identical 3640-byte Markdown
with zero headings. Filtering omits zero hidden subtrees. An independent standard-
library static HTML text inventory, excluding head/script/style text, contains
only 53 text parts/807 bytes of navigation, promotion and breadcrumbs. This
supports a missing static review body, not a visibility-filter regression.
Scripts/app state were not mined or executed. A paywall, browser/parser defect,
or eventual runtime-rendered review has not been established.

**Manuals+:** the Samsung index returns a confirmed Cloudflare challenge, not
manual content. There is no validated individual-manual continuation link. No
challenge solving, identity spoofing or alternate endpoint/client was attempted.

**Scoped saved-body extraction:** existing replay selectors can reduce irrelevant
output when the task specifies a narrower scope. These are changed questions,
not lossless replacements for the full-page results:

| Page/task | Existing selection | Original bytes | Scoped bytes | Limitation |
| --- | --- | ---: | ---: | --- |
| Wikipedia early life | `--section '#Early_life'` | 212991 | 9592 | Only Early life, Childhood and Education |
| PCMag article container | `--selector article` | 15353 | 7137 | Heading/byline outside the article are excluded; some author/recommendation material remains |
| ScienceInsights article | `--selector article` | 3067 | 3067 | Same content; no artificial reduction claim |
| Cambridge English senses | `--selector '.dictionary:has(> #dataset_cald4)'` | 20400 | 6654 | Two English senses; excludes other dictionary datasets and site extras |

The Cambridge source contains two `id="dataset_cald4"` elements. The initial
`--selector '#dataset_cald4'` correctly fails the unique-selection contract.
Selecting its unique dictionary ancestor works; no duplicate-ID ambiguity was
silently ignored. The original refusal is preserved alongside the corrected
selection. Three successful workflows and the refusal were also exercised with
the actual compiled replay CLI and matched API content/outcomes.

## Runtime, safety and evidence

- Runtime: clean compiled source matching commit `bdecf4f`, all1507 committed
  runtime source/config inputs compared. Its existing build/types/format/lint and
  1168 selected native tests passed in the preceding feature validation. Those
  tests were not rerun or counted as fresh evidence in this documentation batch.
- Eight navigations, eight GETs, zero redirects and zero retries. Default body
  admission limits; reader, raw omission separation, inline-source visibility,
  UTF-8 fallback, main-content focus, text-prefix policy and table rows enabled.
  No extraction needed text-prefix fallback in this sample.
- Each live process used an empty HOME/TMP, a45-second deadline,256MiB heap and
  honest `AgentBrowser/0.1` user agent. No credentials, scripts/SafeJS, subresources,
  forms, sign-in, playback or remote browser. All eight recorded request/socket
  closures and child/process-group exits are verified; no deadline fired.
- Five API scope attempts, four compiled CLI checks and two reader diagnostic
  loads used saved bodies only. Seven recorded proof groups closed under kernel-
  denied networking with zero observed I/O attempts. A separate static-inventory
  command completed under kernel network denial; it is not an HTML5 renderer.
- Exact parent-link UTF-16 offsets, literal links and parent Markdown/receipt
  hashes are verified. New receipt/body/output hashes, reviews and scope results
  are in `reports/deep-content-pages-2026-09-16.json`; local evidence lives in
  `node_modules/.cache/native-validation/deep-content-pages-september16/`.

The overall browser goal remains active. RTINGS runtime/content availability,
Manuals+ access and individual manual coverage, general challenge handling,
interactive tasks and the separate SafeJS/credential/passkey/TTY gates remain
open. This is neither a full-manifest pass nor a universal site-compatibility
claim. No push is included.
