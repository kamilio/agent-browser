# Libpng captured full replay on committed 13226

## Measured outcome

One new strictly offline captured-response replay completed. The 49-occurrence
hypothesis was checked against actual native output, not injected: **57
to 49 non-CSS diagnostic occurrences**, with **8
to 8 deferred subtrees**. Eight row-bgcolor hard
guards disappear. Six original blue rows and two original green rows now have
the corresponding computed background paint colors. DOM/source attributes,
capture bodies and native capacities remain unchanged.

The genuine current-DOM FAQ click still fails with **unsupported**:
`Document width resolution requires an issue-free supported formatting profile`. This is not a website acceptance pass,
live visit, new host, successful FAQ navigation or measured whole-page render.
Exit zero means the bounded observation and evidence checks completed.

Native observation UTC: **2026-09-12T11:54:48.647Z through 2026-09-12T11:54:54.343Z**.
Supervisor UTC: **2026-09-12T11:54:48.399Z through 2026-09-12T11:54:54.362Z**;
5.961127 seconds, exit 0.

## Release and immutable inputs

- Runtime commit `fa49059b123243f1b220a8b198607a62c5dc4927`, pinned Node 22.22.0; only
  `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-html-background-color-september12-round00/snapshot01/dist` is executed.
- Verified 20 release receipts, **1148 source / 1964 compiled files**, eight
  actual committed snapshot inputs, and **11 actual Git objects**: commit,
  root/src trees and eight blobs. Local Git retrieval alone ran outside the
  kernel seal; offline checks establish Git object hashes, tree membership
  and byte equality with the committed snapshot. No working-source execution.
- Verified existing release results: **13226 passed / 0 failed / 2 unchanged
  exclusions**, 253 selected suites, 252 strict roots, 647 manifest entries,
  1140 unchanged tracked inputs. No native test suite is rerun by this task.
- Source inventory SHA256: `9dfcd694f03843d14853dd74fb21fd394e4665e9e77f654a17f91dc1d6362e43`.
- Compiled inventory SHA256: `b9e8be9c784221a44d0375b8b8ca2ce1e1f8dac47cbddc94245a41d95821319d`.
- Native result SHA256: `48dbf75b4bd46ee969d706cc5ba8f39c19cfdbadea6fce5c78b6a4b5106b7ab0`.
- Release receipt SHA256: `2018a312829cafa38e2d8f2010c13d24fa11f8d1027639f49e30e52bb86744ff`.
- The 13042 comparison ledger is pinned to `a2e1d9686d3830764e18fdfa6901dd719b03a02673a0a1fa6d5ba871269e01a7`.
  Original live, 12817 baseline, 13042 replay and retained census artifacts,
  including their failures, remain untouched and checked before/after replay.

| Preserved final ledger | Entries | SHA256 |
| --- | ---: | --- |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-flow-september12/FINAL-RECEIPTS.sha256` | 242 | `3379066e83b7f5f5e9c4c899ce5380308d9b0445d67d4a64d0f8e696380bfdcf` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-quirks-replay-september12/FINAL-RECEIPTS.sha256` | 231 | `a2e1d9686d3830764e18fdfa6901dd719b03a02673a0a1fa6d5ba871269e01a7` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-border-baseline-replay-september12/FINAL-RECEIPTS.sha256` | 219 | `578fc1c557e86ca89105da71eee7032331925d9a11ea9923159905e99e303f46` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-hint-census-september12/FINAL-RECEIPTS.sha256` | 280 | `dac6ca409e081b09b160a85a4a4c7dda07782b7f0e5e29897105ecd7216f0c16` |

Original live capture UTC remains 2026-09-12T08:56:00.180Z through
2026-09-12T08:56:06.428Z. Its 23 responses contain one HTML document, 22 images,
zero external stylesheets, **345538 historical encoded / 366824 decoded bytes**.
All original metadata/body and wire-header/body pairs are copied byte-for-byte
and verified, including duplicate-header normalization and bounded gzip
reconstruction. Historical wire bytes are not new traffic.

Original homepage body: 32857 bytes, SHA256
`50ec9ab7655ee476c78e3ff45630a51e459c8bdff8071c73a03056860f4db480`. The unchanged current
native DOM is 33066 bytes, SHA256 `266b3357fdfad8deeba08c187ceaf3c62f4794e3267bd072494d90254750afbe`.
Its one 176-byte inline stylesheet is retained, not injected; stylesheet
metrics record 3 rules and 14 declarations.
Raw CSS issues `{}`, applicable CSS
issues `{}`, and formatting CSS
issues `{}` all remain empty.

## Real native replay and accounting

The genuine `BrowserSession`, `loadBrowserDocument`, original
resource callbacks and `NodeNetworkTransport.requestWithRoutes` process
only the 23 captured responses. There is no foreign browser, alternate parser,
mocked DOM, new response, source rewrite or partial-layout fallback. A missing
destination response aborts rather than fetching or inventing it.

| Observation | Actual |
| --- | ---: |
| Homepage navigations / document commits / genuine FAQ clicks | 1 / 1 / 1 |
| Native adapter entries / transport requests / mocked responses | 23 / 23 / 23 |
| Mock decoded bytes | 366824 |
| Wire calls / wire responses / wire bytes | 0 / 0 / 0 |
| New attempted hosts / missing mocks / network guard attempts | 0 / 0 / 0 |
| Scripts / real SafeJS / credential use | 0 / 0 / 0 |

Mock pacing remains at least 250 ms. The original native network, session,
document, stylesheet and formatting capacities are asserted unchanged. The
kernel unconditionally denies socket and socketpair, connect/bind/listen,
accept, send/receive, ptrace/process-vm and io_uring syscalls. JavaScript
HTTP/HTTPS/net/DNS/TLS/process/addon APIs are denied before browser imports.
Only the pinned compiled module tree is admitted. No network self-probes run.

Each bounded child has 45 seconds wall plus 5 seconds kill grace, 6 MiB
combined output/file, 16 MiB lane and at least 64 MiB free. HOME/TMP are private
and empty, environment explicit, stdin DEVNULL, no TTY. No providers, devices,
secrets or protected native-source-heading-source-10 payloads are accessed.

## Current DOM, selection and click

Title: `PNG (Portable Network Graphics) Home Site`. URL: `https://www.libpng.org/pub/png/`.
The same document identity, 1172 nodes, revision
1197, root `e1`, history
length 1/index 0
remain before and after the click. The native parser reports quirks mode,
windows-1252, scripting false. Both native DOM serializations are byte-identical
to each other and to the sealed 13042 replay.

The unchanged discovery policy inspects 96 of
102 anchor occurrences before deduplication,
finds 9 eligible occurrences and
4 unique destinations. Selected live ref
`e107`, text `FAQ`,
href `pngfaq.html#jpeg-logo` has
3 eligible occurrences. Selection
and every bounded observation match the sealed 13042 replay. The FAQ has no
captured response; the width guard stops the click before any destination request.

## Actual diagnostics and row colors

| Diagnostic occurrence class | 13042 | 13226 | Delta |
| --- | ---: | ---: | ---: |
| display-layout-not-supported | 8 | 8 | 0 |
| html-presentation-hint-not-supported | 31 | 31 | 0 |
| html-table-presentation-hint-not-supported | 16 | 8 | -8 |
| inline-vertical-align-not-supported | 2 | 2 | 0 |

The remaining 49 occurrences comprise **41 hard guards** (31 generic HTML
presentation hints, eight table hints, two inline vertical-align guards) and
**eight table coordinator markers**. The table markers are not evidence of
missing table algorithms: the existing page coordinator handles table roots
through its table layout path. Hard guards still independently reject the
global width profile. The existing native table algorithm was not newly added
or exercised to successful whole-page geometry by this replay.

The one bounded formatting census retains eight deferred tables, 180 visited
nodes and 40 structural samples: eight table/tbody/tr and 16 td. Structure and
all retained attributes match 13042 exactly. Eight table cellpadding=5 hints
remain guarded; border=0 on all eight and width=100% on two remain in the
generic class. Row bgcolor attributes remain original source values.

The additional row observation is capped at eight and taken during that same
bounded traversal. The values below are native `styles.paint(id)["background-color"]`
RGBA byte tuples, not sampled pixels or used rectangles.

| Current row ref | Unchanged bgcolor attribute | Computed paint RGBA |
| --- | --- | --- |
| `e26` | `#007000` | `[0,112,0,255]` |
| `e375` | `#000080` | `[0,0,128,255]` |
| `e431` | `#000080` | `[0,0,128,255]` |
| `e560` | `#000080` | `[0,0,128,255]` |
| `e639` | `#000080` | `[0,0,128,255]` |
| `e699` | `#000080` | `[0,0,128,255]` |
| `e809` | `#000080` | `[0,0,128,255]` |
| `e1087` | `#007000` | `[0,112,0,255]` |

Six `#000080` rows resolve to `[0,0,128,255]`; two
`#007000` rows resolve to `[0,112,0,255]`. The before/after
comparison records only the eight table-hint occurrences disappearing; other
diagnostic counts and all deferred table structures remain unchanged.

The release also contains a collapsed-cell paint-order/rowspan repair covered
by separate isolated release tests. **This blocked full-page replay does not
measure that repair, used whole-page geometry, hit ordering or pixels.**

## Badge and cleanup

Badge `e344` remains broken/policy-denied, natural 0x0,
without decoded data or a captured response. Its original HTTP SourceForge
source triggers no resource callback, request, mock or wire traffic. No remote
availability or decoder verdict is inferred. Attributes remain width=80,
height=15, border=0 and alt=`[primary site hosted by SourceForge]`.

Its native formatting node remains replaced with imageAlternative
`{"text":"[primary site hosted by SourceForge]","fontSize":16,"width":432,"height":16}`, intrinsic
432x16, intrinsicRatio false, CSS box width 80px/height 15px. These are retained
formatting inputs, not a measured whole-page used badge rectangle.

Session close and teardown are sampled for actual owners: document nodes/text,
mutation collectors, inline declarations, image resources/queue/waiters,
event listeners/dispatches, file controls, mouse buttons, session pending loads,
request queue and native transport. All recorded cleanup checks pass:
`{"documents":true,"images":true,"events":true,"controls":true,"session":true,"transport":true}`. The child process group is
absent; private directories are empty. No unobserved owner is claimed proved.

## Artifacts and independent handoff

Lane: `node_modules/.cache/native-validation/native-libpng-background-color-replay-september12`. Main records: `background13226/stdout.json`,
`progress.jsonl` within that run directory, native DOM before/after,
inline stylesheet, invocation/execution stdout/stderr, `COMPARISON.json`,
`TABLE-CENSUS.json`, `ROW-COLORS.json`, `PREFLIGHT.json`,
`GIT-COMMANDS.json`, `PREPARE-COPIES.json` and `CHECKS.json`.
The pre-execution patch-generator transcription failure is preserved in
`INITIALIZATION-NOTE.md`; it produced no patch or browser execution.
There are no failed or repeated native replay attempts in this lane.

Report/artifacts are sealed by `ARTIFACTS.json`, `SEAL.json` and
`FINAL-RECEIPTS.sha256`. Parent must independently verify before
integration using this read-only socket-denied command from the repo root:

`env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B node_modules/.cache/native-validation/native-libpng-background-color-replay-september12/offline.py verify`

The verifier checks 8 input-evidence groups plus
10 replay/diagnostic groups, exact artifact sets, preserved
ledgers, release inventories and report hashes. It never reruns native
parsing/replay; all compiled native imports are prohibited in verifier mode.
No historical evidence is rewritten, no production source is changed, and no
staging/commit/push occurs. Live/FAQ acceptance and the independent research,
performance, provider/passkey/device, TTY, real SafeJS and challenge gates stay open.
