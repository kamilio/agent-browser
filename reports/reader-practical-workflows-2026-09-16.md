# Practical article workflows — September 16, 2026

## Relationship to the 100-page request

The complete checklist remains in `reports/agent-citation-revalidation-v2.md:85`, with machine-readable JSON and CSV beside it. All100 selected entry URLs were navigated and individually reviewed on September16. They are a reproducible citation-derived host/root proxy, **not a verified worldwide ranking of pages most visited by agents**. Public page-level agent-visit telemetry was not established; the frozen list has no dedicated ChatGPT or Claude table.

Historical results remain33 useful,19 navigation-only,23 consent/access,3 login,6 empty,8 HTTP errors,2 transport failures and6 other failures. The original100 navigations/108 GETs/96 complete captures/zero retries are not replaced or inflated by these later article workflows.

## Three additional live workflows

All three follow a literal, source-discovered same-origin link through the maintained programmatic native research CLI. This is not an executable-entrypoint test. Six anonymous GETs return200 with complete decoded captures totaling3123292 bytes. No redirects, retries, scripts, credentials, alternate clients or challenge solving. Native mouse dispatch, request/socket/process closure and empty HOME/TMP pass. The live invocations start at12:40:31.914796,12:40:34.289677 and12:40:36.784784 UTC.

| Corpus entry | Source → article | Markdown bytes | Reviewed result |
| ---: | --- | ---: | --- |
| 23 | wikiHow Main-Page → Transcribe-Online-Meetings-Automatically | 27133 | Useful sponsored tutorial; unrelated recommendation and conditional form-template text remain. |
| 43 | PCMag homepage → reviews/acer-swift-go-16-ai | 38130 | Useful full article text/specifications; pros/cons grouping lost and dynamic benchmark charts absent. |
| 84 | OutdoorGearLab homepage → reviews/camping-and-hiking/soft-cooler/yeti-daytrip-9l | 21289 | Useful verdict, score categories, comparison table and testing narrative; lengthy structural table output. |

Exact source/target URLs, response sizes/hashes, invocations and extraction hashes are in the companion JSON. wikiHow starts at the previously observed canonical Main-Page URL, not a fresh root redirect test. Automatic results remain `extracted-unverified`, `partial: true` and `contentSuccess: null`; reviewed content is not verified factual accuracy.

## Content quality and practical mitigation

- **wikiHow:** sampled article/source inspection finds a five-section, ten-step sponsored tutorial and a retained advertising disclosure. The captured thanks-for-tip template is not an action receipt: no form was submitted. No full stylesheet visibility claim is made. An offline native heading-outline/section extraction selects Steps and produces11450 bytes,57.8% less than27133. All five section headings and ten numbered steps remain; the result exactly equals the corresponding contiguous slice of the full extraction. Q&A, conditional submission text and later recommendations are excluded. Sponsor/byline lie outside the slice and must remain in provenance. This uses existing APIs, not a production change.
- **PCMag:** independent review reads the entire38130-byte extraction and targeted source sections. All29 marked article paragraphs match under bounded text normalization; identity, verdict, six pros/cons items and18 specification rows survive. Adjacent source pros/cons lists merge, one icon-only cell has no textual value, and four empty comparison-chart placeholders lack benchmark numbers. Do not infer missing values, interpret a blank as false, reconcile source inconsistencies or claim retrieved prose constitutes all chart data. The list boundary merits a focused synthetic regression investigation; no patch is claimed here.
- **OutdoorGearLab:** sampled review finds meaningful score categories, comparisons and narrative testing. Long table output retains explicit row/cell boundaries and does not establish inferred associations. Existing compact-table behavior intentionally preserves end markers. Scores, offers and product claims belong to the publisher; no shopping, affiliate traversal, purchase or independent testing occurred.

## Validation and limits

Before live browsing, three source/synthetic-target click proofs pass under kernel-denied networking. Afterwards, all three complete captured pairs replay through the native click workflow: six fixture requests, exact Markdown and normalized full extraction equality. Normalization changes only generated node references. The existing heading-section check also passes offline with zero new GETs and document closure. Its first two diagnostic attempts failed on probe assumptions (wrong content field, then Markdown heading comparison); failed receipts are retained and are not browser failures or passes.

Pinned runtime commit: `f20e9fc49edcaa7a66d9828a0010d023748f28a2`. Source manifests verify1524 entries (1523 committed source/script/config inputs plus the native manifest); compiled manifests verify2300 artifacts. Prior selected native gate809pass/0 in nine files and quality gates are inherited, not rerun here. Prior62 residual broad native failures,22 missing committed manifest inputs, actual SDK, rendering, private-file/credential/device and access-handoff gates stay open.

The live capture wrapper can obscure a failed original request through its captureFailure path; that limitation was not exercised by these six200 responses. Empty per-run HOME/TMP do not validate private storage beneath group-writable repository ancestors. No SafeJS or password/passkey work is implied.

Evidence: `node_modules/.cache/native-validation/reader-practical-workflows-september16`. Sealed108 files,8635109 bytes; ARTIFACTS SHA-256 `9613f4c487b154289af0d5bfdf52b2804b44eb1caa8d010642778098cbfb1d19`. Companion JSON includes exact paths and hashes. Pre-existing42 tracked and697 untracked work items remain separate. No production edits or push; the broader browser goal remains active.
