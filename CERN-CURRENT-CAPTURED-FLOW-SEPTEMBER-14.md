# CERN: current-engine captured link flow

**The bounded captured two-document flow passes on the current native engine.**
This September 14, 2026 check uses original September 11 responses, not new live
requests. It does not replace the historical live result in CERN-NATIVE-FLOW.md.

## Native result

Native interval: **12:27:50.626–12:27:50.715 UTC**. Runtime commit:
`b5d2efdadf208457ca04345ced94ec093ab5fa35`; repository HEAD at execution:
`a63455663cdfdaaf62d368cd1d547d8b8482d641`. The latter changes documentation only.

- Initial document: `https://info.cern.ch/hypertext/WWW/TheProject.html`, native
  title “The World Wide Web project”, 123 nodes and 1,024 body-text code units.
- Native `a[href]` discovery finds one “What's out there?” link, `e39`, with
  `href="../DataSources/Top.html"`, target `_self`, no download or ping.
- One genuine `BrowserSession.click` performs uncanceled native mouse activation
  at `(102, 130)`. There is no forced click or direct destination navigation.
- Destination: `https://info.cern.ch/hypertext/DataSources/Top.html`, title
  “Overview of the Web”, 28 nodes and 498 nonempty body-text code units.
- The destination is a new document and the old document is already closed.
  Two navigations and two commits complete. All document/image/query owners and
  queue/jobs close normally; both documents have zero nodes after session close.

One explicit initial navigation, one click, three explicit native queries, two
accepted mocked responses and 2,881 decoded bytes. Zero denials, redirects, wire
requests, page scripts, form actions or raster passes. Both original bodies are
served once; encoded replay bytes are zero. Native challenge classification of
the captured status/headers/title/text is null for both pages, not evidence of
current live access or challenge bypass.

Cleanup is settled in the first sample; no timer wait is needed. Its recorded
0.3394129999999791 ms includes snapshot/check overhead, not a shutdown latency
benchmark. The source pages retain their native partial/quirks diagnostics;
successful link navigation is not full visual or HTML/CSS conformance.

## Failed harness attempt retained

The first attempted current-engine replay, at **12:26:02.040–12:26:02.047 UTC**,
failed before native document loading. Its harness compared the prototype of a
normalized null-prototype header record with the plain JSON metadata record.
The actual transport records one mocked response / 2,217 decoded bytes, while
the harness never increments its accepted-response counter. No document commits,
query or click occurs. Original verification remains **failed**; this does not
establish a CERN compatibility regression.

The successful result above is an explicit, separately sealed retest. Its sole
workload change compares exact ordered header entries instead of prototypes,
following the existing MDN replay pattern. Names, value arrays, order, status and
body bytes are still checked. No production code or captured response changes.
Both consumed lanes, including the failed verifier, remain unchanged.

## Verification and evidence

The successful prepared verifier passes nine checks. Independent parent checks
rehash both 42-entry evidence ledgers, confirm the single workload-expression
change, exact native link/content/mouse outcomes, two commits, owner closure and
process absence. The failed verdict and original historical CERN ledger remain
intact. The completed 23,340-pass native gate with two unchanged exclusions was
rehashed, **not rerun** for either observation: 466 files, 465 strict roots,
2,901 source inputs and 2,192 compiled files.

Successful supervisor: 12:27:50.497–12:27:50.742 UTC, PID/group 1593039, exit 0,
16,853 output bytes. Failed supervisor: PID/group 1590756, exit 1, 5,889 bytes.
Both groups are absent; private HOME/TMP directories are removed. No timeout,
output-cap, stream or integrity error. Existing JS/kernel guards, 30s deadline,
5s grace, 35s watchdog and pipe-only IO remain. No kernel-denial telemetry was
collected. This is not live, SafeJS, credential/device or TTY/socket acceptance.

Original lanes:
`/dev/shm/agent-browser-cern-current-flow-september14/` and
`/dev/shm/agent-browser-cern-header-retest-september14/`.
Durable byte-identical copies:
`node_modules/.cache/native-validation/cern-current-flow-september14/` and
`node_modules/.cache/native-validation/cern-header-retest-september14/`.

| Successful artifact | SHA-256 |
| --- | --- |
| before-RESULT.json | 1bd22b6a1aa5b12b7b68e16fba2278120c190779d39493d1a388852784e3ba54 |
| VERIFICATION.json | e21355b409d9c8c7e80f115af71436a355d48201d970df3d6fc4e3cc361b815a |
| EVIDENCE.sha256 | c61bd8fcaa10cb19907dbfc50859b504d50b839d52087dc6d81a29f4ee4f42be |

Failed result SHA-256:
`e06d33767b22ef8ed9cb4df02cc2f223a866a3c7cd5f22b341e6a8e0d6311e2a`.
The two historical response hashes and paths remain those in CERN-NATIVE-FLOW.md.
No push; broader website, script-heavy, research and device gates remain open.
