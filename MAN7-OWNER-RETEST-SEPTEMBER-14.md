# Man7 owner-instrumentation captured retest — September 14, 2026

## Outcome

**The separately authorized retest committed the initial ls(1) document and
attempted one genuinely rediscovered date(1) click. The flow remains incomplete.**
The click stopped at native layout with `AgentBrowserError`, code `unsupported`:

> Percentage table role sizing requires cycle resolution

No destination request or commit occurred. This is a current native click/layout
blocker, not a destination fixture miss, live website acceptance or completed
two-document flow. The destination capture is independently absent, but that
limitation was not reached. No retry, third browser attempt, forced click,
fallback navigation, replacement asset or source modification followed.

The unchanged prepared evidence verifier passed **18 checks / 0 failed**.
The child and supervisor each exited **1**, preserving the native flow failure;
the verifier exited **0**. Successful verification establishes that this bounded
failed observation was recorded and cleaned up as scoped, not that man7 works.

## Separate authority and exact correction

Task: `/dev/shm/agent-browser-multisite-september14/MAN7-RETEST-TASK.md`, read in
full before preparation, with its adjacent `AUTHORITY.md`. New private RAM lane:
`/dev/shm/agent-browser-man7-owner-retest-september14/`. This new report and that
lane are the only write scope.

The [first failed check](MAN7-CURRENT-CAPTURED-FLOW-SEPTEMBER-14.md) and its
`/dev/shm/agent-browser-man7-current-september14/` lane remain immutable. Its
`invalid-input: Image owner is already configured` failure and **17 passed / 1
failed** verification remain exactly as originally reported. All **49 sealed
entries**, the original seal/ledger hashes and the original directory membership
were rechecked before and after this retest. The first report remains 10383 bytes,
SHA-256 `579855d9833539fc8b1c269e838cf5657756d998b5f9d6100ed4f4557fd08f0b`.

The retest workload differs from the first workload by exactly one removal:
`imageOwners.add(documentImages(document));` in `initializeDocument`.
`WORKLOAD.patch` preserves the full before/after workload diff. Existing image
observations in the loader resource callback and after `loadBrowserDocument`
returns are unchanged. Static review before launch confirmed that the native
loader invokes `initializeDocument` before configuring its image owner; the
retained resource/post-load observations occur after that configuration. The
interaction-owner accessor does not acquire the image owner. Instrumentation
does not supply image-owner configuration.

| Correction evidence | SHA-256 |
| --- | --- |
| First workload | `8c4943f91d8c3e7f78b9feb7edc66d98f90e7820231fbb15e2e46a7df9f23e0e` |
| Retest `offline.mjs` | `e7539a02b7bba0c0c963c3a05a7712f521b2d4e267020ce3c60255155dec39b0` |
| `WORKLOAD.patch` | `e04711a2d79214ca4c7268a919493f465d7e01bb96fa3d7c065eeb370af7547a` |

`common.mjs`, `fixtures.mjs`, `network-guard.mjs`, `prepare.mjs`, `run.mjs`,
`sealed-exec.py` and `verify.mjs` are byte-identical to the first lane. The audit
module changes only its output-lane binding; the seal module changes only its
new report path. New Markdown authority and a before/after correction audit
document the separate authorization and preservation. No other workload logic,
native limits, fixture, guard, action or diagnostic behavior was changed.

## Runtime and preserved work

Runtime: `/dev/shm/agent-browser-opacity-september14/release01/snapshot/dist/`.
Runtime commit: `39b55d996feb7af5320e3a1d575821743477b475`.
HEAD remained `cc2466ce6ce6fa4707c0cede7adef65cab4f09bf` at preflight, launch and
postflight. Its difference from the runtime commit remained the three existing
Markdown files: `TASKS.md`,
`WEBSITE-TEST-INVENTORY-SEPTEMBER-14-TWENTY-THIRD-UPDATE.md` and
`WIKIPEDIA-OPACITY-DIAGNOSTICS-SEPTEMBER-14.md`.

The release audit, adoption receipt and `native.stdout` hash were verified;
no build or full native gate was rerun. The inherited gate remains **23757
passed / 0 failed / 2 unchanged exclusions**, 477 selected files and 476 strict
roots. Before/after complete inventory walks matched **2925 source and 2200
compiled files**, with no changed or extra snapshot files.

| Runtime pin | SHA-256 |
| --- | --- |
| Release audit | `735a820574fdffa0af4d0ecf8ded759f2a4c955aa37fe2550e518f441e766de5` |
| Source inventory | `d83227bad54ecaa20c738be4a899a1ca63f19049b6f3cb991ec5b283d6ef23cf` |
| Compiled inventory | `7bdeceba8cde54c2387f38c2527e3f3548019c1e13aab4c5c2aeba707bcf5bd9` |

The original optional-image ledgers retained 104 and 106 verified entries;
the historical noscript replay ledgers retained 74 and 75. Original captures,
[optional-image report](MAN7-OPTIONAL-IMAGE-FLOW.md),
[noscript replay report](MAN7-NOSCRIPT-REPLAY.md), and first current-check report
were not altered or relabeled. Their original paths and measurements stand.
**1478 existing source, script, package and native-manifest files** were hashed
before/after and preserved. No root dirty code or old runtime was imported into
the browser. No shared documents, source, manifest, runtime, commits or pushes
were changed, and no new agents were launched.

## Captured resources and actual native flow

All responses are the unchanged original artifacts under
`node_modules/.cache/native-validation/native-man7-optional-image-september12/`.
Receipt metadata preceded body use. All four encoded and decoded body lengths
and hashes, original ordered headers, and encoded-to-decoded byte equality were
checked before/after. The native route served each recorded response once,
preserving its HTTP 200 status, URL, ordered normalized headers and decoded
Buffer bytes. No new response or asset was synthesized.

| Original capture | Decoded bytes | Original received UTC | Current replay |
| --- | ---: | --- | --- |
| `response-1.body`, ls(1) HTML | 17305 | `2026-09-12T02:09:54.286Z` | Once |
| `response-2.body`, root stylesheet | 4297 | `2026-09-12T02:09:54.625Z` | Once |
| `response-3.body`, book-cover PNG | 15833 | `2026-09-12T02:09:55.016Z` | Once |
| `response-4.body`, manual stylesheet | 2127 | `2026-09-12T02:09:55.341Z` | Once |

Totals: **four mocked responses, 39562 decoded bytes, zero replay wire bytes**.
The original archive contains 23256 encoded bytes; these are historical payload
measurements, not current traffic. Observed mock intervals were
**251.74273799999997, 250.73330700000002 and 250.260762 ms**, all at least 250 ms.

The one initial navigation to
`https://man7.org/linux/man-pages/man1/ls.1.html` committed a document titled
`ls(1) - Linux manual page`, root `e1`, **722 nodes**, revision **727**. Native
page/session histories both held one entry, index 0, key `h1-1`. The logical
viewport was 1280 × 720, scale 1, and native scripting was false. Bounded body
text was nonempty and the native challenge classifier returned null. These
observations do not establish rendering acceptance.

Two explicit queries, `body` and `body a[href]`, were issued. Native discovery
inspected all **64** available anchors, below the 96-anchor limit. Matching used
current native text, href, resolved URL, styles and actionability, not a
hardcoded historical element identity. It rediscovered occurrence 17,
reference **e472**, text **date(1)**, href `../man1/date.1.html`, target `_self`,
resolved URL `https://man7.org/linux/man-pages/man1/date.1.html`. Native style
reported displayed/visible, without actionability or ARIA-disabled blocking.
That is availability evidence, not successful screen geometry or hit testing.

Exactly one `session.click` on this discovered reference raised the native
percentage-table sizing error. Before/after URL, title, root, node count,
revision, document identity and both histories were unchanged. No destination
request, replay miss or destination commit occurred; `flowPassed` remains false.

Five adapter attempts comprised the four accepted mocks and one unchanged
local optional-image denial for
`https://c.statcounter.com/7422636/0/9b6714ff/1/`. The original image callback
received `policy-denied` before transport admission, without aborting the whole
navigation, fabricating a response or modifying its element. The book cover
`e688` was complete, 114 × 150 and origin-clean; tracker `e710` remained broken,
settled, 0 × 0 and not origin-clean. No request went to the tracker host.

## Bounded first-blocker diagnostics

Exactly **one explicit formatting inspection** and **one cached style diagnostic
read** followed the failed click. No additional geometry attempt or raster ran.
Formatting revision remained 727 before/after. The census reports:

| Formatting measurement | Value |
| --- | ---: |
| Visited DOM nodes | 707 |
| Formatting nodes / boxes | 719 / 719 |
| Text code units | 10626 |
| Work | 18869 |
| Deferred subtrees | 3 |
| `display-layout-not-supported` issues | 3 |

The three recorded deferred table references are `e27`, `e61` and `e649`, each
with display `table`. The unchanged workload's per-entry `reason` field is null;
it does not provide a more specific per-table diagnosis. The click error and
this bounded census do not identify which particular table role needs cycle
resolution, and no further investigation was performed.

Two external stylesheets loaded: 80 rules, 204 declarations, 6424 code units.
Cached diagnostics report one `unimplemented-css-property` and two
`unimplemented-or-invalid-css-value` occurrences, with **no applicable CSS
issues**. All three available samples were retained within the 32-sample lane
cap: unmatched `pre.code` with authored `//    font-family`, and unmatched
`.t-del` / `.t-add` double `border-bottom` values. The cache reports zero omitted
occurrences, no truncation, but still explicitly marks itself non-exhaustive.
Style metrics were byte-for-byte unchanged across the diagnostic read. These
unmatched CSS samples are not claimed as the click blocker.

## Timing, guards and cleanup

- Supervisor UTC: `2026-09-14T14:14:05.636Z` to
  `2026-09-14T14:14:06.673Z` (**1037 ms**).
- Child observation UTC: `2026-09-14T14:14:05.778Z` to
  `2026-09-14T14:14:06.626Z`.
- Child stdout **61230 bytes**, stderr **0 bytes**; no timeout, signal,
  output truncation, spawn failure or stream error.
- **One session, one initial navigation, one click, one commit, two queries,
  64 inspected anchors, four resource callbacks, four mocks, one optional-image
  denial, zero destination requests, zero scripts and zero wire requests.**

The unchanged kernel-network-denied wrapper and JS network/process/worker/dlopen
guards were active before native imports. The child observed Seccomp 2,
NoNewPrivs 1 and no TTY. There were **zero JS network guard attempts and zero
process guard attempts**. The same sanitized seven-variable environment,
private mode-0700 HOME/TMP, ignored stdin, piped outputs, 30-second deadline,
five-second termination grace and six-MiB output cap were retained. No socket
self-probe, SafeJS, page script, provider, credential, device, live website,
external child process or other browser was used.

Normal `session.close()` completed. Actual document, image, query and interaction
owners were each observed once, with document/event/control/session/transport
cleanup validated. Remaining document nodes, retained image resources, active
requests and pending work were zero. Cookies/storage and request queue closed.
One document close notification was observed. Settlement took
**0.38535400000000664 ms**, one sample, below the one-second/1002-sample bound;
action/request counters were unchanged during settlement. Both private
directories stayed empty and were removed. PID and process group **1666747**
were absent after exit and independent verification. No cleanup errors were
reported. This proof is scoped to actual instrumented owners, not an assertion
about every possible uninstrumented subsystem.

## Evidence and handoff

Artifacts below are relative to
`/dev/shm/agent-browser-man7-owner-retest-september14/`.

| Artifact | SHA-256 |
| --- | --- |
| `before-RESULT.json` | `4e11655e20b3bcf636257030e4b2b695ca8c38609d813be50fe3df816c679dd6` |
| `before.jsonl` | `6ef0bbde033e9f9509977f443d4f542fbb8424d2fbb93cd2b8ef97170fa6b9cf` |
| `before-EXECUTION.json` | `54660217dc83967469f1a516bc52b686ad9d2d92b4f147c70cbbf014fc20afd0` |
| `VERIFICATION.json` | `0a15d3d38af7ac71f0cdd367a76de328ea183914f958fae832934acd60bb3683` |
| `PREFLIGHT.json` | `59e2059aae4ea3883359a1b346fffdb79179682099e249ff54114799099e638b` |
| `RETEST-BEFORE.json` | `da9dce633db0958fa78cafc24386db1017100dcc1f61629145c2e7ade1edeaf2` |
| `RETEST-AFTER.json` | `71e1d6cefb0eca3d2af7385f72eff986ed05aedf9997e8f4b410ade3e63e1c82` |
| `CORPUS.json` | `1e33f7924e48250825f80493ed251245a07f84ab0a88f0d2032aa84dfcfb9079` |

`WORKLOAD.patch`, the new single-use locks, before/after complete inventories,
framework/fixture pins, supervisor/resource/cleanup receipts and verifier output
remain available. `EVIDENCE.sha256` and `SEAL.json` are generated after all
redirected run/audit/verification outputs close, including this new report.
Seal stdout is not redirected into the lane. New artifacts remain in RAM until
parent persistence; no large capture/runtime archives were duplicated. The
first failed lane/report stay separately sealed and unmodified. Site acceptance
and the current percentage-table sizing blocker remain open.
