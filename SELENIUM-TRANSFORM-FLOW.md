# Selenium post-casing native flow: stopped at the local click layout guard

## Actual outcome

One separately authorized fresh public native-browser run on September 12, 2026,
using committed release `ae098bf77c19d626a8f54561da8bc3b496cbc308`. Initial navigation committed, but
the one genuine native reference click failed a local layout guard before any
destination request. **Navigation-flow acceptance is false.** No retry or fallback.
This is not a server restriction and does not establish a cause for the remaining
layout limitation. The other worker's cached CSS diagnostic was not consulted or
duplicated. No page-runtime analysis ran after the stop.

- Supervisor interval: 2026-09-12T17:31:40.097Z–2026-09-12T17:31:40.962Z; measured
  monotonic duration **0.8633775748312473 seconds**, exit1. No timeout,
  delivered signals, output truncation or surviving process group.
- Child report interval: 2026-09-12T17:31:40.422Z–2026-09-12T17:31:40.949Z.
- Start: `https://www.selenium.dev/selenium/web/simpleTest.html`, HTTP200, title **Hello WebDriver**,
  197 native document nodes, one committed document.
- The original native image loader fetched `https://www.selenium.dev/selenium/web/icon.gif`,
  HTTP200. Response bodies and encoded wire payloads are fresh files in this lane.
- 8 current `a[href]` occurrences inspected before deduplication,
  below the96cap; 1 eligible occurrence and
  1 unique eligible destination. Genuine native ref
  **e137**, `href="resultPage.html"`, resolved to `https://www.selenium.dev/selenium/web/resultPage.html`.
  Observed native text: **this link should breakon multiple lines**.
- Exactly one `session.click` invocation. It threw `AgentBrowserError`,
  code`unsupported`, stage`native-information-link-click`:
  **Document width resolution requires an issue-free supported formatting profile**.
- No destination request, click result, destination commit or post-click history
  sample. Before-click history was index0,length1; final session counters record
  one navigation/commit. No successful geometry or hit result; no paint/capture
  was exercised. Native mouse actions remained0; read-only scroll metrics had0builds.

## Accounting and fixed bounds

2 native bodyless GETs, 2 native HTTPS request constructions,
2 authenticated TLS connections and 2 HTTP200 responses,
all on exact origin `https://www.selenium.dev`. 2 adapter admissions,
0 rejected admissions, 0 redirects,
0 mocks. **1,423 encoded bytes /
3,250 transport-decoded bytes**. Native request-start interval:
**260.29935399999994 milliseconds**, above250ms; observed concurrency never exceeded1.
TLS validation/public-address policy and AgentBrowser/0.1 were retained; fresh
empty cookies, credentials omitted and credential request headers prohibited.

Encoded captures are original HTTP payloads and ordered Node header strings,
not TLS/TCP packet capture. Credential header pairs are excluded. SHA256 links
captured headers, encoded bodies and decoded bodies; image raster allocation is
distinct from transport-decoded bytes. No raw-HTML replacement parser was used.

Bounds remain32GETs,1concurrent,250ms minimum spacing,2MiB encoded/decoded per
response,8MiB encoded/decoded totals,45seconds plus5kill grace,6MiB each/combined
stdout/stderr and individual artifacts,16MiB lane,64MiB free minimum.
Live stdout was **63,851 bytes**, stderr0.
Free space at live supervisor start was **4,837,023,744 bytes**.
The maximum pre-existing gate artifact was **4,317,688 bytes**.
Storage/caps are also rechecked during offline verification and sealing.

## Stop policy and cleanup

3 exposed image/stylesheet policy observations occurred:
original loader return before commit, committed initial page before discovery,
and immediately before the native reference click. No exposed denial/capacity
failure, Retry-After, server challenge or restriction was observed. These are
observation boundaries, not interception of every internal policy denial instant.
Static rejected-check and runtime guard-attempt logs were empty; the native
layout exception is preserved separately, not mislabeled as transport denial.

The abort signal was set and session.close called. Final samples prove cleanup
for one instrumented document, event, image and control owner: no remaining nodes,
text allocation, listeners, dispatches, queued/active image jobs, files or pressed
mouse state; transport and request queue closed with0active/0pending. Private
HOME/TMPDIR remained empty and the child process group was absent. This is evidence
for those instrumented owners, not a claim about unsampled ownership.

## Release and evidence provenance

Main's explicit committed release message was read before binding or execution;
its exact text is retained in RELEASE-MESSAGE.md. Before that message, work was
preparation only: no network, Git pinning or harness execution.
The release's existing build/strict/format/native gate reports
**14,922/0/2**, **1,176 source / 1,992 compiled files**,
290 selected suites, 289 strict roots and 668 manifest entries.
This lane did not rerun those broad tests or treat them as a live acceptance gate.

Preparation preserved20gate receipts and21committed snapshot inputs;24actual Git
objects (commit, root/src trees and21blobs) were retrieved read-only before and
after execution outside kernel denial. Offline checks cryptographically link
those bytes to the explicit release; source and compiled inventories match before
and after. No HEAD assumption, Git edit, index update, commit or push occurred.
Node22.22.0 and probe/helper SHA256 pins are retained with phase invocations.

Exact historical helper templates and their hashes are retained separately.
The original SELENIUM-SIMPLE-FLOW.md and its221-entry sealed lane remain unchanged.
That original native13769 run also stopped locally, but its timings and evidence
are not relabeled as this run. This new result independently records the same
error message without asserting identical causes or a new unique-host visit.

Bootstrap binding/syntax, preparation, Git recapture and preflight succeeded;
their stdout/stderr and receipts are preserved. The sole live failure is retained
unaltered in live/stdout.json and progress.jsonl. The supplementary
observation-summary.json is a diagnostic stream containing two JSON values, not
the structured verification input. Any later offline verification failures must
remain in distinct fresh log paths; no failure permits another live run.

## Verification, sealing and limitations

`offline.py verify` / `verifyFlow()` are read-only and do not import the page
runtime, reparse HTML or replay network. Offline socket/socketpair and associated
syscalls are denied. The live wrapper blocks listeners/ptrace/process-vm/io_uring
but relies on guarded native transport for outbound access; it is not full live
network kernel isolation. No socket self-probes, SafeJS, providers, credentials,
devices, TTY/PTY, alternate browser or external search was used.

Evidence verdicts are recorded in CHECKS.json and RESULT.json. SEAL.json and
FINAL-RECEIPTS.sha256 bind this original new report and every lane file; the final
ledger excludes only itself. ARTIFACTS.json additionally self-excludes itself and
the subsequently created SEAL.json/final ledger. No writes are permitted after
sealed completion. Main's independent Git recapture and verification remain
pending and their outputs must stay outside the sealed lane.

No new unique-host, whole-site, performance, geometry/paint, form, provider or
challenge acceptance is claimed. No source, tests, manifest, TASKS, old evidence
or other worker's lane was changed. Owned paths are this report and
`node_modules/.cache/native-validation/native-selenium-transform-flow-september12`.

## Machine-Checked Measured Claims

```json
{
  "outcome": "stopped-partial-native-flow",
  "acceptancePassed": false,
  "commit": "ae098bf77c19d626a8f54561da8bc3b496cbc308",
  "nativePassed": 14922,
  "nativeFailed": 0,
  "nativeExcluded": 2,
  "initialUrl": "https://www.selenium.dev/selenium/web/simpleTest.html",
  "selectedUrl": "https://www.selenium.dev/selenium/web/resultPage.html",
  "selectedReference": "e137",
  "anchorsInspected": 8,
  "clickCalls": 1,
  "committedDocuments": 1,
  "destinationRequested": false,
  "failure": {
    "stage": "native-information-link-click",
    "name": "AgentBrowserError",
    "code": "unsupported",
    "message": "Document width resolution requires an issue-free supported formatting profile"
  },
  "requests": 2,
  "encodedBytes": 1423,
  "decodedBytes": 3250,
  "intervalsMs": [
    260.29935399999994
  ],
  "elapsedSeconds": 0.8633775748312473,
  "stdoutBytes": 63851,
  "stderrBytes": 0,
  "policyObservations": 3,
  "cleanupPassed": true,
  "capsPassed": true,
  "newUniqueHostClaimed": false
}
```
