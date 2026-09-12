# Man7 noscript captured-page replay — September 12, 2026

## Outcome and retained limitations

**Same-input noscript improvement measured; both native flows remain incomplete.**
Exactly two isolated native sessions ran, one per sealed runtime. The new
runtime removes the `noscript` deferred formatting entry, but the genuinely
discovered `date(1)` click still stops at the native layout guard. Neither run
requests or commits the destination. This is not a new live visit, successful
navigation, rendering acceptance, or evidence that the site works.

There is also a preserved harness qualification: one old-runtime mock interval
was **249.95732199999998 ms**, below the requested 250 ms by approximately
0.042678 ms. The single timer undershot; strict mock pacing is not fully proved.
No attempt or artifact was replaced, and no third session or retry ran.
`VERIFICATION.json` records **40 passed / 1 failed** offline checks, with this
pacing check the sole failure. A valid evidence seal does not erase that failure
or establish full contract acceptance.

Both children exited **1**, retaining the incomplete-flow outcome. No timeout,
signal, output truncation, storage-cap event, JavaScript network/process denial
attempt, or incomplete instrumented-owner cleanup was observed. Broader
uninstrumented cleanup remains unproved; the owner proof is scoped below.

## Scope and immutable inputs

Contract: `node_modules/.cache/native-validation/noscript-work-september12/MAN7-REPLAY-TASK.md`.
Only this new report and the new mode-0700 private lane were written:
`node_modules/.cache/native-validation/native-man7-noscript-replay-september12/`.
All filenames below without a directory are relative to that lane. No shared
source, `TASKS.md`, existing report, historical lane, commit, or push was changed
by this task. Parent-owned concurrent work is outside this report.

Historical source: `MAN7-OPTIONAL-IMAGE-FLOW.md` and
`node_modules/.cache/native-validation/native-man7-optional-image-september12/`.
Its report SHA-256 is
`a9bba045d004300db19cd9441e49ccbb09329fd5862cbc11ae2fc8726cb66607`.
Both historical receipt ledgers were independently checked before and after:
104 entries in `RECEIPTS.sha256`, 106 in `FINAL-RECEIPTS.sha256`.
The protected `native-source-heading-source-10` payloads were not read.

| Runtime | Commit | Sealed distribution under native-validation |
| --- | --- | --- |
| Old | `99108ab454de37e7b89786cc4b95388c7d56d0ea` | `native-float-document-september12-round03/snapshot01/dist` |
| New | `0ca889debf2e52abb6316a2ec661fcb5f0ccd529` | `native-noscript-september12-round01/snapshot01/dist` |

Node was pinned to
`/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, version `v22.22.0`.
`PREFLIGHT.json` records executable hashes, both complete source/compiled
inventories, gate receipts, audit and commit verification, and actual
commit-to-snapshot Buffer equality for 22 old and 12 new inputs. Full inventory
walks excluded no source files; compiled files were inventoried separately.

The new gate remains the historical **11599 passed / 0 failed / 2 excluded**
gate, with 208 selected suites, 207 strict roots, 602 manifest entries,
1094 source files, and 1928 compiled files. Both exclusions match the old gate:
the focus-provisioning-pressure host-object ceiling case and the
media-fallback-layout unsupported-display case. Neither the full gate nor the
build was rerun. Separate legacy grid failures and other browser acceptance
gates remain outside this replay.

| New-release artifact | SHA-256 |
| --- | --- |
| Source ledger | `a17003a374936ef07f7cb39ce2cf57d0ce739e0dbf865e935fad081347d14bb9` |
| Compiled ledger | `97dd82d475c52022e6602e066646d292244f9ff2fe45e66aaeb958fc1eb81570` |
| Native results | `167962524711b98fdfdf990dfe7bbc7c0f91884f74f0b986a2f741ec1088009a` |
| Summary | `a8a78594cae62d33b9b81286892041d2cff593f5affdfc3a5644bae6cc3db2fa` |
| Audit | `b5a923a2e2288c824cae8ad16043a03c75fe6f47adae5641658d8aa003c31bde` |
| Gate receipts, all 20 entries | `0f6c33e405eaf8b0a802f437ced6759d1aae6d3e4093c40e6b881f73ac171426` |
| Commit verification | `c763181e16823c82673c1b90f4676edb0f40588196b78c59f5952a5d00372ca7` |

The old release's 1091-source/1928-compiled inventories and 20 gate receipts
also reverified. Its source-ledger hash remains
`b2de339958a5568f598748f4a94dddd737df82fa0c188bb4b4d5d1fac294af10`;
compiled-ledger hash remains
`abab5b33a0984e56a5be422522fac6df52aa078cf7cd0fcef62d21ccfbc30ff2`.
`old/` and `new/` each retain full before/after source and compiled ledgers.

## Exact archive and mock transport

`BYTE-COPIES.json` records **40 exact Buffer copies**, including the historical
report, ledgers, original harness references, original stdout/progress, all four
encoded bodies, decoded bodies and metadata, and new release provenance.
Every copy has checked byte equality, length and SHA-256. Ordered raw header
arrays in the original stdout and progress agree; normalizing those arrays
reproduces all stored header values. No header pair was redacted in this capture.
Gzip decoding of the original encoded bodies reproduces the decoded bodies;
the PNG encoded/decoded bodies are identical. All original resources remain.

| Capture | Original resource | Encoded bytes | Decoded bytes | Original native receipt UTC |
| --- | --- | ---: | ---: | --- |
| 1 | `/linux/man-pages/man1/ls.1.html` | 5629 | 17305 | `2026-09-12T02:09:54.286Z` |
| 2 | `/style.css` | 1111 | 4297 | `2026-09-12T02:09:54.625Z` |
| 3 | `/tlpi/cover/TLPI-front-cover-vsmall.png` | 15833 | 15833 | `2026-09-12T02:09:55.016Z` |
| 4 | `/linux/man-pages/style.css` | 683 | 2127 | `2026-09-12T02:09:55.341Z` |

| Capture | Encoded SHA-256 | Decoded SHA-256 |
| --- | --- | --- |
| 1 | `9269b1df39d46949fe3c3a1fa61bc998340987a3c64d138748c173330b4ede32` | `f14b7f93b12bf3e2e32b1f88687c4053801d34baca4932ec4b409e24b7dde4cb` |
| 2 | `bd310106a8d9e571f1d611480cc2396387173684a8250dcc8503ab29dc3df4cd` | `89a03c73a6cda268fbe6802d620f03531830c4c1be798b299ad83b3ff7f237c2` |
| 3 | `800233e833dd9867a929037ef3edc86819cd605a5a8ffab94d1838e77cbfcda7` | `800233e833dd9867a929037ef3edc86819cd605a5a8ffab94d1838e77cbfcda7` |
| 4 | `165a75a1547984e917f407f04ae9b9764ea8799ed0214215d60db5991a8d3a61` | `62db619b02602156163bf01ada15d6c024ff8c87fc0c706b04cca9de2457c32d` |

Each session used unchanged native `BrowserSession`, `loadBrowserDocument`,
and `NodeNetworkTransport.requestWithRoutes`. The in-memory route returned
exact decoded Buffer copies, original status, URL, normalized headers and empty
redirect chains. Native returned bodies/headers were also equality-checked.
Routing accounts these as **four mocks**, not four fresh HTTP GETs. Per runtime:
five native adapter attempts, four mocks, one local image rejection,
39562 mocked decoded bytes, **zero wire bytes and zero new HTTP requests**.
The original archive contains 23256 encoded bytes; those are not replay wire
traffic. Mock `encodedBytes` is correctly zero, and elapsed times are fresh
mock timings, not original HTTP timings. Fresh network decoding was not tested.

The original loader callbacks and resource order matched between runtimes.
No response absent from the archive could fall back online. A discovered
destination request would throw distinct `ReplayMiss` / `replay-miss`, without
a synthesized destination response. That branch was not reached or tested by
an additional session: both clicks stopped before a destination attempt.

The original cross-origin tracker at
`https://c.statcounter.com/7422636/0/9b6714ff/1/` was rejected before native
transport admission, with `policy-denied`, without globally aborting navigation.
Its original DOM image `e710` remains broken, settled (`complete: true`), 0 × 0,
and not origin-clean. The cover `e688` remains complete, 114 × 150, origin-clean.
No image/CSS/DOM node was removed or rewritten. Native callbacks requested
credentials `include`; transport admission enforced `omit`, as in the original
capture. Cookie jars began and ended empty, with no credential headers.

## Current native inspection and differential

Both initial pages committed at the original **1280 × 720** viewport, default
light color scheme, with scripts disabled. Native document title is
`ls(1) - Linux manual page`, root `e1`, 722 nodes, revision 727, history length 1.
Native parser diagnostics retain `script-not-executed: 3`; no real SafeJS ran.
The old effective scripting flag is observed through `htmlParseInfo.scripting`;
the new flag is also observed through `htmlScriptingEnabled`. Both are false.

Committed native DOM shows `noscript` `e707` directly under body `e18`, beneath
html `e3` and document `e1`, with original child div `e708` parented to `e707`.
It remains connected, with native computed `display: inline`,
`visibility: visible`, `displayed: true`, `visible: true` in both runtimes.
These are DOM/style observations, not proof of final rendered visibility.

Native JSON extraction completed without a caught error and remained marked
partial. Its exact JSON serialization matches across runtimes, SHA-256
`ae6517eb830dc1f3e866ca666472a2b8f9cdf19d92353d1dd020370c7ab30f81`.
No HTML grep was used as browser inspection. Full extraction, style metrics,
DOM parentage, diagnostic census, and geometry outcomes remain in each stdout.

| Formatting observation | Old replay | New replay |
| --- | ---: | ---: |
| Visited DOM nodes | 697 | 700 |
| Formatting nodes/boxes | 706 | 712 |
| Text code units | 10490 | 10527 |
| Work | 16650 | 16736 |
| Deferred subtrees | 5 | 4 |
| `display-layout-not-supported` | 3 | 3 |
| `table-collapsed-borders-not-supported` | 5 | 5 |
| `element-layout-not-supported` | 2 | 1 |
| `css:unimplemented-or-invalid-css-value` | 3 | 3 |
| `css:unimplemented-css-property` | 1 | 1 |

This is the complete issue census, not a favorable sample. The old replay
exactly reproduces the historical formatting metrics and issue counts.
Its `noscript` entry is deferred for `element-layout-not-supported`.
The new census instead contains two native inline fragments for `e707`, with
`fragmentCount: 2`, and no deferred noscript entry. The independent deferred
tables `e27`, `e61`, `e649`, and fieldset `e105` remain, with unchanged reasons.
The five collapsed-border issues remain independently recorded.

Raw CSS issues remain 10 invalid/unimplemented values and 17 unimplemented
properties; applicable CSS issues remain 3 and 1 respectively. Both original
external sheets load: 80 rules, 204 declarations, 6424 code units. Neither raw
CSS issues nor independent formatting guards were suppressed. Census revisions
remain 727 before and after.

Both sessions genuinely rediscovered 64 `body a[href]` anchors, within the
96-anchor cap, using current native text, computed style and actionability.
The match used the historical `date(1)` text, `../man1/date.1.html` href and
resolved destination URL, **not a hardcoded reference identity**. Current
discovery happened to yield `e472`, occurrence index 17, visible/displayed,
without native blocking or aria-disabled state. Exactly one native
`session.click` used that discovered reference per runtime.

Both clicks raised `AgentBrowserError`, code `unsupported`:

> Document width resolution requires an issue-free supported formatting profile

One read-only native geometry observation per runtime also returned that guard.
No destination request, commit, usable rectangle, forced click, fallback layout,
or second action occurred. URL, title, root, node count, revision and both
histories remained unchanged after the failed click.

## New replay times, bounds and cleanup

Original native HTTP observation was `2026-09-12T02:09:53.946Z` through
`2026-09-12T02:09:55.378Z`; the original individual receipt times are above.
The following are new replay times, not rewritten historical receipt times:

| Run | Supervisor UTC start → finish | Native observation UTC start → finish |
| --- | --- | --- |
| Old | `2026-09-12T03:06:03.497Z` → `2026-09-12T03:06:04.416Z` | `2026-09-12T03:06:03.612Z` → `2026-09-12T03:06:04.408Z` |
| New | `2026-09-12T03:06:14.867Z` → `2026-09-12T03:06:15.784Z` | `2026-09-12T03:06:14.979Z` → `2026-09-12T03:06:15.776Z` |

Supervisor durations were 0.9183056131005287 s old and 0.9166801422834396 s new.
Stdout sizes were 101027 and 102627 bytes respectively; both stderr files are
empty. Each launch had a 45-second wall limit plus 5-second termination grace,
6-MiB file/combined-output cap, 16-MiB total-lane cap and 64-MiB minimum free
disk. Original browser/network/document/stylesheet/formatting capacities were
retained, without rebuilding or increasing them.

Observed old mock spacings were 250.17542300000002, 250.80851800000005,
249.95732199999998 ms; new spacings were 250.11949900000002, 250.867656,
250.00279899999998 ms. The old last interval fails the strict 250-ms check.
Native transport was still configured with the original 250-ms pacing;
these measurements are mock emissions, not wire starts. The adverse result
remains in progress, stdout, verification and this report.

Both executions used fresh private 0700 HOME/TMP directories, an explicit
seven-variable environment, ignored stdin, no TTY, closed inherited file
descriptors and separate process groups. OS seccomp denied socket creation,
socketpair, connect, bind/listen/accept, send/receive, ptrace/process-vm and
io_uring calls; children observed Seccomp 2 and NoNewPrivs 1. JavaScript guards
denied HTTP/HTTPS, sockets, DNS, HTTP2, fetch/WebSocket/EventSource, subprocesses,
worker/VM/inspector imports, external modules and native-addon/SafeJS loading.
No real socket self-probe, credentials, provider, device, challenge or bypass
was used. Kernel rule installation and child status were observed; syscall
self-testing was deliberately not performed or claimed.

Actual document, image, event and control owners were captured from original
session/loader initialization and callbacks, one of each per run. `session.close`
was called and final metrics observed: zero retained document nodes/text,
collectors, image resources/active/queued/waiters, listeners/dispatches, retained
files/bytes/controls, pressed buttons or busy mouse interaction. All instrumented
owners were closed. Native transport and session were closed, with zero active
requests, pending loads, queued work or cleanup errors. No settlement delay was
needed. HOME/TMP stayed empty. Both process groups were observed absent after
exit, without any cleanup signal. No incomplete cleanup was observed within
these scopes; system-wide or uninstrumented-owner cleanup remains unproved.

## Sealing and reproducibility

`old/` and `new/` preserve separate run-once locks, exact invocations/environment,
progress, stdout, stderr and process-group execution receipts. Their launched
harness hashes match exactly and remain unchanged. `PREFLIGHT.json`,
`BYTE-COPIES.json` and `VERIFICATION.json` retain all provenance and the
same-input comparison. Verification at `2026-09-12T03:08:57.265Z` recorded the
40 passing checks and single failed old mock-pacing check; it exited 1.

`SEAL.json` binds report claims to observations without changing the failure.
`ARTIFACTS.txt` lists every final file, including this report. Both full file
ledgers include this report and all evidence: `RECEIPTS.sha256` excludes only
the two ledgers, while `FINAL-RECEIPTS.sha256` additionally includes the first
ledger and excludes itself to avoid a self-hash cycle. Full inventories and
receipt checks do not constitute flow acceptance.

## Checkable claims

```json
{
  "classification": "noscript-improved-independent-layout-guards-remain",
  "flowPassed": false,
  "fullContractAcceptance": false,
  "nativeRuns": 2,
  "newHttpRequests": 0,
  "mocksPerRuntime": 4,
  "adapterAttemptsPerRuntime": 5,
  "localImageRejectionsPerRuntime": 1,
  "clickCallsPerRuntime": 1,
  "destinationRequests": 0,
  "replayMisses": 0,
  "oldDeferredSubtrees": 5,
  "newDeferredSubtrees": 4,
  "oldElementGuards": 2,
  "newElementGuards": 1,
  "archiveCopies": 40,
  "offlineChecksPassed": 40,
  "offlineChecksFailed": 1,
  "oldStrictMockPacingPassed": false,
  "newStrictMockPacingPassed": true,
  "instrumentedOwnerCleanupProved": true,
  "processGroupsAbsent": true,
  "retry": false
}
```
