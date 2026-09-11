# MDN logical-availability native live flow — September 11, 2026

**Full flow failed at native click; initial live navigation succeeded.** Exactly one authorized native child ran. It fetched HTML plus all 18 stylesheets, committed the expected document and discovered the real main-content querySelectorAll link. The single `BrowserSession.click` invocation then failed while resolving formatting geometry. No fallback, retry, second child or offline replay followed.

## Observed flow and blocker

- Initial URL: `https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector`. One navigation and one commit. Native title: `Document: querySelector() method - Web APIs | MDN`; main heading: `Document: querySelector() method`, reference `e1444`.
- Actual response-header classification returned no barrier for all 19 HTTP 200 responses. Classification using the observed primary status/headers, native title and 12,000 bounded native text code units also returned no barrier. This run encountered no challenge; it does not establish challenge-handling effectiveness.
- Native `main a[href]` discovery found two same-origin querySelectorAll candidates: `e1673` (`querySelectorAll()`) and `e2010` (`Document.querySelectorAll()`). The unchanged deterministic rule selected the first, **`e1673`**, with observed href `/en-US/docs/Web/API/Document/querySelectorAll` and empty/default target.
- **One genuine native click was attempted**, without direct navigation or geometry bypass. Exact failure stage: `native-link-click`; name `AgentBrowserError`; code **`unsupported`**; message **`Document width resolution requires an issue-free supported formatting profile`**. First and caught failure agree; the complete stack is retained in `stdout.jsonl`.
- Stack: `resolveFormattingPageWidths` (`dist/src/formatting-tree.js:656`) → `layoutFormattingPageDocument` (`dist/src/flex-document.js:22`) → `layoutPageDocument` (`dist/src/flex-document.js:16`) → `layoutDocument` (`dist/src/document-layout.js:65`) → `DocumentGeometry.refresh` (`dist/src/document-geometry.js:293`) → document/client rectangles → `DocumentScrollIntoView.plan` (`dist/src/scroll-into-view.js:118`). These paths are under the pinned `native-logical-availability-september11-round01/snapshot01/`.
- The measured blocker is the supported-formatting-profile prerequisite in the native click geometry/scroll path, **not a CSS work-cap exception**. Specific underlying formatting issues were not separately instrumented or investigated in this assignment.
- No destination request or second navigation occurred. Destination title/heading and navigation-driven previous-document-closure checks were not reached. Final cleanup closed the initial document, which is not evidence of successful replacement navigation. No successful activation, rendering, visual fidelity or full-flow pass is claimed.

## Captures and resource support

- **19 real responses, all HTTP 200:** HTML plus 18 CSS; zero mocked requests or redirects. Totals: **37,076 encoded bytes / 270,288 decoded bytes**. All 19 body hashes match the earlier full stylesheet capture; fresh actual headers and response metadata remain separately recorded.
- Bodies are retained as `response-1.body` through `response-19.body`; exact URLs, status, headers, byte counts, hashes, classifier results and stages are in `stdout.jsonl` and `progress.jsonl`.
- The original resource-completeness assertions passed before accepting the initial document: **18 external stylesheets, zero `stylesheet-resource-limit`, zero `external-stylesheet-not-loaded`**, and no image resource-limit failure. Native image summary: zero elements, requests or errors.
- Cascade: **591 rules, 1,446 declarations, 84,329 source code units; 4,790,072 / 5,000,000 work**, leaving 209,928 units. CSS remains `partial=true`, `layout=false`.
- Remaining CSS issues: 306 unimplemented properties, 14 unimplemented at-rules, 24 invalid/unimplemented values, 29 invalid/unimplemented selectors and 22 invalid/unimplemented media queries. These diagnostics do not identify the exact formatting issue behind the click exception.
- HTML remains an independent subset: six scripts not executed, 24 template-extension issues, four bogus declarations and one iframe not loaded. Fetch completeness and correct native text do not imply complete CSS/HTML support.

## Preconditions and bounds

- Independently reverified completed `native-logical-availability-september11-round01` build/strict/format/native results: **112 unique explicit manifest-listed files; 6,737 passed, zero failed, one excluded; 6,738 total**. Existing exclusion: `exposes the separate total host-object ceiling without claiming full-pool runtime capacity`. Validation finished `2026-09-11T10:43:48.608Z`, before this live launch.
- Verified all 27 prior replay receipt entries and its full-19-response navigation/content success, without assuming live success. Existing immutable source/compiled inventories remain **1,006 / 1,788 files**; independent before/after inventories and session/selector pins agree. The already pinned build was reused without rebuilding or editing it.
- Session stylesheet admission **24**, probe transport request cap **50**; production research transport default 12 remains asserted and unchanged. Sole origin `https://developer.mozilla.org`, bodyless GET, omitted credentials, 250 ms pacing; no page scripts, SafeJS, alternate browser or TTY.
- Limits retained: one tab, at most two navigations, one pending navigation, at most one native click; navigation timeout 20 seconds, transport timeout 15 seconds; response/request/header/total byte caps 2,000,000 / 1 / 16,384 / 8,000,000; five redirects maximum, concurrency one. Query/cascade work caps remain 5,000,000 and DOM limits unchanged. Native page-query result cap is 10,000, as reported by that engine. Child deadline 30 seconds plus five-second grace; 6 MiB file/combined-output caps; private clean HOME/TMPDIR and piped non-TTY I/O.
- Supervisor interval: `2026-09-11T10:56:41.433Z`–`2026-09-11T10:56:46.241Z`; process-group leader PID `2472327`; exit **1**, no timeout or signal. Combined output 65,867 bytes, stderr empty, no cap breach.

## Cleanup and integrity

- Session and transport closed, zero active requests, initial document at zero nodes, no cleanup errors, child process group absent. Immediate `pendingLoads=0`; no settlement sample was needed or taken. Private HOME/TMPDIR remain empty.
- Independent verification passed **62 checks**; all **45 receipt entries** passed `sha256sum --check`. `integrityPassed=true`, **`flowPassed=false`**. Previous replay/live lanes, referenced reports, validation results, immutable build and harness hashes remain unchanged.
- Only `node_modules/.cache/native-validation/native-mdn-logical-availability-live-september11/` and this report were written. No source/test/TASKS edits, commits, dependencies, additional live attempts or offline native follow-up.

## Evidence pins

Exact validation/build/replay pins are in the new lane's `PINS.json` and `PREFLIGHT.json`; launch and cleanup receipts are `INVOCATION.json`, `EXECUTION.json`, `INTEGRITY.json` and `VERIFICATION.json`.

| Receipt | SHA-256 |
| --- | --- |
| Validation summary | `980dd74105d0b215a208d1c0f48f9bb4f0750873c8ee4c5b8e063a5d5f5ce22e` |
| Source ledger | `d284dbd69e929c432dcdc60f65c9b3b910a99be7adaae32645f319dd1ade42d4` |
| Compiled ledger | `ee2177cd3f8f516b3ba917564d5ecf22557773d65a8d9a0fa2055d70e2f942d1` |
| Live `stdout.jsonl` | `70282aae6f120fde8496eec654f82f67113efbc42a066060eac138b60beec68c` |
| `VERIFICATION.json` | `0dcda013f222ce1c99c9c9af752c15fe37e620e3a8581fc77f189807c8c89b70` |
| `RECEIPTS.sha256` | `ed77967316f8cbc26b5b1a3def9613ebd23ee817f00dbfd6806c579bd4c55c49` |
