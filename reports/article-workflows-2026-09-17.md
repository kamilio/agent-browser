# Source-advertised article workflows — September 17, 2026

This follow-up tests article retrieval rather than counting homepage listings as
complete research. Two URLs are selected from literal same-origin anchors in the
previously captured PCMag and NerdWallet homepages. Source spans, hashes and URL
resolution are recorded; this is inert link discovery followed by separate native
CLI navigation, not a DOM click or persistent-session interaction test.

## Acquisition and runtime

Exactly one fresh anonymous GET per article, after each exact-command synthetic
route/closure proof. The proof fixtures are explicitly not historical article
responses and do not establish live content. No homepage is fetched again.
The committed45a7e4d source matches the qualified release03 compiled tree;
1601 source and2380 compiled pins are verified. Prior2732 selected native tests
and build/selected-type/six-overlay formatting/lint results are retained, not
claimed as new test runs. No browser production code changes in this follow-up.

Both commands use `--document-strategy native-reader-fallback-v1 --capture-body`
with the exact source-advertised article URL. Existing2MB response/256KB extraction
caps remain. Each process has256MiB old-space,16MiB per-file,60sec supervision and
private empty HOME/TMP. No redirects, retries, credentials, page scripts, SDK,
subresources, alternate client, form interaction or challenge bypass is used.

## Measured outcomes

| Site | HTTP | Selected loader | Decoded body bytes | Markdown bytes |
| --- | ---: | --- | ---: | ---: |
| PCMag | 200 | reader | 826339 | 46991 |
| NerdWallet | 200 | native | 1025423 | 21508 |

- **PCMag:** response received 2026-09-17T08:17:18.793Z. Reader fallback retains all13 identified direct editorial paragraphs,3 direct subheadings and the headline under normalized matching. One nested author biography is excluded from the13. Navigation and other ancillary material remain; captured-source coverage is not rendered completeness.
- **NerdWallet:** response received 2026-09-17T08:18:01.605Z. Native loading succeeds without reader fallback. Title,21 identified paragraph containers,7 article headings and8 list items match normalized extraction. Four paragraph excerpts were manually inspected; publisher claims and source dates were not verified.

Both exact article destinations also appear in the previously extracted homepage
Markdown. The live transport/session/document/process checks pass with no remaining
active requests. The full receipt/source provenance is retained in sealed evidence.
Mode means the selected loader, not a completeness or factual correctness claim.

## Content scope

PCMag's source article has13 direct editorial paragraphs and3 direct subheadings;
all match normalized extraction, as does the headline. One nested author biography
is separately excluded from those13 paragraphs. The initial independent collector
ignored br separators and falsely missed a paragraph; its artifacts remain and
a separate corrected inventory resolves the audit discrepancy without changing
browser code or repeating the GET. Navigation, recommendations and author content
remain in whole-document output. Captured editorial text is present, not merely
the homepage teaser; rendered/JavaScript-only content is not established.

These checks do not verify publisher facts, product/financial claims, source dates
or medical guidance. They do not validate every inline link, interaction, image,
source ordering, duplicate occurrence or byte-perfect Markdown. Timings describe
individual observed requests, not a comparative performance benchmark.

## Remaining work

Improve task-focused output without extra fetches and continue testing other
source-advertised destinations. Dynamic runtime, access/CAPTCHA handling, real
credentials/passkeys/devices, broad performance and unfinished research remain
open. The original100-entry33-useful/67-other verdicts are unchanged; this is not
a new100-site crawl. The overall browser objective remains active.

## Evidence

See the adjacent JSON for URLs, capture times, body/output hashes and review scopes.
Private source/proof/live evidence is retained under
`node_modules/.cache/native-validation/pcmag-article-september17/` and
`node_modules/.cache/native-validation/nerdwallet-article-september17/`.
No historical evidence or pre-existing workspace work is rewritten.
