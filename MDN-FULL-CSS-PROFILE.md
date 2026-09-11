# MDN full-CSS offline profile — September 11, 2026

**Diagnosis captured; website flow still failed.** One offline native child replayed all 19 captured responses. No new live request, retry, source change or budget increase occurred. The preserved live failure remains failed.

## Finding and next target

- The exception is **after all selector matching, in the custom-property preparation pass**, not inside a selector or its immediate charge: `AgentBrowserError`, `resource-limit`, `CSS cascade work limit exceeded`, stage `native-loader`.
- Exact stack: immutable `dist/src/styles.js:495` (`charge`) → `dist/src/styles.js:631` (`DocumentStyles.refresh`) → `dist/src/styles.js:390` (`metrics`) → profile `probe.mjs:240`. Source counterpart is `src/styles.ts:897`: `charge(1)` while scanning each node's winning properties, before filtering custom-property names. This is not a `resolveCustomProperties` stack or the earlier variable-retention failure.
- The low-level `loadBrowserDocument` returned; the wrapper's subsequent `documentStyles(tree).metrics()` forced the failing cascade refresh. No accepted initial document, commit, title/heading evidence, link click or destination followed. The unchanged post-refresh resource-completeness assertions were not reached.
- **Next measured optimization target:** positive logical-selector feasibility/candidate pruning, particularly `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *`. It costs **958,878 work units with zero matches**, 23.62% of completed selector work. Its exact source is captured `response-8.body`, UTF-16 offset 11,837.
- Static inspection supports that target: `possibleSelectors` checks direct id/class/tag tests, while `candidateTests` likewise omits logical tests; the universal subject plus logical ancestor cannot use those direct-test pruning paths and falls back to candidate/ancestor matching. Review conservative positive `:is`/`:where` handling in immutable `src/selectors.ts:795`, `src/selectors.ts:821`, `src/selectors.ts:846`, and `src/selectors.ts:877`. Preserve specificity, branch semantics and work accounting. This is a proposed target for main's review, not an implemented or measured improvement.
- The terminal winner-scan charge identifies **where the shared budget exhausted**, not the dominant downstream operation. This profile does not measure individual custom-property scans, resolution, reuse or substitutions separately, nor prove that optimizing one selector will finish the website flow.

All source/compiled references above are under `node_modules/.cache/native-validation/native-stylesheet-budget-september11-round01/snapshot01/`, not the concurrently changing working tree.

## Measured accounting

- **323 calls: 294 completed, 29 recoverable unsupported-selector failures, zero fatal selector failures.** Completed selector work is **4,059,662**, or 81.19% of the unchanged 5,000,000 cascade budget. One query engine, one monotone remaining-budget run, zero budget increases; 2,731 document nodes and 1,433 indexed elements.
- Unsupported cases: 19 `:after`, eight `:before`, two other pseudo-element cases. All failed-call costs are excluded. For example, call 27 retains the preceding `lastWork=303`; it is not counted again. Each attempt's remaining allowance and completed-work accounting are retained in `selectors.callRecords`.
- Before final call 323, remaining work is **995,581**; completed prior selector work is **3,932,810**, with **71,609** cascade charges not attributable to completed selectors. Final selector `:is(.footer__mozilla a):hover` completes in **126,852**, zero matches, leaving **868,729** after selector charging.
- Source-backed arithmetic: the later failing `charge(1)` crosses the cap at exactly **5,000,001** charged units. Therefore **868,730** additional downstream units were charged after the final selector, and **940,339** total charged units were outside completed selector matching. These are aggregate deductions from the captured remaining budgets and exact throwing statement, not a breakdown of custom-property operations or a measurement of uncharged parser work.
- The top 20 completed costs total **3,042,097**. All 20 records, match counts, before/after metrics and remaining budgets are preserved in `stdout.jsonl` → `selectors.topSuccessfulCalls`; the five largest are:

| Call | Selector | Work | Matches |
| --- | --- | ---: | ---: |
| 180 | `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *` | 958,878 | 0 |
| 20 | `[data-current-area=learn]:root *` | 289,655 | 0 |
| 299 | `:is(.breadcrumbs li) a` | 167,044 | 4 |
| 323 | `:is(.footer__mozilla a):hover` | 126,852 | 0 |
| 310 | `:is(.footer__socials a):hover` | 126,816 | 0 |

- Corresponding old observations remain consistent: tracked `:is(.content-section ul.specifications-list) li:has(details)` completes at call 146 in **8,390**, zero matches; call 180 also previously cost **958,878**. The new first-210-call completed sum equals the old nine-response profile's **2,915,622**. The full nine-response and 19-response totals cover different prefixes and are **not compared as speedups**.

## Scope, guards and verification

- Exact validated stylesheet-budget build: build/strict/format/native passed; **112 explicit manifest-listed files, 6,717 passed, one existing excluded assertion**, zero failed; immutable source/compiled inventories **1,006 / 1,788**. The complete existing pin set is retained in `PINS.json`.
- Session stylesheet admission **24**, transport request cap **50**, configured pacing 250 ms; unchanged DOM/query/CSS limits, 5,000,000 query/cascade work caps, 30-second deadline plus five-second grace, 6 MiB per-file/combined-output bounds. One navigation attempt only. No scripts, SafeJS, credentials, alternate browser or TTY.
- All **19 fixtures** served once in exact observed URL/order/status/header/body-hash agreement: HTML plus 18 CSS, **270,288 decoded bytes**. Native transport records 19 mocked requests, **zero wire/encoded bytes**, zero redirects and zero unrecorded-resource requests. Original encoded lengths remain provenance, not offline wire traffic.
- Original JS network guards and inherited seccomp deny-network launcher were reused unchanged. Kernel seccomp/no-new-privileges verified; network/addon/subprocess/worker guard attempts all zero. The matching hook delegates the unchanged arguments/result/error and is restored afterward; compiled production files remain unchanged.
- Child interval `2026-09-11T10:37:46.092Z`–`2026-09-11T10:37:46.471Z`, process-group leader PID `2456319`, exit **0 means diagnosis captured only**. Output 469,875 bytes, stderr empty, no timeout/cap breach; process group absent.
- Session/transport/query engine closed; all documents at zero nodes, zero active requests and cleanup errors. Immediate `pendingLoads=1` is preserved; the one allowed post-event-loop sample at approximately **0.358 ms** records zero. Private HOME/TMPDIR stayed empty and were removed.
- Independent offline verification passed **435 checks**; all **27 receipt entries** passed `sha256sum --check`. Captured live evidence, its report, previous diagnostic/replay lanes and immutable build inventories remain unchanged. Only the new profile lane and this report were written; no source/test/TASKS edits, commits or further task launches.

Evidence lane: `node_modules/.cache/native-validation/native-mdn-full-css-profile-september11/`.

| Receipt | SHA-256 |
| --- | --- |
| Profile `stdout.jsonl` | `d975f29fd8860142d08b246bdd7a9f8505b137917c79100c892ed43290b9faa2` |
| `VERIFICATION.json` | `05b6d09949a8e6654077e0f58e6cbc11877fdfaba10038b5925f43d3ac7c1449` |
| `RECEIPTS.sha256` | `0555ef6eb95b81fe0fd597ba66d9a6230655e1556838e02595b137ecf16c0515` |
| Preserved live output | `9167a58e990ec8de7a951ae568c3d4fac0a1d4a8f10f8ae3c1598ceb0a24291e` |
| Preserved live ledger | `836fa57de66d0b7e71df11b6e3c5032e0ec3083d65b2dde9245bb83d7f480206` |
