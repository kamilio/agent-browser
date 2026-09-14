# Captured Python two-page flow — September 14, 2026

## Verified Outcome

**PASS for the bounded offline link-to-document/content flow.** The native
browser loaded the captured Python documentation homepage, rediscovered its
Tutorial link, clicked it, replaced the document and verified the destination's
title and heading. This is not fresh live-site or whole-site acceptance.

The native observation ran from `2026-09-14T04:41:05.573Z` to
`2026-09-14T04:41:06.852Z`. The discovered homepage reference was `e375`;
`BrowserSession.click` returned document navigation to
`https://docs.python.org/3/tutorial/index.html`. The destination was a different
document, and the old document already had zero nodes before final cleanup.

Observed destination title: `The Python Tutorial — Python 3.14.7 documentation`.
The single native `h1` match was `e1181`, text `The Python Tutorial¶`.
These are captured page text and current-run references, not a latest-Python
version claim or reused references from the older semantic-reader run.

`flowPassed`, `contentVerified`, `destinationNavigationCompleted` and
`observationComplete` are true. No request was denied, no partial-asset result
was accepted, and no direct destination navigation or fallback was used.

## Explicitly Expanded Corpus

This is a new experiment, not a retry or relabeling of the earlier eight-response
comparison in `PYTHON-OWNERSHIP-REPLAY.md`. That run correctly stopped at its
missing destination. This run adds the Tutorial response already captured on
September 13, documented in `PYTHON-TUTORIAL-NATIVE-CHECK-SEPTEMBER-13.md`.
The original homepage/assets retain their September 11 and September 13 capture
identities. No response body, URL, status or captured header is substituted.

| Resource accounting | Observed |
| --- | --- |
| Unique response URLs | 9; all used |
| Unique decoded corpus bytes | 109,017 |
| Accepted adapter requests | 16; zero denials |
| Document responses | Homepage once; Tutorial once |
| Shared resources | Six stylesheets and one SVG, each once per document-loader phase |
| Actual served decoded bytes, including reuse | 161,647 |
| Served-byte cap | 262,144 |
| Wire requests / redirects | 0 / 0 |

The request cap is 16 accepted responses. Phase guards permit each shared asset
at most once per document, not unlimited duplicate requests. Unknown URLs,
non-GETs, request bodies, authentication/cookie headers and excess repeats fail
closed. The explicit no-page-runtime assertion and original kernel/JS guards
remain in force. The provisional pre-guard draft was retained before any final
preparation seal or execution.

Exactly one homepage navigation, one discovered click and two native queries
(`a[href]`, then destination `h1`) ran. No extra formatting scan, geometry/raster
probe, chapter navigation or further browsing followed the content check.
The click's normal internal geometry and hit testing are not bypassed.

## Runtime And Measurement

The engine is deliberately held fixed against the previous captured experiment:
`node_modules/.cache/native-validation/overflow-ownership-work-september14/release01/snapshot01/dist`,
correction commit `23e988d39d721c27a318c4d129e1736f32118c48`, gate base
`d46fff7ba25add1368bb841cb11e5ffd527701df`. The newer capability build and root
working-tree code are not used. The pinned native gate remains 22,065 pass,
zero failures and two unchanged exclusions; it is not rerun for this report.

One-run measurements:
- Native observation: **1.279 seconds**; supervised child interval: 1.430 seconds.
- Command wall time reported by `time`: 1.42 seconds.
- User/system CPU time: 2.64 / 0.11 seconds.
- Peak resident set: **214,488 KiB**, approximately **209.5 MiB**.

These are measurements of this two-document captured workload, not a normalized
speed comparison, cold-start benchmark or proof of a lightweight-memory target.
Memory and repeated-layout costs remain performance work to investigate.

## Integrity And Remaining Gates

The sole execution exits zero and its child is reaped. Process group `1278218`
is independently confirmed absent; document, query, image, transport and session owners close.
Private HOME/TMP directories are empty and removed. All 18 run ledgers, totaling
10,980 entries, verify again in the parent's read-only audit. Older failures,
denials, captures and preparation seals remain unchanged.

Evidence under `node_modules/.cache/native-validation/`:
- `native-python-two-page-september14/before-RESULT.json` SHA256:
  `22b523368d3d9aea6a2d67eca75969b1aa48f5e97b6be9bde6c78694f9c4dbd7`.
- `native-python-two-page-september14/VERIFICATION.json` SHA256:
  `66870a4e63e2f14c93f4904dde39379679fe397fce9bad50b59a19f327b07a5e`.
- `native-python-two-page-september14/EVIDENCE.sha256` SHA256:
  `1d0395dd992dbc5b390b437f12ee312249f6fb36cb64c11cb050dbd222e638c0`.
- `python-two-page-work-september14/PARENT-OUTCOME-VERIFICATION.json` SHA256:
  `8716da418c72369b035985780d3e2e7b1110d0309c2f9611a456b3956324b03d`.

Destination rendering/actionability beyond the heading read, residual formatting
support, current live requests, repeatable performance, challenge handling,
research, credential/passkey/device, SafeJS, socket and real-TTY gates remain
open. Next coverage is the retained MDN action corpus plus separately scoped
performance profiling; this success does not close the overall browser goal.
