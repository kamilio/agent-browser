# Website evidence — September 13, 2026, sixth update

This supplements the fifth update without replacing any historical evidence.
**Five fresh native wire GETs** exercise Bing search and a Wikipedia form flow.
Separate offline checks distinguish readable content, native form navigation,
unsupported screen geometry and archived benchmark-table recovery.

## Fresh live requests

| Observed URL | UTC execution | Result and exact scope |
| --- | --- | --- |
| `https://www.bing.com/search?q=site%3Areddit.com+Poe+AI+opinions` | 05:24:00.578–05:24:00.867 | GET200; native reader/capture succeeds; ten result cards readable in a separate offline parse |
| `https://www.wikipedia.org/` | 05:25:34.426 wire start | GET200; actual search field and form discovered in the native document |
| `https://www.wikipedia.org/search-redirect.php?family=wikipedia&search=large+language+model&language=en&go=Go` | 05:25:34.687 wire start | GET302; URL produced by the observed form, not guessed |
| `https://en.wikipedia.org/wiki/Special:Search?search=large+language+model&go=Go` | 05:25:34.701 wire start | GET302; followed the response's observed redirect |
| `https://en.wikipedia.org/wiki/Large_language_model` | 05:25:34.952 wire start | GET200; native destination document contains the query and replaces the closed portal document |

These are five wire requests, not five independent browser flows: Wikipedia
uses two top-level requests and two redirects. No extra result, asset or script
URLs are visited. All requests use the native transport; no remote renderer or
Chromium/Firefox engine, cookies, credential providers or account login.

## Wikipedia form passes; pointer geometry does not

The native session discovers `input[name="search"]`, fills the public constant
large language model, prepares its actual GET form and calls requestSubmit.
The 05:25:34.323–05:25:35.317 child run exits0 after the two redirects. Both
documents close to zero nodes. The transport records four requests, two
redirects, 210075 encoded / 1189125 decoded bytes, zero mocks and zero active
requests after closure. Request pacing is250ms per origin, not a global delay.

The portal has2708 native nodes; the article has17744. Their decoded captures
are119573 and1069552bytes. Portal SHA256:
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
Article SHA256:
`d245314a28881a374410f72c84cc496cbe9b00e67d4716f4b237b7ecf0890705`.
Native redirect-follow mode omits redirect bodies; an empty saved redirect body
is not proof of the complete server response body. Server header dates do not
replace the execution timestamps above.

At05:28:58.820–05:28:59.103, a separate socket-sealed replay selects the portal's
same real input at viewport1280x900. Its first native geometry request throws
unsupported before any raster, mouse or keyboard operation. The message is
Document width resolution requires an issue-free supported formatting profile.
The numeric node argument matches the API; no mock rectangle or CSS rewrite
is substituted. This failure remains preserved, not converted to a pointer pass.

The live form pass therefore establishes HTML/form/navigation functionality,
not screen actionability. No script or resource callbacks were enabled. Partial
HTML parsing, unexecuted scripts and untested external styling/assets remain
explicit. Neither check is a real TTY/device or full-site rendering acceptance.

At05:35:36.258–05:35:36.558, a separate native formatting inspection explains
the guard: twelve raw issue categories, eight independent blockers. Advisory
media diagnostics do not block widths, while existing positioning/float
coordination handles three marker categories. Crucially, the search input has
no formatting node because its fieldset ancestor is deferred. Ignoring a guard
would not create valid input geometry. The independent blockers also include
rejected CSS, overflow, vertical alignment, direction and deferred elements.
No single feature fix is established as sufficient for portal rendering.

Evidence lanes under `node_modules/.cache/native-validation/`:
`native-wikipedia-form-flow-september13/` and
`native-wikipedia-pointer-september13/`, each with RESULT.md/JSON, invocation,
execution, resource, cleanup, before/after inventories and EVIDENCE.sha256.
The diagnosis is in `native-wikipedia-formatting-diagnosis-september13/`;
its issue counts are aggregate diagnostics, not affected-node counts or a
per-rule/winning-declaration trace. See LAYOUT-WIDTH-DIAGNOSTICS.md for the
separate diagnostic-only code change; it does not claim rendering support.

The later audited17840 snapshot is used only for one offline geometry-error
recheck at05:43:08.723–05:43:09.005. It preserves rejection and reports the eight
actual blocker codes/counts. Diagnostic validation passes; geometrySupported
remains false. Zero HTTP, pointer/keyboard actions or rasters. The earlier live
visits are not retroactively attributed to this later code version. Evidence:
`native-wikipedia-width-diagnostics-september13/`.

## Bing readability is not Reddit opinion research

Bing returns117638 decoded /38932 encoded bytes, SHA256
`e5be699081a529b9392435f8cfa40cce121e4e8c3805a7d09a49353a74e5fb11`.
The actual wire path, source title and search-field value preserve the complete
authorized site:reddit.com Poe AI opinions query. One offline native reader
query extracts ten result cards using7156 of10000 excerpt code units; none of
their decoded link payloads points to Reddit. Two identify general Poe product
pages; the other results concern games, a writer or networking.

The actual links are Bing click URLs. Locally decoded payload destinations are
not followed URLs, observed redirects or independently verified sources. No
result link is fetched. The cause of the mixed/off-site results is not known;
there is no evidence that the native client dropped the query terms.

Reader output has21 tokenizer issues and deliberately partial semantics. No
local excerpt clipping occurred, but seven source snippets already contain
ellipses. Snippet product/model claims are not independently verified. **Reddit
opinions on Poe remain unresolved**, despite successful search-page reading.

Evidence: `native-poe-search-september13/RESULT.md`, SEARCH-RESULTS.json,
UNVISITED-LINKS.json, QUERY-PROVENANCE.json and the sealed native capture.

## Archived MLPerf table context recovered

No new GitHub request. The first offline preflight found five tables containing
both model names and stopped on an invalid uniqueness assumption. That failed
lane and its zero CLI invocations remain preserved.

A fresh bounded follow-up publishes all12 candidate tables and actual heading/
preceding-paragraph context before selection. The intended table is identified
by its real Datacenter-suite introduction, not an arbitrary first model match.
One structural CSS selector is validated uniquely. One actual pinned stdin/
stdout replay CLI then retains all14 rows and98 cells, including the seven-cell
label row written with td rather than th. All rows, text, allowed attributes and
114 source metadata records match the independent preflight.

This fixes the research harness's missing-label evidence for the previously
selected Llama2/Mixtral rows. Dataset, QSL size, quality requirements and server
latency constraints now have their actual source-column context. These are
policy text, not achieved quality, measured latency or hardware results. Empty
source attributes remain empty; no span values or semantic header graph are
invented. Literal unresolved source markers remain unresolved.

The original mutable master URL is not pinned to an upstream commit or aligned
to a benchmark round. No latest-policy, v5.0 applicability, submission eligibility
or cross-version consistency claim follows from header recovery. No benchmark,
checker or linked document was run or fetched.

Follow-up preflight05:35:06.519–05:35:06.798; CLI05:35:20.495–05:35:20.790.
CLI output33776bytes, SHA256
`bb0d833c1a37ede6857da4064ebf8b24da5eff45b4fde6b21b5824b38db55b9c`.
Evidence: `native-mlperf-table-replay-september13/` for the failed attempt and
`native-mlperf-table-context-september13/` for CANDIDATES.json, TABLE.json,
PREFLIGHT.json, unchanged replay.jsonl, CHECKS.json and complete provenance.

## Acceptance boundaries

The live requests and archived research checks reuse audited17836 native code;
they are not a rerun of its broad native gate. Before/after source and compiled
inventories match, process groups terminate and private directories are cleaned.
Individual elapsed/RSS observations are not controlled browser benchmarks.

The original four research topics are not complete. Website coverage, layout,
asset/script behavior, performance comparisons, credentials/passkey devices,
SafeJS, real TTY and human challenge handoff remain separate open gates. No
fingerprint spoofing or automated CAPTCHA/challenge solving occurred.
