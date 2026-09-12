# Native man7 manual flow — September 12, 2026

## Actual outcome

**The once-only flow did not complete.** Initial native resource loading hit
the authorized same-origin/privacy boundary: an original page image targeted
`c.statcounter.com`. The harness rejected that adapter call **before forwarding
it to the native transport**. There was no wire request to that host, no broadened
allowlist, no resource removal, and no retry.

The pre-wire adapter entry makes `c.statcounter.com` a **separately substantiated
attempted hostname**, not a reached host or a tested-working website. `man7.org`
has both attempted-host and HTTP-response evidence. Parent owns inventorying
both names under its existing pre-wire-attempt convention; this lane does not
edit the host inventory.

This is a **harness policy-boundary result**, not a website rejection and not a
demonstrated float/layout compatibility defect. All three observed man7 HTTP
responses were 200, with no classified response challenge or Retry-After.
Content-level challenge classification was not reached after a page commit.

The native session recorded one navigation attempt and **zero commits**.
There was no committed native title, root reference, page-history observation,
anchor inspection, or click. Those observations were not reconstructed from
the response HTML. The stat(1)-preferred, availability-before-deduplication
selector was prepared but never reached. No formatting census was authorized
by a failed click because no click occurred.

## Release and execution

- Runtime: audited **11268 passed / 0 failed / 2 excluded**, commit
  `8daf14b35b31a6ce086480861bb9ab60baedcec3`.
- Runtime directory:
  `node_modules/.cache/native-validation/native-float-foundation-september12-round02/snapshot01/dist`.
- Existing release receipts, audit, commit verification, manifest, eight scoped
  committed files, 1082 source files and 1924 compiled files were checked before
  launch. The 591-entry manifest selected 195 suites and 194 strict roots.
  No build or historical gate was rerun; those test counts are release evidence,
  not this website's acceptance result.
- Supervisor UTC: **2026-09-12T00:58:09.489Z–2026-09-12T00:58:10.727Z**.
- Native probe UTC: **2026-09-12T00:58:09.604Z–2026-09-12T00:58:10.719Z**.
- One launched native process chain; exit 1, no timeout or output truncation,
  empty stderr, and the child process group was absent afterward.

Initial URL: `https://man7.org/linux/man-pages/man1/ls.1.html`.

## Requests and exact bytes

There were **4 adapter attempts, 3 forwarded native requests, 3 wire GETs,
3 responses, 0 redirects, and 0 mocks**. The fourth adapter attempt was the
blocked tracking image. Every wire URL remained on `https://man7.org`; no request
had a body. Observed wire-start spacings were **338 ms and 305 ms**, above the
250 ms minimum. Wire events are native HTTPS-construction instrumentation, not
a packet capture.

| Original native resource | HTTP | Encoded bytes | Decoded bytes | Decoded SHA256 |
| --- | --- | ---: | ---: | --- |
| `/linux/man-pages/man1/ls.1.html` | 200 | 5629 | 17305 | `f14b7f93b12bf3e2e32b1f88687c4053801d34baca4932ec4b409e24b7dde4cb` |
| `/style.css` | 200 | 1111 | 4297 | `89a03c73a6cda268fbe6802d620f03531830c4c1be798b299ad83b3ff7f237c2` |
| `/tlpi/cover/TLPI-front-cover-vsmall.png` | 200 | 15833 | 15833 | `800233e833dd9867a929037ef3edc86819cd605a5a8ffab94d1838e77cbfcda7` |

Totals: **22573 encoded / 37435 decoded bytes**. The first two payloads used
gzip; the PNG payload was unchanged by decoding. `wire-1.body` through
`wire-3.body` preserve the original encoded HTTP payloads. `response-1.body`
through `response-3.body` preserve the native transport-decoded bytes before
loader parsing. Each saved length/hash agrees with its response metadata and
the original raw output; decoding each wire payload reproduces the corresponding
native body byte-for-byte.

`response-1.json` through `response-3.json` retain native response metadata.
`stdout.jsonl` preserves wire raw-header name/value ordering and response events.
All observed headers are present; the privacy filter redacted **zero** header
pairs in this run. Raw wire header arrays were independently reconciled with
both the native headers and the saved response metadata. These are Node's HTTP
header fields and payloads, not literal TLS records or an HTTP header-block dump.

## Policies and cleanup boundaries

- Only the audited native browser/transport was used. Page scripts, SafeJS,
  devices, TTY, providers, alternate clients, and mocks were not exercised.
- Public-address policy, certificate verification, native User-Agent identity,
  original-loader provenance and same-origin admission remained enforced.
  Native requests reported credentials `include` from a fresh empty jar; the
  privacy wrapper forwarded `omit`, and no Cookie/Authorization headers went
  onto the wire. This distinction is recorded rather than labeled an unchanged
  credential policy.
- The original loader used `fetchStylesheet` for `/style.css`; no explicit
  `fetchStylesheetWithPolicy` callback or policy object was observed. A later
  `/linux/man-pages/style.css` discovery was recorded, but it was not fetched
  after the stop. CSS completeness and loader completion are not claimed.
- Native document limits remained 50000 nodes, depth 256, 2000000 text code
  units and 1024 changes. No browser capacity was raised. The live bounds were
  eight bodyless GETs, 30 seconds plus five seconds termination grace, 6 MiB per
  file/combined child output, 12 MiB lane and 64 MiB minimum free space.
- Lane, HOME and TMP were created mode0700 before execution. The child received
  an explicit seven-variable environment allowlist, no stdin/TTY, no-new-privs,
  syscall restrictions, a zero core limit and a 6 MiB file limit. HOME/TMP stayed
  empty. Source, compiled, release, adaptation-source and prelaunch harness pins
  were unchanged afterward.
- One initialized document had 722 nodes at immediate shutdown and **zero**
  after the single bounded 50 ms settlement observation (50.342914 ms measured).
  Document resources/mutation/inline-declaration ownership was closed; pending
  loads, queued/active requests and transport activity settled to zero.
- **Event/control/image owner cleanup remains unproved:** the aborted load
  never reached the harness's completed-page owner registrations, leaving zero
  sampled owners for those categories. Empty arrays are not cleanup evidence.
  No extra browser run was performed to repair this evidence gap.

## Preservation and independent checks

Evidence lane:
`node_modules/.cache/native-validation/native-man7-manual-flow-september12/`.

`BYTE-COPIES.json` records byte counts and hashes of the original task, release,
byte-preservation lesson and adaptation references versus their saved archives.
They were copied as Buffers with exclusive creation and compared immediately;
they were not trimmed, reflowed, or emitted through a text patch as purported
byte-identical archives. Adapted executable files are separately named derivative
files, not asserted to be raw copies. Historical reports/lanes were not modified.

The first offline seal precheck correctly rejected abbreviated end timestamps
in this report. `REPORT-PRECHECK01.md`, `checks-precheck01.mjs.source` and
`SEAL-PRECHECK01-FAILURE.json` preserve the failed draft, original checker and
byte/hash assertions. This report expands the dates without weakening that
check. No ledger had been created and no native work was repeated. The failure's
exact UTC was not captured; its record distinguishes later archival time.

Key artifacts are `PREFLIGHT.json`, `INVOCATION.json`, `EXECUTION.json`,
`stdout.jsonl`, `progress.jsonl`, the six body files and three response metadata
files, `INTEGRITY.json`, `RESULT.json`, and `VERIFICATION.json`. All owned paths
are listed in `ARTIFACTS.txt`. `RECEIPTS.sha256` seals the evidence and report;
`FINAL-RECEIPTS.sha256` additionally seals the verification and first ledger.
Both use repository-root-relative paths and exclude their own circular hash.

`verify.mjs` is a read-only independent checker; run it with the lane's
`network-guard.mjs` preload to verify both ledgers, current release inventories,
raw archives and response-byte/header/accounting/report claims. It performs no
native navigation, browser replay or gate rerun. Evidence-check passes are
distinct from the failed flow and the explicitly unproved owner categories.

## Checkable claims

```json
{
  "classification": "harness-policy-boundary",
  "flowPassed": false,
  "auditedCommit": "8daf14b35b31a6ce086480861bb9ab60baedcec3",
  "auditedPassed": 11268,
  "navigationCalls": 1,
  "commits": 0,
  "clickCalls": 0,
  "inspectedAnchors": 0,
  "nativeRequestAttempts": 4,
  "wireRequests": 3,
  "mockedRequests": 0,
  "encodedBytes": 22573,
  "decodedBytes": 37435,
  "rootDecodedBytes": 17305,
  "rootDecodedSha256": "f14b7f93b12bf3e2e32b1f88687c4053801d34baca4932ec4b409e24b7dde4cb",
  "blockedHost": "c.statcounter.com",
  "nonvacuousDocumentCleanup": true,
  "eventControlImageCleanupProved": false,
  "nativeTitleObserved": false,
  "nativeHistoryObserved": false,
  "retried": false
}
```
