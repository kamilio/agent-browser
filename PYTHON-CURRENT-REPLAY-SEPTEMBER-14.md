# Captured Python current-runtime interaction — September 14, 2026

## Verified outcome

**PASS for the bounded offline homepage-to-Tutorial/content flow.** A fresh
native-browser observation on committed runtime `565aa1e` ran from
`2026-09-14T09:12:45.758Z` to `2026-09-14T09:12:47.025Z`. This is a new execution
against existing captures, not fresh live browsing or whole-site acceptance.

The browser loads `https://docs.python.org/3/`, discovers the unique Tutorial
link among 96 native `a[href]` matches, and performs one ordinary
`BrowserSession.click`. Normal internal geometry and hit testing are not
bypassed. The discovered reference is `e375`; the click returns document
navigation to `https://docs.python.org/3/tutorial/index.html`, document `e879`.
References are rediscovered rather than hard-coded, even though they match the
previous execution. The click position also remains unchanged.

The destination replaces the homepage; the old document already has zero nodes.
Its title is `The Python Tutorial — Python 3.14.7 documentation`; the single
native `h1` match, `e1181`, is `The Python Tutorial¶`. These are captured page
strings, not a claim about the latest Python release. Content, navigation,
replacement and complete-flow checks all pass; no denied request, direct
destination navigation, fallback, retry or partial-flow acceptance is involved.

## Scope and comparison

The baseline is the actual two-page run at 04:41 UTC on runtime `23e988d`,
documented in `PYTHON-TWO-PAGE-REPLAY.md`, not its earlier missing-destination
failure. All 49 entries in that lane's evidence ledger rehash unchanged.

| Observation | Previous and current |
| --- | --- |
| Original September 11/13 corpus | 9 resources; 109,017 unique decoded bytes |
| Accepted responses | 16; 161,647 served decoded bytes; zero denials |
| Document phases | Homepage once, Tutorial once; seven shared assets once per phase |
| Explicit browser work | One homepage navigation, one discovered click, two native queries |
| Wire requests / redirects / scripts | 0 / 0 / 0 |
| Loaded document nodes | Homepage 853; Tutorial 1,246 |
| Native query work | Link discovery 2,966; heading lookup 4,013 |
| Bounded label traversal | 196 work; 1,694 text units |
| Raw stylesheet issue occurrences, each phase | 22 unsupported properties; 5 invalid/unsupported values |

Both phases retain identical scalar stylesheet metrics: one cascade build,
five external sheets, one imported sheet; homepage 584 rules/1,075 declarations/
51,430 code units/95,032 work, Tutorial 577/1,062/50,813/200,893. These loader-time
metrics and issue counters are not a full formatting audit. No new diagnostic
scan, raster probe, destination action or additional chapter navigation runs.
The ordinary click does use the browser's internal geometry implementation.

The adapter permits only the original URLs, statuses, headers and body hashes.
Each document is allowed once; each shared asset once per phase/twice total.
Bounds remain 17 attempts, 16 accepted responses and 262,144 served decoded bytes;
the first violation aborts. No missing asset or destination is silently fetched.
Only the native browser interprets captured HTML/CSS.

## Runtime, verification and containment

Runtime: `565aa1ef23c6cb5621fdda7813ad5bfed66a7cb1`, from
`/dev/shm/agent-browser-logical-block-september14/release01/snapshot01/dist`.
Documentation HEAD at binding: `3f0b3be33ac5290945bcc637965db49892d3b98a`.
The dirty working tree is not the runtime. Final selected native gate:
**22,926 passed, zero failed, two unchanged exclusions**, 452 selected files,
451 strict roots, 804 clean manifest entries. Its 155 receipts and exact
1,360-source/2,184-compiled inventories are rehashed, not rerun for this check.

The original supervisor, fixtures, preparation runner and kernel/JavaScript
guards are byte-identical. The workload changes only its runtime provenance
label. The fresh binding, audit and result verifier pin the current build.
All 22 verifier checks and the independent parent outcome checks pass.

Supervised execution is `09:12:45.629`–`09:12:47.044` UTC, exit 0, process group
`1466201` subsequently absent. The 30-second deadline/5-second grace,
35-second watchdog, 10 MiB output and file-size bounds remain unchanged.
Output is 36,415 bytes; no cap, watchdog, stream, spawn, integrity or cleanup
failure occurs. Private HOME/TMP start empty and are removed empty; both
documents and all session/transport/query/image owners close cleanly.

Recorded JavaScript network/process attempts are empty. The kernel restrictions
remain active, but denied-syscall telemetry is not collected; empty JavaScript
arrays are not a measurement of zero kernel denials. This is scoped offline
execution, not a separate socket, SafeJS, credential, device or terminal probe.

One-run measurements: 1.267 seconds native observation; 1.41 seconds command
wall time, 2.56/0.10 seconds user/system CPU, peak RSS 215,308 KiB. They are not
a controlled benchmark or evidence of speed/memory improvement.

## Evidence and remaining work

Original lane: `/dev/shm/agent-browser-python-current-september14/`.
Durable-copy target: `node_modules/.cache/native-validation/python-current-replay-september14/`.
Copying evidence preserves original embedded paths and does not create another
execution. `PERSISTENCE.json` and the copy's `FINAL-EVIDENCE.sha256` record the
completed copy; historical artifacts and native-gate evidence remain unchanged.

| Original artifact | SHA256 |
| --- | --- |
| `before-RESULT.json` | `f7b41fec1f44f91e46e13ed1f20000b033963a485299e28deb8f9fc4d8f9c34f` |
| `VERIFICATION.json` | `9c69686ae8afde8e15c7dd265839934a29fdb36dda618db6e8c655e4ae681500` |
| `PARENT-VERIFICATION.json` | `1130ac72e240ee609486c754d9115e9591a87d6b1143cfe764604c545335cddf` |
| `EVIDENCE.sha256`, 42 core entries | `647bdea0c7314dc47a05fecb4db8cd0200a521020878ce09d367444b0d23d342` |
| `PREPARED.sha256`, 12 framework entries | `f4f29f4e45efe3db3dbf8c06606f25bf9cd800164181433b609abf105c78db59` |
| `RELEASE.json` | `1737ef269ffb11958c9925db93b36de10e7c0b09fe7d83d0f4bcf7c011c23acb` |

This confirms that the bounded Python interaction still works after the newer
CSS changes; it does not close remaining rendering or site-compatibility gaps.
Next: implement observed inline logical-spacing/unit behavior with native
regressions before a separately scoped captured-site recheck. Wikipedia's
geometry failure, MDN's uncaptured destination, broader live sites/forms,
original research, credential/provider/passkey/device, SafeJS, socket/real
terminal and challenge gates remain open. Overall goal active; nothing pushed.
