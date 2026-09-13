# Python basic.css bounded native capture — September 13, 2026

## Result: CAPTURE ACCEPTED

Exactly one actual native GET captured the missing stylesheet, with zero
redirects, retries, mock requests or subresources. This is source capture
only, not a stylesheet application, Python click, layout validation or
overall browser completion.

| Metadata | Observed value |
| --- | --- |
| Exact URL | https://docs.python.org/3/_static/basic.css |
| HTTP method/status | GET / 200 |
| Content-Type | text/css |
| Content-Encoding | gzip |
| Encoded transport bytes | 3390 |
| Decoded retained source bytes | 14685 |
| Decoded source SHA-256 | `656ff1bacd6f260fc7d71b97f9c2f1fcbf692dc84bf469cd952034efcb9eefed` |
| Native capture start UTC | 2026-09-13T15:03:52.874Z |
| Actual GET start UTC | 2026-09-13T15:03:52.879Z |
| Source received UTC | 2026-09-13T15:03:52.901Z |
| Native owners closed / capture finish UTC | 2026-09-13T15:03:52.902Z |
| Supervisor start / finish UTC | 2026-09-13T15:03:52.833Z / 2026-09-13T15:03:52.907Z |
| Source Last-Modified header | Sun, 13 Sep 2026 14:47:53 GMT |
| Native requests / actual GETs | 1 / 1 |

Immutable decoded bytes:
`node_modules/.cache/native-validation/native-python-basic-css-september13/source-response-1.body`.
The SHA-256 covers decoded native transport bytes, not the gzip stream.
The compressed stream was counted but not retained.

## Bounds and stop gates

Only the audited NodeNetworkTransport performed the request. Fresh empty
CookieJar, credentials omit, no Cookie or Authorization header; native
250ms minimum request pacing configured. One request supplies no second
interval with which to measure pacing. Native limits: one request, zero
redirects, one concurrent exchange, 512KiB encoded/body/decoded/aggregate
cap, 25-second transport timeout. A run-once lock prevents another run.

The response was exactly HTTP 200 and text/css. Native header-only
challenge classification returned null; HTTP 429 and Retry-After were
absent. No failed stop gate or guard denial occurred. The guard rejects
non-200, non-CSS, header challenge diagnostics and Retry-After without a
retry or redirect. Classification was stop-only and header-only: the
source body was not searched or interpreted, so this is not a semantic
claim about the CSS or about incorrectly labeled challenge content.

No reader, DOM, stylesheet loader, style, geometry, raster, action,
script/SafeJS, credential, device or real TTY/PTY probe was run. No live
transport other than this one GET was run. No native tests were rerun;
five newly authored harness modules passed syntax-only `node --check`.

## Pinning and isolation

Pinned runtime only:
`node_modules/.cache/native-validation/native-reader-id-contract-september13-round01/snapshot01/dist`.

- Base: `12197a6a1e469b2ab35416213a721464a965b4d5`.
- Source inventory: `91b3541762349300d8a13d49e432cf7528caaefe5dfe4b5b7de4cb9615678b8b`.
- Compiled inventory: `6d146c57138d241b8aca0b6aec0b9a875110188ad6220a3d6bd88a4fdf31c315`.
- Complete 1289-source/input and 2124-compiled inventories matched before
  at 2026-09-13T15:03:52.832Z and after at 2026-09-13T15:03:52.946Z.
- Bound existing audit: 19765 passed, 0 failed, 2 skipped; 383 selected
  files, 382 strict roots, 748 manifest entries. allExecutedTestsPassed
  and selectedRunSuccessful true; allSelectedTestsPassed false due to
  two skips; knownFailures empty. This is inherited audit evidence,
  not a new test run or certification of skipped/unselected/live gates.
- Adapted four framework modules from the sealed
  `native-python-tutorial-september13` lane; their hashes matched its
  existing digest list. No historical receipts or payloads were rewritten.
- Node v22.22.0, clean allowlisted environment, private empty HOME/TMP,
  piped stdio; 30-second supervisor plus 5-second termination grace,
  10MiB combined streams and per-file limit. Exit 0, 781 stream bytes,
  no stream errors or output overflow; timed maximum RSS 67076 KiB.
- Native transport closed with active=0; cookies closed with cookies=0.
  Supervisor process group 729231 was absent on exit. Private HOME/TMP
  stayed empty and were removed at 2026-09-13T15:03:52.947Z.

## Evidence and handoff

The new lane contains authorization, bound audit, framework verification,
capture/guard/supervisor/sealer source, request and response metadata,
classification, closure and cleanup receipts, four complete inventory
ledgers, and immutable source bytes. `PRE-SEAL-VERIFICATION.json` records
the final checks; `DIGESTS.sha256` explicitly whitelists the lane evidence
plus this report and the handoff. The sealer verifies all listed bytes,
source pins and process-group absence, makes owned files read-only, and
then stops editing. The manifest excludes itself.

Handoff:
`node_modules/.cache/native-validation/python-layout-work-september13/CSS-RESULT.md`.

The earlier native homepage replay requested this exact import but was
denied before native transport, with zero HTTP, because the September 11
capture set lacked the fixture. That is not a website rejection or an
established CSS defect; the old diagnostic remains intact. The parent
may apply the new bytes through the native stylesheet loader only under
new scope. This capture does not establish generated-clear correctness,
homepage layout, successful Tutorial click or any broader acceptance.

Only the new lane, this report and the handoff were written. No parent
code, tests, TASKS, shared manifest, historical report, commit or push.
