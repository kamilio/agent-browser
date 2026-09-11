# MDN stylesheet-admission live flow — September 11, 2026

**Result: full flow failed; evidence integrity passed.** Exactly one authorized live native child ran after the new complete isolated validation passed. All 18 source stylesheets were fetched, but native loading stopped at `CSS cascade work limit exceeded`. No initial commit, link discovery, native click, destination load, or rendering success is claimed. No retry or work-budget increase occurred.

## Validation and immutable build

- Validation: `node_modules/.cache/native-validation/native-stylesheet-budget-september11-round01/results/SUMMARY.json`; completed `2026-09-11T10:28:20.425Z`, before launch. Build, strict, format and native commands all exited zero; inputs stable.
- Exactly 112 unique explicit manifest-listed test files: **6,717 passed, zero failed, one excluded; 6,718 total**. The existing excluded assertion is `exposes the separate total host-object ceiling without claiming full-pool runtime capacity` (assertion status `skipped`, aggregate pending count one).
- Source inventory: 1,006 files; compiled inventory: 1,788 files. Two independent completed-build inventories agree, and live before/after inventories match. No rebuild or source overlay was performed here.
- Immutable session source and compiled output retain default stylesheet admission eight, caller-configured allowance, safe-positive-integer validation with maximum 128, and a per-navigation counter using `this.limits.maxStylesheetRequests`.
- New compiled reference: `node_modules/.cache/native-validation/native-stylesheet-budget-compiled-september11/`. Exact pins and admission checks are in its `PINNING.json` and the live lane's `PINS.json`.

| Pin | SHA-256 |
| --- | --- |
| Validation summary | `bd2dde33352b1939dfb54685f1075ef9ee1383533bb5bdc5954e2b8a0e00a5e9` |
| Native results | `582cab2409f35a4ad6cebcb60a44d4646f04949435407c9d1a981639cc19e0cf` |
| Source ledger | `eeccf964b4c5458cb0fcf07e6b17382161152686d2cc0b9d080706c2135a8128` |
| Compiled ledger | `f54668bcb5a171d38b1ebfcf670dab11bc28847a7454d42792c946eb6f35e847` |
| Session source | `1e89f4b8ed1ea11c7faba83ee448e73b2e5735cc7139e26a85a3e7cb5147a8e4` |
| Session compiled | `c87da618c0f3f5c32c1cf6676bac64490b5a42ca87e495de5d6b1ed599062f78` |

## Authorized bounds and actual run

- Supervisor interval: `2026-09-11T10:31:00.644Z`–`2026-09-11T10:31:05.419Z`; child/process-group leader PID `2450271`, exit one, no timeout or signal. Node `v22.22.0`; private empty HOME/TMPDIR, ignored stdin, piped output, no TTY.
- Actual session `maxStylesheetRequests=24`; probe transport `maxRequests=50`. The production research transport default remains 12 and is asserted before construction. Only these two per-run admission allowances changed from the prior flow.
- Sole origin `https://developer.mozilla.org`; initial path `/en-US/docs/Web/API/Document/querySelector`; intended destination `/en-US/docs/Web/API/Document/querySelectorAll`. Native `BrowserSession` and `NodeNetworkTransport` only; 250 ms request pacing, bodyless GET, credentials omitted. No scripts, SafeJS, alternate browser, fallback navigation or geometry bypass.
- Bounds: one tab, two navigations, one pending navigation, at most one native click; navigation timeout 20 seconds, transport timeout 15 seconds; 30-second child deadline plus five-second termination grace; 6 MiB per-file and combined-output cap. Response/request/header/total byte limits: 2,000,000 / 1 / 16,384 / 8,000,000; five redirects maximum, concurrency one. Document limits: 50,000 nodes, depth 256, 2,000,000 text code units, 1,024 changes. CSS/query/storage/work defaults were not raised; the immutable CSS cascade work limit remains 5,000,000.
- The original zero-`stylesheet-resource-limit` and image-resource-completeness assertions remain unchanged before document acceptance. The loader threw before those post-load assertions could run; therefore **zero stylesheet diagnostics is not claimed**.

## Observations and preserved captures

- Nineteen real same-origin responses, all HTTP 200: one HTML plus all 18 external stylesheet links in the captured HTML. Offline comparison of captured link URLs against response URLs confirms coverage. Zero mocked requests or redirects; 37,076 encoded bytes and 270,288 decoded bytes.
- `response-1.body` is HTML; `response-2.body` through `response-19.body` are CSS. Actual response headers, URLs, byte counts and body hashes are preserved in `stdout.jsonl` and `progress.jsonl`. The first nine body hashes match the previous live captures exactly; captures 10–19 supply the previously missing ten stylesheets.
- Header/status classification returned no barrier for every response. Native title/text classification was not reached, so this does not establish a content-classification pass.
- First failure: stage `initial-navigation:native-loader`, `AgentBrowserError`, code `resource-limit`, message `CSS cascade work limit exceeded`. Outer navigation then reported code `aborted`, message `Navigation aborted`. Only `native-loader-start` was recorded; no `native-loader-complete`, commit, title/heading extraction, link selection or click occurred. One navigation attempt, zero commits, zero click attempts.
- This is a native cascade-work exception after expanded CSS fetching, not the prior probe's stylesheet-admission assertion. The run did not instrument the precise failing cascade operation or consumed-work count; the full 19-response capture is preserved for separately authorized offline investigation.

## Cleanup and receipts

- Session/transport closed, zero active requests, all captured documents at zero nodes, no cleanup errors. Immediate `pendingLoads=1` was preserved; the single permitted post-event-loop observation at approximately 0.315 ms recorded zero. No extra launch or forced counter clearing. The child process group is absent; private HOME/TMPDIR remain empty.
- Combined output 41,083 bytes, stderr empty, no file/output cap breach. Independent offline verification passed **58 checks**; all **45 receipt entries** passed `sha256sum --check`. `integrityPassed=true`, `flowPassed=false`.
- Evidence lane: `node_modules/.cache/native-validation/native-mdn-stylesheet-budget-live-september11/`.
- Live output SHA-256: `9167a58e990ec8de7a951ae568c3d4fac0a1d4a8f10f8ae3c1598ceb0a24291e`.
- Verification SHA-256: `bc1ee00864f069562887ac2655698937ab72878653152f679b9dedc3b22a9648`.
- Receipt ledger SHA-256: `836fa57de66d0b7e71df11b6e3c5032e0ec3083d65b2dde9245bb83d7f480206`.
- Prior successful offline replay was verified before launch; previous replay/live evidence inventories and referenced reports remain unchanged. Writes are confined to this report and the two authorized new directories. No source, tests, TASKS, historical evidence, dependency or commit changes.
