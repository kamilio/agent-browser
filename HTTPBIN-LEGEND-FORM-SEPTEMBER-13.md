# HTTPBin: native legend layout and live public form submission

September 13, 2026. **The bounded public form flow now passes through this
repository's native browser.** This is one live form result, not whole-browser
conformance, research completion or a repeatable performance improvement.

## Actual live result

Execution: **20:22:57.507–20:22:57.891 UTC**, exit 0. A fresh native
`BrowserSession` loads `https://httpbin.org/forms/post`, discovers its actual
form, prepares eight synthetic values, and calls `session.click` on observed
submitter `e93`. That genuine pointer path emits click and submit events,
sends a POST to `https://httpbin.org/post`, and commits the echo document.

- Exactly two HTTPS requests: one GET and one 197-byte POST; both return 200.
  Request start spacing is 259ms. No redirects, retries or additional resources.
- The fresh form is 1,397 bytes and 96 native nodes. Its body hash equals the
  earlier captured form. The JSON echo is 816 bytes and a three-node native
  document. Total encoded and decoded response bytes are both 2,213.
- The echoed form exactly matches the approved synthetic entries: name
  `Native Browser Test`, phone `202-555-0100`, email
  `native-browser@example.invalid`, size `medium`, toppings `bacon` and `cheese`,
  delivery `12:30`, and comment `Native browser public echo validation`.
- One native form query, eight fill/check preparations, 19 preparation events,
  one pointer click and one submit event. These native-generated events report
  `isTrusted:false`; they are not claimed as OS or reference-browser input.
- No fabricated DOM, geometry, style edits, resource removal, mocked response or
  semantic-submit fallback. No scripts, credentials, cookies, accounts or devices.
  Normal native User-Agent/TLS remain; no fingerprint disguise or challenge bypass.
- Header/status and native-content classifications find no access barrier. Both
  loads have no stylesheet issues or image requests. No guard or cleanup error.
- Session, transport, both documents, image owners, selector cache and event owner
  close; request queues empty. Empty private HOME/TMP directories are removed.
  Process group 926398 is absent at exit and independent verification.

The retained single observation is 0.38s / 95,976KiB maximum RSS (93.73MiB),
including harness work. It is not a benchmark, speedup or repeatability claim.
The live runner permits only the documented public echo flow and bounded
same-origin resources. Its JS guards allow that outbound HTTPS; it does not
claim the offline kernel network seal or general socket acceptance.

## Unchanged captured-form comparison

Before the live run, an exact captured-body replay at
**20:20:13.771–20:20:13.996 UTC** uses the prior probe, fixture and offline guards
unchanged, except for new audited runtime pins. The same form and eight
preparations now reach native click and submit, followed by a verified synthetic
POST intent. The offline guard intentionally denies it before transport.

That replay is exit 1 / `flowPassed:false`, with **zero actual HTTP or POST**.
It is not relabeled as an echo pass. The earlier two visible-legend deferrals
disappear: formatting advances from 91 visited DOM nodes / 112 boxes / 1,032 work
to 93 / 114 / 1,092, with no issues and zero deferred subtrees. Formatting remains
a partial native subset. Full original-header parity is not established.

## Implemented fix and validation

Commit `c60b133089a87b7cea06554131c725d3429b8731` implements first-qualifying
rendered legend ownership, fit-content width, auto-height vertical reservation
and legend-local border interruption. It also corrects percentage-padding
intrinsic aggregation and charges child extraction movement before mutation.
Details and explicit unsupported profiles are in `FIELDSET-LEGEND.md`.

Final isolated native gate, **20:13:59.593–20:18:53.793 UTC**:
**21,042 passed / zero failed / two unchanged skips**. Build, strict, scoped
format and immutable source checks pass. Selection is 411 files / 410 strict
roots / 765 manifest entries, leaving 354 unselected. The two old exclusions
remain the host-object-ceiling and unsupported-display/advisory-media cases.

There are 90 new cases: 43 border-exclusion and 47 legend cases. Identical focused
tests produce baseline05 581/84/1 versus fixed05 665/0/1. Of those differences,
81 are new cases failing on old production and three are updated diagnostic
fixtures; nine new cases already pass on old production. Review regressions
first produced 660/5/1, then passed after the intrinsic/budget corrections.
Earlier missing-import/default-min-height failures and the superseded
21,035/0/2 broader run remain retained, not erased or used as final authority.

Native reading of the retained WHATWG prose leaves an unresolved edge min/max
ambiguity. A second native parse recovers its SVG figure: geometry and painter
order support a local border gap only by inference. Required SVG text, dashes
and markers prevent faithful native rasterization; no reference PNG is claimed
and nothing is stripped to obtain one. Both source operations make zero HTTP.

## Immutable evidence

Paths below are under `node_modules/.cache/native-validation/`:

| Lane | Evidence and identity |
| --- | --- |
| `native-fieldset-legend-september13-round01/` | `AUDIT.json`, `RECEIPTS.sha256`; 1,306 source / 2,124 compiled files; 1,291 unchanged tracked inputs match parent `39ebd91` |
| `fieldset-legend-work-september13/` | `FOCUSED-VERIFICATION-05.json`, `INITIAL-VERIFICATION.json`, `SOURCE-VERIFICATION.json`, `REPLAY-VERIFICATION.json`, `LIVE-VERIFICATION.json` |
| `native-httpbin-form-legend-september13/` | `RESULT.json`, `OFFLINE-AUDIT.json`, `VERIFICATION.json`; 28-entry evidence ledger |
| `native-httpbin-form-legend-live-september13/` | `RESULT.json`, `LIVE-AUDIT.json`, `VERIFICATION.json`; 31-entry evidence ledger; original responses retained privately |
| `native-legend-source-september13/` | Native excerpts, unresolved prose analysis, sealed source handoff |
| `native-legend-diagram-september13/` | `DIAGRAM-DOM.json`, `DIAGRAM-ANALYSIS.json`; illustrative inference and explicit rendering limitation |

Final native audit SHA256:
`06bac6cb08c4b0b74781c2c244e055fb16b6bc909f2b4c0ae261c576f694ba39`.
Native 20-receipt ledger:
`5975ff847221e0f0cd90512ff5e4c42d70366693cea4e88540f956d85798ddb5`.
Offline replay ledger:
`c37e8656dcaf3bec93aea4359a46dda59b8bd0f8143e8d4de94ccb762011edb6`.
Live replay ledger:
`839759fb32cfa08c1c56cd847520d7576d8083ece7da9bf4d0e01ef6d4968300`.
Source root receipt:
`5136be2e50d557619d29e5323d1981c0353392664521228e818af50e1588e127`.
Diagram root receipt:
`7818b556c486982924e1b30426fc8b6bf1a1a0967ba91a0454f46047b43f1299`.

Runtime/framework/source pins and previous immutable ledgers are independently
checked. Historical paths and measurements remain unchanged; old unrelated
worktree edits are not included. No push is performed. Broader site coverage,
Internet/Wikipedia/Python acceptance, repeatable performance, hardware/benchmark/
Astra/verified Reddit-Poe research, credential providers, passkey devices,
SafeJS and real socket/TTY acceptance remain open in `TASKS.md`.
