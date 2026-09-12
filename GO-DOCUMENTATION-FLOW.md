# Bounded native Go documentation flow on committed13446

## Outcome

**The live documentation flow did not pass.** One native homepage GET returned
200, but the original document loader discovered an off-origin stylesheet and
the predeclared single-origin admission boundary stopped loading before commit.
This is an authorization-boundary stop, not a server restriction or a demonstrated
browser layout defect. No origin expansion, stripping, fallback or retry occurred.

- Start URL: `https://go.dev/`; only origin `https://go.dev` was allowed.
- Denied stylesheet: `https://fonts.googleapis.com/css?family=Material+Icons`.
- First failure at **2026-09-12T13:08:35.401Z**, stage
  `initial-navigation:network`, `AssertionError`, code `ERR_ASSERTION`:
  `Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance`.
- That stylesheet was rejected at the adapter before native transport or wire
  execution. **No Google Fonts host attempt is counted.**
- The caller then observed `AgentBrowserError`, code `aborted`, message
  `Navigation aborted`. This does not replace the retained first failure.
- One navigation call, **zero committed documents, zero inspected anchor
  occurrences, zero selected refs, zero clicks, zero destination requests**.
  URL/title/history/document-identity/readable-text destination gates were not
  reached; no destination or homepage interaction success is claimed.

Supervisor UTC: **2026-09-12T13:08:34.978Z–2026-09-12T13:08:35.673Z**;
elapsed **0.694517158 seconds**, exit **1**, no timeout, truncation or signal.
Native report UTC: **2026-09-12T13:08:35.278Z–2026-09-12T13:08:35.658Z**.
The supervisor interval also covers runtime loading and before/after evidence
checks. A successful offline evidence check is not a successful live flow.

## Committed Inputs

Only commit `69d74cb23c591d760b8735dc11071406852dbe2d`, committed13446, was used:
`node_modules/.cache/native-validation/native-html-cell-padding-september12-round01/snapshot01/dist`.
Pinned runtime: `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, version
`v22.22.0`, SHA256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
No working-tree source module was imported.

Before and after the live attempt, verification covered **20 release receipts,
1152 source files, 1968 compiled files and ten actual committed inputs**. Thirteen
actual Git objects—commit, root tree, src tree and ten blobs—were captured by
read-only local `git cat-file` outside the kernel seal. The evidence checker
recomputed Git object identities, checked tree membership and byte-for-byte
snapshot equality under the offline kernel seal. The parent can independently
verify those retained bytes without trusting Git command summaries alone.

| Release evidence | SHA256 |
| --- | --- |
| Source inventory | `ef2bb7a84904358ffd86f543f4641aa44fed3fdddb1f22b0190e0018b9ced203` |
| Compiled inventory | `fcfa40d329a2b6b6742436067c21ce18c84dadaca9892d68e246d1aa2a19c4de` |
| Native test result | `5e924500a241a4e77d19b83f36a3c09695f07cabcc78506cf99efa078f0cb163` |
| Gate receipt ledger | `25fce8558e5accdf9be84d8b4e284cba4a2583069132b6b3af58ccd09da51128` |
| Commit verification | `1ad1e089708283fdedd58ee50714c66c336d4273ec0bfa75a6fc3596eb5be15c` |

The existing release gate is **13446 passed / zero failed / two unchanged
exclusions**, 256 selected suites, 255 strict roots, 650 manifest entries and
1142 unchanged tracked inputs. This lane did not rerun that native test gate or
reinterpret it as live acceptance. Preflight completed at
**2026-09-12T13:08:28.579Z**; live after-check at
**2026-09-12T13:08:35.658Z**. Six evidence checks pass in each.

The prior `native-libjpeg-turbo-flow-september12` framework was copied only into
the new private lane, adapted to committed13446 and exactly one allowed origin.
Its historical 136-entry ledger remains unchanged, SHA256
`c99a77fecdfbab567e41cddefe0525541327b7415e87255e19c01e392d8b3f63`.
The old runtime was not executed. Original template bytes, task, release,
AGENTS instructions and release receipts are retained in the new lane's archive.

## Native Request Evidence

The single bodyless GET was constructed at **2026-09-12T13:08:35.290Z**,
received HTTP 200 headers at **13:08:35.354Z**, completed its encoded body at
**13:08:35.358Z**, and closed at **13:08:35.359Z**, all on September 12, 2026 UTC.
Response type was `text/html; charset=utf-8`, encoding `gzip`.

| Measurement | Observed |
| --- | ---: |
| BrowserSession instances / explicit navigation calls | 1 / 1 |
| Adapter entries / recorded request-start events | 2 / 2 |
| Admitted adapter requests / rejected adapter entries | 1 / 1 |
| Native transport requests / wire request calls / wire responses | 1 / 1 / 1 |
| Redirect responses / followed redirects / mocks | 0 / 0 / 0 |
| Encoded payload bytes / native decoded bytes | 12085 / 64185 |
| Successful stylesheet or image requests | 0 / 0 |
| Commits / inspected anchors / current refs chosen / clicks | 0 / 0 / 0 / 0 |

The legacy `accounting.nativeRequestAttempts` field is **2** because it counts
adapter `request-start` records, including the locally rejected stylesheet.
The actual native transport and wire counts are **1**, not 2. No host count is
derived from that ambiguous legacy field or from merely discovered URLs.

- Encoded body SHA256:
  `572ef4c3a05bbc68f56893aa4c5538716fee9aefe45c07775e54d1835d3d57d3`.
- Decoded body SHA256:
  `f51aad480881c9a70d80a22fce58d68097b8937fdffae658cffd18fd9ab3d818`.
- Retained `wire-1.body` is the original encoded HTTP payload, not a TLS/packet
  capture. `wire-1.headers.json` preserves ordered raw header strings and
  normalized headers with credential header pairs excluded.
- `response-1.body` and its metadata preserve the native decoded response.
  Offline verification independently decompresses the encoded capture and
  compares its bytes and hashes with the native response.
- HTTP/header challenge classification returned null and no Retry-After was
  observed. Committed-page text classification was not reached; no broader
  absence-of-challenge claim is made.

**Observed attempted host set: `go.dev` only.** No allowed-only alias exists.
The published inventory remains 83; the completed pending fifteenth update has
84 attempted hosts, with Go absent from both per the task. This attempt adds one
new observed host: 85 only if the parent integrates it after the pending 84-host
inventory. No shared inventory, index or TASKS file is edited here.

## Diagnostic And Cleanup

One bounded retained-document formatting census was attempted at
**2026-09-12T13:08:35.430Z**, after the recorded admission stop. It failed with
`AgentBrowserError`, code `unsupported`, message
`Rich button content layout is not implemented`. The partial document revision
remained **1741** before and after. No completed census, deferred sample list,
layout/pixel result or sole-cause finding exists. This separate diagnostic guard
does not turn the earlier authorization stop into a browser layout defect.
There was no second census, source modification, reparse or interaction retry.

Session close and abort were called. After a requested 50ms settlement
(**50.884345ms** observed), transport, session and request queue were closed with
zero active requests, pending loads, queued requests and cleanup errors. The
one instrumented document, event owner and control owner were cleared/closed;
remaining nodes/text, listeners/dispatches, mutation collectors, inline
declarations, files/bytes/controls and pressed mouse state were zero. Initial
and final cookie counts and accepted cookies were zero.

**No image owner was instrumented** because loading stopped earlier; image-owner
cleanup is explicitly unproved, not inferred from an empty sample. The process
group was absent after exit without termination signals, and private HOME/TMPDIR
remained empty. The live storage receipts record 5,754,880 allocated bytes before
and 5,857,280 after child execution, with over 2.7GB free; the after figure precedes
supervisor output serialization. Final lane storage is recorded by the seal and
read-only verifier, not substituted for the original live measurements.

## Contract And Verification

Predeclared `CONTRACT.md` SHA256:
`1ee34e931f0ecc6900cd4040e660148714eb3849780e9c2855d0aff8d13ad968`.
Limits: 32 bodyless GET, concurrency one, >=250ms per-origin monotonic spacing;
2MiB encoded/decoded per response, 8MiB encoded and decoded session totals;
45s wall plus 5s kill grace; 6MiB each file/combined output, 16MiB lane and >=64MiB
free. Deadline checks occur before adapter, transport hop and wire. Only one
request reached the wire, so spacing between two requests was not exercised.
Original native document/CSS/image/formatting capacities remained unchanged.

The original BrowserSession document/CSS/image loaders and native transport were
used with public-address/TLS checks, native `AgentBrowser/0.1` identity, fresh
cookies and credentials omit. Explicit environment, empty 0700 HOME/TMPDIR,
stdin DEVNULL, no TTY/PTY, core limit zero. Shell heredocs used lane-private TMPDIR
because shared `/tmp` was full. Scripts/real SafeJS, alternate HTTP clients,
foreign engines, network selfprobes, subprocesses from the live runtime,
identity rotation, credentials/providers/devices and protected payload access
were not used. No source stripping, cap increase or extra session followed failure.

Live seccomp allows outbound traffic needed by the native transport and denies
listening/ptrace/process-vm/io_uring. The single-origin/public-address/TLS boundary
is native policy plus harness admission, not an OS origin firewall. Offline
verification additionally denies socket/socketpair and related network syscalls;
it does not import the native page runtime, open a session or rerun native parsing.

Private lane:
`node_modules/.cache/native-validation/native-go-flow-september12`.
`CHECKS.json`, `RESULT.json`, `DIAGNOSTICS.json`, `REPORT-CLAIMS.json`,
`ARTIFACTS.json`, `SEAL.json` and `FINAL-RECEIPTS.sha256` retain the summary and
seal. `live/stdout.json`, `live/EXECUTION.json`, `live/INVOCATION.json`,
`progress.jsonl` and original body/header captures remain the direct evidence.
All setup/check failures, if any, stay retained; the failed live attempt and
failed diagnostic are not overwritten or relabeled as a pass.

From repository root, the parent can run this **read-only, no-network** verifier
without redirecting output into the sealed lane:

```sh
lane="$PWD/node_modules/.cache/native-validation/native-go-flow-september12"
env -i PATH=/usr/bin:/bin HOME="$lane/home" TMPDIR="$lane/tmp" \
  LANG=C.UTF-8 LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B "$lane/offline.py" verify
```

The report and lane are sealed for parent verification before integration.
Only this report and the new lane are owned; no shared edits, commits or pushes.
The full-browser goal, whole-website support, destination flow, credentials,
provider/device/TTY/real-SafeJS and challenge gates remain separate and open.
