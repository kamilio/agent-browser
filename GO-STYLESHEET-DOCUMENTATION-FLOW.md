# Separate native Go stylesheet documentation flow on committed13446

## Outcome And Stop Limitation

**The documentation flow did not pass.** In this separately authorized run, the
homepage and two original-loader stylesheets returned 200, the homepage committed,
and one genuine current-ref documentation click was invoked. The click threw
`AgentBrowserError`, code `unsupported`, message
`Rich button content layout is not implemented`, before any destination request.
There was no fallback, second click, retry, source repair or further origin expansion.

**First-policy-denial-stop coverage is not proved.** Before the click, the native
loader had already reported **56 nonthrowing image `policy-denied` states**. The
reused harness retained those states but did not abort the session on them; it
stopped on the later thrown click failure. Therefore the rich-button exception is
the first **recorded top-level failure**, not the first native policy denial.
This limitation remains explicit rather than treating successful integrity checks
as certification of every first-restriction clause. Contract acceptance is not
claimed, and the run is not repeated to replace this evidence.

The original single-origin Go report and its sealed lane are unchanged. The
parent's prior verification at **2026-09-12T13:16:52.939Z** covered thirteen actual
Git objects, ten inputs and twelve read-only groups. That run stopped on the
excluded Google Fonts stylesheet; this new authorization changes only its
stylesheet-origin admission, not browser source or that historical result.

Supervisor UTC: **2026-09-12T13:21:04.756Z–2026-09-12T13:21:05.818Z**;
elapsed **1.060808565 seconds**, exit **1**, no signals, timeout or truncation.
Native report UTC: **2026-09-12T13:21:05.069Z–2026-09-12T13:21:05.802Z**.

## Scope And Committed Inputs

Only navigation origin **`https://go.dev`** was allowed, starting at
`https://go.dev/`. The additional origin **`https://fonts.googleapis.com`** was
admitted exclusively through the original document-loader stylesheet callback
from actual parsed Go source. The observed request used `text/css`,
`original-native-loader.fetchStylesheet`, source document `https://go.dev/`, and
was not a navigation, direct extra fetch, injected response or image request.
`fonts.gstatic.com` and all other origins were not admitted or contacted.

Runtime commit: `69d74cb23c591d760b8735dc11071406852dbe2d`, committed13446;
only `node_modules/.cache/native-validation/native-html-cell-padding-september12-round01/snapshot01/dist`.
Pinned Node: `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, `v22.22.0`,
SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
No working-tree source module or old runtime was executed.

Before/after checks verify **20 receipts, 1152 source files, 1968 compiled files
and ten actual committed inputs**. Thirteen actual Git objects—commit, root/src
trees and ten blobs—were captured by read-only local `git cat-file` outside the
kernel seal. Offline checks recompute object identities, tree membership and exact
snapshot-byte equality; the parent can independently verify the retained bytes.
Preflight completed **2026-09-12T13:20:58.158Z**; the live after-check completed
**2026-09-12T13:21:05.802Z**.

| Release evidence | SHA256 |
| --- | --- |
| Source inventory | `ef2bb7a84904358ffd86f543f4641aa44fed3fdddb1f22b0190e0018b9ced203` |
| Compiled inventory | `fcfa40d329a2b6b6742436067c21ce18c84dadaca9892d68e246d1aa2a19c4de` |
| Native results | `5e924500a241a4e77d19b83f36a3c09695f07cabcc78506cf99efa078f0cb163` |
| Gate receipts | `25fce8558e5accdf9be84d8b4e284cba4a2583069132b6b3af58ccd09da51128` |
| Commit verification | `1ad1e089708283fdedd58ee50714c66c336d4273ec0bfa75a6fc3596eb5be15c` |

The existing release gate remains **13446 passed / zero failed / two unchanged
exclusions**, 256 selected suites, 255 strict roots, 650 manifest entries and
1142 unchanged tracked inputs. This task did not rerun that gate or use it as
evidence of live acceptance. The original Go 141-entry ledger remains
`7cdfa8a75b516da560f742972489b3ca9b6c88b61d1f8cea024f1f44fc61b952`; the prior
libjpeg-turbo 136-entry ledger remains
`c99a77fecdfbab567e41cddefe0525541327b7415e87255e19c01e392d8b3f63`.
Both are checked before/after, including their report bytes.

## Requests And Origin Accounting

All three requests were bodyless native GETs with status **200**, no redirects,
mocks, credential headers, Retry-After or classified HTTP/header challenge.
Wire request/response UTC on **September 12, 2026**:

| Resource | Request UTC | Response UTC | Encoded bytes | Decoded bytes |
| --- | --- | --- | ---: | ---: |
| `https://go.dev/` | 13:21:05.171 | 13:21:05.257 | 12085 | 64185 |
| `https://fonts.googleapis.com/css?family=Material+Icons` | 13:21:05.308 | 13:21:05.332 | 292 | 475 |
| `https://go.dev/css/styles.css` | 13:21:05.422 | 13:21:05.505 | 26894 | 110436 |

| Origin | Adapter starts | Admitted | Rejected | Native hops | Wire requests/responses | Encoded/decoded bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `https://go.dev` | 2 | 2 | 0 | 2 | 2 / 2 | 38979 / 174621 |
| `https://fonts.googleapis.com` | 1 | 1 | 0 | 1 | 1 / 1 | 292 / 475 |
| Total | 3 | 3 | 0 | 3 | 3 / 3 | 39271 / 175096 |

Native transport metrics separately report **3 requests**; the per-origin native
column is observed transport-hop records, not a fabricated per-origin metric.
There are zero adapter rejections, redirect hops, image requests or mocks.
The two Go wire starts are **250.519269ms** apart on the monotonic clock; no
two-request interval was exercised on the stylesheet-only origin.

| Capture | Decoded SHA256 |
| --- | --- |
| `response-1.body` | `f51aad480881c9a70d80a22fce58d68097b8937fdffae658cffd18fd9ab3d818` |
| `response-2.body` | `07bd90fa08501eef587462beb0d267aef595c95292e002a30c5cd5a20b4af211` |
| `response-3.body` | `f7289e3cd8ef69a1fc3118e2e5979771f25bb9aef10c11a27b57b67c6d895472` |

| Encoded capture | SHA256 |
| --- | --- |
| `wire-1.body` | `572ef4c3a05bbc68f56893aa4c5538716fee9aefe45c07775e54d1835d3d57d3` |
| `wire-2.body` | `4cfa70c6f36a4a7bfbef9c5370a895f8947f179793b0e63701766d43f3273c45` |
| `wire-3.body` | `6bfb9ecd2a95bc2e17341c1fbc74f61e84aaeb25baceecfb76803c8427fc5115` |

All bodies were gzip encoded. Retained ordered raw-header strings exclude
credential header pairs; they are not a TLS/packet capture. Offline verification
normalizes headers and independently decompresses each encoded body to compare
native decoded bytes/hashes. The homepage matches the first run's body hash, but
this run has its own fresh native wire/response evidence and zero mocks/replays.

Both allowed origins were actually contacted; there are no allowed-only hosts.
**No new host is added by this run**: Go was already the 85th completed attempted
host from the first run, and Google Fonts already belonged to the 84-host
inventory. Neither is counted again. Parent integration of both reports and the
inventory remains separate; no shared inventory or TASKS file is edited here.

## Committed State And Actual Click

Homepage navigation committed at **2026-09-12T13:21:05.588Z**. Observed title:
**The Go Programming Language**; URL `https://go.dev/`; root `e1`; **1736 nodes**,
revision **1743**. History key `h1-1`, index **0**, length **1**, state null;
session history contains only that homepage. The bounded 12000-code-unit native
document-text/header/title classification returned no challenge. That text includes
unexecuted script text and is not a rendered-readable-text or pixel measurement.

The selector found **148** body anchor occurrences. Only the first **96** were
inspected, with native visibility/actionability and ancestor checks before URL
deduplication. There were **3 eligible occurrences / 3 unique destinations**:

| Zero-based occurrence | Current ref | Label | Destination |
| ---: | --- | --- | --- |
| **38, selected** | **`e445`** | **Go User Manual** | **`https://go.dev/doc`** |
| 41 | `e463` | Effective Go | `https://go.dev/doc/effective_go` |
| 49 | `e531` | Go project | `https://go.dev/help` |

The selected current anchor has original href `/doc`, target `_self`, displayed
and visible true, no native blocked reason, aria-disabled false, complete
12-level ancestor inspection, and no form ancestor. No ref or link was injected.
These preliminary checks are not proof that full click geometry succeeds.

`session.click` was invoked exactly once in `native-documentation-link-click`,
starting **2026-09-12T13:21:05.597Z** and throwing the rich-button guard at
**2026-09-12T13:21:05.612Z**. There is no successful click result or destination
request. Before/after URL, title, root, node count, revision, document identity,
history, session history, recorded scroll metrics and native request count remain
unchanged. One explicit navigation, one committed document, one attempted click;
destination URL/title/history/new-document/readable-body acceptance was not reached.

## Diagnostic And Resource Limitations

One retained-document formatting census at **2026-09-12T13:21:05.616Z** threw the
same `unsupported` / `Rich button content layout is not implemented` exception.
Revision **1743** was unchanged. No completed formatting census, deferred-sample
set, pixels, alternative layout or source-level sole-cause finding exists. This is
a native click/layout guard observation, not a server denial or whole-site verdict.

The original loader reports two external sheets, zero imports, **1063 rules**,
**2836 declarations**, **110939 code units**, and **283659 work**. Native CSS
diagnostics are retained without stripping or suppressing unsupported entries:

| CSS issue class | Raw | Applicable |
| --- | ---: | ---: |
| `unimplemented-css-at-rule` | 1 | 1 |
| `unimplemented-or-invalid-css-value` | 40 | 14 |
| `unimplemented-css-property` | 293 | 79 |
| `unimplemented-or-invalid-css-selector` | 8 | 8 |

At loader completion **2026-09-12T13:21:05.587Z**, all **56 image elements** already
had `policy-denied`, with **zero image requests**. Static inspection of the pinned
release shows the original loader enables its fail-closed image-CSP flag when
the document has a Content-Security-Policy header; the original image owner then
rejects with `Image CSP enforcement is not implemented`. The homepage has that
header. This explains the retained image-policy states without attributing them
to remote denials or silently calling the images rendered. No image callback was
invoked, no image source was stripped, and no image/font origin was expanded.

These nonthrowing image states preceded the click but were not escalated by the
reused live harness into its top-level stop. `POSTRUN-AUDIT.json` records this
first-native-policy-denial-stop gap separately from the later thrown failure.
The offline integrity verifier does **not** retroactively prove that stronger
stop condition. The later click failure remains evidence, not clean acceptance.

## Cleanup, Bounds And Verification

Session close and abort occurred; session, transport and request queue were closed
with zero active requests, pending loads, pending requests and cleanup errors.
One actual document, event owner, image owner and control owner were instrumented
and cleared/closed: zero nodes/text, mutation collectors, inline declarations,
listeners/dispatches, image resources/active/queued/waiters, files/bytes/controls,
and pressed mouse state. The image owner made no requests and proves only that
instrumented owner's cleanup, not successful image loading. No settlement wait
was needed. Initial/final cookie counts and accepted cookies were zero. Child
process group was absent after exit, and private HOME/TMPDIR remained empty.

Predeclared contract SHA256:
`6901fe1d010b1ac15305cb0dade956eb6376338de63453f5c1cdc3677520133f`.
Bounds: 32 bodyless GET, one concurrent, >=250ms per-origin monotonic pacing;
2MiB encoded/decoded per response, 8MiB encoded and decoded session totals;
45s wall +5s kill grace; 6MiB each file/combined output, 16MiB lane, >=64MiB free.
Deadline checks precede adapter, native hop and wire; original native capacities
remain unchanged. Live storage receipts record **5,812,224 allocated bytes** before
and **6,193,152** after child execution, with over 2.7GB free; the latter precedes
supervisor output serialization. The final seal records final lane storage rather
than replacing those original measurements.

Original native BrowserSession/loaders/transport only; native public-DNS/TLS and
`AgentBrowser/0.1` identity. Callback metadata records native requested credentials
`include`, but the adapter overrides every forwarded request to **omit** with a
fresh empty jar, and wire checks require absent cookie/auth headers. Scripts/real
SafeJS stayed off. Explicit environment, empty 0700 HOME/TMPDIR, stdin DEVNULL,
no TTY/PTY or selfprobes, zero core limit. Shell heredocs used lane-private TMPDIR;
no use of full shared `/tmp`. No alternate clients/engines, protected payloads,
providers/devices/credentials, identity rotation, CAPTCHA bypass or source edits.

Live seccomp denies listening/ptrace/process-vm/io_uring but permits native outbound
traffic. Origin/role/public-address/TLS admission is native policy plus harness
instrumentation, not an OS origin firewall. Offline checking additionally denies
socket/socketpair and related network syscalls, imports no page runtime, opens no
session, and does not rerun native parsing. Six release/preservation checks and
six flow-evidence groups validate retained observations; **flow and contract
acceptance remain false**, including the explicit policy-stop coverage gap.

Artifacts: `node_modules/.cache/native-validation/native-go-stylesheet-flow-september12`.
Direct evidence is `live/stdout.json`, `live/INVOCATION.json`, `live/EXECUTION.json`,
`progress.jsonl` and the six body captures/header metadata. `CHECKS.json`,
`RESULT.json`, `ORIGIN-ACCOUNTING.json`, `DIAGNOSTICS.json`, `POSTRUN-AUDIT.json`,
`REPORT-CLAIMS.json`, `ARTIFACTS.json`, `SEAL.json` and `FINAL-RECEIPTS.sha256`
retain the audit and seal. Failures remain preserved, never rewritten into passes.

Parent read-only verification from repository root, with no output redirected
into the sealed lane:

```sh
lane="$PWD/node_modules/.cache/native-validation/native-go-stylesheet-flow-september12"
env -i PATH=/usr/bin:/bin HOME="$lane/home" TMPDIR="$lane/tmp" \
  LANG=C.UTF-8 LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B "$lane/offline.py" verify
```

Only this report and the new lane are owned. No shared edits, commits or pushes.
Parent verification/integration remains separate. Full website, destination,
rendering, credential/provider/device/TTY/real-SafeJS/challenge gates remain open.
