# Review and manual discovery workflows — September 16, 2026

## Result

Six new native-browser GETs exercise three exact source-linked workflows. **HTTP success is not content success:** RunRepeat returns substantial review text; RTINGS returns navigation and breadcrumbs rather than the requested review; Manuals.plus stops at a confirmed Cloudflare challenge. No failed destination is replaced or retried.

| Corpus entry | Exact destination | HTTP | Markdown bytes | Reviewed result |
| ---: | --- | --- | ---: | --- |
| 58 | https://www.rtings.com/laptop/reviews/microsoft/surface-pro-13-12th-edition-2026 | 200 → 200 | 4,726 | Navigation-only; no review headings or measurements. |
| 97 | https://runrepeat.com/brooks-revel-max | 200 → 200 | 19,465 | Review content and laboratory-measurement text; see independent fidelity review in JSON. |
| 82 | https://manuals.plus/category/logitech | 200 → 403 | None | Confirmed Cloudflare challenge; no category/manual content. |

Source URLs are the corresponding HTTPS roots. Targets are literal links in earlier hash-verified native homepage captures, then rediscovered and clicked in the fresh pages. The Manuals.plus category is a manual-discovery step, not a claim to have read a model manual. Native mouse events occur on all three source links, including before the failed destination response.

## Content gaps and restrictions

**RTINGS:** all emitted text is navigation, category/tool/popular-product links, affiliate/membership disclosure and breadcrumbs. Independent static inspection finds a ProductVuePage mount with whitespace-only children and a 25,474-unit opaque data-props attribute. This is a second structural sample of the already-known inert-component limitation, not a new demonstrated reader defect or a validated laptop adapter schema. The reviewer does not deserialize those props or transfer fields/blurring flags from the earlier projector capture. Existing source-access metadata reports a false free-access declaration on a JSON-LD hasPart entry; this does not prove that every part of the page requires payment. No subscriber-only recovery or alternate request is attempted.

A separate native offline diagnostic compares document-wide, main-content-v1 and main-content-v2 extraction with the same reader/visibility policy. All three produce identical 4,726-byte output, zero headings and no truncation. No main/article candidates exist in the reader document; source-hidden-subtree and tokenizer-issue counts are zero. Therefore changing focus does not recover the missing review in this capture. This excludes that particular hypothesis, not every possible parser/runtime cause.

**RunRepeat:** the independent reviewer reads all 840 emitted Markdown lines and checks relevant source samples. All 28 selected-article tables/104 cell texts, 44 headings and 50 normalized paragraph texts match. The review identifies lost publisher-specific active measurement context, excluded attribution/supplemental tables, unavailable chart/media detail and flattened size-vote radio/disabled-button state. One apparent wording inconsistency is already present in the source, not introduced by extraction. These are separate fidelity limits; no shopping, health advice or endorsement follows from this browsing test.

**Practical recovery using existing document scope:** after that review, run the actual compiled research-browser CLI over the same saved RunRepeat response under kernel-denied networking, omitting content-focus selection. This produces **27,113 bytes and 30 tables**, with the entire original19,465-byte article retained as an exact contiguous slice. The additional7,648 bytes include author/date/methodology context, a lab-summary table with explicit heel labels and a separately named brand-specification table. Main verifies the exact article slice and selected source-backed provenance/label/specification samples; this is not an independent comparison of every cell in all30 tables. The earlier reviewer did not test this follow-up, and its original findings remain unchanged.

See READER-DOCUMENT-SCOPE.md for the tested existing command. This is one explicitly routed fixture response through an actual executable entrypoint, **zero additional live requests**, and no production change. It recovers source context rather than inferring selected state from arbitrary .active classes. Alternate measurement states, chart/media detail and radio/disabled semantics remain unavailable; more document-wide navigation/control text is also retained. The result remains extracted-unverified/contentSuccess:null.

**Manuals.plus:** the target returns HTTP403 and a selected cf-mitigated: challenge response header. Native classification is semantic-barrier, provider Cloudflare, confirmed specifically by that header, with stop-and-request-user-handoff. No target extraction, manual download, challenge-solving attempt or alternate URL/client follows. This path needs human handoff; it does not block other browser improvements.

## Safety, pacing and timing

- Six GETs, no redirects/retries/mocked live requests; **1,617,921 decoded and 273,441 encoded bytes**. Native identity, TLS/public-address checks and credential omission remain unchanged.
- Observed request starts: RTINGS14:11:48.394Z/14:11:50.397Z; RunRepeat14:11:50.765Z/14:11:52.768Z; Manuals.plus14:11:53.192Z/14:11:55.195Z, all September16,2026. Each source-to-target interval is2.003 seconds.
- Supervised elapsed observations are2.372,2.423 and2.257 seconds respectively. They include the two-second pacing interval, network, parsing and supervisor overhead; they are not a controlled performance benchmark or a browser speed improvement.
- All six observed requests, sockets and authorized TLS connections close; native documents/transports and all child groups close with no cleanup error. HOME/TMP remain empty. No page scripts, SafeJS, credentials, account/form/cart actions, downloads or fingerprint changes.

## Verification and provenance

Use runtime commit 648abb2ffb0e2040e7827645f7cc56f8147a2e70; verify all1,527 committed runtime source/script/config files plus the canonical native manifest against the clean pinned build. The prior selected gate is2,762 native passes across32 files, with build/types/format/lint passing. **No new native-unit run or production fix is claimed in this report.** Existing62 broad failures and22 missing committed manifest tests remain open, along with independent SDK/rendering/credential/passkey/device/TTY gates.

Three source/synthetic-destination proofs pass under kernel network denial. Reused admission helpers initially retain an obsolete native count, then an incorrect nested proof path; both failures occur before any live child launches. Retain all three proof runs and original helper versions. The final proof03 and LIVE-APPROVAL02 admit the only six-request live batch.

All three fresh source/target pairs subsequently replay under kernel network denial: exact available Markdown, normalized extraction, source discovery and the failed403 challenge outcome/evidence match the live receipts. This is six fixture requests, not six additional live GETs. The RTINGS focus diagnostic uses only saved source; the separate actual-CLI document-scope proof adds one fixture response and no live request.

Independent review scope is static captured-content inspection, not fresh browsing or runtime validation. Main owns the six live GETs and offline native proofs. Historical100-root verdicts and the citation-proxy ranking limitation remain unchanged; these deeper workflows are additional evidence, not retroactive root-page passes.

Evidence: node_modules/.cache/native-validation/review-manual-workflows-september16. Sealed2026-09-16T14:26:31.431Z: 146 files/7681007 bytes; ARTIFACTS.json SHA256 3b48dc60be1fdcdfb8cd6eaef491eee89e1d28874edb150aba8866768730290f. Companion JSON preserves exact receipt/capture hashes, process records, source-access metadata, reviews and replay results. Existing work is preserved; overall goal remains active; no push.
