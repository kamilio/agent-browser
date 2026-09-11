# Native website test inventory and candidate queue

Audited September 11, 2026: **54 distinct substantiated hostnames** across saved September 1–11 records.
**This is an attempts/coverage inventory, not a list of 54 working websites.**

## Counting and evidence

- Exact hostnames, not registrable domains or individual URLs.
- Includes failed/blocked and pre-response attempts.
- Six hostnames come from 85 attributed historical JSON reports; 38 from 197 September 5 JSONL attempts; ten more from inspected native source/live-flow receipts and reports.
- Nineteen historical reports lack explicit host attribution; no invented hosts are added.
- HTTP 200, reader extraction, script execution, geometry and interaction are distinct gates.
- Reference-browser inspection, linked-only URLs, loopback/synthetic fixtures and this inventory’s external candidate discovery are not native website tests.
- Representative URL query strings/fragments are omitted; original records remain unchanged.
- Proposed candidates have not undergone native acceptance checks in this inventory; current availability is not asserted.

Audits: `node_modules/.cache/native-validation/website-inventory-september11/legacy/hosts.json` and `research/hosts.json` under the same directory. The first screens 604 tracked historical JSON reports; the second reads 106 research JSONL files. Additional parent checks include original Camoufox receipts, the Linux hidraw metadata, CTAP2 and September 11 live-flow records. GitHub is substantiated by the later native Camoufox GET, not by the earlier research audit’s report-only reference.

Machine-readable compact inventory: `reports/website-test-inventory-2026-09-11.json`. No prior evidence paths, counts or outcomes are rewritten. No native browser, script, credential or website test is launched for this inventory.

## Browser and interaction corpus

| Host | Observed scope/result | Evidence |
| --- | --- | --- |
| `example.com` | A real HTTP 200 request is explicitly evidenced despite the domain also appearing in synthetic tests. Native parsed documents, controlled DOM/timer evaluation and canceled/fragment clicks are evidenced. Initial lexical-state and timer-scope probes fail; later controlled checks pass. No automatic website-script acceptance is established. | `reports/attributes-cli-2026-09-02.json` |
| `books.toscrape.com` | HTTP 200 downloads and native parsed-page/CLI/controlled-click checks are evidenced. Automatic scripts repeatedly remain partial or failed, including fetch-policy denial, interpreter errors, timeouts and halted realms; seven owned-process reports record failed navigation. Latest automatic report executes 1 script, fails 2 and skips 5; this is not dynamic catalog acceptance. | `reports/attributes-cli-2026-09-02.json` |
| `quotes.toscrape.com` | HTTP 200 initially establishes only the JavaScript HTML shell. Later automatic SafeJS attempts retain partial/failed compatibility, interpreter errors, halted realms and two failed-navigation timeouts. Latest automatic report executes 0 scripts, fails 1 and skips 1 due to execution-timeout. No successful dynamic quote rendering or site interaction is established. | `reports/attributes-process-sites-2026-09-02.json` |
| `httpbingo.org` | Public POST echo, synthetic cookie requests/redirects and native JSON documents succeed. Parsed public-form type/fill/check/Enter and POST echo also succeed with website JavaScript disabled. Earlier constructed-control tests are distinct from actual parsed public-form interactions. Cookie route paths and the initial form GET URL are not retained and are not reconstructed. | `reports/cookie-session-node-2026-09-01.json` |
| `news.ycombinator.com` | Native homepage/CSS load and link discovery; genuine click fails at the width/layout profile. No destination request completes. | `HN-NATIVE-FLOW.md` |
| `info.cern.ch` | Genuine native link click reaches the second document; two HTTP 200 responses. | `CERN-NATIVE-FLOW.md` |
| `developer.mozilla.org` | Live document/CSS capture followed by offline native Grid/click diagnostics. Last recorded click fails before geometry at the absolute accessibility-menu/Grid-parent boundary; not a working MDN renderer. | `MDN-POSITIONED-GRID.md` |
| `html.duckduckgo.com` | Native search-form fill and POST result navigation recorded. Original harness exits 1 due to its case-comparison assertion; separate offline audit confirms the recorded flow. | `WEBSITE-FLOWS-SEPTEMBER-11.md` |
| `www.wikipedia.org` | Native portal/form discovery, fill and GET submission complete in a live flow to the English article; not full rendering acceptance. | `SELECTOR-ANCESTOR-RANGES.md` |
| `en.wikipedia.org` | Live search destination and stylesheets loaded; expected text and old-document closure verified. Later selector comparisons are offline replays. | `SELECTOR-ANCESTOR-RANGES.md` |
| `www.python.org` | Homepage and three CSS resources fetched; live search flow fails at query work budget before submission. Later offline profiles do not replace that live result. | `CSS-WORK-SITE-COVERAGE.md` |
| `pypi.org` | Homepage/form/fill/GET submission execute; search destination is an HTTP 200 Client Challenge, not search results. | `PYPI-NATIVE-FLOW.md` |

## Other source/research/attempted hosts

These are additional sites contacted or attempted by the native reader. A missing status can be a local/network/admission failure; it is not automatically a site-imposed block. A final 200 after redirect belongs to the final response host, not necessarily the requested host.

| Host | Recorded scope/result | Evidence |
| --- | --- | --- |
| `aclanthology.org` | Saved final-response metadata (200: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/benchmarks/methodology-followup/05-verified-references.jsonl:2` |
| `api.llm-speed.com` | Saved final-response metadata (200: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/measurement-followup/06-qwen-5090-payload.jsonl:1` |
| `arxiv.org` | Paper/abstract reader attempts include successful native MMLU-Pro abstract extraction; source reading is not benchmark reproduction. | `WEBSITE-COMPATIBILITY-SEPTEMBER-11.md` |
| `camoufox.com` | Native HTTP 200 fingerprint and virtual-display documentation reads; no Camoufox engine or fingerprint-effectiveness test. | `CAMOUFOX-ARCHITECTURE-2026-09-05.md` |
| `crfm.stanford.edu` | Saved final-response metadata (200: 1; unavailable: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/benchmarks/01-discovery.jsonl:2` |
| `deploymentsafety.openai.com` | Saved final-response metadata (unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/astra-twitter/06-followups.jsonl:1` |
| `developers.cloudflare.com` | Saved final-response metadata (200: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/fingerprint-identity/04-cloudflare-support.jsonl:1` |
| `developers.openai.com` | Saved final-response metadata (unavailable: 3); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/astra-twitter/01-official.jsonl:2` |
| `developers.yubico.com` | Saved final-response metadata (200: 2; 404: 1; unavailable: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/passkey-hardware-feasibility/01-cli-sandbox.jsonl:1` |
| `docs.kernel.org` | Native HTTP 200 source extraction; not device I/O or hardware acceptance. | `LINUX-HIDRAW-REPORTS.md` |
| `docs.mlcommons.org` | Saved final-response metadata (200: 3); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/benchmarks/05-docs-followups.jsonl:2` |
| `docs.nvidia.com` | Saved final-response metadata (200: 2; unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/06-primary-docs.jsonl:3` |
| `drafts.csswg.org` | Saved final-response metadata (200: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/fingerprint-identity/03-cssom.jsonl:1` |
| `fidoalliance.org` | Native CTAP2 specification requests, initial extraction limits and subsequent bounded section reads; not passkey-device testing. | `HEADING-SECTION-EXTRACTION.md` |
| `github.com` | Native HTTP 200 and source-heading/section extraction; not repository UI acceptance. | `WEBSITE-RESEARCH-SEPTEMBER-11-FOLLOWUP.md` |
| `gorilla.cs.berkeley.edu` | Saved final-response metadata (200: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/benchmarks/round-two/05-saturation-systems-tools.jsonl:3` |
| `help.openai.com` | Saved final-response metadata (unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/astra-twitter/04-alternatives.jsonl:4` |
| `help.poe.com` | Saved final-response metadata (403: 1; unavailable: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/poe-reddit/03-search-official.jsonl:3` |
| `html.spec.whatwg.org` | Native standards-source requests include a September 11 HTTP 200 parsing page followed by reader-depth failure and offline diagnostics. | `WEBSITE-FLOWS-SEPTEMBER-11.md` |
| `huggingface.co` | Native model-card/configuration and quantization documentation reads; no model execution, hosted inference or account workflow. | `WEBSITE-RESEARCH-SEPTEMBER-11-FOLLOWUP.md` |
| `lastexam.ai` | Saved final-response metadata (200: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/benchmarks/round-two/04-full-methods.jsonl:3` |
| `lite.duckduckgo.com` | Saved final-response metadata (200: 5; 202: 3); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/04-lite-methodology-apple.jsonl:1` |
| `livecodebench.github.io` | Saved final-response metadata (unavailable: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/benchmarks/01-discovery.jsonl:3` |
| `llm-speed.com` | Saved final-response metadata (200: 4; unavailable: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/05-benchmarks-spark-upstream.jsonl:2` |
| `openai.com` | Observed public announcement-link request returns HTTP 403 with a Cloudflare challenge. No model identity, announcement truth or challenge bypass established. | `WEBSITE-FLOWS-SEPTEMBER-11.md` |
| `poe.com` | Saved final-response metadata (200: 8; unavailable: 3); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/poe-reddit/04-lite-older-official.jsonl:3` |
| `raw.githubusercontent.com` | Saved final-response metadata (200: 26; unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/04-lite-methodology-apple.jsonl:2` |
| `rocm.docs.amd.com` | Native source attempts and captured-table diagnostics; September 11 request records HTTP 429/access challenge. | `WEBSITE-COMPATIBILITY-SEPTEMBER-11.md` |
| `search.yahoo.com` | Saved final-response metadata (200: 2; unavailable: 2); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/poe-reddit/04-lite-older-official.jsonl:2` |
| `support.apple.com` | Saved final-response metadata (unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/04-lite-methodology-apple.jsonl:3` |
| `www.amd.com` | Saved final-response metadata (200: 1; unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/07-amd-quantization.jsonl:1` |
| `www.apple.com` | Native Mac Studio specifications extraction succeeds with partial reader semantics. No configurator, purchase, model workload or hardware benchmark. | `WEBSITE-COMPATIBILITY-SEPTEMBER-11.md` |
| `www.bing.com` | September 11 Poe search receives HTTP 200 but reader loading fails on a malformed-attribute tokenizer limitation. No Reddit opinions are established. | `WEBSITE-FLOWS-SEPTEMBER-11.md` |
| `www.cnbc.com` | Saved final-response metadata (unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/astra-twitter/06-followups.jsonl:3` |
| `www.google.com` | Saved final-response metadata (200: 5; unavailable: 4); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/01-discovery.jsonl:1` |
| `www.hardware-corner.net` | Saved final-response metadata (200: 1; unavailable: 1); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/local-llm-hardware/05-benchmarks-spark-upstream.jsonl:1` |
| `www.nvidia.com` | Wrong-route 404 remains recorded; native product-index link discovery subsequently finds and loads the actual DGX Spark page, with an observed specifications section. No hardware benchmark. | `WEBSITE-FLOWS-SEPTEMBER-11.md` |
| `www.reddit.com` | Saved final-response metadata (403: 5; unavailable: 3); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/poe-reddit/01-discovery.jsonl:2` |
| `www.rfc-editor.org` | Native RFC 9110 text retrieval and later Retry-After/date grammar research; protocol/source coverage, not an interactive app. | `WEBSITE-RESEARCH-SEPTEMBER-11-FOLLOWUP.md` |
| `www.swebench.com` | Large-page reader and heading-image failures were investigated; a later bounded reader replay recovers headings. No interactive leaderboard acceptance. | `SWE-BENCH-READER-RECOVERY.md` |
| `www.w3.org` | Native CSS Grid/Box Alignment/WebAuthn source attempts. Latest Box Alignment GET returns 200 and two sections extract; not conformance or rendered-page acceptance. | `GRID-ALIGNMENT-NATIVE.md` |
| `x.com` | Saved final-response metadata (200: 13; unavailable: 5); HTTP status is not content or application success. | `node_modules/.cache/native-validation/browser-research/astra-twitter/03-social-search.jsonl:3` |

## Explicit exclusions

- `kitesurf.cloudflare.app` was inspected with an external Chromium reference session; it is not counted as native-browser compatibility evidence (`COMPATIBILITY.md`).
- Merely cited standards URLs, search-result destinations, unrequested assets and candidate presets are not visits.
- Local/synthetic `.invalid`, loopback and test documents are not public websites.
- The 19 unattributed historical reports remain unresolved rather than being assigned guessed hosts.

## New candidate queue

These are proposed test objectives, not claims of current native compatibility or a fresh reachability check. P0 is the next controlled regression layer; P1 broadens real-world layouts/runtime; P2 covers explicitly isolated security/auth behavior.

| Priority | Candidate | Proposed checks |
| --- | --- | --- |
| P0 | `https://www.selenium.dev/selenium/web/web-form.html` | Forms: labels, input types, select, checkbox/radio, submit/reset and keyboard behavior. |
| P0 | `https://testpages.eviltester.com/` | Small isolated HTML/JavaScript cases: tables, dialogs, navigation, frames, controls and dynamic content. |
| P0 | `https://the-internet.herokuapp.com/` | Interaction cases: delayed loading, uploads/downloads, frames, windows and dialogs. |
| P0 | `https://demo.playwright.dev/todomvc/` | Todo workflow: create/edit/complete/filter/delete, focus, event ordering and reload persistence. |
| P1 | `https://www.uitestingplayground.com/` | Actionability and timing: changing identifiers, delayed controls, scrolling and covered elements. |
| P1 | `https://demoqa.com/` | Complex widgets: date pickers, autocomplete, tabs, dialogs and drag/drop. |
| P1 | `https://automationexercise.com/` | Multi-page catalog/search/cart workflow; stop before purchases or real-account changes. |
| P1 | `https://docs.python.org/3/` | Large real documentation pages: tables, anchors, search, code blocks, responsive navigation. |
| P1 | `https://docs.rs/` | Dense source/code pages, long identifiers, links, overflow and scroll restoration. |
| P1 | `https://react.dev/` | Modern documentation navigation, hydration/runtime behavior and history. |
| P1 | `https://svelte.dev/` | Additional framework/runtime patterns and navigation behavior. |
| P1 | `https://en.wiktionary.org/` | Unicode, long definitions, nested lists/tables and internal links. |
| P1 | `https://ar.wikipedia.org/` | RTL and Arabic content/selection; distinguish reader access from actual shaping/rendering. |
| P1 | `https://www.gutenberg.org/` | Long documents, encodings, download MIME handling and navigation. |
| P2 | `https://webauthn.io/` | Passkey create/get, cancellation, challenge/origin/RP checks with dedicated test credentials. |
| P2 | `https://badssl.com/` | Expected-positive and expected-negative TLS/certificate cases; never disable verification to pass. |
| P0 | `https://web-platform-tests.org/` | Use selected upstream tests in an owned local fixture server; this is a suite source, not app acceptance. |

Also use an **owned Cloudflare/Turnstile test site** with official test keys for deterministic success/failure/expiry paths. This is a controlled test environment, not another already-tested public site.

## Per-site acceptance record

Record each stage independently: request/status → parse/DOM → stylesheet/cascade → page runtime → layout/paint/hit testing → genuine input/navigation → final content → cleanup. Preserve the first failed stage and exact build. HTTP 200 or a green native unit suite cannot replace the action/rendering gates.

For a useful first expansion, start with Selenium’s form, Test Pages, The Internet, TodoMVC and one documentation site; run several explicit interactions on each rather than collecting only more homepage GETs. Keep public changes read-only, avoid real credentials, and isolate uploads, authenticator registrations and challenge tests.
