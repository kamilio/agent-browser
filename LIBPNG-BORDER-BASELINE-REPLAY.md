# Libpng captured homepage: committed 12817 baseline replay

## Outcome and scope

**Unsupported, not an acceptance pass.** Exactly one captured-homepage navigation
and one genuine current-DOM FAQ click were executed with the native browser.
The click returned `unsupported`: `Document width resolution requires an issue-free supported formatting profile`.
There was no destination request, fallback interaction, partial-layout fallback,
download, input, fresh website visit, added attempted host, or online retry.
This records a baseline; it does not require the whole-page flow to succeed.

Native observation UTC: **2026-09-12T10:23:27.024Z through 2026-09-12T10:23:32.682Z**.
Supervisor UTC: 2026-09-12T10:23:26.813Z through 2026-09-12T10:23:32.701Z
(5.886663 seconds, exit 0 means baseline instrumentation
completed, not that the click or website flow passed).
The original live capture remains dated **2026-09-12T08:56:00.180Z through
2026-09-12T08:56:06.428Z**, with its original paths and measurements intact.

## Verified inputs

- Runtime: committed `3890c339b2bba7c743c1322a36c733a8f2c2fc75`, pinned Node 22.22.0, only
  `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-image-border-september12-round01/snapshot01/dist`; never working source.
- All **20 release receipts**, **1140 source files**, **1956 compiled files**,
  and **7 actual committed Git inputs** verified. Git ran only for 10 local
  object captures outside the kernel seal (commit, two trees, seven blobs).
  Offline verification cryptographically links captured blobs through those
  trees to the pinned commit, then compares bytes to the snapshot.
- Release evidence: 12817 passed, 0 failed, 2 unchanged exclusions; 247 selected
  suites, 246 strict roots, 641 manifest entries, 1133 unchanged tracked inputs.
  These are verified existing release results, not a newly rerun native suite.
- Source inventory SHA256: `6c658bcfdfd3cd9ab3f6bd8fe5911649d29532a07efdfda430c54116b6099845`.
- Compiled inventory SHA256: `fcc6bc59398e54dc999f160937f39df145930289a1850e45544e5ece8d74658d`.
- Original final ledger: **242 entries**,
  SHA256 `3379066e83b7f5f5e9c4c899ce5380308d9b0445d67d4a64d0f8e696380bfdcf`.
- All 23 original response metadata/body pairs and all 23 original wire
  header/body pairs verified against that ledger, saved observations and
  original response claims. Raw repeated headers remain unchanged; native
  header normalization and gzip reconstruction are checked separately.
- Captures comprise **1 HTML response, 22 image responses, 0 external CSS
  responses**: **345538 encoded historical bytes / 366824 decoded captured
  bytes**. The homepage's one 176-byte inline style is extracted from its
  unchanged HTML/native DOM. Nothing is rewritten or synthesized.
- Exact source and compiled inventories, original ledger and private byte
  copies are checked before and after the native replay, and by the verifier.

## Genuine native flow and current DOM

The mock route is inside `NodeNetworkTransport.requestWithRoutes`, used by
`BrowserSession` and the original `loadBrowserDocument` resource callbacks.
Each response uses the original status, URL, redirect list, decoded body and
header values. Encoded bytes are zero for this mock replay, not the historical
wire size. No parallel renderer, alternate fetch client or HTML repair is used.

- Current URL: `https://www.libpng.org/pub/png/`.
- Title before/after: **PNG (Portable Network Graphics) Home Site**.
- Current DOM: **1172 nodes**, root `e1`, revision **1197**;
  identical document object before/after. History stays length **1**, index **0**,
  key `h1-1`, retained URL bytes **39**.
- Serialized DOM before and after: **33066 bytes** each;
  SHA256 `266b3357fdfad8deeba08c187ceaf3c62f4794e3267bd072494d90254750afbe`. Serialization is a native observation,
  not substituted response HTML. Both complete observations are retained.
- Original Transitional doctype is unchanged; the native parser reports
  **quirks**, **windows-1252**, scripting **false**, with issues
  `{"nonconforming-doctype":1,"quirks-layout-not-implemented":1,"unmatched-end-tag":2}`.
- Inspected exactly **96 of 102 current-DOM anchors before deduplication**:
  9 eligible occurrences, 4 unique destinations. Selected actual current ref
  `e107`, text **FAQ**, original href
  `pngfaq.html#jpeg-logo`, with 3 eligible occurrences of that
  destination. No historical ref was used for discovery.
- Exactly one `session.click` targeted that ref. The native formatting guard
  rejected it before navigating. The FAQ has **no captured response**; this run
  never requested it, so replay-miss count is **0**, not proof of destination
  support. Any uncaptured request aborts instead of fetching or adding a mock.

## Strict counts and badge owner

| Observation | Count |
| --- | ---: |
| Explicit homepage navigations / committed documents / genuine clicks | 1 / 1 / 1 |
| Native adapter entries / native transport requests / mock responses | 23 / 23 / 23 |
| Native image callbacks / native image requests | 22 / 22 |
| Mock body bytes / mocked decoded bytes | 366824 / 366824 |
| Wire calls / wire responses / wire bytes / redirects | 0 / 0 / 0 / 0 |
| New attempted hosts / network-process guard attempts / replay misses | 0 / 0 / 0 |
| Page scripts / real SafeJS / cookies accepted | 0 / 0 / 0 |

The SourceForge badge is identified from **original captured attributes and the
current DOM**, not a hardcoded old ref. Its observed ref is
`e344`; width **80**, height **15**, border **0**, alt
`[primary site hosted by SourceForge]`, source
`http://sflogo.sourceforge.net/sflogo.php?group_id=32355&type=9`; parent href
`http://sourceforge.net/projects/png-mng`.

Its genuine image owner is **broken / policy-denied**, complete **true**,
natural dimensions **0 x 0**, **no decoded image**, and no captured response.
It never reaches an original-loader image fetch callback, adapter entry or
mock response. The original HTTP badge was policy-blocked before a request;
no response exists to invent. The formatting census retains its current ref
as `element-layout-not-supported`. This is **not a SourceForge remote-server
or codec verdict**. CSS width/height and border styles are recorded, not claimed
as a successfully laid-out rectangle. Loaded images elsewhere account for
2046524 decoded owner bytes before teardown; this
must not be misreported as decoded badge data.

## One bounded failure census

Raw CSS issues **{}**, applicable CSS issues **{}**, formatting CSS issues **{}**.
These are actual native metrics, not suppression and not universal CSS support.
The following **58 non-CSS guard occurrences across 5 types** remain:

| Guard type | Count |
| --- | ---: |
| html-presentation-hint-not-supported | 31 |
| html-table-presentation-hint-not-supported | 16 |
| display-layout-not-supported | 8 |
| inline-vertical-align-not-supported | 2 |
| element-layout-not-supported | 1 |

There are **9 deferred subtrees**: **8 display-layout-not-supported**, **1
element-layout-not-supported** (the badge). All 9 samples fit the unchanged
20-sample limit. Metrics: 1156 visited DOM nodes, 1124 boxes, 1077 formatting
nodes, 47 outside markers, 11728 text code units, 21559 work. The document
revision stays 1197. No sole-cause claim, extra click, forced URL, geometry
fallback, partial-layout rendering or capacity increase is made.

## Isolation, bounds and sampled teardown

Every preparation, preflight, replay and verification child runs under an
unconditional libseccomp **socket/socketpair** denial, also denying connect,
bind, listen, accept, socket message operations, ptrace, cross-process memory
and io_uring. No socket self-probes are executed. The replay additionally denies
JavaScript HTTP, HTTPS, HTTP2, DNS, net, TLS, datagrams, fetch, WebSocket, child
processes, native addons and real SafeJS; imports are confined to pinned
compiled modules and this lane's explicit harness files. Git is not run in a
sealed child. Successful socket use is prevented at the kernel boundary;
zero wire counts are native/guard instrumentation, **not a packet capture or a
syscall-attempt trace**.

Explicit environment, empty private HOME/TMP, DEVNULL stdin, no TTY and no
credentials, .env, password store, provider or device access. Supervisor limit
**45 seconds + 5 seconds kill grace**, **6 MiB per file/output** (the supervisor
uses a stricter combined-output cap), **16 MiB lane**, **64 MiB minimum free**.
Replay stdout **131852 bytes**, stderr **0**, no truncation,
signals or timeout. Snapshot native bounds remain exactly the captured values:
network 32 requests / 1 concurrent / 2 MiB response / 8 MiB total / 15s timeout;
session 1 tab / 2 navigations / 1 pending / 20s navigation timeout; minimum mock
interval 250ms; DOM 50000 nodes / depth 256 / 2000000 text units / 1024 changes;
formatting 50000 owned nodes and boxes / depth 256 / 1000000 text / 2000000 work.
Stylesheet and remaining limits are retained verbatim in the JSON artifacts.

Teardown is sampled immediately at **2026-09-12T10:23:32.605Z** and finally
at **2026-09-12T10:23:32.606Z**. Document nodes/text, image resources/decoded
bytes/active/queued/waiters, event listeners/dispatches, held controls, file
bytes, pending session loads and request queue activity are all zero; owners,
session and transport are closed, cleanup errors zero. The supervisor finds
the process group absent after exit. These are bounded actual samples, not a
long-duration retention or performance acceptance claim.

## Artifacts and read-only verification

Private 0700 lane: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-border-baseline-replay-september12`.
Primary evidence: `baseline12817/stdout.json`, `baseline12817/progress.jsonl`,
`baseline12817/native-dom.html`, `baseline12817/native-dom-after.html`,
`baseline12817/EXECUTION.json`, `PREFLIGHT.json`, `GIT-COMMANDS.json`,
`CHECKS.json`, `PREPARE-COPIES.json`, and unchanged byte copies in `archive/`.
Preparation and check stdout/stderr/receipts are retained. One offline
finalization check failed at 2026-09-12T10:28:57.442Z because it compared the
query-redacted image-inspection URL with the owner's unredacted currentSrc.
The original exit-1 receipt and 1831-byte stderr remain in `finish/`, with
the exact failed checker/finalizer source bytes archived. The checker now
validates that intentional diagnostic redaction separately. No native replay,
response, source, owner observation or failed evidence was rewritten.

The final seal covers this report and every lane artifact via
`ARTIFACTS.json`, `SEAL.json`, and `FINAL-RECEIPTS.sha256`.
Run from `/home/kjopek/project/agent-browser`:

`env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B node_modules/.cache/native-validation/native-libpng-border-baseline-replay-september12/offline.py verify`

The verifier performs **6 input-evidence groups plus
8 replay-invariant groups**, validates the complete ledger
and exact file set, and checks its lane content is unchanged. It is read-only,
socket/socketpair-denied, deadline-bound and does **not rerun the browser**.
The parent must independently run it before using this baseline.

Only this report and private lane are owned. No source, other root docs,
manifest, TASKS.md, staging, commit or push changes are authorized here.
Existing work and historical reports remain untouched. Full browser,
live-site, research/performance, provider/passkey/device, TTY, real SafeJS and
challenge-handling acceptance gates remain open.
