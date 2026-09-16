# Native retrieval of PCMag's missing chart data — September 16, 2026

## Outcome

Recover the data behind all four embedded charts in the previously captured Acer Swift Go16 AI review without running page scripts. **Five native GETs return200**, totaling163198 decoded bytes (50723 encoded): one advertised loader and four source-derived iframe documents. Parse their inline JSON with the maintained bounded `parseSourceLiteral` parser and independently compare to strict JSON parsing.

The result contains **15 source matrices: one specification sheet and14 benchmark/display/battery sheets**, with90 rows including headers and234 cells. Five model labels recur across the sheets; this is not75 distinct products or90 independent measurements. Preserve original cell types and strings, including16 null cells and five empty strings. Scores, times, missing-value tokens and declared units are data, not converted or independently verified measurements.

**The ordinary native reader still returns zero Markdown bytes for each iframe.** This is successful explicit source-data recovery, not a completed automatic-reader feature. The original article output, missing-chart diagnosis and historical100-entry verdicts remain unchanged. The prior list-grouping fix remains in place.

## Source chain and native requests

1. The existing PCMag capture contains four literal embed IDs and a lazy-loader assignment to `https://e.infogram.com/js/dist/embed-loader-min.js`. Inspect the assignment as inert text, then fetch that exact public script once.
2. The10311-byte loader specifies iframe URL construction from its own origin, each embed ID, the encoded parent article URL and the fixed embed query parameter. Derive the four public URLs from those captured strings; do not guess endpoints or run the loader. The optional type/page attributes are absent; the client-side fragment is not sent in HTTP.
3. Fetch the four HTML responses, respectively34465,40433,39527 and38462 decoded bytes. Each contains one complete inline assignment to `window.infographicData`. Trackers, viewer bundles, images and other resources are not fetched or executed.
4. The four parsed block IDs match the exact corresponding parent article blocks. Literal byte ranges and whole-body/literal/normalized-value hashes are recorded in the companion JSON. All parsed containers are frozen under the existing parser contract; caller body hashes remain unchanged.

Use only pinned standalone `NodeNetworkTransport`, fixed native identity, explicit allowed origins, anonymous GETs, no redirects/retries and no alternative browser/client. All five requests have authorized TLS, observed request/socket closure, closed child groups and empty HOME/TMP. Same-origin start gaps are95.379,2.173,2.174 and2.174 seconds. No CAPTCHA solving, fingerprint spoofing, credentials or device operations occur.

## Recovery and interpretation

The four literal payloads are25655,31609,30711 and29645 bytes, within existing literal-parser limits. Recovery and matrix export run under kernel-denied networking with zero new requests and no source-code execution. Separate ordinary native HTML loads/extractions close their documents; they demonstrate the remaining integration gap rather than counting empty output as useful content.

Matrix export retains each sheet's name, axis settings, chart-type number, modifier, row/column positions, source path and typed cell states. Formatting metadata remains in pinned raw artifacts; it is not evaluated. All218 supplied scalar cell values are strings (213 nonempty, five empty);16 other cells are literal null. No string score becomes a number, no time string becomes a duration, and no blank becomes zero. The companion JSON contains the matrices, while the local `node_modules/.cache/native-validation/pcmag-charts-september16/tables/proof/TABLES.md` provides a readable view.

An independent offline review checks the four payloads, response/embed identities and every exported cell. Main performs the article-block comparison; the reviewer does not independently repeat that article check. Of95 benchmark cells,72 contain numeric strings and10 contain time strings;13 contain missing-value representations (five empty strings, one null and seven textual markers). Fifteen other nulls are header corners, not measurement gaps. The review also flags stale2020 GPU accessibility text, naming differences and mixed unit/direction cues. Exact findings are retained in the companion JSON and `node_modules/.cache/native-validation/pcmag-charts-september16/review.md`. Do not treat template text as current chart identity or infer causes for absent values. Publisher results are not independent hardware testing or buying advice.

## Validation and corrections

Final per-resource routed proofs pass before the five live GETs. These are explicitly mocked transport requests, not live requests; kernel guards confirm no networking in proof/recovery/export phases. Verify all response/input hashes, source associations, source-file/compiled-artifact pins and process closure. Runtime commit `382a9186e28e2fd5b6e99e63d13bdc8744d0eb7d` matches1525 source/manifest inputs and2300 compiled artifacts. The prior955-pass selected native gate and build/types/format/lint are reused, not rerun or described as full-suite acceptance.

Retain two harness corrections: the initial offline callback assumed a field not supplied to route resolvers and failed before networking; the original one-resource-per-host reservation then rejected the first chart before launch. A separate resource harness preserves duplicate-URL refusal while enforcing observed origin pacing. These are local diagnostic/admission failures, not website barriers, successful requests or live retries.

## Next implementation

Implement a bounded, explicitly source-labeled table codec for the demonstrated inline schema, preserving sheet labels, axis qualifiers, raw string values and distinct missing-cell states. Integrate it with a maintained public-source workflow rather than exposing arbitrary application globals or treating script text as visible prose. Add synthetic malformed/ambiguous/oversized input tests, output-budget and lifecycle coverage, then replay these captures. Do not weaken raw-script omission or invent values to make the reader appear complete.

No production files change in this turn. Prior62 broad native failures,22 missing committed manifest inputs, actual SDK, rendering, credentials/passkeys/devices and access-handoff gates remain open. Evidence is sealed: 180 files,2856753 bytes, ARTIFACTS SHA-256 `e9bfcb1159f02e56562814ce47f522110f5255f507ca0ab920606fd978a52b63`. Pre-existing42 tracked and697 untracked work items stay separate; no push.
