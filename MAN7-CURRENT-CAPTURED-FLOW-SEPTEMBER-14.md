# Current man7 captured flow — September 14, 2026

## Outcome: harness initialization failure, no site acceptance

**Exactly one authorized offline native check ran and failed before the initial
document committed.** The first failure is `AgentBrowserError`, code
`invalid-input`, at `initial-navigation`:

> Image owner is already configured

This is a worker-authored harness initialization defect, **not evidence of a
current man7 layout regression or a successful native man7 flow**. The harness
eagerly calls `documentImages(document)` in its `initializeDocument` callback.
The immutable native loader invokes that callback before configuring the same
owner with its image-fetch, content-security-policy and background options.
The second configuration correctly raises the retained error. Static inspection
of the already-pinned compiled modules confirms this order; no additional
browser execution was used to diagnose it.

The single-use lane and its launched framework files remain unchanged. No fix,
second session, replacement input, retry, forced click or direct destination
navigation followed. The historical date(1) layout blocker **was not retested**:
current link discovery, click, formatting inspection and cached diagnostics were
never reached. The user required preserving the final outcome, not expanding
scope.

The prepared verifier records **17 passed / 1 failed** checks. Its failed check
requires nonempty document, image, query and interaction owner observations.
There is no query owner observation because no document committed; the query
owner array is empty. Actual observed owners closed and settled, but the
prepared verifier's complete-owner-coverage assertion is not satisfied. This
failure is retained, not relabeled or repaired after execution. Conditional
checks on unreached click/diagnostic behavior and mock spacing do not establish
those behaviors: only one mock occurred, so there was no spacing interval.

## Authority, scope and immutable runtime

- Authority read first:
  `/dev/shm/agent-browser-multisite-september14/AUTHORITY.md`.
- Task: `/dev/shm/agent-browser-multisite-september14/MAN7-TASK.md`.
- New private mode-0700 lane:
  `/dev/shm/agent-browser-man7-current-september14/`.
- Only repository change owned by this worker: this new report.
- Runtime: `/dev/shm/agent-browser-opacity-september14/release01/snapshot/dist/`.
- Runtime commit: `39b55d996feb7af5320e3a1d575821743477b475`.
- HEAD at preflight, immediately before launch and verification:
  `cc2466ce6ce6fa4707c0cede7adef65cab4f09bf`. Its changes relative to the runtime
  commit are only `TASKS.md`,
  `WEBSITE-TEST-INVENTORY-SEPTEMBER-14-TWENTY-THIRD-UPDATE.md` and
  `WIKIPEDIA-OPACITY-DIAGNOSTICS-SEPTEMBER-14.md`.

The completed release audit, post-commit adoption receipt and native result hash
were verified, not rerun. The inherited native gate remains **23757 passed / 0
failed / 2 unchanged exclusions**, with 477 selected files and 476 strict roots.
Full inventory walks checked **2925 source files and 2200 compiled files** before
and after this check, with no extra files or changed bytes. No old runtime or
root dirty source was imported into the browser runtime.

| Runtime receipt | SHA-256 |
| --- | --- |
| Release audit | `735a820574fdffa0af4d0ecf8ded759f2a4c955aa37fe2550e518f441e766de5` |
| Source inventory | `d83227bad54ecaa20c738be4a899a1ca63f19049b6f3cb991ec5b283d6ef23cf` |
| Compiled inventory | `7bdeceba8cde54c2387f38c2527e3f3548019c1e13aab4c5c2aeba707bcf5bd9` |

Original optional-image receipt ledgers reverified **104 and 106 entries**;
original noscript replay ledgers reverified **74 and 75 entries**, before and
after. Historical `MAN7-OPTIONAL-IMAGE-FLOW.md` and `MAN7-NOSCRIPT-REPLAY.md`
remain unchanged, respectively SHA-256
`a9bba045d004300db19cd9441e49ccbb09329fd5862cbc11ae2fc8726cb66607` and
`5338c77c50fcfb5322fd43cc86802a1bd6057fec470b081310703eb48ccd3e82`.
Their original paths, runtimes, measurements and acceptance failures are not
reinterpreted as current validation.

`PROTECTED-WORKTREE.json` and verification hash **1478 existing source, script,
package and native-manifest files** without modifying them. Original captures,
historical reports, consumed lanes and shared docs were not changed. Parent
work remains separate. No commit or push was made.

## Captured bytes and actual execution

Original input directory, unchanged:
`node_modules/.cache/native-validation/native-man7-optional-image-september12/`.
Original receipt metadata was read before body use. All four decoded bodies and
encoded bodies were length/hash verified; original ordered header arrays
normalized to exactly the recorded ordered header entries. Gzip decoding of
encoded fixtures matched the stored decoded bytes, without HTML inspection by
another parser or browser. Exact fixture paths and all hashes are in
`CORPUS.json` in the new lane.

| Capture | Decoded bytes | Original received UTC | Served in current check |
| --- | ---: | --- | --- |
| `response-1.body`, ls(1) HTML | 17305 | `2026-09-12T02:09:54.286Z` | Once |
| `response-2.body`, root stylesheet | 4297 | `2026-09-12T02:09:54.625Z` | No |
| `response-3.body`, book-cover PNG | 15833 | `2026-09-12T02:09:55.016Z` | No |
| `response-4.body`, manual stylesheet | 2127 | `2026-09-12T02:09:55.341Z` | No |

The corpus totals **39562 decoded / 23256 historical encoded bytes**. Those
encoded bytes are old capture evidence, not current wire traffic. The native
`NodeNetworkTransport.requestWithRoutes` served only the first original HTTP
200 response, with unchanged headers and exactly **17305 decoded bytes**,
SHA-256 `f14b7f93b12bf3e2e32b1f88687c4053801d34baca4932ec4b409e24b7dde4cb`.
Returned status, URL, ordered header entries and decoded Buffer equality were
checked. Replay encoded bytes were zero.

| Current execution observation | Count/result |
| --- | --- |
| Native sessions / initial navigation calls | 1 / 1 |
| Committed documents | 0 |
| Explicit selector queries / inspected anchors / clicks | 0 / 0 / 0 |
| Explicit formatting inspections / cached diagnostic reads | 0 / 0 |
| Native adapter attempts / accepted captured responses | 1 / 1 |
| Original loader resource callbacks / optional image rejections | 0 / 0 |
| Destination requests / replay misses | 0 / 0 |
| Fresh wire requests / wire encoded bytes | 0 / 0 |
| JavaScript network guard / process guard / script attempts | 0 / 0 / 0 |

Initial URL: `https://man7.org/linux/man-pages/man1/ls.1.html`.
The optional cross-origin tracker denial policy was retained but never reached.
The archive still has no date(1) destination response; a destination acceptance
claim is unavailable independently of the initialization defect. No title,
rendered page, geometry, click actionability or current two-document flow was
validated.

## Time, guards and cleanup

- Supervisor UTC: `2026-09-14T14:09:09.169Z` to
  `2026-09-14T14:09:09.339Z` (170 ms).
- Child observation UTC: `2026-09-14T14:09:09.314Z` to
  `2026-09-14T14:09:09.325Z`.
- Child exit **1**; supervisor exit **1**; prepared verifier exit **1**.
- Child stdout **9143 bytes**, stderr **0 bytes**. No timeout, signal,
  output-cap violation, spawn error or stream error.

The CERN header-retest seccomp wrapper and JavaScript network guard were reused
byte-for-byte. Additional JS process/worker/dlopen guards were installed before
native runtime imports. The child observed Seccomp 2, NoNewPrivs 1 and no TTY.
The wrapper denies kernel socket/connect/send operations, io_uring and process
creation while allowing required Node threads. The invocation used a sanitized
seven-variable environment, private empty HOME/TMP, ignored stdin and piped
stdout/stderr. Limits were 30 seconds, five-second kill grace, 6-MiB combined
output, and a one-second/1002-sample owner-settlement bound. Original man7
network and session capacities were retained. No socket self-probe, SafeJS,
page script, external child process, live website or other browser was used.

Normal `session.close()` completed. Observed session, transport, request queue,
cookie/storage owners, document, image owner, events, file controls and mouse
closed with zero pending/active work and zero remaining document nodes. One
document close notification was observed. Settlement took
**0.3322339999999997 ms**, one sample, with identical action/request counters
before and after. Both private directories remained empty and were removed.
PID and process group **1663481** were absent at supervisor exit and independent
verification. No cleanup error was reported. Query-owner coverage remains
unproved, as explicitly recorded by the verifier failure; broader uninstrumented
owner cleanup is not claimed.

The initial preparation shell heredoc failed before Node ran because its
default temporary filesystem was full. Subsequent shell temporary files used
the authorized RAM lane. No browser attempt was consumed by that preparation
error and no existing files were removed to make space.

## Evidence and persistence

All artifact names below are relative to
`/dev/shm/agent-browser-man7-current-september14/`.

| Artifact | SHA-256 |
| --- | --- |
| `before-RESULT.json` | `39c4685ec335f0f69b226ae4608159194a72f97335f654e456ca13814beef724` |
| `before.jsonl` | `a72ff33c585051c40cf1d708ea5075b49ce7d3a8f35ad5449345fca1c5304336` |
| `before-EXECUTION.json` | `e29d604ea40315e93782b67bba2f94b0eeabbf756a82764d64c7d4d9e0d0f6dd` |
| `VERIFICATION.json` | `c160e86a0e145c5af3d3db53e46c4fb0c9db170a02198fd89263cef151281f71` |
| `PREFLIGHT.json` | `f643c22e43860834294b3d3662b5ce7b4cbdfd3afe390055da520a72626d0e7a` |
| `CORPUS.json` | `1e33f7924e48250825f80493ed251245a07f84ab0a88f0d2032aa84dfcfb9079` |

`before-RUN-ONCE.lock` and `WORKLOAD-ONCE.lock` retain single-use consumption.
`before-INTEGRITY.json`, the full before/after source/compiled ledgers,
`before-CLEANUP.json`, invocation/environment receipts, framework hashes and
original fixture inventories retain the scope and preservation evidence.
`EVIDENCE.sha256` and `SEAL.json` are generated only after run/verification output
streams close, including this report in the seal; no seal stdout is redirected
into the lane. Artifacts remain in RAM, without duplicate runtime/capture
archives, until parent persistence. A valid evidence seal does not erase the
harness failure, verifier failure or outstanding site-acceptance gates.
