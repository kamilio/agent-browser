# Source-linked retrieval and focused replay — September 17, 2026

This workflow follows two literal links from previously captured public homepages,
retrieves each destination once through the standalone native browser, then
re-extracts the saved responses with the committed strategy-aware replay API.
It tests useful content retrieval without a second request, not DOM clicking,
persistent sessions, rendered completeness or medical/financial accuracy.

## Acquisition and runtime

Mayo Clinic's source link leads to an institutional brain-aneurysm care page,
not a symptom/diagnosis article. Bankrate's source link leads to an editorial
article about real-estate agents and mortgages. Exact literal href byte ranges,
hashes, labels, base handling and URL resolution are recorded before navigation.
Source URLs are not guessed, and neither homepage is fetched again.

Each destination has its own exact-command synthetic route/closure proof before
its single anonymous native GET. Synthetic fixtures are not historical publisher
responses and do not establish live content. No retries, redirects, page scripts,
SDK, credentials, forms, subresources, alternate clients or challenge bypass are
used. The existing2MB response/256KB extraction limits remain, with private empty
HOME/TMP,256MiB old-space,16MiB per-file and60-second live supervision.

Both acquisitions and the subsequent offline replay use the qualified release02
runtime whose1604 source pins match committed0b49d8a and whose2380 compiled pins
verify. Its3804 selected native tests and scoped build/type/format/lint results
are prior evidence, not new runs. There is no full-suite, actual SDK or dirty
workspace runtime qualification in this follow-up.

## Observed results

| Destination | HTTP / mode | Received UTC | Body bytes | Whole Markdown | Focused Markdown | Reduction |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Mayo Clinic | 200 / native | 2026-09-17T09:30:56.349Z | 642366 | 29059 | 11347 | 61% |
| Bankrate | 200 / native | 2026-09-17T09:29:58.842Z | 769193 | 36397 | 16472 | 54.7% |

- **Mayo Clinic:** all18 selected care-region paragraphs,16 headings and the headline remain in focused output. Selection includes nonempty source-visible paragraphs within article#main-content between the care and support headings, including captions and logistical paragraphs. Its10 list-item checks retain the original9/10 strict matches; removing line-start Markdown bullet markers yields10/10. The nested-parent strict mismatch is not rewritten as an omission or a strict pass.
- **Bankrate:** all40 direct-child editorial paragraphs,6 subheadings,5 blockquotes and the headline remain in focused output. Paragraphs are selected by the immediate parent div.article__main-content; two nested feedback paragraphs are excluded.

Original document-title metadata is preserved for both. No selected paragraph omission is demonstrated, but ancillary content remains. The source inventories retain full text and source fragment hashes for parent verification; paragraph/list/blockquote counts can overlap and are not additive.

Both live processes and their preceding synthetic proofs pass request/TLS/session/document/process closure checks. Parent replay separately reports zero network requests and closes under kernel/JavaScript network denial. Worker parser/inspection incidents and Mayo’s strict nested-list mismatch remain in sealed evidence; there is no production browser change in this follow-up.

## Focused replay and content scope

The parent separately invokes `extractResearchStrategyReplayJson` with trusted
receipt/body pins, the expected native-first strategy and main-content-v3.
Original capture outcome and mode remain in provenance; replay uses the same
captured bytes without transport or script hooks. The network-denied process
closes, and input/runtime pins remain unchanged. This is neither a re-fetch nor
permission to reinterpret a failed or protected response.

Source review compares entire normalized text blocks under explicit selection
rules, rather than only short excerpts. Those matches are source-pattern coverage,
not proof of every possible article component, ordering, occurrence multiplicity,
images, layout, external CSS, interactivity or correctness of publisher claims.
Selected content may still contain navigation, recommendations or other ancillary
material. Output size reductions measure Markdown bytes, not model tokens or
end-to-end browsing speed.

## Remaining work

Historical100-entry33-useful/67-other results are unchanged. This is two new
destination checks plus saved-body replay, not a new100-site crawl or100 working
websites. Dynamic runtime, actual SafeJS, real credentials/passkeys/devices/TTY,
broader performance, access/CAPTCHA handling and unfinished topic research remain
open. Continue source-linked tasks and concrete browser fixes; the overall goal
is still active.

## Evidence

The adjacent JSON records URLs, times, sizes, hashes, content-review rules and
execution scope. Sealed source/proof/live artifacts remain in
`node_modules/.cache/native-validation/mayo-care-september17/` and
`node_modules/.cache/native-validation/bankrate-article-september17/`.
Parent replay and publication evidence remains in
`node_modules/.cache/native-validation/focused-live-workflows-september17/`.
No historical measurement or pre-existing work is rewritten.
