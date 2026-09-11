# MDN positive-logical availability replay — September 11, 2026

**Offline initial navigation and bounded content evidence succeeded.** Exactly one guarded native child replayed all 19 captured responses. This is not rendering, link-activation or live-site acceptance; the previous live failure remains unchanged.

## Result and explicitly tracked selector

- One navigation, one committed document; final stage `bounded-native-content-evidence-complete`. No replay failure or failure stack occurred. Native title: `Document: querySelector() method - Web APIs | MDN`; main heading: `Document: querySelector() method`, reference `e1444`. The committed document has 2,731 nodes, one main element, 15 retained headings and 6,469 retained text code units, within the existing evidence bounds.
- **The requested selector did not improve:** `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *` remains call 180, with zero matches, increasing from **958,878 to 958,911 work units (+33)**. It is still the largest completed selector cost. Its full record is independently retained in `selectors.logicalAncestor.calls` and `logicalAncestorComparison`, not merely in the top 20.
- The reduction comes from other selectors. Both full-19-response profiles have **323 calls, 294 completed and 29 recoverable unsupported-selector failures**. Offline comparison confirms identical selector order, completion status and matched-element counts for the corresponding calls; it does not independently compare matched node identities or specificity maps.
- Completed selector work decreases from **4,059,662 to 3,692,716**, a **366,946-unit reduction (9.04%)** over that aligned selector sequence. This is charged-work accounting, not a wall-clock or website-speed claim. Failed parser calls retain potentially stale `lastWork` and remain excluded.

| Call | Selector | Previous work | Replay work |
| --- | --- | ---: | ---: |
| 180 | `:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *` | 958,878 | 958,911 |
| 79 | `:is(.prev-next a):visited` | 102,108 | 12 |
| 155 | `:is(:is(.content-section .index) .index-nav ul) a` | 68,488 | 26 |
| 154 | `:is(:is(.content-section .index) .index-nav ul) li` | 63,584 | 26 |

All 323 attempt records, monotone remaining-work accounting, recoverable failures and the top 20 completed costs are in `stdout.jsonl`. The top 20 total **2,919,501** units. The matching engine has zero remaining-budget increases; the separately observed page-query engine is not counted as another cascade run.

## Stylesheet completeness and remaining limitations

- The unchanged completeness assertions passed: **18 external stylesheets**, zero `stylesheet-resource-limit`, zero `external-stylesheet-not-loaded`, and no image resource-limit failure. All 19 fixtures were served once, in exact observed URL/order/status/header/body-hash agreement: HTML plus 18 CSS, **270,288 decoded bytes**.
- One cascade build completed: **591 rules, 1,446 declarations, 84,329 source code units, 4,790,072 work units**, leaving **209,928** under the unchanged 5,000,000 cap. Final selector call 323 uses 126,872 of its 1,362,547 allowance, leaving 1,235,675 before downstream charges. Final total minus completed selector work is 1,097,356 units; this is aggregate non-selector charging, not an operation-level attribution.
- The baseline stopped during downstream custom-property preparation, whereas this run completes. Their unequal completed cascade totals are not presented as a speedup. The explicit selector-level reduction above compares the same recorded sequence.
- CSS remains `partial=true`, `layout=false`: 306 unimplemented-property issues, 14 unimplemented at-rules, 24 invalid/unimplemented values, 29 invalid/unimplemented selectors, and 22 invalid/unimplemented media queries. The 29 selector failures comprise 19 `:after`, eight `:before`, and two other pseudo-element cases.
- HTML remains an independent subset: six scripts not executed, 24 template-extension issues, four bogus declarations and one iframe not loaded. The partial image owner reports zero image elements/resources/requests. Fetch completeness does **not** imply complete CSS/HTML support or visual fidelity.
- No geometry/rendering, querySelectorAll link activation, destination navigation, live challenge classification or end-to-end website pass was attempted. `websiteFlowPassed=false` remains explicit.

## Validation, bounds and cleanup

- Before launch, `native-logical-availability-september11-round01` completed build/strict/format/native with stable inputs at `2026-09-11T10:43:48.608Z`. Verified **112 unique explicit manifest-listed files; 6,737 passed, zero failed, one excluded; 6,738 total**. Exclusion: `exposes the separate total host-object ceiling without claiming full-pool runtime capacity`.
- Independently pinned **1,006 source / 1,788 compiled files**, including selector implementation hashes. Two independent compiled inventories agree; before/after inventories match the completed immutable build. No rebuild, source overlay or compiled-production edit occurred here.
- Session stylesheet admission **24** and transport request cap **50** match the live capture. Other DOM/CSS/query limits remain unchanged, including 5,000,000 query/cascade work caps; configured pacing 250 ms, 30-second deadline plus five-second grace, 6 MiB file/combined-output bounds, clean private HOME/TMPDIR, bodyless same-origin GET, credentials omitted. Original JS guards and inherited seccomp wire denial are unchanged; no scripts, SafeJS, alternate browser or TTY.
- Child interval `2026-09-11T10:47:14.204Z`–`2026-09-11T10:47:14.613Z`, process-group leader PID `2464173`, exit zero. **19 mocked requests, zero wire/encoded bytes**, zero redirects and no unrecorded resource requests. Network/addon/subprocess/worker guard attempts all zero. Output 484,768 bytes, stderr empty, no timeout/cap breach.
- Hook restored; session, transport and both observed query engines closed; document node count zero, active requests zero, cleanup errors zero. Immediate and single post-event-loop `pendingLoads` samples are both zero; the bounded sample occurred at approximately 0.639 ms. Private HOME/TMPDIR stayed empty and were removed; child process group absent.
- Independent verification passed **440 checks**; all **27 receipt entries** passed `sha256sum --check`. Previous live/profile evidence and referenced reports remain unchanged. Only the two authorized new directories and this report were written; no source/test/TASKS edits, commits, live retry or second native child.

## Evidence and pins

- Replay: `node_modules/.cache/native-validation/native-mdn-logical-availability-replay-september11/`.
- Compiled reference: `node_modules/.cache/native-validation/native-logical-availability-compiled-september11/`.
- Exact fixture, validation, session, styles and selector pins are retained in `PINS.json`; independent build pinning is in `PINNING.json` in the reference directory.

| Receipt | SHA-256 |
| --- | --- |
| Validation summary | `980dd74105d0b215a208d1c0f48f9bb4f0750873c8ee4c5b8e063a5d5f5ce22e` |
| Source ledger | `d284dbd69e929c432dcdc60f65c9b3b910a99be7adaae32645f319dd1ade42d4` |
| Compiled ledger | `ee2177cd3f8f516b3ba917564d5ecf22557773d65a8d9a0fa2055d70e2f942d1` |
| Replay `stdout.jsonl` | `53f6653cced7897c74c76b12ee1ac3501ce85d076a70bcb69972e2a90fdd16d3` |
| `VERIFICATION.json` | `11488e2a53b2b4a0bd6b482cdec1571d768f95c4c6bbd52a5ea753536901ba04` |
| `RECEIPTS.sha256` | `711498eedc6a7690c76dc1cc7831d96cbbf1d89bc3d5400dbc24a5e3de6eeb1b` |
