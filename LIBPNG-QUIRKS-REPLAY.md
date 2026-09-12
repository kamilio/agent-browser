# Libpng captured whole-page replay on committed 13042

## Outcome

The observed badge formatting node changes from **deferred** to **replaced with
imageAlternative**. Actual total guard occurrences change **58
to 57**, and deferred subtrees **9
to 8**. These are measured outputs, not a target
achieved by removing guards or changing source. The complete FAQ click still
fails independently with **unsupported**:
`Document width resolution requires an issue-free supported formatting profile`.

This is **one new strictly offline captured replay, not a live visit, retry,
new host or acceptance pass**. No historical flow is reclassified. Native
observation UTC: **2026-09-12T10:44:50.952Z through 2026-09-12T10:44:56.625Z**.
Supervisor UTC: **2026-09-12T10:44:50.733Z through 2026-09-12T10:44:56.644Z**,
5.908725 seconds, exit 0.
Exit 0 means the bounded observation completed, not that the FAQ flow passed.

## Pinned inputs and preservation

- Native runtime: commit `96541506e7878af0bea70ed002bf13111765da3c`, pinned Node **22.22.0**, only
  `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/dist`. No working-source execution.
- Verified **20 release receipts, 1144 source files, 1960 compiled files,
  10 actual committed snapshot inputs**. Thirteen actual Git objects were
  captured outside the kernel seal: commit, root/src trees, ten blobs. Offline
  children verify object hashes, commit/tree links, and exact snapshot bytes.
- Existing release results: **13042 passed, 0 failed, 2 unchanged exclusions**;
  250 selected suites, 249 strict roots, 644 manifest entries, 1134 unchanged
  tracked inputs. Build/strict/format/native receipts pass. These are verified
  prior release results, not a newly rerun native test suite.
- Source inventory SHA256: `d6def5f5dc5b444fd5f1ef05c02e95ad961c83d0124bfb0316ff466b989d3815`.
- Compiled inventory SHA256: `a6a08e4c041dd8f7adadf214dd7c385e43d0ccc14078a39856d9c2c862d9ecf7`.
- The parent-verified 12817 baseline remains untouched, including its failed
  finalization checker, stderr, receipts and all subsequent artifacts. Its
  **219-entry** final ledger is pinned to `578fc1c557e86ca89105da71eee7032331925d9a11ea9923159905e99e303f46` and checked
  before and after this replay and by the read-only verifier. The task records
  the parent's independent verification at 2026-09-12T10:34:34.653Z; no baseline
  browser run is repeated here.
- The original live Libpng capture remains at its original path and UTC
  **2026-09-12T08:56:00.180Z through 2026-09-12T08:56:06.428Z**. Its **242-entry**
  final ledger, SHA256 `3379066e83b7f5f5e9c4c899ce5380308d9b0445d67d4a64d0f8e696380bfdcf`, remains intact.
- All **23 original response metadata/body pairs and 23 wire header/body
  pairs** are verified, including raw duplicate-header normalization, decoded
  hashes and bounded gzip reconstruction. They contain **1 HTML response,
  22 image responses, 0 external CSS responses**, **345538 historical encoded
  bytes / 366824 decoded captured bytes**. The 176-byte inline stylesheet is
  retained from the unchanged captured homepage, not injected or edited.
- The capture description is byte-for-byte equivalent in meaning and exact
  values to the sealed baseline's capture description; all 137
  private copies are byte-equal to their source artifacts. HTML, Transitional
  doctype, CSS, images, headers, URL/status/redirect metadata and native budgets
  are unchanged. No response exists for the HTTP SourceForge badge or FAQ.

## Native flow, identity and strict counts

The genuine `BrowserSession` and `loadBrowserDocument` use
`NodeNetworkTransport.requestWithRoutes` to replay the exact captured
decoded bodies and original response metadata. Original native stylesheet and
image callbacks remain in place. There is no foreign engine, alternate HTTP
client, invented response, extra mock, source rewrite or partial-layout path.

| Observation | Count |
| --- | ---: |
| Explicit homepage navigations / committed documents / genuine FAQ clicks | 1 / 1 / 1 |
| Native adapter entries / transport requests / mock responses | 23 / 23 / 23 |
| Original native image callbacks / image-owner requests | 22 / 22 |
| Mock body bytes / transport mocked decoded bytes | 366824 / 366824 |
| Actual wire calls / responses / encoded bytes / redirects | 0 / 0 / 0 / 0 |
| New attempted hosts / network-process guard attempts / replay misses | 0 / 0 / 0 |
| Page scripts / real SafeJS / accepted cookies | 0 / 0 / 0 |

Current document URL: `https://www.libpng.org/pub/png/`. Title:
**PNG (Portable Network Graphics) Home Site**. Before/after and against the sealed baseline,
the native DOM stays at **1172 nodes**, root `e1`,
revision **1197**, same object identity. History stays at **length 1, index 0**,
key `h1-1`, retained URL bytes **39**. Both
complete serialized DOM observations are **33066 bytes**,
SHA256 `266b3357fdfad8deeba08c187ceaf3c62f4794e3267bd072494d90254750afbe`, also equal to the baseline's DOM.
The native parser still reports **quirks**, **windows-1252**, scripting **false**,
with unchanged diagnostics `{"nonconforming-doctype":1,"quirks-layout-not-implemented":1,"unmatched-end-tag":2}`.
Serialization is an observation only, never substituted response HTML.

Exactly **96 of 102 current-DOM anchors** are inspected before deduplication;
**9 eligible occurrences / 4 unique destinations**. The actual selected current
ref is `e107`, text **FAQ**, original href
`pngfaq.html#jpeg-logo`, with three eligible occurrences of its
destination. The entire bounded inspection/deduplication/choice policy is
verified byte-identical to the baseline's harness policy, and all discovery
observations are equal. No old reference was used to choose a target.

One genuine `session.click` fails at the native global width guard
before a destination request. The FAQ has no captured response. If requested,
the harness aborts as a replay miss instead of fetching or adding a mock.
Here **no FAQ request occurs**, so zero replay misses are not proof of FAQ
support. There is no forced destination, second interaction, download or input.

## Current-DOM badge and formatting change

The badge is located from retained current-DOM and original captured attributes,
not a hardcoded historical ref. Current ref: `e344`; original
width **80**, height **15**, border **0**, alt `[primary site hosted by SourceForge]`;
source `http://sflogo.sourceforge.net/sflogo.php?group_id=32355&type=9`, parent href
`http://sourceforge.net/projects/png-mng`.

Its genuine image owner remains **broken / policy-denied**, complete true,
natural **0 x 0**, with **no decoded image**. No SourceForge original-loader
callback, native request, mock or captured response exists. The owner snapshot
is unchanged from 12817. Inspection's query-redacted diagnostic URL and the
unredacted owner/current-DOM source are intentionally checked separately.
This makes **no SourceForge remote-server or codec verdict**. Other loaded
images account for 2046524 decoded owner bytes
before teardown; none is badge pixel data.

The one matching formatting node is now **replaced**, inline, with
`imageAlternative` = `{"text":"[primary site hosted by SourceForge]","fontSize":16,"width":432,"height":16}`, intrinsic
`{"width":432,"height":16}`, and
`intrinsicRatio: false`. The recorded CSS box width/height are
**80px / 15px**. The alternative's **432 x 16** intrinsic text metadata and
those declared dimensions are **not a measured whole-page used rectangle**:
global width guards still prevent that measurement. No raster or geometry
fallback is invoked to produce a success claim.

## One bounded failure census and baseline comparison

Raw CSS issues **{}**, applicable CSS issues **{}**, formatting CSS issues
**{}**, as independently recorded by the native style/formatting metrics.
This is not suppression or a claim of universal CSS support.

| Guard type | 12817 | 13042 observed | Delta |
| --- | ---: | ---: | ---: |
| display-layout-not-supported | 8 | 8 | 0 |
| element-layout-not-supported | 1 | 0 | -1 |
| html-presentation-hint-not-supported | 31 | 31 | 0 |
| html-table-presentation-hint-not-supported | 16 | 16 | 0 |
| inline-vertical-align-not-supported | 2 | 2 | 0 |
| **Total occurrences** | **58** | **57** | **-1** |

The image element guard disappears at the replaced alternative, but **57
non-CSS occurrences across 4 remaining types** still block a supported
whole-page profile. Deferred count is now **8**, all
`display-layout-not-supported`; the old badge deferred entry is absent.
One formatting build supplies both the census and table observations, with
all deferred samples inside the unchanged 20-sample ceiling. Observed metrics:
1156 visited DOM nodes, 1124 boxes,
1077 formatting nodes, 47
outside markers, 11764 text code units,
21668 work. DOM revision remains 1197. There is **no sole-cause
claim, guard weakening, raised bound or partial-layout fallback**.

## Remaining deferred tables: next concrete blocker

All **8 deferred tables** are inspected from the retained DOM in the same
census. This visits **180 nodes**, recording **40 structural samples**:
**8 tables, 8 tbody, 8 tr, 16 td**. Every table traversal and structural sample
set is complete within its bounds. Table root attributes include border=0 and
cellpadding=5 on all 8, width=100% on 2. Two green rows (#007000) each have five
cells with align=center and valign=middle; six blue rows (#000080) each have one
cell without those attributes. Actual per-table rows follow:

| Current ref | Original DOM table attributes | Rows | Cells | Visited nodes | Sampling |
| --- | --- | ---: | ---: | ---: | --- |
| `e23` | `{"width":"100%","border":"0","cellpadding":"5"}` | 1 | 5 | 51 | complete |
| `e372` | `{"border":"0","cellpadding":"5"}` | 1 | 1 | 13 | complete |
| `e428` | `{"border":"0","cellpadding":"5"}` | 1 | 1 | 13 | complete |
| `e557` | `{"border":"0","cellpadding":"5"}` | 1 | 1 | 13 | complete |
| `e636` | `{"border":"0","cellpadding":"5"}` | 1 | 1 | 13 | complete |
| `e696` | `{"border":"0","cellpadding":"5"}` | 1 | 1 | 13 | complete |
| `e806` | `{"border":"0","cellpadding":"5"}` | 1 | 1 | 13 | complete |
| `e1084` | `{"width":"100%","border":"0","cellpadding":"5"}` | 1 | 5 | 51 | complete |

All eight report computed table-layout **auto**, border-collapse **separate**,
border-spacing **2px 2px**, caption-side **top**, empty-cells **show**, and
vertical-align **baseline**. The native snapshot's
`snapshot01/src/formatting-tree.ts:886` table branch explicitly emits
`display-layout-not-supported` for table roots; its node remains
deferred with table content mode. These are genuine unresolved native table
layout roots, not image decode errors or missing captured resources.

**Native table layout and retained table presentation hints are the next
concrete investigation target**, including those original cellpadding, border,
width, row bgcolor and cell alignment attributes. The 16 table-presentation
guards are independently counted; this census does not prove an exact
attribute-to-guard mapping or that a table-only fix makes the FAQ pass.
31 other HTML presentation guards and 2 inline vertical-align guards remain.

Diagnostic limits: 20 tables, 512 visited nodes per table / 2048 total,
32 structural samples per table / 128 total, 24 attributes per element,
256 code units per attribute. This is bounded diagnosis, not another render,
source mutation or acceptance proof. Full computed styles, original attributes,
parent/current refs and complete samples are in `TABLE-CENSUS.json`.

## Isolation, unchanged bounds and sampled cleanup

Socket/socketpair creation and related connect/bind/listen/accept/message
syscalls are **unconditionally denied** by libseccomp before every offline
Node child starts. Ptrace, cross-process memory and io_uring are also denied.
No socket self-probes are run. The replay additionally denies JavaScript
HTTP/HTTPS/HTTP2/DNS/net/TLS/datagram/fetch/WebSocket and subprocess/native-addon
APIs, real SafeJS, and imports outside the pinned runtime/explicit harness.
Git objects are the explicitly separate outside-kernel-seal read-only capture.
Zero wire counts come from native/guard instrumentation; this is **not a
packet capture or exhaustive syscall-attempt trace**. Successful socket use
is prevented by the kernel boundary.

Private 0700 empty HOME/TMP, explicit environment, DEVNULL stdin, no TTY,
credentials, .env/password stores, providers or devices. Each supervisor keeps
**45s wall + 5s kill grace**, **6 MiB file/output** (a stricter combined-output
ceiling), **16 MiB lane**, **64 MiB minimum free**. Replay stdout is
**147712 bytes**, stderr **0**, with no truncation,
signals or timeout. Final lane usage is recorded by the seal and verifier.

Native bounds are identical to the captured baseline, including network
32 requests / 1 concurrent / 2 MiB response / 8 MiB total / 15s timeout;
session 1 tab / 2 navigations / 1 pending / 20s navigation timeout;
250ms minimum mock spacing; DOM 50000 nodes / depth 256 / 2000000 text units /
1024 changes; formatting 50000 owned nodes/boxes / depth 256 / 1000000 text /
2000000 work. Unchanged stylesheet and remaining capacities are in the JSON.

Cleanup is sampled immediately at **2026-09-12T10:44:56.537Z** and finally
at **2026-09-12T10:44:56.537Z** (the same recorded millisecond). Document
nodes/text, image resources/decoded bytes/active/queued/waiters, event
listeners/dispatches, held controls/files, pending loads and request queue
activity are zero; owners, session and transport are closed, cleanup errors
zero. The supervisor finds the process group absent after exit. This is a
bounded teardown observation, not a long-term retention/performance gate.

## Artifacts and independent verification

Only this new report and private 0700 lane `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-quirks-replay-september12` are written.
Primary artifacts: `quirks13042/stdout.json`,
`quirks13042/progress.jsonl`, `quirks13042/native-dom.html`,
`quirks13042/native-dom-after.html`, `quirks13042/EXECUTION.json`,
`COMPARISON.json`, `TABLE-CENSUS.json`, `PREFLIGHT.json`,
`GIT-COMMANDS.json`, `PREPARE-COPIES.json`, `CHECKS.json`
and byte-exact copies under `archive/`. Preparation/preflight/replay
stdout, stderr and execution receipts are retained. There were no failed new
preparations or replay checks before report generation. All original baseline
failed-finalizer evidence is still retained and ledger-verified in place.

The report and every new artifact are sealed through `ARTIFACTS.json`,
`SEAL.json` and `FINAL-RECEIPTS.sha256`. From `/home/kjopek/project/agent-browser`, run:

`env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B node_modules/.cache/native-validation/native-libpng-quirks-replay-september12/offline.py verify`

The read-only, socket/socketpair-denied verifier checks **7
input-evidence groups plus 9 replay/diagnostic groups**,
all three generations of relevant ledgers, exact file sets and unchanged
lane contents. It does not rerun either browser. The parent must independently
verify before integration. No source/shared docs/TASKS/manifest/staging/commit/
push changes occur here. Full website/FAQ interaction, live-site,
research/performance, provider/passkey/device, TTY, real SafeJS and challenge
acceptance gates remain open.
