# Selenium Web-Form Native Flow — September 12, 2026

## Outcome

**Stopped partial: one successful document response, then an off-origin
stylesheet rejected locally before transport and before document commit.**
This is not a forms, page-layout, index-navigation or full-site acceptance pass.

The only live invocation ran **2026-09-12T15:13:09.715Z–15:13:10.434Z**,
supervisor elapsed **0.7178799845278263 seconds**, exit **1**. It used the exact
committed13588 request-start-pacing release
`e02ebaf4365c5e7a534cc08f4849795d58e391d8`, pinned Node22.22.0 and immutable
`native-request-start-pacing-september12-round00/snapshot01/dist`.
Main's later block-alignment release and the dirty working tree were not used.

Start: `https://www.selenium.dev/selenium/web/web-form.html`.
The native document GET received **HTTP200**, **1,233 encoded bytes** and
**4,988 decoded bytes**. The original native stylesheet callback then discovered
`https://cdn.jsdelivr.net/npm/bootstrap@5.1.0/dist/css/bootstrap.min.css`.
The exact-origin admission guard rejected that callback at the adapter, before
forwarding to native transport. It did not contact the CDN, strip the stylesheet,
expand the origin list, guess another target, retry or invoke another client.

The preserved first error is **AssertionError / ERR_ASSERTION** at
`initial-navigation:network`, with exact message:

```text
Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance
```

The caught native error is **AgentBrowserError / aborted**, message
`Navigation aborted`, at `initial-navigation`. These are distinct observations,
not an inferred server denial or proof of an underlying native browser defect.
The safe structured rejected-check label is `adapter.resource-admission`,
recorded at **436.950677 ms** on the live child's monotonic clock. The preceding
local-denial event explicitly records `offOrigin: true`, `beforeWire: true`.

## Actions And Accounting

- One fresh session and one initial native navigation; **zero document commits**.
- **Zero semantic control/anchor snapshots, inspected anchors and clicks**.
  The Return to index selection and reference-click stages were never reached.
- Two adapter request entries: one admitted document, one rejected stylesheet.
  Exactly **one native transport request, wire request, TLS connection and response**.
- Zero stylesheet responses, image requests, redirects and mocked responses.
- Actual contacted/replied host: **www.selenium.dev** only. TLS peer observation:
  `185.199.110.153:443`, certificate authorization true. This is instrumentation,
  not packet capture or a broader infrastructure-contact census.
- **cdn.jsdelivr.net** was discovered and locally rejected, not transport-admitted,
  TLS-connected or contacted. The single allowed origin was
  `https://www.selenium.dev`; there was no allowed-only uncontacted origin.

The archived seventeenth website inventory already records www.selenium.dev as
historical, with host increment0. This run adds **zero unique hosts**. The
inventory's broader proposed form checks were not authorized or performed here.

The first wire admission recorded zero active requests, required spacing250ms,
and no previous start. There is **no pair of starts and no measured live pacing
interval**. The committed native test evidence is not a fresh live pacing pass.
No server restriction, classified challenge or Retry-After was observed in the
single successful response; this says nothing about uncontacted resources.

The run stopped during native loading, before loader settlement. Consequently
there are **zero settlement resource-policy observations**, not proof that all
page resources were clear. The harness retains the predeclared loader-settlement
checks for nonthrowing denials, but did not reach them. No post-stop page parsing,
anchor discovery, content analysis, geometry, hit testing or painting occurred.

## Bounds And Cleanup

The original bounds remained **32 bodyless GETs, concurrency1, minimum250ms
monotonic per-origin request-start spacing; 2MiB encoded/decoded per response;
8MiB encoded and decoded totals; 45seconds plus5seconds kill grace; 6MiB each
and combined output and per-file cap; 16MiB allocated/logical lane; 64MiB free**.
Native DOM/CSS/image/formatting limits and partial profiles were unchanged.

Live stdout is **30,004 bytes**, stderr **zero**, without output truncation,
supervisor termination reasons or signals. Live storage receipts record
**6,627,328 allocated bytes before**, **6,668,288 after**, and **2,474,373,120
free bytes before execution**. The after sample precedes supervisor output
serialization; final seal storage is measured separately.

Native BrowserSession/loadBrowserDocument callbacks, resource roles/provenance,
NetworkPolicy DNS/public-address protection, NodeNetworkTransport TLS validation
and AgentBrowser/0.1 remain intact. Native callback metadata requested credentials
`include`; every forwarded request explicitly used **omit**. Wire credential
headers were rejected. The fresh cookie jar accepted zero cookies and closed
empty. No credentials, providers, devices, SafeJS, scripts, alternate engines,
form actions, TTY/PTY, CAPTCHA bypass or other user action occurred.

The child used empty private0700 HOME/TMPDIR, stdin DEVNULL, core limit zero and
minimal explicit environment. Live seccomp denied listening, ptrace, process-vm
and io_uring; it was not a kernel origin firewall. No socket self-probe occurred.

Immediate close observed one pending load and179 remaining document nodes.
A requested50ms cleanup sample actually took **49.862617ms**, then observed
zero pending loads, active transport requests and active/queued session requests.
Session/transport/queue closed with zero cleanup errors; the document released
all nodes/text. The one instrumented document, event and control owner passed
their recorded cleanup checks. **No image owner was instrumented, so image-owner
cleanup is not proved.** The process group was absent after exit and private
HOME/TMPDIR remained empty.

## Evidence And Independent Verification

Only this report and the new private lane are owned:
`node_modules/.cache/native-validation/native-selenium-web-form-flow-september12`.
There are no worker changes to shared source, manifests, TASKS or historical
lanes, and no worker commits or pushes. Main separately integrates and verifies.

Preparation and before/after checks bind20 release receipts, source1155 and
compiled1968 exact inventories, native13588 passed/0failed/2unchanged exclusions,
261selected suites,260strict roots,653manifest entries and1150unchanged tracked
inputs. Read-only Git outside kernel isolation captured and recaptured **eight
actual objects**: commit/root/src trees and **five input blobs**, cryptographically
linked to the exact release and immutable snapshot. No pending release input was
substituted. The188-entry weather seal and nine preceding historical seals remain
unchanged; no protected native-source-heading-source-10 payload was opened.

The lane retains task/release copies, original weather helper copies, syntax and
preflight outputs, before/after Git command receipts and bytes, live invocation,
unchanged exit1 execution record and stdout, safe progress/rejected checks, one
encoded wire body/header record and one decoded response body/metadata record.
`SETUP-FAILURES.md` preserves two later tooling setup failures: a shell heredoc
temporary-file failure and an execution-tool rejection of a proposed NUL-bearing
command. Neither launched or replayed a browser/network run. Preparation, syntax
and preflight passed before execution.

`CHECKS.json`, `RESULT.json`, `ORIGIN-ACCOUNTING.json`, `ASSERTION-BOUNDARY.json`,
`POLICY-OBSERVATIONS.json`, `REPORT-CLAIMS.json`, `ARTIFACTS.json`, `SEAL.json` and
`FINAL-RECEIPTS.sha256` bind the report and all private lane files. Evidence
integrity is separate from the stopped flow's failed acceptance. The offline
verifier hashes bodies and checks compression/integrity and metadata; it does
not parse pages, import the page runtime or replay network. Kernel seccomp
denies socket/socketpair and network syscalls. Main independently verifies
actual Git objects and sealed evidence before any integration.

From the repository root, without redirecting output into the sealed lane:

```sh
lane="$PWD/node_modules/.cache/native-validation/native-selenium-web-form-flow-september12"
env -i PATH=/usr/bin:/bin HOME="$lane/home" TMPDIR="$lane/tmp" \
  LANG=C.UTF-8 LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1 \
  /usr/bin/python3 -I -B "$lane/offline.py" verify
```

Expected interface: exit0 and JSON `passed: true`, `acceptancePassed: false`,
`noNetworkOrPageReplay: true`, `kernelSocketAndSocketpairDenied: true`, followed
by a read-only supervisor receipt. Parent verification remains independent.
This result establishes no full-site, performance, button, provider, passkey,
credential, device, real-SafeJS, TTY or challenge acceptance.
