# Fresh libjpeg-turbo documentation flow on committed 13226

## Outcome

The homepage committed and a genuine current-DOM documentation link was
clicked, but **the documentation flow did not pass**. The first native failure
was `unsupported` in `native-documentation-link-click`:

> Float integration with flex, grid and table reflow is not coordinated

No destination request, second navigation, fallback action or retry followed.
The same homepage document, URL/title/history/root/revision remain after the
failed click. This is a recorded native coordination guard, not an inferred
decoder error, server denial, whole-page render or entire-website verdict.

Native UTC: **2026-09-12T12:26:18.000Z through 2026-09-12T12:26:18.978Z**.
Supervisor UTC: **2026-09-12T12:26:17.669Z through 2026-09-12T12:26:18.995Z**;
1.324357 seconds, exit **1**.
Successful offline evidence checks do not reclassify that failed flow.

## Committed input and preservation proof

- Runtime commit `fa49059b123243f1b220a8b198607a62c5dc4927`, pinned Node **22.22.0**;
  `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-html-background-color-september12-round00/snapshot01/dist` only. No working modules.
- Verified **20 receipts, 1148 source files, 1964 compiled files, eight actual
  committed inputs and 11 Git objects** before/after. Real commit/root/src
  tree/eight-blob bytes were captured by read-only local Git outside the kernel
  seal, then verified inside for object hashes, tree membership and exact
  committed snapshot equality. Parent can independently check those bytes.
- Existing release: **13226 passed / 0 failed / 2 unchanged exclusions**,
  253 selected suites, 252 strict roots, 647 manifest entries, 1140 unchanged
  tracked inputs. No new native test suite was run by this website task.
- Source SHA256: `9dfcd694f03843d14853dd74fb21fd394e4665e9e77f654a17f91dc1d6362e43`.
- Compiled SHA256: `b9e8be9c784221a44d0375b8b8ca2ce1e1f8dac47cbddc94245a41d95821319d`.
- Native result SHA256: `48dbf75b4bd46ee969d706cc5ba8f39c19cfdbadea6fce5c78b6a4b5106b7ab0`.
- Gate receipt SHA256: `2018a312829cafa38e2d8f2010c13d24fa11f8d1027639f49e30e52bb86744ff`.
- Predeclared contract SHA256: `74f7fac4318acf1572bf3a86cefc17c46fc20ee2b65eddeb50fa3a21154372bf`.
- Six preserved final ledgers remain unchanged: original Libpng live, 12817
  baseline, 13042 replay, retained hint census, 13226 replay and Vim flow.
  Their complete referenced files and the full current release inventories
  are checked before/after and again by the read-only verifier.

All writes are confined to this new report and its private lane. Production
cellpadding work, shared docs/TASKS/manifest/inventory and all historical
reports/artifacts remain untouched. No staging, commit or push occurs here.

## Predeclared native execution boundary

One session and one tab start at **https://libjpeg-turbo.org/**. The only allowed
origins are **https://libjpeg-turbo.org** and **https://www.libjpeg-turbo.org**,
including native redirects and original CSS/image loading. No other origin
or alias is admitted. Only original `BrowserSession`,
`loadBrowserDocument`, CSS/image callbacks and
`NodeNetworkTransport` are used, with no foreign client/browser,
response mock, source rewriting or stylesheet stripping.

Limits: at most 32 bodyless GETs, native concurrency one, >=250 ms monotonic
spacing per origin with actual-wire and deadline rechecks, 2 MiB each encoded/
decoded response, 8 MiB each encoded/decoded session, native deadlines,
45 seconds wall plus 5 seconds kill grace, 6 MiB combined output/each file,
16 MiB private lane, at least 64 MiB free. Original native capacities stay fixed.

The native public DNS/address policy, HTTPS certificate verification and
`AgentBrowser/0.1` identity remain intact. Cookies are initially/finally
empty; every native request uses credentials omit. HOME/TMP are private 0700
and empty, environment explicit, stdin DEVNULL/no TTY. Scripts, real SafeJS,
providers, devices, credentials, self-probes, identity rotation, CAPTCHA bypass
and protected native-source-heading-source-10 payload access are absent.

Live seccomp denies listening/accept, ptrace, process-vm and io_uring while
allowing outbound sockets required by native networking. Exact-origin and
original-loader provenance checks plus native public-address/TLS policy bound
egress. All recorded wire requests pass those checks. Offline verification
instead denies socket/socketpair and related network syscalls unconditionally.

## Actual host and traffic accounting

Only **libjpeg-turbo.org** was observed attempted. **www.libjpeg-turbo.org was
allowed only, never attempted**; it is not counted as a second host. No redirect
occurred. The task supplied 83 prior attempted hosts; this candidate contributes
one observed new host, yielding 84 only if parent applies that bookkeeping.
No inventory is edited or independently recensused in this lane.

| Measurement | Actual |
| --- | ---: |
| Explicit homepage navigations / commits / genuine link clicks | 1 / 1 / 1 |
| Adapter entries / admitted calls / native transport requests | 3 / 3 / 3 |
| Wire request constructions / responses | 3 / 3 |
| Locally rejected adapter entries / mock requests | 0 / 0 |
| Redirect responses / followed redirects | 0 / 0 |
| Encoded payload bytes / decoded body bytes | 10690 / 30178 |
| Destination requests | 0 |
| Observed attempted hosts / allowed-only aliases | 1 / 1 |

All three responses are HTTP 200: one HTML homepage and two original external
CSS resources; there are no image responses. The first wire construction was
`2026-09-12T12:26:18.037Z`. A lack of image response is
not a decoder verdict. Wire instrumentation observes native HTTPS calls and
HTTP payloads, not TCP/TLS packets or header-inclusive transfer size.

| Response | Native URL | Status | Encoded bytes | Decoded bytes | Decoded SHA256 |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | `https://libjpeg-turbo.org/` | 200 | 5050 | 14637 | `ba1b22a8f366bc082c7045f7a823f0434ce12b5afb62166cea4eaec6f876d32d` |
| 2 | `https://libjpeg-turbo.org/pmwiki/pub/lib/pmwiki-core.css` | 200 | 3609 | 10554 | `a95f735892db4e9bfa3a73677f1603e6ed9a87fd55c3d43b15277086e1bf045c` |
| 3 | `https://libjpeg-turbo.org/pmwiki/pub/skins/vgl/pmwiki.css` | 200 | 2031 | 4987 | `9a4c329a6770a371792a1f843279204182d951458a5b171319eae0a922120956` |

Exact native decoded bodies/metadata and encoded wire bodies/headers are
retained and hashed. Non-credential raw header pairs preserve original order;
credential header pairs are excluded. Read-only checks normalize headers and
reconstruct bounded decoded payloads using their original content encodings.

## Committed page and current documentation click

Committed URL: `https://libjpeg-turbo.org/`.
Title: `libjpeg-turbo | Main / libjpeg-turbo`. Root `e1`,
**475 nodes**, revision **478**;
history length **1**, index **0**.
Native title/body nonempty checks and bounded content classification completed.
The recorded title/text/status/headers classifier found no homepage barrier.

The current `body a[href]` query found **49 occurrences**; all **49**
were inspected within the predeclared 96 cap, before deduplication. Native
availability checks yielded **16 eligible occurrences / 14 unique destinations**.
Selection did not mutate document revision/history. The chosen current ref
was **`e124`**, occurrence index **11**:

- Visible text: `Official Binaries: Supported Platforms and Other Notes`.
- Native href/resolved URL: `https://libjpeg-turbo.org/Documentation/OfficialBinaries`.
- Target `_self`, displayed/visible, not blocked or
  aria-disabled, complete ancestry depth 10.
- Eligible occurrence count for that URL: 1.

The selected path is a documentation candidate describing supported platforms
and notes, not a binary/download request. No download/release/account/form/action
endpoint was requested. Actual destination MIME/title/content remain unverified:
the genuine `session.click` hit the quoted native guard before fetching
that destination. The report does not substitute a forced navigation or another
link. Post-failure URL/title/root/node count/revision/history/document identity
and native request count match the before-click state; scroll builds remain zero.

## One bounded failure census

One formatting build sampled the retained homepage after the first click
failure, under original limits; no source reparse, extra click or fallback
layout was performed. Metrics: **451 visited DOM
nodes**, 468 boxes, 468 formatting nodes,
7627 work units and **4 deferred subtrees**.
The bounded deferred sample cap stays 20. These are diagnostic structure and
style observations, not used whole-page geometry or pixels.

| Non-CSS diagnostic occurrence class | Count |
| --- | ---: |
| positioned-layout-requires-coordination | 1 |
| html-presentation-hint-not-supported | 5 |
| html-table-presentation-hint-not-supported | 1 |
| display-layout-not-supported | 2 |
| float-layout-not-supported | 1 |
| element-layout-not-supported | 2 |

Non-CSS total: **12**.
Raw CSS `{"unimplemented-css-property":54,"unimplemented-or-invalid-css-value":9,"unimplemented-or-invalid-css-selector":14}`; applicable CSS
`{"unimplemented-or-invalid-css-selector":14,"unimplemented-css-property":19,"unimplemented-or-invalid-css-value":6}`; formatting CSS
`{"css:unimplemented-or-invalid-css-selector":14,"css:unimplemented-css-property":19,"css:unimplemented-or-invalid-css-value":6}`. Raw CSS totals **77** and
applicable/formatting CSS totals **39** remain distinct. No diagnostic is
suppressed or demoted. Coexisting issues are not asserted to be the sole cause
of this click failure. Table-root display markers require page-coordinator
qualification; they do not prove missing table algorithms. No CSS-selector,
decoder or production-cellpadding root cause is inferred beyond the recorded
first native float/reflow coordination error.

## Cleanup and independent handoff

The session, transport and request queue close with zero active/pending work
and zero cleanup errors. Actual document nodes/text, mutation collectors,
inline declarations, event listeners/dispatches, image resources/queue/waiters,
file controls and mouse state are empty/closed. One actual document/event/image/
control owner of each class is instrumented and all corresponding cleanup
checks pass. The child process group is absent; private HOME/TMP remain empty.
Unobserved owners or independent acceptance gates are not claimed proved.

This lane has one preparation, one preflight and **one live launch**. Preparation
and syntax checks succeeded. The failed live click, original stdout/stderr,
first-stop trace, current refs, response bodies and all supervisor records are
preserved. There are no retries or failed-setup replacements in this lane.

Lane: `node_modules/.cache/native-validation/native-libjpeg-turbo-flow-september12`. Key artifacts: `live/stdout.json`,
`live/INVOCATION.json`, `live/EXECUTION.json`,
`progress.jsonl`, `RESULT.json`, `DIAGNOSTICS.json`,
`CHECKS.json`, `GIT-COMMANDS.json`, `PREFLIGHT.json`,
all response/wire files and exact copied source-release/template evidence.
Report/artifacts are sealed through `ARTIFACTS.json`, `SEAL.json`
and `FINAL-RECEIPTS.sha256`. From the repository root:

`env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B node_modules/.cache/native-validation/native-libjpeg-turbo-flow-september12/offline.py verify`

The read-only verifier checks **6 evidence groups plus
6 flow groups**, exact file sets/report hashes, six immutable
historical ledgers and current release inventories. All compiled native imports
are prohibited in verifier mode; no parse/session/network is rerun. Parent
must independently verify before integration. Documentation/entire-website,
successful research, provider/passkey/device/TTY/real SafeJS and other separate
acceptance gates are not claimed from this flow.
