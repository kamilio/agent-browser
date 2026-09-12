# man7 optional-image native follow-up — September 12, 2026

## Outcome

**Flow incomplete: the initial manual committed, but the one genuine discovered
manual-link click stopped at the native formatting/layout guard.** The original
loader's cross-origin tracking image was rejected locally without aborting the
navigation. This was not a server rejection and is not a completed two-document
flow. No retry, forced click, URL substitution, resource rewriting, fabricated
response, capacity change, or production modification followed the guard.

The only fresh native run used audited commit
`99108ab454de37e7b89786cc4b95388c7d56d0ea`, the **11492 passed / 0 failed / 2
excluded** release. Later parent-owned image-session tests and gate runs are not
part of this run and do not relabel its runtime or acceptance result.

- Supervisor UTC: `2026-09-12T02:09:53.828Z` through
  `2026-09-12T02:09:55.387Z`.
- Native observation UTC: `2026-09-12T02:09:53.946Z` through
  `2026-09-12T02:09:55.378Z`.
- Supervisor exit: `1`, no signal, no timeout, no output-cap violation;
  process group observed absent after exit.

## Scope and immutable runtime

Contract:
`node_modules/.cache/native-validation/optional-resource-work-september12/MAN7-TASK.md`.
New private lane:
`node_modules/.cache/native-validation/native-man7-optional-image-september12/`.
All filenames below without a directory are relative to that lane.

Runtime:
`node_modules/.cache/native-validation/native-float-document-september12-round03/snapshot01/dist`.
Release source:
`node_modules/.cache/native-validation/float-document-work-september12/RELEASE.md`.
Before launch, `PREFLIGHT.json` verified the release Markdown pins, all 20 gate
receipts, audit and commit-verification pins, native-result and summary pins,
599 manifest entries, 203 selected suites, 202 strict roots, 22 committed
snapshot files, 1091 source files, and 1928 compiled files. It also checked the
original reference's two receipt ledgers. No build or historical test gate ran.

- Source-ledger SHA-256:
  `b2de339958a5568f598748f4a94dddd737df82fa0c188bb4b4d5d1fac294af10`.
- Compiled-ledger SHA-256:
  `abab5b33a0984e56a5be422522fac6df52aa078cf7cd0fcef62d21ccfbc30ff2`.

Before/after source and compiled inventories, original references, gate receipts,
security executables, and launched harness pins remained unchanged. This report
and the new private lane are the only write scope. Shared docs, production,
tests, manifests, prior evidence, and `TASKS.md` remain parent-owned. No commit
or push was made.

## Actual navigation, discovery, and click

The single initial navigation was to
`https://man7.org/linux/man-pages/man1/ls.1.html`. Native loader completion and
one session commit were observed. The page reported title
`ls(1) - Linux manual page`, root `e1`, 722 nodes, revision 727, and page/session
history length 1 at index 0 with history key `h1-1`.

Native discovery inspected all 64 available `body a[href]` occurrences, below
the 96-anchor cap. Every inspected occurrence received native style
displayed/visible and interaction-actionability checks before URL deduplication.
There were 23 eligible occurrences and 22 unique destinations. An eligible
stat(1) was not present; the recorded stat-family links were `stat(2)` and
`statx(2)`, not invented replacements for `stat(1)`.

The first eligible fallback was the actual `date(1)` anchor, reference `e472`,
observed href `../man1/date.1.html`, resolving to
`https://man7.org/linux/man-pages/man1/date.1.html`. Its native availability was
displayed/visible, with no actionability block or ARIA-disabled state, and a
complete ancestor walk. This is native availability evidence, not successful
screen-geometry or hit-test evidence.

Exactly one `session.click` was attempted on that reference. It raised
`AgentBrowserError`, code `unsupported`:

> Document width resolution requires an issue-free supported formatting profile

No destination request, destination commit, or completed click result occurred.
After failure, the observed URL, title, root, node count, revision, page history,
and session history were unchanged. The same native document remained loaded
until explicit cleanup. There was no second action or navigation retry.

## Optional-image policy and loader state

An original `fetchImage` callback requested
`https://c.statcounter.com/7422636/0/9b6714ff/1/`. The harness recorded one
`policy-denied` rejection before forwarding to `NodeNetworkTransport` or
constructing any wire request. It threw that error back to the unchanged image
loader without setting the global navigation stop. No request to that host,
server response from that host, synthesized image body, element removal, or
element rewrite occurred. Documents and CSS stayed restricted to
`https://man7.org`; HTTP failures, Retry-After, and classified barriers remained
whole-flow stops. No such server failure or challenge was observed.

The native image owner reported two image elements and two image requests:

- `e688`: original same-origin PNG cover, `state: complete`, natural dimensions
  114 × 150, origin-clean.
- `e710`: tracking image, `state: broken`, `error: policy-denied`, natural
  dimensions 0 × 0, not origin-clean. Native `complete: true` means the image
  load has settled; it does **not** mean successful decoding or rendering.

The native image owner had no aggregate failure and had no active or queued
image work at loader completion. The page's two original CSS loads also
completed: `/style.css` and `/linux/man-pages/style.css`. Actual callbacks were
`original-native-loader.fetchStylesheet`, not `fetchStylesheetWithPolicy`;
the explicit-policy callback list was empty, so no policy object is claimed to
have been observed. CSS metrics recorded 2 external sheets, 80 rules,
204 declarations, and 6424 code units. The configured image fetch adapter was
never replaced. Original image/CSS bodies and DOM elements were not modified.

The native callbacks requested credentials `include`; the harness explicitly
enforced `omit` at native transport admission, preserving the provenance
distinction. The fresh cookie jar began empty, accepted no cookies, and ended
empty. No Cookie, Authorization, or Proxy-Authorization header went to wire.

## Network and raw-byte evidence

Five native adapter attempts comprised four forwarded native requests and one
local image rejection. Four native HTTPS wire constructions received four HTTP
200 responses; there were zero mocks, zero redirects, and no destination wire
request. Every admitted request was a bodyless GET to `https://man7.org` using
the unchanged native public-address policy, TLS validation, and native identity
`AgentBrowser/0.1`. Wire-start spacings were 355, 316, and 400 ms, each at least
250 ms. Encoded bytes totaled 23256; native-decoded bytes totaled 39562.

| Capture | Observed resource | Encoded bytes | Decoded bytes |
| --- | --- | ---: | ---: |
| 1 | `/linux/man-pages/man1/ls.1.html` | 5629 | 17305 |
| 2 | `/style.css` | 1111 | 4297 |
| 3 | `/tlpi/cover/TLPI-front-cover-vsmall.png` | 15833 | 15833 |
| 4 | `/linux/man-pages/style.css` | 683 | 2127 |

For each capture, `wire-N.body` holds the exact encoded HTTP payload observed
before native decoding; `response-N.body` holds the actual native-decoded body;
`response-N.json` holds its metadata and normalized headers. Original ordered
header pairs, exact wire UTC, status, and encoded-body hashes remain in
`progress.jsonl` and the `wire` array of `stdout.jsonl`. No protected header
pairs were encountered/redacted. These are native transport observations, not
packet capture or raw HTTP/TLS framing.

| Capture | Encoded SHA-256 | Decoded SHA-256 |
| --- | --- | --- |
| 1 | `9269b1df39d46949fe3c3a1fa61bc998340987a3c64d138748c173330b4ede32` | `f14b7f93b12bf3e2e32b1f88687c4053801d34baca4932ec4b409e24b7dde4cb` |
| 2 | `bd310106a8d9e571f1d611480cc2396387173684a8250dcc8503ab29dc3df4cd` | `89a03c73a6cda268fbe6802d620f03531830c4c1be798b299ad83b3ff7f237c2` |
| 3 | `800233e833dd9867a929037ef3edc86819cd605a5a8ffab94d1838e77cbfcda7` | `800233e833dd9867a929037ef3edc86819cd605a5a8ffab94d1838e77cbfcda7` |
| 4 | `165a75a1547984e917f407f04ae9b9764ea8799ed0214215d60db5991a8d3a61` | `62db619b02602156163bf01ada15d6c024ff8c87fc0c706b04cca9de2457c32d` |

## One post-guard census

One bounded read-only formatting census followed the failed genuine click.
It used unchanged native limits, visited 697 DOM nodes, recorded 706 formatting
nodes, 10490 text code units, work 16650, and 5 deferred subtrees. Document
revision stayed 727 before/after the census. No partial-layout fallback or
diagnostic suppression was used.

| Diagnostic source | Observed issues |
| --- | --- |
| Raw `styles.metrics().issues` | `unimplemented-or-invalid-css-value: 10`; `unimplemented-css-property: 17` |
| Applicable `styles.metrics().applicableIssues` | `unimplemented-or-invalid-css-value: 3`; `unimplemented-css-property: 1` |
| Formatting CSS issues | The applicable values above, with `css:` prefixes |
| Independent non-CSS formatting issues | `display-layout-not-supported: 3`; `table-collapsed-borders-not-supported: 5`; `element-layout-not-supported: 2` |

The five deferred samples were three tables (`e27`, `e61`, `e649`), a fieldset
(`e105`), and a noscript element (`e707`). These observed profile limitations
explain why issue-free width/layout could not be claimed; the census does not
establish that fixing any single issue would complete the flow. Native color
preference remained unset/effective light; there was no OS preference detection,
host override, site override, or page-script experiment.

## Owners and execution boundaries

The actual event/control owner was captured immediately after the original
session `initializeDocument` configured history/storage. The image owner was
captured at the original stylesheet callback, after the unchanged native loader
had configured it. Both registrations precede loader completion and retain
actual owner objects; no second owner or replacement adapter was created.

Cleanup observations are nonvacuous: one document owner, one event owner, one
image owner, and one interaction/control owner were observed. All closed with
zero retained document nodes/text, zero collectors, zero event listeners/active
dispatches, zero image resources/active/queued/waiters, zero retained files/bytes,
and zero pressed mouse buttons or busy interaction. Native transport active
requests and session pending loads/queue active/queue pending were zero, with
both session and transport closed and zero session cleanup errors. No settlement
delay was needed. This proves only the instrumented owner scopes, not broader
engine acceptance.

The lane and fresh HOME/TMP directories were created mode 0700; HOME/TMP stayed
empty. The explicit environment contained only PATH, LANG, LC_ALL, TZ, HOME,
TMPDIR, and PYTHONDONTWRITEBYTECODE. Stdin was ignored, no TTY/PTY was allocated,
no page scripts or real SafeJS ran, and there were no providers, submissions,
devices, alternate clients/transports, identity spoofing, or challenge bypasses.
The launch retained an 8-GET cap, 250-ms pacing, 30-second wall plus 5-second
termination grace, 6-MiB individual-file/combined-output cap, 12-MiB lane cap,
and at least 64 MiB free space. Native stdout was 144030 bytes and stderr empty;
storage/free-space checks passed. `INVOCATION.json` and `ENVIRONMENT.json`
record the exact child invocation and allowlist; the supervisor itself ran with
6-MiB RLIMIT_FSIZE and zero core size. The child also verified seccomp and
no-new-privileges enforcement.

## Preservation and offline verification

The historical reference remains separately preserved at
`node_modules/.cache/native-validation/native-man7-manual-flow-september12/` and
`MAN7-MANUAL-FLOW.md`. Its original tracker-induced global abort was a harness
policy boundary, not an engine failure. It was read for adaptation only and
was not rerun or modified. This follow-up does not rewrite its measurements.

Before adaptation, 60 original reference/contract/release files were archived as
exact Buffer copies, with immediate length/hash equality checks recorded in
`BYTE-COPIES.json`. Historical scripts, failures, prechecks, reports, bodies,
and ledgers remain in `reference--*` or the named source archives. They were
not trimmed, reflowed, or normalized. Historic failures remain historic; the
fresh run and fresh offline checks are separately named. The new preparation,
syntax, and postflight checks had no failures requiring a rerun or correction.

`RESULT.json` contains 33 passing offline raw-evidence checks. The final
`VERIFICATION.json` adds report cross-claims. `RECEIPTS.sha256` and
`FINAL-RECEIPTS.sha256` cover the report and lane inventory, with
`ARTIFACTS.txt` naming every file. Independent checking recomputes actual body
lengths/hashes, gzip decoding, ordered/normalized header agreement, raw-progress
wire counts, local rejection and image state, actual discovery/selection,
unchanged history, census attribution, owner closure, original archive claims,
immutable runtime inventories, and both old/new receipt ledgers.

Offline report checks and valid ledgers are **not flow acceptance**. The final
classification remains `native-layout-guard-after-optional-image-local-rejection`:
the optional-image policy allowed the initial native page to commit, but the
genuine discovered manual click did not complete. Broader browser gates and
subsequent parent test evidence remain separate.

## Checkable claims

```json
{
  "classification": "native-layout-guard-after-optional-image-local-rejection",
  "flowPassed": false,
  "auditedCommit": "99108ab454de37e7b89786cc4b95388c7d56d0ea",
  "auditedPassed": 11492,
  "supervisorStartedAt": "2026-09-12T02:09:53.828Z",
  "supervisorFinishedAt": "2026-09-12T02:09:55.387Z",
  "nativeStartedAt": "2026-09-12T02:09:53.946Z",
  "nativeFinishedAt": "2026-09-12T02:09:55.378Z",
  "navigationCalls": 1,
  "commits": 1,
  "clickCalls": 1,
  "inspectedAnchors": 64,
  "eligibleOccurrences": 23,
  "uniqueDestinations": 22,
  "selectedReference": "e472",
  "selectedText": "date(1)",
  "selectedUrl": "https://man7.org/linux/man-pages/man1/date.1.html",
  "stat1Eligible": false,
  "nativeRequestAttempts": 5,
  "wireRequests": 4,
  "mockedRequests": 0,
  "encodedBytes": 23256,
  "decodedBytes": 39562,
  "pacingMs": [355, 316, 400],
  "localImageRejections": 1,
  "blockedHost": "c.statcounter.com",
  "imageReference": "e710",
  "imageState": "broken",
  "imageComplete": true,
  "title": "ls(1) - Linux manual page",
  "rootReference": "e1",
  "nodeCount": 722,
  "revision": 727,
  "historyLength": 1,
  "rawCssIssues": {
    "unimplemented-or-invalid-css-value": 10,
    "unimplemented-css-property": 17
  },
  "applicableCssIssues": {
    "unimplemented-or-invalid-css-value": 3,
    "unimplemented-css-property": 1
  },
  "nonCssFormattingIssues": {
    "display-layout-not-supported": 3,
    "table-collapsed-borders-not-supported": 5,
    "element-layout-not-supported": 2
  },
  "deferredSubtrees": 5,
  "formattingNodes": 706,
  "ownerCleanupProved": true,
  "archiveCopies": 60,
  "retried": false
}
```
