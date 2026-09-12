# Bounded native NASA About/editorial flow on committed13501

## Outcome

**The About/editorial flow did not pass.** The homepage returned HTTP 200, but
initial loading stopped with a wrapped assertion while attempting the first
original-loader same-origin stylesheet. No page committed, no anchor occurrence
was inspected and no About/Missions/Science click or destination request occurred.
There was no retry, alternate client, origin expansion, source stripping or fix.

First recorded top-level failure, **2026-09-12T13:59:39.071Z**:

- Stage: `initial-navigation:network`.
- Error: `AgentBrowserError`, code `network-error`.
- Exact message: `Network request failed (ERR_ASSERTION)`.
- The navigation caller then received `AgentBrowserError`, code `aborted`,
  message `Navigation aborted`; this does not replace the original failure.

**The underlying assertion is not localized by the retained live telemetry.**
There are two native transport/hop attempts but only one recorded wire request
and response. The second attempt has no wire-start event, body, response or
server status. The original transport wrapped the assertion code without its
specific assertion message. No definite pacing, origin-policy, TLS, server or
layout root cause is claimed. This is a partial-load/pre-second-wire assertion
failure, not evidence of NASA denying access or of a successful website flow.

Supervisor UTC: **2026-09-12T13:59:38.469Z–2026-09-12T13:59:39.401Z**;
elapsed **0.930999987 seconds**, exit **1**, no timeout, signal or truncation.
Native report UTC: **2026-09-12T13:59:38.807Z–2026-09-12T13:59:39.387Z**.

## Committed Runtime And Preservation

Only immutable commit **`025bae17d4aaecff5e914980b9b46f0edc2e309e`**, committed13501,
was executed from
`node_modules/.cache/native-validation/native-float-shell-september12-round00/snapshot01/dist`.
Pinned Node: `/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, **v22.22.0**,
SHA256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
No working-tree source or old Netlib/Go runtime was imported.

Before/after verification covers **20 release receipts, 1155 source files,
1968 compiled files, thirteen actual committed inputs and sixteen actual Git
objects**. Commit/root/src trees and thirteen blobs were captured by read-only
local `git cat-file` outside the kernel seal. Offline checks recompute Git object
identities, tree membership and exact snapshot equality. Parent comparison can
use those retained bytes independently of command summaries.

| Release evidence | SHA256 |
| --- | --- |
| Source inventory | `a1a6b8c9f1bad92db4740f45d8fb7dadb2c91d1ee516c1f8775cdb26b886d296` |
| Compiled inventory | `245b8f4a4b78a1c75d34fb1a4a6fa708b2eefbdc1ed40b5036f205507af297fe` |
| Native test results | `fcd0b07729a130294b2cb276b551d04ace082a7e48d37bc1520c062f3acc7fb5` |
| Gate receipts | `5fe05de3ebad29aa3862df8c5954add4dd3b58e20c964d3328dd79f0582ad043` |
| Commit verification | `7afc25e6622d523dfd1acf37349845b2396e8c5f046a41f87d6683fee44d077b` |

The existing release gate is **13501 passed / zero failed / two unchanged
exclusions**, 259 selected suites, 258 strict roots, 653 manifest entries and
1142 unchanged tracked inputs. This website task did not rerun that gate or
interpret it as live acceptance. Preflight completed
**2026-09-12T13:59:31.651Z**; the live after-check completed
**2026-09-12T13:59:39.387Z**.

All six completed Netlib and both Go lanes, including their original reports,
failures and measurements, were ledger-verified before/after without edits or
old-harness execution. The latest Netlib 176-entry ledger remains
`58351a69aa16e34c48e977e7ad9b8924b37a1a7ba6ab9733d5e8c25ec567b26f`.
The full eight-lane preservation pins and copied framework provenance are retained
in `PREFLIGHT.json`, `PREPARE-COPIES.json` and the private archive.

## Requests And Accounting

Only **`https://www.nasa.gov`** was authorized for navigation and every resource.
The single actual wire request was a bodyless native homepage GET:

| Event | UTC on September 12, 2026 |
| --- | --- |
| Homepage adapter entry | 13:59:38.812 |
| Homepage native transport hop | 13:59:38.815 |
| Homepage wire request | 13:59:38.821 |
| HTTP 200 response headers | 13:59:38.840 |
| Encoded body complete | 13:59:38.845 |
| Wire close | 13:59:38.846 |
| Original native document loader starts | 13:59:38.852 |
| Stylesheet discovered | 13:59:38.934 |
| Stylesheet adapter entry/native hop | 13:59:38.935 |
| Wrapped assertion stops flow | 13:59:39.071 |

The actual loader-discovered stylesheet URL, retained without replacement:

`https://www.nasa.gov/_static/??-eJyNjssKwjAQRX/IGETUdiHu3PoNk+nYhk4eZJKW/r2lKogu6mq4wzmXq8eoMPhMPmtkOx/liopcWutFFxkbUfcEjsaQ+mfWplhutOSJSbYostEfJW8VEEnEGss2Two7wp7SS50dLenmebqG5CD/lOSOHIn2ILDALQcDrDwMqygN8/d31jcGCTs7kDLgPaVVPIZYonLQ/8F2wVGEdu7mgP0y5eLOu1NV1Ye6Ou4foA+KrQ==`

Its provenance was `original-native-loader.fetchStylesheet`, source document
`https://www.nasa.gov/`, accept `text/css`, top-level navigation false. It passed
adapter/hop admission, but no second wire request or server reply was recorded.
There is no completed stylesheet body, CSS load result or stylesheet status to
report. No alternate URL or fallback was tried.

| Measurement | Actual |
| --- | ---: |
| Adapter entries / request-start records | 2 / 2 |
| Admitted adapter requests / rejected adapter entries | 2 / 0 |
| Native transport requests / observed transport hops | 2 / 2 |
| Recorded wire requests / responses | 1 / 1 |
| Completed native responses | 1 |
| Redirect responses / followed redirects / mocks | 0 / 0 / 0 |
| Encoded payload bytes / native decoded bytes | 46546 / 355707 |
| Committed pages / inspected anchors / chosen refs / clicks | 0 / 0 / 0 / 0 |
| Image adapter entries / image wire requests | 0 / 0 |

Native request counts are not wire counts: the failed stylesheet attempt is
included in the former only. The returned homepage had Brotli (`br`) HTTP
encoding. Captures:

- `wire-1.body`, **46546 bytes**, SHA256
  `2126fa03c5a48593b0168e9b9b619a5d870e709fd0067ef14db83e332fd33d05`.
- `response-1.body`, **355707 bytes**, native decoded SHA256
  `0d25625fbcfc6ec9d5ba5f3c63623e27c30e28946c9aa35c47ff0554a4ce512b`.

Offline verification independently decodes the retained Brotli payload and
compares the native response bytes/hashes. Ordered raw header strings and
normalized headers exclude credential header pairs; they are not a packet/TLS
capture. HTTP/header challenge classification returned null; no Retry-After was
observed. No committed-page title/text classification was reached, so there is
no broader assertion that every possible challenge was absent.

**Observed attempted host: `www.nasa.gov` only.** The native image loader discovered
four fetch-callback URLs on `assets.science.nasa.gov`, but none reached an adapter
entry, native transport hop or wire event. Discovery is not contact or admission;
that origin was never added to the allowlist or counted. The current published
inventory is 85 per the task; this one observed new host would produce 86 only
when the parent integrates the result. No shared inventory or TASKS edit occurs here.

## State, Policy And Diagnostic Limits

There is no committed homepage state, selected anchor, click result, destination,
new-document identity or readable destination text. About-first selection was
predeclared but never exercised. No forced reference, guessed About URL, input,
search, form, newsletter, PDF or download action occurred.

The native document loader did not return successfully. Consequently **zero
exposed-resource-policy observation checkpoints were reached**. This is not
evidence of policy-clear resources or instantaneous first-denial coverage.
There was no next user action: the initial failure aborted the only navigation.
The predeclared checks remain at original-loader return, committed homepage
before discovery, immediately before click, and after click before acceptance;
none was bypassed to perform a click.

One permitted retained-document formatting census at
**2026-09-12T13:59:39.137Z** failed with `AgentBrowserError`, code `unsupported`,
message **`Rich button content layout is not implemented`**. The partial document
revision stayed **4601** before/after. No completed census, deferred sample set,
alternative layout or page-pixel result exists. This separate diagnostic guard
does not identify the earlier transport assertion or turn it into a proved
NASA layout failure. Main retains ownership of rich-button primary-source work;
this lane performs no source fix or extra live diagnostic run.

Image instrumentation observed **one real native image owner** and four original
fetch callbacks before failure. Its final cumulative counter is **24 image-owner
resource requests**, with **zero received/decoded bytes**. That counter includes
native scheduled resource work, not 24 HTTP requests. No image response, decoding,
initial frame or image rendering was demonstrated. The final original image owner
has zero resources, active/queued work and waiters and is closed. The partial
page did not reach a final image snapshot/CSS diagnostics result; unsupported or
policy-denied image states cannot be recensused after close from these metrics.

## Cleanup And Bounds

Abort and session close were called. After a requested 50ms settlement
(**50.193648ms** measured), cleanup at **2026-09-12T13:59:39.189Z** shows transport,
session and request queue closed; zero active requests, pending loads, pending
requests and cleanup errors. One document, event owner, image owner and control
owner were instrumented and cleared/closed: zero nodes/text, mutation collectors,
inline declarations, event listeners/dispatches, image resources/active/queued/
waiters, files/bytes/controls and pressed mouse state. Initial/final cookies and
accepted cookies were zero. The process group was absent after exit without
signals, and private HOME/TMPDIR remained empty.

Predeclared `CONTRACT.md` SHA256:
`334dd022db83262e95117362d04312fcb3d0b8cf468791d2442bb33497f3ca10`.
Caps: 32 bodyless GET, one concurrent request, >=250ms per-origin monotonic pacing;
2MiB encoded/decoded response, 8MiB encoded and decoded session totals;
45s wall +5s kill grace; 6MiB each file/combined output, 16MiB lane, >=64MiB free.
Deadline checks precede adapter, native hop and wire. Only one request reached
the wire; no two-wire spacing interval was exercised or measured. The exact
assertion responsible for the second pre-wire stop is not retained, so this
report does not label that stop a proved pacing result.

Original native capacities remain unchanged. Live storage receipts record
**5,754,880 allocated bytes** before and **6,189,056** after the child, with over
2.64GB free; the latter precedes supervisor output serialization. Final seal
storage is separate rather than substituted for the live measurement.

Original native BrowserSession/document/CSS/image callbacks/NodeNetworkTransport
only; public-DNS/TLS checks and `AgentBrowser/0.1` identity. Native callback metadata
records requested credentials `include`, but every forwarded request uses **omit**
with a fresh empty jar and wire checks reject cookie/auth headers. Scripts and
real SafeJS stayed off. Explicit environment, empty 0700 HOME/TMPDIR, stdin DEVNULL,
no TTY/PTY, core limit zero, and workspace TMPDIR for shell heredocs because shared
`/tmp` is full. No alternate engine/client, mocks, protected payloads, providers,
devices, credentials, selfprobes, identity rotation, CAPTCHA bypass or cap raises.

Live seccomp permits native outbound traffic and denies listening/ptrace/process-vm/
io_uring. Native/harness role/origin/public-address/TLS admission is not an OS
origin firewall. Offline checking additionally denies sockets/socketpair and
related network syscalls, imports no native page runtime, and performs no parser,
session or network replay. Integrity checks cannot recover the missing assertion
message or promote this failed flow to acceptance.

## Sealed Artifacts And Parent Verification

Private lane: `node_modules/.cache/native-validation/native-nasa-about-flow-september12`.
Direct evidence is `live/stdout.json`, `live/INVOCATION.json`, `live/EXECUTION.json`,
`progress.jsonl`, `wire-1.body`, `wire-1.headers.json`, `response-1.body` and metadata.
`CHECKS.json`, `RESULT.json`, `ORIGIN-ACCOUNTING.json`, `ASSERTION-BOUNDARY.json`,
`POLICY-OBSERVATIONS.json`, `DIAGNOSTICS.json`, `REPORT-CLAIMS.json`,
`ARTIFACTS.json`, `SEAL.json` and `FINAL-RECEIPTS.sha256` retain the summary and seal.
Failed live/diagnostic results and all setup/check outputs remain preserved.

Parent readonly verification from repository root, without writing output into
the sealed lane:

```sh
lane="$PWD/node_modules/.cache/native-validation/native-nasa-about-flow-september12"
env -i PATH=/usr/bin:/bin HOME="$lane/home" TMPDIR="$lane/tmp" \
  LANG=C.UTF-8 LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B "$lane/offline.py" verify
```

Only this named report and new private lane are owned; no shared edits, commits
or pushes. Parent verification/integration remains separate. This result does
not establish whole NASA support, a destination flow, complete image/layout
support, or completion of broader research/provider/device/credential/TTY/
real-SafeJS/challenge gates.
