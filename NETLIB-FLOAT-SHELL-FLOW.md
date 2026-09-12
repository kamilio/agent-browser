# Native Netlib regression on committed13501

## Verified Narrow Result

**The bounded homepage-to-FAQ flow passes on committed13501.** One native
BrowserSession opened `https://www.netlib.org/`, inspected the current homepage,
and invoked one genuine current-ref FAQ click. The click committed the observed
FAQ URL/title, advanced session history, replaced the document and produced
bounded readable text. This is a new release regression, not a retry of a
restricted site or a claim of complete Netlib/browser support.

- Four bodyless native GETs returned **200**, with **34762 encoded / 34762 decoded
  bytes**, no redirects, mocks, admission rejections, HTTP/header challenge or
  Retry-After.
- **21 anchor occurrences inspected**, two eligible occurrences, one unique
  destination; current ref **`e133`** selected from occurrence **15** (zero-based).
- Destination **`https://www.netlib.org/misc/faq.html`**, title **Netlib FAQ**,
  new root **`e164`**, **11352 code units** of readable native body text.
- Five exposed-resource-policy observations were clear, including immediately
  before the click. There is no claim of instantaneous first-denial instrumentation.
- Two real native GIF owners expose retained initial **147×148 RGBA** frames.
  Animation playback and full-page pixel parity are not claimed.
- Only after the live process exited, all four decoded bodies were compared with
  completed13226 captures and found byte-identical. Equality was not a live-run
  precondition or a substitute for this run's actual request/click evidence.

Supervisor UTC: **2026-09-12T13:43:44.384Z–2026-09-12T13:43:45.823Z**;
elapsed **1.436805356 seconds**, exit **0**, no signal, timeout or truncation.
Native report UTC: **2026-09-12T13:43:44.718Z–2026-09-12T13:43:45.803Z**.
The supervisor interval includes runtime/evidence overhead; it is not a general
browser performance benchmark.

## Release And Preservation

Only immutable commit **`025bae17d4aaecff5e914980b9b46f0edc2e309e`**, committed13501,
was executed, from
`node_modules/.cache/native-validation/native-float-shell-september12-round00/snapshot01/dist`.
Pinned Node: `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, **v22.22.0**,
SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
No working-tree source module or old Netlib/Go runtime was executed.

Before/after verification covers **20 release receipts, 1155 source files,
1968 compiled files, thirteen actual committed inputs and sixteen Git objects**.
The commit/root/src trees and thirteen blobs were captured by read-only local
`git cat-file` outside the kernel seal. Offline evidence checks recompute Git
object identities, tree membership and exact committed snapshot bytes. The parent
can independently verify the retained objects, not just command-result claims.

| Release evidence | SHA256 |
| --- | --- |
| Source inventory | `a1a6b8c9f1bad92db4740f45d8fb7dadb2c91d1ee516c1f8775cdb26b886d296` |
| Compiled inventory | `245b8f4a4b78a1c75d34fb1a4a6fa708b2eefbdc1ed40b5036f205507af297fe` |
| Native test results | `fcd0b07729a130294b2cb276b551d04ace082a7e48d37bc1520c062f3acc7fb5` |
| Gate receipts | `5fe05de3ebad29aa3862df8c5954add4dd3b58e20c964d3328dd79f0582ad043` |
| Commit verification | `7afc25e6622d523dfd1acf37349845b2396e8c5f046a41f87d6683fee44d077b` |

The already completed native release gate is **13501 passed / zero failed / two
unchanged exclusions**, 259 selected suites, 258 strict roots, 653 manifest entries
and 1142 unchanged tracked inputs. This website task did not rerun or relabel that
gate as live acceptance. Preflight completed **2026-09-12T13:43:37.202Z**; the live
after-check completed **2026-09-12T13:43:45.803Z**.

Five historical Netlib lanes—original, center, GIF, quirks and background-color—
and both original Go lanes were ledger-verified before/after without edits or
old-harness execution. Their original paths, reports and failed measurements
remain intact. Historical preservation pins and copied framework provenance are
in `PREFLIGHT.json`, `PREPARE-COPIES.json` and the archive. In particular the
completed13226 Netlib ledger remains
`c69c173d6986188912717c606c6c1cb6b5009150165cb6f41268e2f66beb5736`, with 225 entries.
The earlier Go stylesheet flow's stop-policy limitation is not rewritten by this
new harness's observation-point checks.

## Native Requests And Bytes

Only **`https://www.netlib.org`** was admitted, for every document, redirect, CSS
and image. No alias or additional origin was expanded. Original native document/
image callbacks and NodeNetworkTransport supplied every response.

All times in this table are **September 12, 2026 UTC**. Encoded and decoded bytes
are equal because these responses had no HTTP content encoding.

| Request | URL | Wire start | Response headers | Status | Encoded / decoded |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `https://www.netlib.org/` | 13:43:44.737 | 13:43:44.833 | 200 | 3921 / 3921 |
| 2 | `https://www.netlib.org/netlib2.gif` | 13:43:44.988 | 13:43:45.071 | 200 | 6710 / 6710 |
| 3 | `https://www.netlib.org/misc/faq.html` | 13:43:45.239 | 13:43:45.346 | 200 | 17421 / 17421 |
| 4 | `https://www.netlib.org/netlib2.gif` | 13:43:45.490 | 13:43:45.586 | 200 | 6710 / 6710 |

| Measurement | Actual |
| --- | ---: |
| Adapter entries / request-start records | 4 / 4 |
| Admitted adapter requests / rejected adapter entries | 4 / 0 |
| Native transport requests / observed native transport hops | 4 / 4 |
| Wire requests / wire responses | 4 / 4 |
| Redirect responses / followed redirects / mocks | 0 / 0 / 0 |
| Document requests / image requests / stylesheet requests | 2 / 2 / 0 |
| Encoded bytes / decoded bytes | 34762 / 34762 |
| Explicit navigation calls / genuine click calls / document commits | 1 / 1 / 2 |

Every origin-accounting row is `https://www.netlib.org`; wire attempts—not an
allowlist—prove that host was contacted. **No new host** is added. Published
inventory remains 84 and completed Go contributes pending host85; this known-host
regression edits neither inventory nor TASKS.

Consecutive same-origin wire starts are **250.995720ms**, **251.347193ms** and
**251.005990ms** apart on the retained monotonic clock. Payload SHA256 values:

| Encoded and native decoded capture pair | SHA256 |
| --- | --- |
| `wire-1.body` / `response-1.body` | `e37c5a60af1aa52fda53d56dc0ee5780706b9e1feb2ce5a540fc52d3e44b6236` |
| `wire-2.body` / `response-2.body` | `87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d` |
| `wire-3.body` / `response-3.body` | `6d73e09dec4d5b0ae4f5aa154bd16d39ad15b3208e6ae3d822e8ad5f049f1dcd` |
| `wire-4.body` / `response-4.body` | `87f35dc29c023234732259e9440ebcce2126b53ff8160ba9beace8463d41a04d` |

Each body and native metadata file is retained. Ordered raw header strings and
normalized headers exclude credential header pairs; they are not a packet/TLS
capture. Offline checks independently validate headers and encoded/native decoded
payload equality. The repeated GIF was actually fetched once per original
document owner; there is no response mock or assumed cross-document reuse.

## Current Anchor And Click-Driven State

The homepage committed as **The Netlib**, URL `https://www.netlib.org/`, root
**`e1`**, **163 nodes**, revision **164**. All **21** current `body a[href]`
occurrences were inspected, below the 96 cap. Native visibility/actionability and
ancestor checks preceded URL deduplication. Two eligible occurrences resolve to
one unique FAQ destination.

Selected occurrence **15**, ref **`e133`**, original href **`misc/faq.html`**,
label **Frequently Asked Questions about Netlib (FAQ)**, target `_self`. It was
displayed/visible, with no blocked or aria-disabled state and no form ancestor;
ancestor inspection completed at depth six. The actual current ref was passed to
`session.click`, not injected or replaced by a fallback navigation.

| Observed state | Before click | After click |
| --- | --- | --- |
| URL | `https://www.netlib.org/` | `https://www.netlib.org/misc/faq.html` |
| Title | The Netlib | Netlib FAQ |
| Document root | `e1` | `e164` |
| Nodes / revision | 163 / 164 | 751 / 759 |
| Same document as homepage | true | false |
| Session history index / length | 0 / 1 | 1 / 2 |
| Active session history key | `h1-1` | `h2-1` |
| Native request-start count | 2 | 4 |

The click result records native navigation kind `document`. Old homepage nodes
were cleared to **zero**. Per-document history is distinct from session history:
the new document's own history is index zero/length one, while session history
contains both URLs with the FAQ active. No back/forward action was performed.

The FAQ's bounded native body text is **11352 code units**, under the 12000 cap,
and begins with “Frequently Asked Questions (FAQ)” and “Table of Contents,”
followed by readable Netlib questions. The full bounded sample is retained in
the live result. Actual primary status/headers and native URL/title/text were
classified without a challenge on both committed pages. This is readable-text
evidence, not proof of full visual layout or every FAQ link.

## Policy Observations And GIF Owners

The harness checks exposed nonthrowing image/stylesheet policy and capacity states
at declared observation points before further user action. All five snapshots
have **zero image policy denials, zero image capacity errors, null image failure
and no stylesheet policy issue counters**:

| Observation point | UTC on September 12, 2026 |
| --- | --- |
| Homepage original loader returned, before commit | 13:43:45.081 |
| Committed homepage, before anchor discovery | 13:43:45.084 |
| Immediately before current-ref click | 13:43:45.091 |
| FAQ original loader returned, before commit | 13:43:45.594 |
| After click, before destination acceptance | 13:43:45.597 |

Original document revisions remain unchanged by these observations. This proves
the checks occurred at those points; it does not claim instantaneous coverage
of every possible denial inside the native engine. No denial/capacity/restriction
was encountered in this run, so stopping on an actual denied state was not a live
negative test. The guard would abort before a subsequent click if an exposed
policy-denied state were observed; no source change or HTTP probe tests that branch.

Both native document owners completed one image from
`https://www.netlib.org/netlib2.gif`: homepage ref **`e23`**, FAQ ref **`e178`**.
Each is observed as **GIF87a, one frame, animated false, initial-frame
presentation**, natural size **147×148**. Each original decoder exposes **87024
RGBA bytes**, retained separately as `gif-1-1.rgba` and `gif-2-1.rgba`, SHA256
`0cc43ff6c5d1949358f3e72259785d4a09c08666624e7e4a9e9221523f9cfff7`.
The existing native image-owner `inspect`/`decoded` getters supplied these bytes;
the harness made no extra decode call or fetch. Owner metrics record one request,
6710 received bytes and 87024 decoded bytes per document, with no active/queued
request or waiter at observation. No animation playback or full-page pixel parity
is claimed. The legacy owner profile label `png-resource-owner` is retained even
though actual decoded metadata is `image/gif`.

Both pages report zero external stylesheets, zero authored stylesheet rules and
empty raw/applicable CSS issue maps. This does not remove the native parser's
partial/quirks diagnostic metadata or establish complete HTML/CSS support. No
failure occurred, so no failure-only formatting census was run.

## Post-Live Comparison And Cleanup

Only after the live process exited at **2026-09-12T13:43:45.823Z**, the separately
socket-denied comparison began at **2026-09-12T13:46:58.182Z**. It pairs current
responses by observed URL and unused occurrence with completed13226 responses in
`native-netlib-background-color-flow-september12`, commit
`fa49059b123243f1b220a8b198607a62c5dc4927`.

**All four decoded bodies are byte-identical**, with no mismatched or unmatched
historical response. The homepage, FAQ and both GIF occurrences match the hashes
listed above. `COMPARISON.json` records each current and historical body/metadata
path, length, hash, comparison result and after-live timing. Neither this equality
nor the earlier four-GET/FAQ outcome was assumed before the live flow. No old
harness, parser, session or runtime was reexecuted. No historical receipt was edited.

Session close/abort and native cleanup completed. Two instrumented documents,
event owners, image owners and control owners are cleared/closed; zero remaining
nodes/text, mutation collectors, inline declarations, event listeners/dispatches,
image resources/active/queued/waiters, files/bytes/controls and pressed mouse state.
Transport/session/request queue are closed with zero active/pending work and zero
cleanup errors. Initial/final cookie counts and accepted cookies are zero. No
settlement wait was needed. The child process group was absent after exit without
signals; empty private HOME/TMPDIR remained empty.

## Bounds, Artifacts And Parent Verification

Predeclared `CONTRACT.md` SHA256:
`da97a2b7460038f8153cd3462ea75ad99145d00e613611244e5403cc570937aa`.
Bounds: 32 bodyless GET, concurrency one, >=250ms per-origin monotonic pacing;
2MiB encoded/decoded per response, 8MiB encoded and decoded session totals;
45s wall +5s kill grace; 6MiB each file/combined output, 16MiB lane and >=64MiB free.
Original native document/CSS/image/formatting capacities were not raised. Deadline
checks precede adapter, native hop and wire execution. Live allocated storage was
**5,787,648 bytes** before and **6,213,632** after the child, with over 2.66GB free;
the latter precedes supervisor output serialization. Final storage is recorded
separately by the seal rather than substituted for these original measurements.

Native BrowserSession/original loaders/NodeNetworkTransport only; public-DNS/TLS
checks, `AgentBrowser/0.1`, fresh empty cookies. Native callback metadata may say
requested credentials `include`; the adapter forwards **omit** and wire checks
reject cookie/auth headers. Scripts/real SafeJS, foreign engines/alternate HTTP
clients, injected responses, global fetch, protected payloads, providers/devices,
credentials, identity rotation, CAPTCHA bypass and network selfprobes were not used.
Explicit environment, empty 0700 HOME/TMPDIR, stdin DEVNULL/no TTY/PTY, zero core
limit. All shell heredocs used workspace-private TMPDIR because shared `/tmp` is full.

Live seccomp permits necessary native outbound requests and denies listening,
ptrace/process-vm/io_uring. Native/harness origin/public-address/TLS admission is
not an OS origin firewall. Offline verification additionally denies sockets,
socketpair and related network syscalls, imports no native page runtime, opens no
session, and reruns no native parser/decoder. It independently checks release/Git/
preservation evidence, request/frame bytes, policy observation order, click/state,
cleanup and the post-live historical byte comparison.

Private lane:
`node_modules/.cache/native-validation/native-netlib-float-shell-flow-september12`.
Direct evidence: `live/stdout.json`, `live/INVOCATION.json`, `live/EXECUTION.json`,
`progress.jsonl`, response/wire/header captures and two native RGBA frame captures.
Summary/seal: `CHECKS.json`, `RESULT.json`, `ORIGIN-ACCOUNTING.json`,
`POLICY-OBSERVATIONS.json`, `GIF-OBSERVATIONS.json`, `DIAGNOSTICS.json`,
`COMPARISON.json`, `REPORT-CLAIMS.json`, `ARTIFACTS.json`, `SEAL.json` and
`FINAL-RECEIPTS.sha256`. Syntax, preparation, actual-Git, preflight, live,
comparison and final-check outputs remain retained; any failures are not overwritten.

Parent read-only verification from repository root, without writing output into
the sealed lane:

```sh
lane="$PWD/node_modules/.cache/native-validation/native-netlib-float-shell-flow-september12"
env -i PATH=/usr/bin:/bin HOME="$lane/home" TMPDIR="$lane/tmp" \
  LANG=C.UTF-8 LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B "$lane/offline.py" verify
```

Only this named report and new lane are owned; no shared edits, commits or pushes.
Parent verification/integration is separate. This narrow Netlib regression does
not prove full float-shell website support, repair Libjpeg/Go outcomes, erase their
limitations, or close the overall browser/research/provider/device/credential/TTY/
real-SafeJS/challenge gates.
