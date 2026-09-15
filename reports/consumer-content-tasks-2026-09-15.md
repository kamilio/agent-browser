# Consumer detail content — September 15, 2026

## Scope and relationship to the 100-page run

This follow-up validates four exact detail-page links found in the original
100-page captures. The original results remain in
`reports/agent-citation-pages-2026-09-15.md`, including every attempted URL.
That corpus is a citation-derived host-root proxy, **not a measured global list
of the 100 pages agents use most**. Its 100 attempts and 48 useful-source-content
reviews are historical measurements, not updated by these five follow-up checks.

Baseline runtime: `10ebaa8d2f9a42e561a61102a7f89253f982ca43`. Clean archived builds
exclude unrelated working changes. The native browser alone performs the public
HTTPS GETs: no alternative browser/fetch client, login, credentials, page scripts,
SafeJS SDK, forms, cart, purchase, install, media execution or challenge solver.
Each child has empty HOME/TMP, a 45-second deadline, 192MiB heap, default 2MB
response/256KB extraction limits and same-origin HTTPS-only request observation.
The reader uses separate omitted raw-source accounting and explicit UTF-8
fallback, without source-hidden visibility filtering. No request retries.

## Every fresh navigation

| Phase | Exact target | HTTP | Captured body bytes | Markdown bytes | Finding |
| --- | --- | ---: | ---: | ---: | --- |
| Baseline | https://www.target.com/p/apple-watch-series-12/-/A-1013556561 | 200 | 797138 | 3370 | Identity/variant shell; description headings lack content |
| Baseline | https://www.ulta.com/p/halo-glow-goddess-balm-glossy-body-highlighter-pimprod2061644?sku=2661744 | 200 | 1399341 | 55162 | Useful product description, directions and ingredients; extensive navigation |
| Baseline | https://apps.apple.com/us/app/nfl/id389781154 | 200 | 960882 | 39459 | Useful app listing, version/privacy sections; duplication and mixed historical content |
| Baseline | https://dictionary.cambridge.org/dictionary/english/enormous | 200 | 323765 | 35523 | Useful definitions/examples/translations; dialogs and navigation noise |
| Candidate | https://www.target.com/p/apple-watch-series-12/-/A-1013556561 | 200 | 801349 | 3394 | Four source product records added; rendered-content claim remains false |

All five retain the native `extracted-unverified` outcome. Nonempty Markdown is
not an automatic task success: the original Target extraction is insufficient
for a description task. Ulta review/question controls do not establish substantive
reviews; App Store reviews are present but dated. Pricing, availability, product
release names, health claims, app behavior and privacy practices are publisher
statements, not independently verified facts or recommendations. No audio,
checkout, installation, authentication or other interactive behavior was tested.

## Implemented recovery

`sourceProducts` exposes a bounded projection of Target's inert `__NEXT_DATA__`
JSON. Exact HTTPS origin, route, decoded slug, TCIN, page type and known field
paths must agree. Only title, specifications, highlights and description are
projected, with product IDs, relationships and source provenance. It does not
copy query variables, visitor/context data, cookies, arbitrary objects or offers.
Other sites do not enter this product parser; this is not a general hydration
engine, JSON-LD reader or script execution capability.

The companion explicitly says document-source, partial, not rendered, not
verified and HTML-source text. The route product and up to three variants are
separate records, not a claim about the currently selected variant. Literal HTML
inside strings is never inserted into the DOM. Offsets identify the script tag
in LF-normalized decoded UTF-16 source, not response byte positions. JSON paths
identify fields. Source limits and the 32KiB serialized companion cap are
documented in `SOURCE-PRODUCTS.md`; extraction still respects its total byte cap.

The saved Target response gains **26,865 serialized metadata bytes**, four
records and three complete included descriptions of 4,722/4,728/4,728 code units.
The primary record has specifications but no description. The source has 21
variants; recovery is explicitly truncated. Independent literal-source checks
compare every emitted field, ID, relationship and source path, not just keywords.
The fresh candidate receives a different body hash and independently passes the
same field checks: 26,865 metadata bytes, four records, three descriptions.
The changed fresh Markdown size is a new-response observation, not a same-input
performance or extraction comparison.

## Regression and offline validation

- Selected baseline: **1,198 passed**, zero failures across 18 manifest files.
- Old production with final new tests: **1,252 passed, 26 expected failures**.
- Final candidate: **1,278 passed**, zero failures across 19 manifest files,
  including **80 new regressions**. Build, types, format and lint pass.
- This is not a full 919-file native-manifest run or actual SafeJS SDK validation.
- Four saved-page Markdown outputs remain byte-identical; reader reports also
  match. Other three sites gain no product metadata. JSON extraction agrees
  with Markdown metadata; tree text, revisions and resource usage are unchanged.
- The successful socket-denied offline comparison opens/closes **33 documents**,
  verifies source/compiled pins, and confirms metadata is removed on tree close.
- Twelve alternating saved-Target samples give median **27.02ms baseline versus
  28.02ms candidate**. They include load, extraction, assertions and cleanup;
  they do not establish network latency or a general browser speed result.

Retained initial failures matter: release01 had four failed checks, leading to
noscript exclusion, full route-slug matching, bounded valid-variant selection
and a corrected Markdown-escaping test. Three boundary cases were then added.
The first offline release02 comparison failed because the receipt's redacted
query was incorrectly reused as Ulta's base URL. The harness now verifies the
redacted URL against the authorized corpus URL and uses that exact original
base; the failed run remains intact. No production workaround hides that error.

## Evidence and remaining gates

The private local lane is
`node_modules/.cache/native-validation/consumer-content-tasks-september15/`.
The companion JSON report pins receipts, body hashes, invocations, request
observers, reviews, source/compiled manifests, regression results and replay
evidence. Five navigations produce **five HTTPS GETs and five captures**; all
children, process groups, requests and observed sockets close. Zero retries,
credential headers, alternate-fetch attempts or scripts are observed.

This focused change does not solve generic JS-only content, changing product
schemas, complete variant enumeration, navigation/dialog noise, duplicate
sections, access challenges or full browser compatibility. Actual SafeJS,
credential/password/passkey and interactive acceptance gates remain separate.
Original working changes and original measurements are preserved. No push.
