# 100 agent-citation entry pages — September 15, 2026

## What this validates

**100/100 selected URLs received a fresh native-browser navigation.** This is a
transparent proxy corpus, **not a verified global ranking of pages most visited
by agents**. Public page-level agent-visit measurements were not established.
We pooled the exact hosts in five published AI citation rankings, then tested
their publisher-linked root pages. Citation frequency is not visit frequency,
and a frequently cited domain's homepage is not necessarily its cited page.

The source rankings are September2026 snapshots, updated **September 2, 2026**.
They cover Perplexity, Copilot, Gemini, Google AI Overviews and Google AI Mode.
The first four lookup-derived source paths and one guessed ChatGPT path returned
HTTP404. All five failures remain recorded; they supply no ranking data. Earlier
lookup claims about September3 dates or response sample counts are not adopted.
Dedicated ChatGPT/Claude rankings are absent. No human-traffic top100 list was
substituted. The prior May2026 Similarweb sweep remains separate historical work.

## Reproducible selection

- google-ai-overviews: `https://ahrefs.com/blog/most-cited-domains-ai-overviews/`; updated **September 2, 2026**, 50 rows, September2026 US/all-topics snapshot.
- google-ai-mode: `https://ahrefs.com/blog/most-cited-domains-ai-mode/`; updated **September 2, 2026**, 50 rows, September2026 US/all-topics snapshot.
- perplexity: `https://ahrefs.com/blog/most-cited-domains-perplexity/`; updated **September 2, 2026**, 50 rows, September2026 US/all-topics snapshot.
- copilot: `https://ahrefs.com/blog/most-cited-domains-copilot/`; updated **September 2, 2026**, 50 rows, September2026 US/all-topics snapshot.
- gemini: `https://ahrefs.com/blog/most-cited-domains-gemini/`; updated **September 2, 2026**, 50 rows, September2026 US/all-topics snapshot.

The five actual native-extracted tables contain **250 rows / 113 unique hosts**.
Keep subdomains distinct. Sort by number of platform lists containing the host
descending, sum of within-list ranks ascending, then exact hostname lexical
ascending. Select the first100. All selected URLs are normalized HTTPS root links
from the publisher's tables; none are invented deep links. URL serialization adds
a trailing slash to literal source hrefs with empty paths. The frozen corpus's
"exact" link wording denotes that equivalent entry target, not byte-identical
source href text. An independent captured-HTML table parser reproduces all250
rows, the113 hosts, all100 selections and13 exclusions with no rank, metric,
membership or normalized-URL discrepancies. Priority numbers below
are our deterministic **test order**, not global agent usage ranks. The adjacent
corpus JSON retains every source rank and the13 excluded hosts. These commercial
search-backed US samples, top50 cutoffs and equal list weighting create bias;
inclusion is not a safety, quality or factual-reliability recommendation.

## Native run and outcomes

Runtime commit: `17722140cb89c619041fdccb15faf9f769ece7ed`. The pinned clean build matches all
**1,457 committed runtime source/script/config files**; dirty root output is not
used. Existing selected native build/type/format/lint/test gates previously
passed; this report does not claim a new full-manifest test run or SDK acceptance.

**100 navigations, 107 GET requests including redirects, zero retries;
95 decoded bodies captured and hash-verified.** Ten separate source-acquisition
GETs brought the complete experiment to110 children and117 requests. All children,
process groups, requests and observed sockets closed. Original tracked/untracked
work and source/compiled pins are unchanged at postflight. Each navigation had
empty HOME/TMP, no credential headers, no page scripts or SafeJS, no challenge
solver, no impersonation and no account/form interactions. At most four target
processes ran concurrently. Existing five-redirect, 2MB response and256KB output
bounds were retained, with a45-second outer deadline and192MiB heap per child.

Reader: `separate-omitted-raw-v1`, `source-hidden-inline-v1`, Markdown preference
and selected table rows. All outcomes are partial source-level observations.

| Native outcome | Count |
| --- | ---: |
| empty-extraction | 5 |
| extracted-unverified | 59 |
| http-failure | 12 |
| semantic-barrier | 18 |
| failure | 6 |

Nonempty text is **not** automatically useful content. Four disjoint offline
reviewers inspected all100 native receipts and available extractions. The
JSON records whether each review read the full extraction, sampled it, or had
only a receipt. Their source-content judgments are not full website acceptance.

| Reviewed source-content result | Count |
| --- | ---: |
| empty | 5 |
| useful-source-content | 48 |
| http-error | 11 |
| other-failure | 3 |
| consent-or-access | 20 |
| navigation-only | 6 |
| login-required | 2 |
| transport-failure | 5 |

## Concrete outstanding issues

1. **Retain bounded partial content rather than lose all text at output limits.**
   Kateminimalist supplied525,193 decoded Markdown bytes with HTTP200 but hit
   the256,000-byte extraction limit. This is not an HTML loader error. A future
   explicit partial-output contract needs fixture tests; no cap was raised here.
2. **Handle large responses without hiding limits.** Google Play, TechRadar and
   CNBC exceeded the2,000,000-byte decoded-response budget. Their observers saw
   HTTP200 headers but no completed primary response/body. Tom's Guide timed out
   after HTTP200 headers; Comparor timed out without response headers. A received
   status is not a completed or readable response.
3. **Separate JS/login shells from content.** BestBuy, Pinterest, Quora and
   OreateAI illustrate tiny nonempty outputs that must not be counted as useful
   retrieval. YouTube, TikTok, Nordstrom, carinterior.alibaba.com and
   thelivinglook.com have empty extracted bodies. These are not automatically
   CAPTCHA failures and do not justify silently enabling scripts.
4. **Keep access restrictions explicit.** Eighteen semantic barriers and12 HTTP
   failures remain failures, including429 responses from Wayfair and Expedia.
   No retries, solvers or authentication were attempted. Preserve original live
   classification because stored content-only headers omit challenge evidence.
5. **Test agent tasks/deep URLs separately.** Homepage access does not validate
   document retrieval, searching, article bodies, product details, feeds, video,
   login, payment or passkey flows. Native source extraction does not establish
   that claims/prices in the content are accurate or current.

No production behavior changes are included in this measurement commit. The
unfinished response-header helper and all other pre-existing work are preserved
outside it. SafeJS contract, credential/passkey, interactive and broader browser
compatibility gates remain open; see TASKS.md.

## Every attempted page

Score is list appearances / sum of ranks. “Not completed” means no complete
primary-response receipt, even if the private observer saw HTTP headers. The
JSON records those observed statuses separately. Redirect query strings are
redacted from the shared JSON; raw receipts remain private local evidence.

| Priority | Exact requested URL | Score | Completed HTTP | Native outcome | Markdown bytes | GETs | Review | Note |
| ---: | --- | ---: | --- | --- | ---: | ---: | --- | --- |
| 1 | `https://www.youtube.com/` | 5 / 18 | 200 | empty-extraction | 0 | 1 | empty | HTTP 200 with empty-extraction and zero extracted characters; no parser failure recorded. The page title alone supplies no video listings. |
| 2 | `https://en.wikipedia.org/` | 5 / 22 | 200 | extracted-unverified | 57367 | 2 | useful-source-content | HTTP 200 after redirect to Main_Page. Sampled featured-article prose, news, anniversaries and picture explanation are substantive; extensive navigation and language lists inflate the extraction. Linked articles were not assessed. |
| 3 | `https://www.forbes.com/` | 5 / 64 | 200 | extracted-unverified | 48414 | 1 | useful-source-content | HTTP 200. Sampled news and wealth-list sections contain topical headlines, bylines and short descriptions; useful homepage listings, not full articles. Duplicate cards and navigation remain. |
| 4 | `https://www.healthline.com/` | 5 / 72 | 200 | extracted-unverified | 8903 | 1 | useful-source-content | HTTP 200; health article headlines, topic directories and nutrition/tool descriptions are readable. Repeated videos, tool labels and footer text add noise; linked articles and tools were not exercised. |
| 5 | `https://www.walmart.com/` | 5 / 73 | 200 | extracted-unverified | 6310 | 1 | useful-source-content | HTTP 200; named merchandise, seasonal promotions and offer descriptions survive alongside navigation. Useful storefront content, not product-detail or checkout validation; duplicated labels and encoded entities remain. |
| 6 | `https://www.edmunds.com/` | 5 / 77 | 403 | http-failure | 475 | 1 | http-error | HTTP 403 with explicit access-denied and network-restriction text, not automotive content. Preserve the recorded http-failure despite nonempty extraction and a null semantic-barrier classification. |
| 7 | `https://www.target.com/` | 5 / 80 | 200 | extracted-unverified | 8441 | 1 | useful-source-content | HTTP 200. Seasonal promotions, a named product and discount/event details provide limited shopping content, but 60 loading placeholders leave many modules without product content. |
| 8 | `https://www.homedepot.com/` | 5 / 81 | 200 | extracted-unverified | 36237 | 1 | useful-source-content | HTTP 200; named furniture, grills and seasonal products include prices, discounts and review counts. Duplicate labels and escaped zero-width characters impair readability; recommendations remain a loading placeholder. No shopping interaction verified. |
| 9 | `https://www.kbb.com/` | 5 / 92 | 200 | extracted-unverified | 25696 | 1 | useful-source-content | HTTP 200; beginning/middle/end and topical sections contain a named vehicle with starting price, automotive news summaries and valuation-service explanations. Navigation repeats; no valuation interaction was tested. |
| 10 | `https://www.bestbuy.com/` | 5 / 119 | 200 | extracted-unverified | 43 | 1 | other-failure | HTTP 200 yields only an unresolved business-name template and a main-content label. No products or topical prose survive extraction; this is a nonempty shell, not a recorded loader/parser failure. |
| 11 | `https://www.ebay.com/` | 5 / 130 | 403 | http-failure | 242 | 1 | http-error | HTTP 403, recorded http-failure. Only a generic error notice and homepage/retry directions; no marketplace listings. |
| 12 | `https://www.webmd.com/` | 5 / 139 | 200 | extracted-unverified | 23679 | 1 | useful-source-content | HTTP 200; health headlines, article summaries, condition directories and contributor details are present. Several apostrophes and dashes are visibly corrupted, and the doctor-location section is unpopulated; no medical claims or linked pages independently verified. |
| 13 | `https://www.trustpilot.com/` | 5 / 169 | 403 | http-failure | 178 | 1 | http-error | HTTP 403, native http-failure; extraction contains only browser-verification waiting, failure and retry text. Native barrier is null despite the challenge-like content; no consumer reviews are available. |
| 14 | `https://www.reddit.com/` | 4 / 5 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; native classification records an access-denied semantic barrier from a network-security-block signal, with possible confidence. Extraction was not produced; no posts were assessed. |
| 15 | `https://www.amazon.com/` | 4 / 23 | 200 | extracted-unverified | 25385 | 1 | useful-source-content | HTTP 200. Apparel price promotion, branded collections and sale dates provide limited homepage shopping content. Large department/footer menus dominate; no full catalog or purchase flow was assessed. |
| 16 | `https://www.businessinsider.com/` | 4 / 83 | 200 | extracted-unverified | 22734 | 1 | useful-source-content | HTTP 200; top-story and feature listings contain specific news headlines, some bylines and reading times. Many later sections repeat generic publisher copy and comment-loading placeholders; this is not full article or subscriber access. |
| 17 | `https://www.cnet.com/` | 4 / 96 | 200 | extracted-unverified | 50326 | 1 | useful-source-content | HTTP 200; beginning/middle/end and headings show technology-review and news listings with summaries, dates and bylines. Substantial navigation accompanies the content; article bodies were not inspected. |
| 18 | `https://www.linkedin.com/` | 4 / 97 | 200 | extracted-unverified | 20871 | 1 | navigation-only | HTTP 200 public join/sign-in landing page contains category directories, course counts and feature marketing, but no actual posts, profiles or job listings. This does not establish that every linked public page requires login. |
| 19 | `https://www.lemon8-app.com/` | 4 / 105 | 200 | extracted-unverified | 1466 | 1 | navigation-only | HTTP 200. Language/legal menus, repeated app-download labels and sharing controls only; no posts or topical discovery feed. |
| 20 | `https://www.consumerreports.org/` | 4 / 107 | 200 | extracted-unverified | 32338 | 1 | useful-source-content | HTTP 200; public buying-guide headlines, a testing summary and expert-video descriptions survive extensive navigation. Membership-locked ratings, sign-in error templates and zero-valued counters also appear; these do not establish an actual account state or access to paid reviews. |
| 21 | `https://pmc.ncbi.nlm.nih.gov/` | 4 / 110 | 403 | http-failure | 179 | 1 | http-error | HTTP 403, native http-failure; only a permission-denied page and secondary error-document message were extracted, not scholarly content. |
| 22 | `https://medium.com/` | 4 / 112 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; native receipt confirms a Cloudflare challenge and policy-denied semantic-barrier failure. No extraction or article content is available for review. |
| 23 | `https://www.wikihow.com/` | 4 / 115 | 200 | extracted-unverified | 31599 | 2 | useful-source-content | HTTP 200 after redirect to Main-Page. How-to, quiz and course listings plus forum excerpts provide topical content; login and newsletter boilerplate interleave. No linked instructions or quizzes were opened. |
| 24 | `https://www.etsy.com/` | 4 / 119 | 200 | extracted-unverified | 5501 | 1 | useful-source-content | HTTP 200; seasonal collection descriptions and substantial marketplace/independent-seller explanations are available despite a JavaScript notice and loading placeholders. Useful homepage content, not verified individual inventory or checkout. |
| 25 | `https://www.lowes.com/` | 4 / 124 | 200 | extracted-unverified | 3161 | 1 | useful-source-content | HTTP 200; appliance and lawn-care promotions include concrete discounts, offer qualifications and home-maintenance service details. Useful promotional storefront content only; menus run together and no purchase interaction was tested. |
| 26 | `https://www.cars.com/` | 4 / 154 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; native receipt confirms a Cloudflare challenge and policy-denied semantic-barrier failure. No extraction or vehicle listings are available for review. |
| 27 | `https://www.facebook.com/` | 3 / 11 | 200 | extracted-unverified | 3993 | 1 | login-required | HTTP 200 but only the login form, account creation and language/footer links. No posts or feed; the recorded extracted-unverified outcome and null barrier do not establish content access. |
| 28 | `https://www.instagram.com/` | 3 / 25 | 200 | extracted-unverified | 1967 | 1 | login-required | HTTP 200; extraction is a login form, account-creation links, language choices and footer, with no public feed or posts. Receipt says extracted-unverified with no classified barrier; content inspection identifies the login wall. |
| 29 | `https://www.nytimes.com/` | 3 / 54 | 200 | extracted-unverified | 20494 | 1 | useful-source-content | HTTP 200; beginning/middle/end and headings contain topical news headlines, summaries and reading-time labels. Some image descriptions repeat and later sections are bare headings; this does not establish full-article or subscriber access. |
| 30 | `https://www.nerdwallet.com/` | 3 / 55 | 200 | extracted-unverified | 44516 | 1 | useful-source-content | HTTP 200 samples contain named financial-news listings and explanatory product/resource text beyond the large menu. Repeated cards and merged labels add noise; no personalized recommendation, application or linked article was tested. |
| 31 | `https://www.tripadvisor.com/` | 3 / 56 | 403 | http-failure | 44 | 1 | http-error | HTTP 403, recorded http-failure. Extraction only asks for JavaScript and disabling an ad blocker; an access interstitial, not travel listings. No specific challenge provider is established by the receipt. |
| 32 | `https://www.yahoo.com/` | 3 / 72 | 200 | extracted-unverified | 15236 | 1 | useful-source-content | HTTP 200; a substantial news feed includes topical headlines, publisher names, categories and reading times. Advertising markers and empty footer bullets add noise; underlying articles and headline accuracy were not checked. |
| 33 | `https://www.goodrx.com/` | 3 / 85 | 403 | http-failure | 0 | 1 | http-error | HTTP 403, native http-failure, with an access-denied title and zero extracted characters. Preserve the HTTP failure rather than reporting successful access or an HTML parser error. |
| 34 | `https://finance.yahoo.com/` | 3 / 94 | 200 | extracted-unverified | 66558 | 1 | useful-source-content | HTTP 200 samples contain financial-news headlines with publishers and timestamps, video-summary prose and quote listings. Useful homepage source content, not independently verified market data, full articles or working video playback. |
| 35 | `https://www.thespruce.com/` | 3 / 94 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with recorded semantic-barrier and confirmed Cloudflare challenge. No extraction; the large captured body is not evidence of accessible editorial content. |
| 36 | `https://play.google.com/` | 3 / 107 | not completed | failure | 0 | 3 | transport-failure | Recorded resource-limit at network stage: decoded response reached 2,002,886 bytes against the 2,000,000-byte limit. No primary-response status or extraction recorded; this is a bounded transport failure, not an empty page or parser failure. |
| 37 | `https://www.tastingtable.com/` | 3 / 116 | 200 | extracted-unverified | 30911 | 1 | useful-source-content | HTTP 200; beginning/middle/end and headings contain food and cooking article listings with descriptive summaries, authors and relative timestamps. Category and byline duplication adds noise; full recipes were not retrieved. |
| 38 | `https://www.cargurus.com/` | 3 / 134 | 200 | extracted-unverified | 28831 | 1 | useful-source-content | HTTP 200 samples contain named vehicle-review listings with numeric ratings, model directories and service explanations. Repeated titles merge with ratings; inventory search, financing and offer generation remain untested. |
| 39 | `https://www.google.com/` | 2 / 7 | 200 | extracted-unverified | 1018 | 1 | navigation-only | HTTP 200. Search landing-page links and empty native table/cell markers only; no query results or topical source text. Search interaction was not tested. |
| 40 | `https://www.quora.com/` | 2 / 13 | 200 | extracted-unverified | 58 | 1 | consent-or-access | HTTP 200; the entire extraction only requests JavaScript enablement and refresh. No questions or answers are available; the receipt's null barrier does not turn this JavaScript access shell into useful content. |
| 41 | `https://www.tiktok.com/` | 2 / 17 | 200 | empty-extraction | 0 | 1 | empty | HTTP 200 with empty-extraction and zero extracted characters. A page title is present, but no video listings or topical text; no parser failure is recorded. |
| 42 | `https://www.goodhousekeeping.com/` | 2 / 31 | 200 | extracted-unverified | 27707 | 1 | useful-source-content | HTTP 200 samples contain editorial headlines with bylines, testing-team descriptions and named product offers. Image descriptions and merged byline/time text add noise; this is homepage content, not full articles or purchase success. |
| 43 | `https://www.pcmag.com/` | 2 / 40 | 200 | extracted-unverified | 47028 | 1 | useful-source-content | HTTP 200. Sampled technology news, review and how-to sections contain headlines, bylines and a lead summary; not full reviews. Long menus and duplicate cards remain; nine tokenizer issues are recorded. |
| 44 | `https://www.techradar.com/` | 2 / 40 | not completed | failure | 0 | 1 | transport-failure | Recorded resource-limit at network stage: decoded response reached 2,015,232 bytes against the 2,000,000-byte limit. No primary-response status or extraction recorded; do not infer a loader/parser error or successful partial article. |
| 45 | `https://www.alibaba.com/` | 2 / 46 | 200 | extracted-unverified | 5333 | 1 | navigation-only | HTTP 200; extraction is a category directory, generic search shortcuts and sourcing/service promotional text. No named supplier or concrete product listing with specifications was found; nonempty output is not sourcing success. |
| 46 | `https://www.caranddriver.com/` | 2 / 48 | 200 | extracted-unverified | 27740 | 1 | useful-source-content | HTTP 200 samples contain automotive news, dated vehicle-review listings and feature summaries. Image descriptions and duplicated cards remain; full reviews, car comparisons and shopping interactions were not assessed. |
| 47 | `https://www.justanswer.com/` | 2 / 55 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with recorded semantic-barrier and confirmed Cloudflare challenge. No extraction or accessible expert answers. |
| 48 | `https://www.liberia.ubuy.com/` | 2 / 58 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; receipt confirms a Cloudflare challenge and semantic-barrier policy denial. No extraction was produced, and no product content or challenge bypass is established. |
| 49 | `https://www.medicalnewstoday.com/` | 2 / 61 | 200 | extracted-unverified | 13664 | 1 | useful-source-content | HTTP 200; beginning/middle/end and headings contain specific health-news and explainer titles organized into topical sections. This is article discovery, not medical evidence review; empty bullets, abbreviated titles and duplicated footer text remain. |
| 50 | `https://www.pinterest.com/` | 2 / 61 | 200 | extracted-unverified | 98 | 1 | other-failure | HTTP 200 extraction contains only a notice requiring JavaScript. No pins or other topical content are present; this is an unsupported page-runtime shell, not empty extraction or a recorded loader failure. |
| 51 | `https://www.angi.com/` | 2 / 69 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with recorded semantic-barrier and confirmed Cloudflare challenge. No extraction or accessible service listings. |
| 52 | `https://my.clevelandclinic.org/` | 2 / 71 | 200 | extracted-unverified | 24098 | 1 | useful-source-content | HTTP 200; specialty-care directories, service descriptions and care-access guidance are readable. Repeated institutional sections, decorative icon labels and escaped soft hyphens add noise; appointments and patient records were not accessed. |
| 53 | `https://www.bobvila.com/` | 2 / 75 | 200 | extracted-unverified | 27611 | 1 | useful-source-content | HTTP 200; beginning/middle/end and headings contain home-improvement and product-review listings with authors, plus editorial testing-method text. Repeated navigation and newsletter prompts add noise; no linked how-to was opened. |
| 54 | `https://www.bbb.org/` | 2 / 77 | 200 | extracted-unverified | 2040 | 1 | useful-source-content | HTTP 200 contains short public explanations of accreditation and community AI-learning resources alongside search and cookie controls. Markdown is wrapped in a code fence; no business results or complaint workflow were tested. |
| 55 | `https://www.tomsguide.com/` | 2 / 81 | not completed | failure | 0 | 1 | transport-failure | Recorded timeout at the network stage after about 15 seconds, with no primary response or extraction. This is not a parser failure or the external 45-second deadline. |
| 56 | `https://www.cnbc.com/` | 2 / 85 | not completed | failure | 0 | 1 | transport-failure | Recorded resource-limit at network stage: decoded response reached 2,010,789 bytes against the 2,000,000-byte limit. No primary-response status or extraction recorded; this is not evidence of empty news content or a parser failure. |
| 57 | `https://www.seriouseats.com/` | 2 / 85 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with native semantic-barrier: confirmed Cloudflare challenge and policy-denied at semantic-barrier stage. No extraction was produced; substantial received bytes do not establish recipe access. |
| 58 | `https://www.rtings.com/` | 2 / 86 | 200 | extracted-unverified | 15275 | 1 | useful-source-content | HTTP 200 contains named review/test-result listings across product categories and explanatory testing-methodology prose. Duplicate title links inflate content; the membership invitation does not block this extraction or demonstrate access to full paid results. |
| 59 | `https://carinterior.alibaba.com/` | 2 / 92 | 200 | empty-extraction | 0 | 2 | empty | Redirected to an Alibaba showroom URL with HTTP 200 and title 404-Error, but extraction content is empty. Recorded empty-extraction with no failure; neither an HTTP 404 nor a demonstrated parser error. |
| 60 | `https://www.ziprecruiter.com/` | 2 / 97 | 200 | extracted-unverified | 5106 | 1 | useful-source-content | HTTP 200 text/markdown response contains a substantive career-service feature explanation, application steps and testimonials, but no job listings. Extraction wraps the document in a code fence and retains frontmatter/structured metadata; email continuation and applications were not exercised. |
| 61 | `https://scienceinsights.org/` | 1 / 4 | 200 | extracted-unverified | 3123 | 1 | useful-source-content | HTTP 200; specific article titles cover animal behavior, ecology and human biology under topical headings. Useful discovery listings, not article bodies or verified science; menu and site-name duplication remains. |
| 62 | `https://engineerfix.com/` | 1 / 5 | 200 | extracted-unverified | 3813 | 1 | useful-source-content | HTTP 200 contains specific engineering-article listings covering programming controllers, fuses, transformers, conductors and measurement tools. This is a topical index, not article-body access; duplicated branding and image/title labels remain. |
| 63 | `https://grokipedia.com/` | 1 / 6 | 200 | extracted-unverified | 1515 | 1 | navigation-only | HTTP 200. Topic labels, zero article counts and contribution/sign-in dialogs form an app shell without encyclopedia text. Simultaneous success/error prompts do not establish a submission or loader failure. |
| 64 | `https://goto.walmart.com/` | 1 / 7 | 404 | http-failure | 84 | 1 | http-error | HTTP 404 with recorded http-failure; the short extraction reports a malformed link and directs the reader to its originating editor. This is an error response, not Walmart product content. |
| 65 | `https://www.oreateai.com/` | 1 / 8 | 200 | extracted-unverified | 114 | 1 | navigation-only | HTTP 200, native extracted-unverified, but only five short generic essay-writing marketing slogans survive. This is a minimal promotional app shell, not substantive documentation, generated work or useful source material. |
| 66 | `https://biologyinsights.com/` | 1 / 9 | 200 | extracted-unverified | 3478 | 1 | useful-source-content | HTTP 200 contains specific biology-article listings about anatomy, zebrafish eyes, animal behavior and ecology. Category menus and duplicated branding are noisy; usefulness is limited to the index, not scientific article contents or accuracy. |
| 67 | `https://www.macys.com/` | 1 / 17 | 403 | http-failure | 251 | 1 | http-error | HTTP 403, recorded http-failure. Only an access-denied notice and browser/support directions; no product content. The receipt does not identify a specific challenge provider. |
| 68 | `https://www.merriam-webster.com/` | 1 / 20 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; receipt confirms a Cloudflare challenge and semantic-barrier policy denial. No extraction or dictionary content is available. |
| 69 | `https://www.collinsdictionary.com/` | 1 / 21 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with native semantic-barrier: confirmed Cloudflare challenge and policy-denied at semantic-barrier stage. No extraction or dictionary entries are available. |
| 70 | `https://wellnd.com/` | 1 / 22 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; native receipt confirms a Cloudflare challenge and policy-denied semantic-barrier failure. No extraction was produced; this is an access barrier, not evidence of a parser defect. |
| 71 | `https://www.wayfair.com/` | 1 / 23 | 429 | http-failure | 0 | 1 | http-error | HTTP 429 with recorded http-failure and policy-denied at rate-limit stage. No extraction; preserve the rate-limit failure rather than treating this as an empty page or loader error. |
| 72 | `https://www.yelp.com/` | 1 / 23 | 403 | http-failure | 44 | 1 | consent-or-access | HTTP 403 and recorded http-failure are preserved; the entire extraction asks for JavaScript and removal of an ad blocker. This is an access barrier, not business listings, despite the classifier's null barrier; no challenge provider inferred. |
| 73 | `https://wellwhisk.com/` | 1 / 24 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with native semantic-barrier: confirmed Cloudflare challenge and policy-denied at semantic-barrier stage. No extraction was produced; no topical content is established. |
| 74 | `https://www.mayoclinic.org/` | 1 / 25 | 200 | extracted-unverified | 22565 | 1 | useful-source-content | HTTP 200 samples contain institutional care explanations, named locations and featured specialty areas beyond navigation. No disease article or medical advice was validated, and appointment or patient-portal access was not tested. |
| 75 | `https://www.comparor.com/` | 1 / 26 | not completed | failure | 0 | 1 | transport-failure | Recorded timeout at the network stage after about 15 seconds, with no primary response or extraction. No evidence to judge comparison content or infer a parser failure. |
| 76 | `https://www.whowhatwear.com/` | 1 / 26 | 200 | extracted-unverified | 103618 | 1 | useful-source-content | HTTP 200; beginning/middle/end, major headings and a trends-section sample show fashion, luxury and lifestyle article listings with summaries and bylines. Navigation identifiers and escaped zero-width characters add noise. Sampled extraction only; full articles were not opened. |
| 77 | `https://apps.apple.com/` | 1 / 28 | 200 | extracted-unverified | 17593 | 2 | useful-source-content | HTTP 200; beginning/middle/end and headings contain named apps and games, feature/event descriptions and editorial collections. Useful store listings; installation, account access and app execution were not tested. |
| 78 | `https://hometosight.com/` | 1 / 29 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; native receipt confirms a Cloudflare challenge and policy-denied semantic-barrier failure. No extraction was produced; no source content was assessed. |
| 79 | `https://www.reviewed.com/` | 1 / 30 | 200 | extracted-unverified | 12755 | 1 | useful-source-content | HTTP 200. Appliance comparisons, buying-guide listings and editorial testing descriptions provide topical homepage content. Repeated cards and metric labels without values remain; full reviews were not fetched. |
| 80 | `https://wallethub.com/` | 1 / 31 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; receipt confirms a Cloudflare challenge and semantic-barrier policy denial. No extraction or financial source content is available. |
| 81 | `https://www.nordstrom.com/` | 1 / 31 | 200 | empty-extraction | 0 | 1 | empty | HTTP 200 with empty-extraction, zero extracted characters and an empty title. No product listings are available; native classification records no barrier or parser failure. |
| 82 | `https://manuals.plus/` | 1 / 32 | 200 | extracted-unverified | 9271 | 1 | useful-source-content | HTTP 200 contains substantive manual-search instructions, service explanations and FAQs, with brand/type/task directories. No actual manual or PDF was retrieved; sign-in is advertised for saved content rather than blocking this public extraction. |
| 83 | `https://dictionary.cambridge.org/` | 1 / 33 | 200 | extracted-unverified | 22018 | 1 | useful-source-content | HTTP 200. A word-of-the-day idiom definition and lexical/blog listings provide source content beyond menus. Logged-in and logged-out prompts coexist without proving authentication; two tokenizer issues are recorded. |
| 84 | `https://www.outdoorgearlab.com/` | 1 / 33 | 200 | extracted-unverified | 22996 | 1 | useful-source-content | HTTP 200; outdoor-gear review listings include descriptive snippets, named products, award labels and testing-method explanations. Some labels repeat and snippets end in ellipses; detailed reviews and comparisons were not opened. |
| 85 | `https://www.kohls.com/` | 1 / 34 | 403 | http-failure | 211 | 1 | http-error | HTTP 403, native http-failure; extraction is only an access-denied explanation and diagnostic reference, not retail content. Native barrier remains null. |
| 86 | `https://hub.sivo.it.com/` | 1 / 36 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; native receipt confirms a Cloudflare challenge and policy-denied semantic-barrier failure. No extraction was produced; no source content was assessed. |
| 87 | `https://www.bankrate.com/` | 1 / 36 | 200 | extracted-unverified | 23689 | 1 | useful-source-content | HTTP 200. Mortgage/home-equity explanations, research summaries and attributed article listings provide substantive landing-page content. No personalized rates were obtained; extensive menus and 98 tokenizer issues limit confidence in completeness. |
| 88 | `https://www.expedia.com/` | 1 / 37 | 429 | http-failure | 0 | 1 | http-error | HTTP 429 with recorded http-failure and policy-denied/rate-limit failure. No extraction was produced; retain the rate-limit classification rather than claiming an empty travel page or successful search. |
| 89 | `https://kateminimalist.com/` | 1 / 38 | 200 | failure | 0 | 1 | other-failure | HTTP 200 text/markdown body of 525193 decoded bytes; resource-limit at extraction stage, kind extraction.output, limit 256000 bytes, observed 256014. No extraction was emitted; this is not an HTML loader failure. No rerun. |
| 90 | `https://health.clevelandclinic.org/` | 1 / 39 | 200 | extracted-unverified | 26548 | 1 | useful-source-content | HTTP 200 samples contain named health articles and explanatory teasers about nutrition, allergies and head injuries. Duplicated image labels and standalone URLs add noise; no full articles or clinical claims were independently validated. |
| 91 | `https://www.aeanet.org/` | 1 / 40 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with recorded semantic-barrier and confirmed Cloudflare challenge. No extraction or assessable source content. |
| 92 | `https://www.amazon.co.uk/` | 1 / 40 | 200 | extracted-unverified | 21904 | 1 | useful-source-content | HTTP 200; homepage contains named board-game, footwear and tool deals with discount percentages plus seasonal merchandising. Most text is navigation/footer and some controls are blank; listing visibility does not verify stock, checkout or account access. |
| 93 | `https://thelivinglook.com/` | 1 / 41 | 200 | empty-extraction | 0 | 2 | empty | One redirect reaches an Alibaba home-storage showroom with HTTP 200, then empty-extraction and zero extracted characters. The product-themed title is not a listing; no parser failure is recorded and redirect query details are omitted. |
| 94 | `https://carbuzz.com/` | 1 / 42 | 200 | extracted-unverified | 26307 | 1 | useful-source-content | HTTP 200 samples contain automotive news summaries, named reviews and vehicle offers with prices. Sign-in/newsletter prompts coexist with public content; registration, AI search and purchasing were not exercised. |
| 95 | `https://www.ign.com/` | 1 / 43 | 200 | extracted-unverified | 24019 | 1 | useful-source-content | HTTP 200. Game/entertainment headlines, short news summaries, release listings and guide links provide topical content. Many card titles repeat and menus run together; linked reviews, videos and guides were not assessed. |
| 96 | `https://www.ubuy.mq/` | 1 / 43 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403; receipt confirms a Cloudflare challenge and semantic-barrier policy denial. No extraction or product content is available. |
| 97 | `https://runrepeat.com/` | 1 / 44 | 200 | extracted-unverified | 9805 | 1 | useful-source-content | HTTP 200; named shoe reviews with dates, detailed guide topics and an explanation of the testing process are present. Review links and labels repeat extensively; linked measurements and full reviews were not inspected. |
| 98 | `https://www.cosmopolitan.com/` | 1 / 44 | 200 | extracted-unverified | 22986 | 1 | useful-source-content | HTTP 200 samples contain editorial listings, bylines and feature summaries across entertainment, fashion and relationships. Image-description text and merged bylines add noise; no full articles, subscription access or factual verification is established. |
| 99 | `https://www.byrdie.com/` | 1 / 45 | 403 | semantic-barrier | 0 | 1 | consent-or-access | HTTP 403 with recorded semantic-barrier and confirmed Cloudflare challenge. No extraction; the large captured body is not evidence of accessible beauty articles. |
| 100 | `https://www.ulta.com/` | 1 / 45 | 200 | extracted-unverified | 55232 | 1 | useful-source-content | HTTP 200; beginning/middle/end, headings and merchandising samples reveal named beauty products and promotional descriptions beyond the large category menu. Several recommendation/deal carousels contain controls only. Sampled extraction; no cart or purchase interaction verified. |

## Evidence

- Corpus SHA256: `9416ba16dfcfc7a544f1b2b68419bc583f0f5e42aec8ddc0e263285cb1f79d0b`.
- Postflight SHA256: `c90df8de330a3c2c10928d7c9c49db2d7b221a1fe470b24f758c361c6cdc2fc7`.
- Local lane: `node_modules/.cache/native-validation/agent-citation-pages-september15` (source and100 target receipts,
  bodies, invocation pins, closure logs, independent reviews, selection/audit
  scripts and final artifact ledger). Raw bodies are not committed.
- Public companions: `reports/agent-citation-corpus-2026-09-15.json` and
  `reports/agent-citation-pages-2026-09-15.json`.
