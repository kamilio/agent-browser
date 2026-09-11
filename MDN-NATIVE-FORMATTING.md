# MDN native formatting diagnosis — September 11, 2026

**Diagnosis captured; native link flow remains failed.** The live report was completed first in `MDN-LOGICAL-AVAILABILITY-LIVE.md`. This assignment used one offline child, the exact 19 fresh live captures and the same immutable logical-availability build—not the newer predicate-ordering work.

## Reproduction and rejecting stage

- Replayed initial navigation committed the expected querySelector document. Native main-content discovery reproduced the same two candidates and selected **`e1673`**, text `querySelectorAll()`, href `/en-US/docs/Web/API/Document/querySelectorAll`.
- Exactly one unchanged `BrowserSession.click` reproduced the live error at `native-link-click`: **`AgentBrowserError`, code `unsupported`, `Document width resolution requires an issue-free supported formatting profile`**. No destination request, second navigation, click retry, DOM edit or alternate activation occurred.
- The native stack starts at `resolveFormattingPageWidths` (`dist/src/formatting-tree.js:656`), through `layoutFormattingPageDocument`, `layoutDocument`, `DocumentGeometry` and `DocumentScrollIntoView`. The complete click stack is retained.
- After that failure, one public `buildFormattingTree(tree)` **returned successfully**. One public `resolveFormattingPageWidths` call on the unchanged result reproduced the same code/message at `public-width-rejection`; its independent stack again starts at `dist/src/formatting-tree.js:656`.
- Therefore the exception is the **width resolver's issue guard**, not an exhausted construction budget. Successful construction here means a partial formatting result with a deferred subtree, not complete layout of the page. No used widths or successful link geometry were obtained.

## Exact issues

| Formatting issue | Count | Rejects this width call? |
| --- | ---: | --- |
| `css:unimplemented-css-property` | 306 | Yes |
| `css:unimplemented-css-at-rule` | 14 | Yes |
| `css:unimplemented-or-invalid-css-value` | 24 | Yes |
| `css:unimplemented-or-invalid-css-selector` | 29 | Yes |
| `css:unimplemented-or-invalid-media-query` | 22 | No: advisory |
| `display-layout-not-supported` | 1 | Yes |

The four rejecting CSS categories are copied from actual stylesheet diagnostics. There are **zero flex nodes, no coordinated-layout path and zero absolute/fixed nodes** in this formatting result, so the resolver's narrowly defined coordinated-flex exception does not apply to the one display issue. Neither CSS diagnostics nor the display issue was suppressed.

## Missing link box and observable source cause

- Formatting metrics: **five visited DOM nodes, five formatting nodes/boxes, 16 text code units, 43 work units, one deferred subtree**, within the unchanged 2,000,000 formatting-work limit. The complete 4,806-byte result is preserved as `formatting.json`.
- The five nodes are viewport, the `html` block (`e3`), a whitespace text node (`e71`), an anonymous block, and **deferred body `e72`**, formatting id 3. The body is `<body class="page-layout">`, with native computed **`display:grid`** and reason **`display-layout-not-supported`**. Its 11 direct children were not decomposed; it contains the selected link.
- **`e1673` has no formatting node or box.** Native style inspection reports it as visible/inline, but the deferred body prevents traversal to it. Visibility alone therefore does not establish actionability.
- The recorded ancestry also includes visible grid container `e1436`, class `layout__2-sidebars-inline reference-layout`, and `main#content` (`e1438`, `display:contents`). Those descendants are absent from the formatting tree because traversal already stopped at the body; their later layout behavior was not tested.
- Exact capture correspondence, using UTF-16 offsets: `response-1.body` offset **5,624** contains `<body class="page-layout">`; `response-12.body` offset **0** begins `.page-layout{display:grid;grid-template-columns:minmax(0,1fr);...}`. That CSS response is `styles-page-layout.5a4354f33e894319.css`. The nested layout selector also occurs in `response-3.body`, beginning at offset 0 as `.layout__2-sidebars,.layout__2-sidebars-inline{display:grid;...}`. These source observations agree with recorded native computed displays; no separate winning-declaration trace was collected.

## Native stylesheet examples

After both failures were reproduced, bounded read-only calls to the public native CSS parser recorded exact source slices and emitted issue codes. Examples include:

| Exact source or retained rule | Capture offset | Native diagnostic |
| --- | --- | --- |
| `border-radius:1em` | `response-2.body`, 112 | `unimplemented-css-property` |
| `vertical-align:text-top` | `response-2.body`, 216 | `unimplemented-css-property` |
| `color-scheme:light` | `response-2.body`, 13,544 | `unimplemented-css-property` |
| `margin-left:.5ch` | `response-2.body`, 21,458 | `unimplemented-or-invalid-css-value` |
| Complete `@font-face` rule retained in evidence | `response-2.body`, 14,129 | `unimplemented-css-at-rule` |

- All 12 retained examples include the exact slice, URL, offset, parser method and slice hash. Sampling used at most 128 declaration calls and eight leaf at-rule calls, 5,993 total source code units, shared unchanged parser ceilings of 4,096 rules / 16,384 declarations, and at most four examples per issue.
- These are direct native-parser observations on source slices, **not an occurrence-by-occurrence attribution of the cascade counts**. Isolated parsing can differ from enclosing at-rule/media context, and the examples do not prove which declarations win on a node. No unsupported-browser-feature guesses or additional cascade/selector trials were used.

## Immutable implementation locations

All locations are relative to `node_modules/.cache/native-validation/native-logical-availability-september11-round01/snapshot01/`:

- `src/formatting-tree.ts:167`: public formatting construction; `src/formatting-tree.ts:181`: imports stylesheet issues with the `css:` prefix.
- `src/formatting-tree.ts:653`: creates an unsupported-element/display deferred node instead of descending into that subtree.
- `src/formatting-tree.ts:847`: only the media-query issue is advisory; `src/formatting-tree.ts:851`: width resolver and its rejecting issue predicate; throw at `src/formatting-tree.ts:869` corresponds to `dist/src/formatting-tree.js:656`.
- `src/flex-document.ts:50`: page-layout width-resolution path. Public CSS sample APIs are in `src/css-parser.ts:208` and `src/css-parser.ts:515`.

## Bounds, preservation and verification

- All 45 live receipt entries were verified before replay. The reused build's completed validation remains **112 explicit manifest-listed files, 6,737 passed, one existing exclusion, zero failures**; immutable inventories **1,006 source / 1,788 compiled files** match before and after. Newer parent work was not substituted.
- Exactly **19 mocked responses**, with identical URL/order/status/headers/body hashes: HTML plus 18 CSS, **270,288 decoded bytes, zero wire/encoded bytes**, zero redirects or unrecorded resources. Original stylesheet/image completeness checks passed unchanged. CSS work remained **4,790,072 / 5,000,000** before and after the diagnosis.
- Session stylesheet admission 24, transport request cap 50, configured pacing 250 ms; unchanged session/DOM/query/CSS/formatting/layout limits, 30-second deadline plus five-second grace, 6 MiB output/file caps, private clean HOME/TMPDIR. Inherited seccomp and original JS network/addon/process/worker denials remained active, with zero guard attempts. No credentials, page scripts, SafeJS, alternate browser, TTY or installs.
- Child interval: `2026-09-11T11:04:22.983Z`–`2026-09-11T11:04:23.394Z`; process-group leader PID `2480955`; exit **0 means diagnosis captured only**. Output 78,127 bytes, stderr empty, no timeout or cap breach. Final stage `formatting-diagnosis-complete`; `websiteFlowPassed=false`.
- Document revision stayed **2750** across click, formatting construction and width rejection. The formatting input hash was unchanged by the rejecting resolver, and stylesheet metrics were unchanged after source sampling. No hooks, criteria changes, CSS removal, budget increases or production-file edits.
- Session/transport closed, document at zero nodes, zero active requests, no cleanup errors; immediate `pendingLoads=0`, so no settlement sample. Private directories stayed empty and were removed; child process group absent.
- Independent verification passed **72 checks**; all **24 receipt entries** passed `sha256sum --check`. Live evidence/report and immutable inputs remain unchanged. Writes are confined to the new diagnostic lane and this report. No further probe or task was started.

Evidence lane: `node_modules/.cache/native-validation/native-mdn-formatting-diagnostic-september11/`.

| Receipt | SHA-256 |
| --- | --- |
| `stdout.jsonl` | `adc8afdb99556c171cde92e96f590150d3491a3762d7cc4a471ccc26b0bf1327` |
| `formatting.json` | `3f348dfeecd5d7df95a004fd429df506814d144507dfc8fdfa456949fc23420e` |
| `VERIFICATION.json` | `2f6b0dda15b1eb52b08298c9ba9bc1bf2043614365766acf1b9d24edfbc1eb8a` |
| `RECEIPTS.sha256` | `e26a3e3ca7c47f6e137eb641dbef3667f9a179aa8ea8701dc4a4a7624c5c16f5` |
