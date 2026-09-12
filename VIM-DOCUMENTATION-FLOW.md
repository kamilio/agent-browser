# Fresh Vim documentation flow on committed 13226

## Outcome: stopped at the declared origin boundary

**The documentation flow did not pass.** One fresh native session attempted
the Vim homepage, received seven successful same-origin responses, and stopped
when the original native image loader requested an off-origin image:
`https://www.kuwasha.net/wp-content/uploads/2024/06/Kuwasha-Logo.svg`.

That eighth adapter entry was rejected **before native transport, DNS or wire
access for its target**. No additional origin was authorized, contacted or
counted. The exact first failure is `initial-navigation:network`,
`ERR_ASSERTION`: `Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance`.

There were **zero committed documents, zero inspected anchor occurrences and
zero clicks**. No current link was selected or fabricated. The requested
homepage URL was `https://www.vim.org/`; committed URL/title/history/
document identity, readable committed body and destination state are not
available and are not claimed. There was no fallback navigation or retry.

The first failure is the harness's predeclared same-origin admission boundary,
not a demonstrated width-layout failure, server restriction or browser crash.
One native formatting census sampled the still-retained partial document after
that stop. Its diagnostics do not replace the first-failure attribution.

Native UTC: **2026-09-12T12:04:19.388Z through 2026-09-12T12:04:22.079Z**.
Supervisor UTC: **2026-09-12T12:04:19.049Z through 2026-09-12T12:04:22.096Z**;
3.045907 seconds, exit **1**.
Exit one preserves the failed flow; successful evidence verification does not
turn it into a website pass.

## Pinned native release and immutable evidence

- Commit `fa49059b123243f1b220a8b198607a62c5dc4927`, pinned Node **22.22.0**, runtime only
  `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-html-background-color-september12-round00/snapshot01/dist`. No working-source execution.
- Verified **20 receipts, 1148 source files, 1964 compiled files, eight actual
  committed inputs and 11 Git objects**. Commit, root/src trees and eight blobs
  were read with local Git outside the kernel seal, then checked offline for
  object hashes, tree membership and exact snapshot bytes.
- Existing release results: **13226 passed, 0 failed, 2 unchanged exclusions**,
  253 selected suites, 252 strict roots, 647 manifest entries, 1140 unchanged
  tracked inputs. These are verified release receipts, not tests rerun here.
- Source SHA256: `9dfcd694f03843d14853dd74fb21fd394e4665e9e77f654a17f91dc1d6362e43`.
- Compiled SHA256: `b9e8be9c784221a44d0375b8b8ca2ce1e1f8dac47cbddc94245a41d95821319d`.
- Native result SHA256: `48dbf75b4bd46ee969d706cc5ba8f39c19cfdbadea6fce5c78b6a4b5106b7ab0`.
- Gate receipt SHA256: `2018a312829cafa38e2d8f2010c13d24fa11f8d1027639f49e30e52bb86744ff`.
- Contract SHA256, captured before network: `ee496a9e1adb1eb200ef82724f66facb8dfc6a2ccf3d6eac69ed0e6b446acba7`.
- Original Libpng live, 12817 baseline, 13042 replay, hint census and 13226
  replay ledgers all remain intact. The latest Libpng replay ledger remains
  `b27d3569e2ef837ce235901519391a36cf4055971cddd77a8e17365e71ea5257`.
  All five historical ledgers and complete release inventories are checked
  before/after this execution and by the read-only verifier.

## Predeclared execution boundary

`CONTRACT.md` and all execution harnesses were hashed before launch.
The sole allowed origin was **https://www.vim.org**, including every document,
redirect hop, stylesheet and image. Native `BrowserSession`,
`loadBrowserDocument`, original CSS/image callbacks and
`NodeNetworkTransport` were used without source rewriting, stylesheet
stripping, alternate clients, foreign browsers or mocks.

The bounds were 32 bodyless GETs, native concurrency one, minimum 250 ms
monotonic per-origin pacing checked at actual wire construction, 2 MiB each
encoded/decoded response, 8 MiB each encoded/decoded session total, native
deadlines, 45 seconds wall plus 5 seconds kill grace, 6 MiB combined output and
each file, 16 MiB private lane, and at least 64 MiB free. No cap was raised.

The native public DNS/address policy, HTTPS certificate validation and original
`AgentBrowser/0.1` identity remain in use. Cookies start empty and stay
empty; every native request explicitly omits credentials. HOME/TMP are private
0700 and empty, environment explicit, stdin DEVNULL, no TTY. Scripts, real
SafeJS, providers, devices, credentials, self-probes and protected
native-source-heading-source-10 payload access are absent.

Live seccomp denies listening/accept, ptrace, process-vm and io_uring, but does
not deny outbound sockets needed for authorized native networking. Egress is
restricted by native policy plus resource-provenance and exact-origin checks
before every native hop/wire call. The read-only verifier instead denies
socket/socketpair and all network syscalls unconditionally.

If the homepage had committed, the authorized policy would inspect at most 96
current-DOM anchors, check native availability before deduplication, and click
at most one visible same-origin documentation/help/about HTML candidate.
HTML/PHP/directory/extensionless URLs were only candidates; an actual
destination needed text/html MIME. Downloads, accounts, query actions, forms,
ping/download attributes and credentials were excluded. None of this selection
or click phase was reached. The first admission failure stopped the session.

## Exact traffic and host accounting

| Measurement | Actual |
| --- | ---: |
| Explicit homepage navigations / commits / link clicks | 1 / 0 / 0 |
| Adapter entries / request-start records | 8 / 8 |
| Admitted calls / native transport requests | 7 / 7 |
| Locally rejected adapter entries | 1 |
| HTTPS wire request constructions / responses | 7 / 7 |
| Redirect responses / followed redirects | 0 / 0 |
| Mocked requests | 0 |
| Encoded payload bytes / decoded body bytes | 96397 / 113897 |
| New observed wire-attempted hosts | 1 |
| Off-origin native/wire requests | 0 |

All seven responses are HTTP 200: one HTML document, one original external
stylesheet and five images. The first wire attempt was
`2026-09-12T12:04:19.508Z`. Only **www.vim.org** is
observed attempted. **www.kuwasha.net is an uncontacted, locally rejected
resource target**, not a new attempted host. The task supplied 82 previous
attempted hosts; adding this one new candidate would yield 83 in parent
bookkeeping, but no inventory or global count is edited or independently
recensused here. No origin alias is inferred from authorization alone.

Wire counts refer to original native HTTPS request construction and observed
responses, not TCP/TLS packet captures. Encoded bytes are HTTP payload before
native content decoding, not total packet/header traffic. Credentials-bearing
header pairs are excluded from retained headers; other raw header names and
values retain order and are checked against normalized headers.

| Response | Native URL | Status | Encoded bytes | Decoded bytes | Decoded SHA256 |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | `https://www.vim.org/` | 200 | 5265 | 19325 | `7d29be8639f61ec16097dbc2bf4872f9b6ea1dc8869b8675e80c718e8b070cf6` |
| 2 | `https://www.vim.org/css/style.css` | 200 | 1266 | 4706 | `3d2856068f0bdee83349dd5495827e65e876eb5d4244b57fbfa671815c9eb185` |
| 3 | `https://www.vim.org/images/spacer.gif` | 200 | 67 | 67 | `09d46019c7a75b96187202c3c8412182f27c413a9c3661857923dc8e94e91b7b` |
| 4 | `https://www.vim.org/images/sponsorvim.gif` | 200 | 3276 | 3276 | `4a65eff09cc1ce1b01ff0691703cf3581b353821928d3016d38277d7008a8e7f` |
| 5 | `https://www.vim.org/images/vim_header.gif` | 200 | 3061 | 3061 | `ee34ecd1c9b7fb052d98f74a051db4324dc5f2fd5dbe176fb12005c7157d8337` |
| 6 | `https://www.vim.org/images/buyhelplearn.gif` | 200 | 1687 | 1687 | `264c489485e406db1bd9a6bbdc8b3dc906fd0adb403f4938f4f0690036d62dd9` |
| 7 | `https://www.vim.org/images/vim_drill_small.JPG` | 200 | 81775 | 81775 | `adc46a4cfb1e47245a2d86e221f0b5d35f7e7f5c219140fca49f740230dce2ea` |

Every saved decoded body/metadata and encoded wire body/header file is hashed.
The read-only verifier reconstructs bounded decoded bodies from the retained
wire payload using the recorded content encoding. It issues no requests.

## One partial-document diagnostic census

After the admission stop, a still-retained native document permitted one
formatting build under original limits. No source is reparsed and no live
action is retried for this diagnostic. The inherited census scope string says
“after layout failure”; here that generic label is **not the failure cause**:
the authoritative first failure is the earlier off-origin admission rejection.

Native metrics: **893 visited DOM nodes**,
741 boxes, 732 formatting nodes,
15740 work units, **59 deferred subtrees**;
at most 20 deferred samples are retained. These are a partial loading-state
census, not used whole-page geometry, pixels, completed image state or proof
that a documentation click would have reached a particular guard.

| Non-CSS diagnostic occurrence class | Count |
| --- | ---: |
| html-presentation-hint-not-supported | 45 |
| html-table-presentation-hint-not-supported | 16 |
| display-layout-not-supported | 16 |
| element-layout-not-supported | 43 |
| inline-vertical-align-not-supported | 1 |
| table-column-layout-not-supported | 1 |

Non-CSS occurrence total: **122**.
Raw CSS: `{"unimplemented-or-invalid-css-value":26,"unimplemented-css-property":12}`; applicable CSS:
`{"unimplemented-or-invalid-css-value":10,"unimplemented-css-property":2}`. Formatting CSS:
`{"css:unimplemented-or-invalid-css-value":10,"css:unimplemented-css-property":2}`. Raw and applicable counts
are distinct and come from their actual native metrics; no issues are removed
or demoted. The 16 display-layout entries must not be called 16 missing table
algorithms: table-root entries are coordinator markers in the page path, while
independent hard guards retain their meaning. Deferred samples are bounded,
not an exhaustive per-element attribution census.

## Cleanup, failures and handoff

The session, native transport and request queue close with zero active/pending
work and zero cleanup errors. Actual sampled document nodes/text, mutation
collectors, inline declarations, event listeners/dispatches, image resources/
queue/waiters, file controls and mouse state are closed/empty. One actual owner
of each document/event/image/control class was instrumented; all corresponding
cleanup checks pass. Private HOME/TMP are empty and the child process group is
absent. Unobserved behavior is not claimed proved.

The failed scaffolding substitution check, before Git/native/network work,
remains documented in `INITIALIZATION-NOTE.md`. The one live flow's
failure, original stdout/stderr, first-stop trace, supervisor receipt and
captured response artifacts remain intact. No second setup launch of the native
browser, retry, additional origin, source patch or limit increase occurred.

Owned lane: `node_modules/.cache/native-validation/native-vim-flow-september12`. Key files: `live/stdout.json`,
`live/INVOCATION.json`, `live/EXECUTION.json`,
`progress.jsonl`, `RESULT.json`, `DIAGNOSTICS.json`,
`CHECKS.json`, `GIT-COMMANDS.json`, `PREFLIGHT.json`,
all response/wire bodies and metadata, and exact copied release/template inputs.

Report/artifacts are sealed via `ARTIFACTS.json`, `SEAL.json`
and `FINAL-RECEIPTS.sha256`. From the repository root, the parent can run:

`env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B node_modules/.cache/native-validation/native-vim-flow-september12/offline.py verify`

The read-only verifier checks **6 evidence groups plus
6 flow groups**, exact file sets/report hashes, immutable
historical ledgers and unchanged release source/compiled inventories. It denies
all native compiled imports, reruns no parse/session and performs zero network.
Independent parent verification is required before integration. No shared
source/docs/TASKS/manifest/inventory, historical reports, staging, commit or
push are changed. Full Vim documentation and entire-website support remain
unproved; provider/device/TTY/real SafeJS and other independent gates stay open.
