# Article and review workflows — September 15, 2026

## Outcome

Five fresh source-linked pages provide subject-matter prose. Four provide
substantial article/review content; Consumer Reports provides background, testing
and FAQ text but **not the seven ranked recommendations promised by its title**.
Five actual offline section-replay CLI invocations reproduce native API output
byte-for-byte, with zero additional website requests. This validates existing
content-retrieval capabilities; no production change or new regression-suite run
is claimed in this report.

The original 100-page inventory and its outcomes remain unchanged in
`reports/agent-citation-pages-2026-09-15.md`. That citation-derived host-root proxy
is not a measured worldwide ranking of pages used by agents. These are different
linked detail-page tasks, not retroactive upgrades to the original results.

## Every fresh target

| Target | HTTP | Body bytes | Full Markdown bytes | Content judgment |
| --- | ---: | ---: | ---: | --- |
| https://www.cnet.com/home/internet/what-is-cellular-home-internet/ | 200 | 292197 | 48500 | Explainer, six-provider table, service discussions and FAQs |
| https://www.consumerreports.org/appliances/cooktops/the-best-induction-cooktops-a1194688661/ | 200 | 497366 | 43825 | Background/testing/FAQs; seven ranked product recommendations absent |
| https://runrepeat.com/brooks-revel-9 | 200 | 643648 | 48718 | Review prose, populated lab results and separate brand specifications |
| https://www.kbb.com/reviews/back-to-school-subaru-ascent-helps-a-family-get-along/ | 200 | 270047 | 19297 | Narrative vehicle review and cargo/travel sections |
| https://www.ign.com/articles/steam-frame-review | 200 | 315174 | 27713 | Review sections, verdict and score card |

All native outcomes remain `extracted-unverified`, with partial reader semantics.
The independent reviewer inspected all extracted text, excluding HTTP(S) link
destinations: CNET lines 1–946, Consumer Reports 1–966, RunRepeat 1–2718, KBB 1–404
and IGN 1–258 in the review's newline-expanded inspection representation. That
representation retains other JSON/Markdown escapes; it is not the physical JSONL
line numbering. The parent separately verifies exact requested links and URLs.

Source claims, products, prices, measurements, release dates and recommendations
are not fact-checked or endorsed. Media, interactive controls, purchases, accounts
and actual UI visibility are untested. A null challenge diagnosis is not proof of
unrestricted access or completeness. No challenged target was retried.

## Bounded follow-up tasks without new requests

On each same captured body, full output matches the original receipt. Main focus
selects one source main landmark; row-list output retains physical cell order
without inferring header associations or grid coordinates. Complex tables keep
their existing fallback. Three pages without tables are byte-identical between
focus-only and focus-plus-row-list modes.

| Site | Main focus bytes | Focus + row-list bytes | Selected section | Section bytes |
| --- | ---: | ---: | --- | ---: |
| CNET | 29165 | 26686 | Cellular internet providers compared | 1641 |
| Consumer Reports | 16010 | 16010 | How CR Tests Induction Cooktops | 2182 |
| RunRepeat | 28972 | 19688 | Shock absorption | 613 |
| KBB | 7488 | 7488 | Packing the Ascent | 966 |
| IGN | 22730 | 22730 | Performance and Gaming | 8874 |

Sections use unique, untruncated native heading discoveries and exact selectors
resolved back to the same heading refs. Five actual research-replay CLI commands
receive original receipts through stdin, with independent receipt/body hashes
and byte counts, `--expected-profile default --section <observed-selector>
--format markdown --table-rows`. Their emitted Markdown matches the API section
files exactly, and each provenance envelope records `networkRequests: 0`.

The API checks compare **226 selected text nodes** to native source data and
**39 selected table cells** to independent per-cell extraction. CNET's main has
one table/35 cells; RunRepeat's main has 28 tables/104 cells. The selected CNET
section checks all 35 cells; the selected RunRepeat section checks four. This is
not a claim that all tables or publisher measurements were independently audited.

Focus is intentionally lossy outside its scope: RunRepeat's main starts below
the article title, which remains available in document metadata/full output.
Consumer Reports' two source `isAccessibleForFree: false` declarations remain
document-scoped in focus, section extraction and actual CLI replay. They do not
identify why recommendations are missing or confer access. Recently tested model
links must not substitute for the absent ranked picks. KBB image-label duplication,
IGN `null` image labels and other source/UI noise remain visible, not silently fixed.

## Extraction-only timing

Twelve same-tree samples per mode/site alternate mode order. Timers include
`extractDocument`, including focus selection when enabled; equality/byte checks
follow the timer. Load, network, startup and cleanup are excluded. These are small
local observations comparing different scopes, not a general speed benchmark.

| Site | Full median ms | Focus median ms | Focus + rows median ms |
| --- | ---: | ---: | ---: |
| CNET | 5.73 | 3.36 | 3.49 |
| Consumer Reports | 9.94 | 4.19 | 4.61 |
| RunRepeat | 8.19 | 6.28 | 6.40 |
| KBB | 4.29 | 1.41 | 1.43 |
| IGN | 2.26 | 1.45 | 1.41 |

Smaller row-list output does not guarantee faster extraction: several row-list
medians are slightly higher than focus alone. Section output is suitable for the
selected task, not a full-document summary. No source limits or defaults change.

## Evidence and boundaries

Runtime is commit `038119511351c11ff6e1989f6cfe2565def5c141`. Pre/post checks compare
all **1,493 committed source/script/package/tsconfig inputs** and verify the clean
candidate's full source/compiled pin manifests. Dirty root build output is unused.
Five sequential navigations produce **five HTTPS GETs and five captures**, with
two-second inter-target gaps, 45-second child deadlines, 192MiB heaps and existing
2MB response/256KB extraction limits. Empty HOME/TMP, same-origin HTTPS-only
observation, no credential headers, alternate browsers/fetch, scripts/SDK, solvers,
forms or commerce. All observed child/group/request/socket closures pass.

Two socket-denied API runs open and close **10 documents**. Five socket-denied CLI
processes also exit cleanly; internal CLI document closure is not separately
instrumented here. Guard attempts are zero. Trees retain their resource usage and
revision across API operations. Scope was extended before CLI execution; both
scope versions are retained and checked against their respective invocation pins.

The private lane is
`node_modules/.cache/native-validation/review-content-tasks-september15/`.
The JSON report pins live receipts, source-link provenance, reviews, workflow
outputs, invocation records, timing samples, guards and hashes. Documentation now
shows this content-first workflow in `CONTENT-FIRST-RESEARCH.md`.

No native suite rerun, SafeJS acceptance, credential/passkey operation, rendering,
media playback, CAPTCHA handling or complete site compatibility is claimed.
Missing recommendation bodies, repeated sections, image-label noise, dynamic
content and access barriers remain open. Original working files and historical
measurements are preserved. No push; the broader browser goal remains active.
