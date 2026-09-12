# Selenium simple-fixture native navigation: stopped partial result

## Measured outcome

One separately declared public native-browser run on September 12, 2026. Initial
navigation committed, but the one genuine reference click stopped at a native
layout limitation. **Navigation-flow acceptance is false.** No retry, fallback,
new origin, alternate client/browser, content stripping or challenge bypass.
The prior web-form lane belongs to another worker and was not read or changed.

- Supervisor: 2026-09-12T15:21:45.553Z–15:21:46.395Z, measured monotonic duration
  **0.8403253331780434 seconds**, exit1, no timeout/signals/truncation; process group
  absent. Child report interval:15:21:45.866Z–15:21:46.381Z.
- Start: `https://www.selenium.dev/selenium/web/simpleTest.html`, HTTP200,
  title **Hello WebDriver**,197native document nodes, one committed document.
- Original native image loader fetched `https://www.selenium.dev/selenium/web/icon.gif`,
  HTTP200. Native image snapshot exposed an18×18 GIF initial frame and one empty
  image element; this is not paint or pixel-comparison acceptance.
-8current `a[href]` occurrences inspected, below96cap; one eligible occurrence,
  one unique eligible destination. Native reference **e137**, `href="resultPage.html"`,
  resolved to `https://www.selenium.dev/selenium/web/resultPage.html`; observed
  text **this link should breakon multiple lines**. No eligible index.html link.
- Exactly one `session.click` invocation with e137. It threw `AgentBrowserError`,
  code`unsupported`, stage`native-information-link-click`:
  **Document width resolution requires an issue-free supported formatting profile**.
- No destination request, click result, destination commit or after-click history
  sample. Before-click history was index0,length1 at the initial URL; session close
  reported one navigation/commit. No claim of a successful navigation or post-click
  history transition. No successful geometry or hit result; no paint/capture was
  exercised. Final native mouse owner recorded zero actions.

## Accounting and policy boundaries

Two native bodyless GETs, two native HTTPS request constructions, two authenticated
TLS connections and two HTTP200 responses, all on exact origin
`https://www.selenium.dev`. Two adapter admissions; zero rejected admissions,
redirects or mocks. **1,423 encoded bytes / 3,250 transport-decoded bytes** total:
HTML1,296encoded/3,123decoded; GIF127/127. Image raster allocation is separate from
transport-decoded response bytes. Wire captures are original encoded HTTP payloads
and ordered Node header strings, not TLS/TCP packet captures; credential headers
are excluded. SHA256 links all captured headers and encoded/decoded bodies.

Native HTTPS request-start spacing was **261.055491 milliseconds** (stored double
261.05549099999996); concurrency observation was zero already-active requests at
each start. This proves instrumented native request-start spacing, not remote
arrival or packet timing. Preserved native public-address/DNS/TLS checks and
AgentBrowser/0.1 identity. Underlying requests used credentials`omit`; provenance
metadata separately retains the original native callbacks'`include` requests
before the override. Fresh cookie jar remained empty; wire credential headers
were rejected by the guard. No credentials/providers/SafeJS/devices/page scripts.

Three exposed resource-policy observations were clear: original loader return
before commit; committed initial page before anchor discovery; immediately before
the one native reference click. Each exposed zero image policy/capacity denials,
no stylesheet policy issues and no image failure. This is post-native-settlement
observation before further action, **not instantaneous internal-denial interception**.
No restriction, challenge, Retry-After or admission/pacing assertion was observed.
`rejected-checks.jsonl` is empty, not missing; native unsupported-layout failure
is separately recorded. Safe structured guard labels remain in the sealed harness.

Native raw and applicable CSS metrics each exposed four
`unimplemented-css-property` issues before clicking. These counters are not a
diagnosis of the particular layout failure; no post-stop page analysis, HTML
reparse, source fix, parameter adjustment or second experiment was performed.
Native default preference was null/effective light; no preference override.

Allowed, discovered-anchor, admitted, attempted, TLS-connected and responding
origin sets each contain only the Selenium origin; allowed-only set is empty.
HTTP replies and TLS establish actual contact, not mere discovery or permission.
**No new unique-host claim**: www.selenium.dev is already historical.

## Bounds, cleanup and evidence

Fixed caps:32GETs,1concurrent,250msminimum start spacing;2MiBencoded/decoded per
response;8MiBencoded/decoded totals;45seconds plus5kill grace;6MiBeach/combined
stdout/stderr;16MiBlane;64MiBfree before run. Output was **64,333 bytes stdout,
zero stderr**. Free before run:2,465,345,536bytes. No cap/admission failure or cap
raise. Final storage is measured in the sealed metadata and read-only verifier.

Session close/abort completed; zero active transport requests, queued requests,
pending loads, tabs or cleanup errors. One document/event/image/control owner
each was instrumented and closed: zero retained document nodes/text, listeners,
image resources/active/queued/waiters, files/bytes and pressed mouse buttons.
Private HOME/TMPDIR remained empty and0700; stdin DEVNULL, no TTY/PTY. Live seccomp
denies listening/ptrace/process-vm/io_uring but does not kernel-deny outbound
sockets; the original native transport and harness enforce live origin/provenance.
Offline verification denies socket/socketpair and network syscalls in the kernel.

Runtime: pinned Node22.22.0, executable
`/home/kjopek/.nvm/versions/node/v22.22.0/bin/node`, SHA256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
Committed release **4c2d78c8b7c6c10acef91a04ed6b17613ce0f345**; native
**13,769passed/0failed/2unchanged exclusions**,266selected suites,265strict roots,
657manifest entries,1,146unchanged tracked inputs. Only immutable
`node_modules/.cache/native-validation/native-block-content-alignment-september12-round01/snapshot01/dist`
was imported. No dirty source or other live runtime was imported.

Exact before/after evidence: **1,160 source / 1,972 compiled files**,20gate receipts,
commit proof,13owned paths plus native-tests.json = **14 inputs**, **17 Git objects**
(commit,root/src trees,14blobs). scope.json and actual captured Git bytes were
audited, not old five-input/eight-object counts. Local read-only Git captures ran
outside kernel isolation before and after the live run. Both captures match the
immutable snapshot and are cryptographically linked to commit/tree/blob IDs.

| Release evidence | SHA256 |
| --- | --- |
| Source inventory | `dc7656ca4237cd1cc04abeae7cc0e5f32160b21cdd387218e76e330a105eb481` |
| Compiled inventory | `1694a83c51d8a3f2659174bbb8d288feda6d74113ef54114852231ec528584d3` |
| Native result | `58d78d04bbcd00482d9d1b7ca0581efd2f2758a1c3afd2c3c4467ba57f72a424` |
|20gate receipts | `f98afce65150d29bb6c091f21e608d0aba67eade3b62879706764d69508cac05` |
| Commit verification | `b6250b4f40e6e3526fa59a4d6a997b59fe883f0a09355151ee41dfd77670a405` |

## Read-only verifier interface

Private lane:
`node_modules/.cache/native-validation/native-selenium-simple-flow-september12`.
Only this lane and this new report are owned. Preparation and preflight passed;
their execution records and syntax outputs remain intact. The initial offline
verifier rejected the already-started image connection's final wire-close event
after probe-complete. Its failed stdout/stderr evidence is preserved in
verification-initial.stdout/stderr. The verifier now permits only cleanup and
closures belonging to already-recorded requests after the stop; no live rerun or
page analysis was performed. Immutable weather
helper source copies and its188receipt ledger are pinned and unchanged. No
protected native-source-heading-source-10 payload was opened.

From repository root, the sealed read-only supervisor interface is:

```sh
python3 -I -B node_modules/.cache/native-validation/native-selenium-simple-flow-september12/offline.py verify
```

It starts pinned Node with explicit private empty HOME/TMPDIR, DEVNULL stdin,
bounded output/deadline, kernel socket/socketpair denial and page-runtime import
denial. It verifies original bytes and bounded gzip decompression only: no HTML
parse, browser execution or network replay. It prints JSON and makes no lane
writes; do not redirect its output into the sealed lane.

`verify.mjs` exports `verifyFlow({ independentGitDirectory } = {})`. The optional
directory, outside this lane, contains independently collected raw bytes named
`git-commit.bin`, `git-root-tree.bin`, `git-src-tree.bin`, and
`git-input-0.blob` through `git-input-13.blob`. Exact Git type/expression/order is
recorded in GIT-COMMANDS.json. Collect with local read-only `git cat-file` outside
kernel denial, not by copying worker archives. A direct sealed Node invocation
`verify.mjs verify /absolute/independent-directory` checks these additional bytes.
Default supervisor verification checks the worker's before/after captures only;
it does not pretend to replace Main's independently recaptured Git evidence.

Seal binds report/execution/cleanup/cap metadata and all private artifacts with
ARTIFACTS.json,SEAL.json,FINAL-RECEIPTS.sha256 (only ledger itself excluded).
Worker offline evidence checks and receipt sealing are not live-flow acceptance.
**Main independently verifies all evidence and handles commit.** No commits or
pushes here; no shared source/manifest/TASKS or prior-lane modifications.
No whole-site, form-control, button, speedup, provider/passkey, device, SafeJS,
challenge-bypass or overall-browser acceptance is claimed.
