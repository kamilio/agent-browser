# Explicit loader-limit replay — September 18, 2026

This checkpoint makes a real failed capture readable through the existing CLI.
It does **not** establish Zoom participation or complete the browser goal.

## Implemented

`--recover-loader-limit` admits a complete, independently pinned, default-profile
2xx HTML capture with a closed transport and an original semantic-reader loader
resource-limit failure. It supports selector, heading section and content focus;
ordinary replay still refuses the same failure. Original receipt bytes, failure,
field presence and query redaction remain intact. Invalid/incomplete captures,
barriers, backoff, strategy captures and contradictory completed results fail.

Captured fallback encoding and source-heading policies apply without inventing
an earlier reader observation. Recovery uses the existing native loader and
unchanged extraction/resource limits. It reclassifies source and selected text,
closes documents, clears decoded replay buffers and does not access the network,
SafeJS, another browser, credentials or devices. See `LOADER-LIMIT-REPLAY.md`.

## Native qualification

- Final main selection: **1,277 passed / 0 failed in 14 files** (100.10 seconds).
- Disjoint existing reader-policy regression selection: **222 / 0 in 3 files**
  (4.02 seconds). Combined: **1,499 / 0 in 17 files**; not a full-suite pass.
- New admission tests: 142; new replay/CLI tests: 48. Build, test type checking,
  format and lint pass. Native selections deny network operations, use synthetic
  data and finish with absent child/process groups and empty private HOME/TMP.
- First selection: 1,269 / 6; missing captured-outcome provenance, bad test-table
  types and fixture lint were corrected. Review also found captured fallback
  policy incompatibility; regression coverage includes it and source headings.
- Second selection: 1,276 / 1, all quality checks green; the remaining assertion
  omitted normal Markdown period escaping. Final test checks exact escaped text.
  Both failed runs remain at their original paths; no tests were skipped.

## Actual captured-page CLI replay

The HN discussion fetched at **04:15:02.383 UTC** remains an original HTTP200,
605,306-byte response with a loader/resource-limit failure. No site refetch.
The prior formatting-marker optimization makes that saved body parseable; this
change exposes an explicit standard replay path instead of a custom reader.

Ordinary CLI replay still refuses it. Explicit loader recovery plus the existing
`text-prefix-v1` output policy returns **136,318 bytes**, preserving all **127,383
selected source code units**, `truncated: false`. Its exact content SHA-256 is
`768d182d6791f13e7b0a7016eee9cc4276abbda5686effcbdc0af9ad884c0a52`, matching
the independently extracted and source-checked text. Earlier source comparison
covered 414 comments/authors, 347 parent links and 25 comment-body links; this
plain-text fallback does not preserve the links' destinations or Markdown.

The report retains `capturedOutcome: failure`, the original failure, zero
requests and `originalRequestRetried: false`. `partial: true` and
`contentSuccess: null` remain: text recovery is not full browser conformance or
factual validation. The 256,000-byte strict Markdown limit is not raised.

The corrected supervised offline CLI run completes in 0.72 seconds with kernel
and JS guards, no IO attempts, no socket probe, one closed document and no live
child/group. A preceding harness syntax error occurred before replay; that
failed harness and its artifacts are preserved separately, not overwritten.

## Three fresh anonymous reads

These run the previously qualified immutable native reader, not this new
recovery branch. Each is one HTTPS GET, no automatic redirect, retry, subresource,
script, authentication, identity change or challenge solver.

| Target | Observed UTC | Result | Extracted Markdown |
| --- | --- | --- | ---: |
| `https://github.com/PrismML-Eng/Bonsai-demo/` | 04:55:32.075 | HTTP200; 501,587 body bytes | 76,825 bytes |
| `https://arxiv.org/abs/2105.00272` | 04:55:31.942 | HTTP200; 41,568 body bytes | 9,352 bytes |
| `https://docs.prismml.com/` | 04:55:31.738 | HTTP308; native redirect-mode-error stop | none |

GitHub output includes the README's quick start, model/backend requirements,
upstream compatibility warning and links. No downloaded command was executed;
vendor hardware/performance claims are not recommendations or fact-checked.
The arXiv output includes title, author, abstract, publication notice and PDF/
HTML links for the **2021** paper; neither linked document was fetched. Both
reports remain `extracted-unverified`, partial and not content-success claims.

The original docs wrapper incorrectly rejected the stopped request's null
finalUrl as a wrong destination. Independent review verifies one exact request,
no redirect follow, closed transport and no created document; the original
wrapper failure is retained, not changed into a successful load. A new runner
branch has 28 offline checks and a guarded synthetic proof. The observed
same-origin introduction Location is staged **offline only**, not fetched.

## Evidence and remaining work

Exact runtime/pin/process records and original failures are in the JSON companion
and `node_modules/.cache/native-validation/bounded-content-reading-september18/`.
Private raw captures remain private. Original sealed handoffs are unchanged.
The former 100-page reports and their measurements are not rewritten.

The requested Zoom notetaker remains unavailable end to end: native client
execution/admission, real incoming media/decode, recording integration,
transcription, summary and verified delivery are not established. A PCM buffer
does not supply those capabilities. No meeting joined, recording made or daemon
changed. Broader website coverage, Twitter/Astra and Reddit/Poe research,
credentials/passkeys and actual runtime/media gates remain open. No push.
