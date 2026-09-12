# Libpng captured full replay on committed 13446

## Measured result

One new strictly offline captured-response replay completed. The hypothesis
was verified against actual native output: non-CSS diagnostic occurrences
change **49 to 41**, with
**8 to 8 deferred subtrees**.
The eight table-cellpadding hard-guard occurrences disappear. Actual native
ownership and style observations cover **16 HTML cells in
8 original tables**, with **64 computed padding sides
all equal to 5px**. No side differs from its native-parsed owner hint.

The genuine current-DOM FAQ click still fails with **unsupported**:
`Document width resolution requires an issue-free supported formatting profile`. Remaining diagnostics comprise **33 hard
guards plus eight table coordinator markers**. No whole-page used geometry,
pixels, destination response, successful FAQ flow or entire-website acceptance
is claimed. Exit zero means the bounded replay observations completed, not
that the FAQ interaction passed.

Native observation UTC: **2026-09-12T12:57:20.882Z through 2026-09-12T12:57:26.601Z**.
Supervisor UTC: **2026-09-12T12:57:20.616Z through 2026-09-12T12:57:26.621Z**;
6.001882 seconds, exit 0.

## Committed release and immutable inputs

- Runtime commit `69d74cb23c591d760b8735dc11071406852dbe2d`, pinned Node **22.22.0**; only
  `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-html-cell-padding-september12-round01/snapshot01/dist` executes. No working modules,
  foreign browser or dependency additions.
- Verified **20 receipts, 1152 source files, 1968 compiled files, ten actual
  committed snapshot inputs and 13 Git objects**. Real commit/root/src trees
  and ten blobs were captured outside the kernel seal, then checked inside for
  object hashes, tree membership and exact snapshot bytes. Parent can verify
  the actual object bytes independently.
- Existing release results: **13446 passed / 0 failed / 2 unchanged exclusions**,
  256 selected suites, 255 strict roots, 650 manifest entries, 1142 unchanged
  tracked inputs. No native test suite is rerun by this replay.
- Source inventory SHA256: `ef2bb7a84904358ffd86f543f4641aa44fed3fdddb1f22b0190e0018b9ced203`.
- Compiled inventory SHA256: `fcfa40d329a2b6b6742436067c21ce18c84dadaca9892d68e246d1aa2a19c4de`.
- Native result SHA256: `5e924500a241a4e77d19b83f36a3c09695f07cabcc78506cf99efa078f0cb163`.
- Gate receipt SHA256: `25fce8558e5accdf9be84d8b4e284cba4a2583069132b6b3af58ccd09da51128`.
- The sealed 13226 comparison ledger remains `b27d3569e2ef837ce235901519391a36cf4055971cddd77a8e17365e71ea5257`.
  All historical captures/replays/census/live-flow artifacts, including their
  failed attempts, stay at their original paths and hashes. Seven prior final
  ledgers are checked before/after this run and during read-only verification.

| Preserved final ledger | Entries | SHA256 |
| --- | ---: | --- |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-quirks-replay-september12/FINAL-RECEIPTS.sha256` | 231 | `a2e1d9686d3830764e18fdfa6901dd719b03a02673a0a1fa6d5ba871269e01a7` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-vim-flow-september12/FINAL-RECEIPTS.sha256` | 153 | `709719e940a576e0dc586acfbb7a5dd4b8fe428cf9fb1933087986880fbf5830` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libjpeg-turbo-flow-september12/FINAL-RECEIPTS.sha256` | 136 | `c99a77fecdfbab567e41cddefe0525541327b7415e87255e19c01e392d8b3f63` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-flow-september12/FINAL-RECEIPTS.sha256` | 242 | `3379066e83b7f5f5e9c4c899ce5380308d9b0445d67d4a64d0f8e696380bfdcf` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-background-color-replay-september12/FINAL-RECEIPTS.sha256` | 228 | `b27d3569e2ef837ce235901519391a36cf4055971cddd77a8e17365e71ea5257` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-border-baseline-replay-september12/FINAL-RECEIPTS.sha256` | 219 | `578fc1c557e86ca89105da71eee7032331925d9a11ea9923159905e99e303f46` |
| `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-hint-census-september12/FINAL-RECEIPTS.sha256` | 280 | `dac6ca409e081b09b160a85a4a4c7dda07782b7f0e5e29897105ecd7216f0c16` |

Original live capture UTC remains **2026-09-12T08:56:00.180Z through
2026-09-12T08:56:06.428Z**. Its 23 responses comprise one HTML document, 22 image
responses and zero external CSS responses, with **345538 historical encoded /
366824 decoded bytes**. Those old encoded bytes are not new traffic.

All 23 original response metadata/body pairs and 23 encoded wire-header/body
pairs are copied byte-for-byte and verified, including duplicate-header
normalization and bounded content reconstruction. Original homepage body:
**32857 bytes**, SHA256 `50ec9ab7655ee476c78e3ff45630a51e459c8bdff8071c73a03056860f4db480`.
The unchanged current DOM is **33066 bytes**, SHA256
`266b3357fdfad8deeba08c187ceaf3c62f4794e3267bd072494d90254750afbe`. Before/after serializations and the sealed
13226 serialization match exactly. One unchanged 176-byte inline stylesheet
has 3 rules and 14 declarations;
raw, applicable and formatting CSS issue maps all remain empty.

## Strict zero-HTTP replay and bounds

The genuine `BrowserSession`, `loadBrowserDocument`, original
native stylesheet/image callbacks and `NodeNetworkTransport.requestWithRoutes`
process only the original 23 captured bodies and metadata. No alternate parser,
mocked DOM, new response, source rewrite, destination override or fallback
layout is substituted. An absent destination response aborts, never fetches.

| Measurement | Actual |
| --- | ---: |
| Explicit homepage navigations / commits / genuine FAQ clicks | 1 / 1 / 1 |
| Native adapter entries / transport requests / mocked responses | 23 / 23 / 23 |
| Mock decoded body bytes | 366824 |
| Wire calls / wire responses / wire bytes | 0 / 0 / 0 |
| New hosts / missing mocks / network guard attempts | 0 / 0 / 0 |
| Scripts / real SafeJS / credentials | 0 / 0 / 0 |

Kernel seccomp unconditionally denies socket/socketpair, connect/bind/listen,
accept, send/receive, ptrace/process-vm and io_uring. JavaScript HTTP/HTTPS/net/
DNS/TLS/process/addon operations are guarded before browser imports. No network
self-probe or other session runs. Only the pinned compiled module tree is
admitted for browser execution; verifier mode prohibits all compiled imports.

Bounds remain **45 seconds wall + 5 seconds kill grace**, **6 MiB combined
output/each file**, **16 MiB lane**, **64 MiB minimum free** and all original
native network/session/document/style/formatting capacities. Mock pacing remains
at least 250 ms. HOME/TMP are private 0700 and empty, environment explicit,
stdin DEVNULL/no TTY. Shell TMPDIR uses this owned workspace lane's tmp,
not the full shared /tmp. No unrelated files are removed. No credentials,
providers/devices or protected source-heading payloads are accessed.

## Same current DOM, policy and actual click

Title: `PNG (Portable Network Graphics) Home Site`. URL: `https://www.libpng.org/pub/png/`.
The same document identity, **1172 nodes**, revision
**1197**, root **`e1`**, history
length **1** / index **0**
remain before and after the failed click. Native parsing remains quirks mode,
windows-1252, scripting false. No attribute or document source is rewritten.

The exact 13226 selection policy inspects **96 of
102 anchor occurrences** before deduplication,
finds **9 eligible occurrences /
4 unique destinations**, and selects
current ref **`e107`**, text
`FAQ`, href
`pngfaq.html#jpeg-logo`. All bounded discovery records match
13226. The selected URL has 3
eligible occurrences. One genuine click hits the native width guard before
requesting the uncaptured FAQ destination; there is no second action.

## Actual guard reduction

| Non-CSS occurrence class | 13226 | 13446 | Delta |
| --- | ---: | ---: | ---: |
| display-layout-not-supported | 8 | 8 | 0 |
| html-presentation-hint-not-supported | 31 | 31 | 0 |
| html-table-presentation-hint-not-supported | 8 | 0 | -8 |
| inline-vertical-align-not-supported | 2 | 2 | 0 |

The remaining **41 occurrences** are **31 generic HTML presentation-hint
guards**, **two inline vertical-align guards**, and **eight table coordinator
markers**. The latter are not eight missing table algorithms. The existing
page coordinator has a table layout path; the remaining 33 hard guards still
independently prevent an issue-free global width profile. Eight deferred table
subtrees remain; there is no partial-layout workaround or sole-cause claim.

## Native ownership and real computed padding

One formatting census retains the original bounded table traversal: eight
tables, 180 visited nodes, 40 structural samples (eight table/tbody/tr and
16 td). Table structure and all source attributes match sealed13226. Cell
observation is capped at **128 unique cells** and occurs during that same
traversal, not in a second document parse or formatting build.

The committed `cellPaddingOwner` helper establishes actual HTML
ownership; `cellPaddingLength` parses each observed owner value once.
There are **16 ownership calls**, **48
charged parent reads** (three per cell), and **8
parsed owner tables**. Four padding sides come from real
`page.styles.box(cell.id)`, not from copying raw hint values into
observations. Native source is `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-html-cell-padding-september12-round01/snapshot01/src/html-cell-padding.ts`;
the actual compiled helper belongs to the verified runtime inventory and its
source blob is among the ten independently checked committed inputs.

| Original table ref | Unchanged raw attributes | Observed owned cells |
| --- | --- | ---: |
| `e23` | `{"width":"100%","border":"0","cellpadding":"5"}` | 5 |
| `e372` | `{"border":"0","cellpadding":"5"}` | 1 |
| `e428` | `{"border":"0","cellpadding":"5"}` | 1 |
| `e557` | `{"border":"0","cellpadding":"5"}` | 1 |
| `e636` | `{"border":"0","cellpadding":"5"}` | 1 |
| `e696` | `{"border":"0","cellpadding":"5"}` | 1 |
| `e806` | `{"border":"0","cellpadding":"5"}` | 1 |
| `e1084` | `{"width":"100%","border":"0","cellpadding":"5"}` | 5 |

| Cell ref | Native owner table | Raw cellpadding | Computed top / right / bottom / left | Differing sides |
| --- | --- | --- | --- | ---: |
| `e28` | `e23` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e37` | `e23` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e46` | `e23` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e55` | `e23` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e64` | `e23` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e377` | `e372` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e433` | `e428` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e562` | `e557` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e641` | `e636` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e701` | `e696` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e811` | `e806` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e1089` | `e1084` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e1098` | `e1084` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e1107` | `e1084` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e1116` | `e1084` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |
| `e1125` | `e1084` | `5` | `5px` / `5px` / `5px` / `5px` | 0 |

All **16 cells / 64 sides** actually compute **5px**. **Zero differing-side
overrides are observed relative to the parsed hint.** This is not an assumption
that every raw hint must win: the probe records each independent computed side
and would retain differing values. Computed equality alone cannot distinguish
a winning hint from an equal-valued authored declaration; exact winning-author
declaration attribution is not claimed. These are computed padding values,
**not whole-page used rectangles, content offsets, hit geometry or pixels**.

The eight row-color observations remain exactly equal to 13226: six original
`#000080` rows compute `[0,0,128,255]`, two original
`#007000` rows compute `[0,112,0,255]`. No bgcolor or other
raw source attribute changes. Separate release geometry/paint/hit tests are
not reclassified as successful full Libpng geometry in this still-guarded run.

## Badge, cleanup and handoff

Badge `e344` remains broken/policy-denied with natural 0x0,
no decoded image and no captured SourceForge response. Its original HTTP
SourceForge source produces no callback/request/mock/wire traffic. Width=80,
height=15, border=0 and alt=`[primary site hosted by SourceForge]` remain intact.
Its formatting node is still replaced with imageAlternative
`{"text":"[primary site hosted by SourceForge]","fontSize":16,"width":432,"height":16}`, intrinsic
432x16, intrinsicRatio false and CSS width80px/height15px. No remote availability,
decoder result or measured whole-page used badge rectangle is inferred.

All actual sampled document/image/event/control owners, session/request queue
and native transport close with zero retained nodes/text/collectors/listeners/
active/pending work. Recorded cleanup checks:
`{"documents":true,"images":true,"events":true,"controls":true,"session":true,"transport":true}`. The child process group is
absent and HOME/TMP remain empty. Unobserved owners are not claimed proved.

This lane has one successful preparation/preflight and one native replay;
there are no failed or repeated replay attempts. Original historical failures
remain intact. Main records in `node_modules/.cache/native-validation/native-libpng-cell-padding-replay-september12` are
`cellpadding13446/stdout.json`, progress and native DOM before/after,
`COMPARISON.json`, `TABLE-CENSUS.json`, `CELL-PADDING.json`,
`ROW-COLORS.json`, `CHECKS.json`, `PREFLIGHT.json`,
`GIT-COMMANDS.json`, invocation/execution/stdout/stderr and exact private
capture/release/template copies. Report and artifacts are sealed through
`ARTIFACTS.json`, `SEAL.json` and `FINAL-RECEIPTS.sha256`.

From the repository root, use this read-only verifier (workspace TMPDIR explicit):

`env -i PATH=/usr/bin:/bin TMPDIR=/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-cell-padding-replay-september12/tmp /usr/bin/python3 -I -B node_modules/.cache/native-validation/native-libpng-cell-padding-replay-september12/offline.py verify`

It checks **8 evidence groups plus 11
replay/diagnostic groups**, exact artifact sets/report hashes, seven historical
ledgers and full current release inventories, under socket/socketpair denial.
It reruns no native parse, session or replay. Parent must independently verify
before integration. No source/shared docs/TASKS/manifest/index/staging/commit/
push changes occur. Full FAQ/live-site/entire-website acceptance and all separate
research/performance/provider/passkey/device/TTY/real SafeJS/challenge gates stay open.
