# Native Debian documentation flow — September 12, 2026

## Actual outcome

**FAILED: the authorized eight-GET boundary stopped the initial navigation before
document commit. This is not working-site acceptance.** No retry or second live
launch occurred. No link discovery, click, destination navigation or formatting
census occurred; this was a request-budget failure, not an observed layout failure.

- Native UTC: `2026-09-12T02:15:43.006Z` through `2026-09-12T02:15:45.146Z`.
- Supervisor UTC: `2026-09-12T02:15:42.891Z` through `2026-09-12T02:15:45.154Z`.
- Initial requested and response URL: `https://www.debian.org/doc/`.
- First failure: `initial-navigation:network`, `AssertionError`, `ERR_ASSERTION`,
  `Native request attempt cap exceeded`. The session subsequently reported
  `AgentBrowserError: aborted`, `Navigation aborted`.
- The ninth adapter entry was the original native loader's discovered stylesheet
  `https://www.debian.org/font-awesome.css`; it was rejected before native
  transport forwarding and wire admission. No ninth GET occurred.
- Native navigation calls: **1**; committed documents: **0**; click calls: **0**.
  Native committed title, root reference, URL and history were not sampled and
  remain **unproved**. A response URL is not a committed page URL.

## Authorization and immutable runtime

Task: `node_modules/.cache/native-validation/optional-resource-work-september12/DEBIAN-TASK.md`.
Private lane: `node_modules/.cache/native-validation/native-debian-docs-flow-september12`.
The lane and its empty `home` and `tmp` directories were created with mode `0700`.
Only this lane and this report are owned by this task; parent owns code, tests,
shared documentation, inventories and commits. No commit or push was performed.

The executed runtime is the released, immutable
`node_modules/.cache/native-validation/native-float-document-september12-round03/snapshot01/dist`
at commit `99108ab454de37e7b89786cc4b95388c7d56d0ea`.
Release source: `node_modules/.cache/native-validation/float-document-work-september12/RELEASE.md`.

Preflight checked release pins, all 20 gate receipts, manifest membership, the
recorded 11492 passed / 0 failed / 2 excluded tests, 203 selected suites, 202 strict
roots, 599 manifest entries, and 22 committed snapshot files. These are historical
gate results, not fresh test runs. No rebuild or test-gate rerun occurred.

All 1091 source files and 1928 compiled files were independently inventoried
before and after execution, then rechecked offline:

- Source ledger SHA-256: `b2de339958a5568f598748f4a94dddd737df82fa0c188bb4b4d5d1fac294af10`.
- Compiled ledger SHA-256: `abab5b33a0984e56a5be422522fac6df52aa078cf7cd0fcef62d21ccfbc30ff2`.
- Gate receipt SHA-256: `0716c4582b3a4408e4e0895a9c9ae8427473bcfdedd006c0034b275ef0aaa337`.

The harness was adapted only from immutable
`native-man7-manual-flow-september12`; its old probe was not executed. Both of that
reference lane's ledgers were checked before adaptation and again afterward.
The other worker's ongoing optional-image lane was not read or edited.
Seventeen source/task/release/reference archives are exact Buffer copies, with
source/saved lengths and hashes checked immediately and independently afterward.
See `BYTE-COPIES.json`; no trimming or newline normalization was used for archives.

## Network and byte evidence

All eight admitted wire GETs received HTTP 200, with no observed Retry-After or
header-classified access barrier. Content-level challenge classification was not
reached because the document never committed; CAPTCHA absence is not proved.
Accounting is deliberately separate:

- Adapter entries: **9**; admitted entries: **8**; locally rejected entries: **1**.
- Native request-start records: **8**; transport requests: **8**; wire request
  constructions: **8**; wire responses: **8**; mocked requests: **0**.
- Resources: one document, six original-loader stylesheets, one original-loader
  same-origin PNG image. Followed redirects and wire redirect responses: **0**.
- Encoded payload bytes: **17557**; native decoded response bytes: **52649**.
- Successive wire request spacings: **257, 250, 251, 251, 252, 250, 250 ms**.
- Local cross-origin image rejections: **0**. The optional local rejection branch
  was configured but not exercised; no cross-origin image behavior is proved.

All paths below are URL paths on `https://www.debian.org`:

| ID | Original resource | Encoded bytes | Decoded bytes | Decoded body SHA-256 |
| --- | --- | ---: | ---: | --- |
| 1 | `/doc/` | 4839 | 13907 | `aa0efce427478623f57abab9ea840531fb1b75ea183d8d964a52c95b4657a057` |
| 2 | `/debhome.css` | 1521 | 3995 | `c032e7a896b8475b1aa6d7d7ba429760d46cea7e17975f82a459f9b2bf0356e8` |
| 3 | `/Pics/openlogo-50.png` | 2006 | 2006 | `599c5da9217274a3b1cd150c97839c011efc84ad74244a070de3d57e29beae0f` |
| 4 | `/debian.css` | 4714 | 16661 | `c63ccc983ab22b239286b58b0fc8838d56e17c157fca58206ba6b91f76eefad8` |
| 5 | `/empty.css` | 0 | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| 6 | `/startpage.css` | 2793 | 8036 | `5dd64848164e9158a29823613e675af9517d9209faa937c6293b3f1df19eae0e` |
| 7 | `/5img-carousel-slider.css` | 1334 | 6997 | `3ae02e0afd2181eb0ff37bf94673c6661d65ada685e44289669dead3efad11f3` |
| 8 | `/debian-en.css` | 350 | 1047 | `752495a8a164e0f64d717ad6a392518c193c98a7ad2da6f23f73a5b0360d15ad` |

For each ID, the lane contains `wire-ID.body` (original encoded HTTP payload),
`response-ID.body` (native decoded bytes), `wire-ID.headers.json` (ordered original
Node `rawHeaders` name/value strings plus metadata) and `response-ID.json`.
`RESULT.json` records every encoded/decoded/header/metadata hash and byte length.
Gzip decoding, header pairs, response metadata and cross-log claims were checked
independently against saved bytes. All observed header redaction counts were zero.
Header evidence is Node's raw-header representation, not TCP/TLS packet capture.

## Actual policies and constraints

Only `https://www.debian.org` was allowed, including original-loader same-origin
CSS and images. Strict native public-address checks, TLS certificate validation,
the unchanged `AgentBrowser/0.1` identity and per-hop origin checks were retained.
No alternate browser or HTTP client, resource replacement/removal, page scripts,
provider/credential access, real SafeJS, device, socket self-probe, TTY/PTY or mock
was used. No native capacity increase or allowlist broadening occurred.

The original loader requested `mode: no-cors`, `credentials: include` for
`/debian.css` and `/empty.css`; both returned `type: basic`, status 200. Other CSS
requests used the original ordinary stylesheet callback. Original native request
metadata reported credentials `include`, while the authorized transport adapter
enforced credentials **omit** on every actual request. No credential headers were
sent; the fresh cookie jar ended with zero cookies and zero accepted cookies.
Requested loader policy and enforced wire policy are not conflated.

Limits remained eight bodyless GETs, 250 ms minimum pacing, 30 seconds plus five
seconds termination grace, 6 MiB file/output cap, 12 MiB lane cap, and at least
64 MiB free space. Supervisor output was **63025 bytes**, with no timeout or
output-cap violation. Explicit environment allowlist and private HOME/TMP were
used; stdin was ignored and no TTY allocated. `PREFLIGHT.json`, `INVOCATION.json`,
`EXECUTION.json` and `INTEGRITY.json` retain enforcement details and storage samples.

## Cleanup and remaining gates

One actual loader-created document owner and one actual configured native image
owner were observed. The image owner was obtained only when its existing original
fetch callback ran, after native configuration; no second or optionless substitute
owner was created. Its final metrics show one image request, 2006 received bytes,
one delivery, zero resources/active/queued/waiters, and closed state. Document nodes,
retained text, mutation collectors and inline declarations were released.

Immediate session cleanup still had one pending load and one active queue entry.
The single authorized 50 ms settlement sample took **50.797803999999815 ms** and
observed zero pending loads, zero active/pending queue entries and zero active
transport requests. The supervisor observed the child process group absent.
The immediate pending count is not presented as a leak.

Event and control owners were not instrumented before the aborted initial load;
their cleanup remains **unproved**, not vacuously passed. Native committed page
state, anchor eligibility, FAQ preference, a genuine click, destination rendering,
actual color-scheme state, applicable/raw CSS diagnostics, deferred formatting
gates and working-site acceptance remain unproved. No layout census or sole-cause
layout attribution is claimed. The request cap explains this stop, not whether
later site stages would work.

Offline evidence checks passed **28** assertions; this is evidence integrity,
not a browser-flow pass. `RECEIPTS.sha256` seals the report and primary artifacts;
`FINAL-RECEIPTS.sha256` additionally seals that ledger and `VERIFICATION.json`.
Both lane ledgers and report cross-claims are independently checked by `verify.mjs`.
Original execution, any failed/precheck artifacts and immutable historical evidence
are retained; no live work is repeated to improve the report.
