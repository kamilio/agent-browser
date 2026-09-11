# Native public PyPI search flow — September 11, 2026

## Result

**Partial native flow; search acceptance failed.** One native browser child made
two document navigations and seven HTTP requests, all returning HTTP 200. Native
homepage loading, observed-form discovery, fill, GET submission and replacement
document loading completed. The destination was **Client Challenge**, not search
results; its native text did not contain the public query `requests`. The existing
classifier returned `null`, including when given the actual primary-response
status/headers and native title/text. The probe stopped with exit code **1**;
there was no website retry, challenge solving or script execution.

All receipt paths below are relative to this new lane unless otherwise stated:

`node_modules/.cache/native-validation/native-pypi-search-flow-september11/`

UTC supervisor interval: **2026-09-11T09:09:42.985Z–09:09:44.595Z** (1.610 s).
Native child report: **09:09:43.063Z–09:09:44.586Z**, same UTC date.
Independent offline verification passed at **2026-09-11T09:11:53.502Z**.

## Preconditions and execution provenance

- Used only the immutable build at
  `node_modules/.cache/native-validation/native-stylesheet-selector-branches-september11-round01/snapshot01/dist/`.
  The completed validation summary records successful build, strict checks,
  formatting and native tests, with stable inputs; validation finished at
  `2026-09-11T09:04:06.816Z`.
- Checked the native test receipt: **6,406 passed, zero failed, one documented
  exclusion**: `exposes the separate total host-object ceiling without claiming
  full-pool runtime capacity`, in `focus-provisioning-pressure.test.ts`.
  This prerequisite is not itself live-site or SafeJS evidence.
- Rehashed **1,006 source files** and **1,788 compiled files** before/after the
  child, compared both against the validated source ledgers and independently
  pinned compiled ledgers, and independently rehashed them again offline.
- `run.mjs` and `probe.mjs` adapt the existing
  `native-python-stylesheet-branches-live-september11` harness. Node was
  `v22.22.0`; executable SHA-256:
  `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.
  Only native `BrowserSession`, `NodeNetworkTransport` and
  `loadBrowserDocument` were used for the live flow.
- There were **two supervisor invocations but only one native child launch**.
  The first supervisor stopped locally before child spawn because its added
  file-limit assertion did not tolerate trailing whitespace in
  `/proc/self/limits`. The limits were already correct. Original preflight
  receipts and supervisor are preserved in `preflight-local-failure/`; the
  corrected check trims trailing whitespace without relaxing the limits.
  `LIVE-LAUNCH.lock` records the sole actual native launch. This was a local
  setup correction, not a second public probe or retry across a restriction.

## Observed native stages

| Stage | Observation |
| --- | --- |
| Homepage HTTP | `https://pypi.org/`: 200; 27,965 decoded bytes. Four same-origin stylesheet responses also returned 200. |
| Native homepage | Committed an 801-node document titled `PyPI · The Python Package Index`; 3,491 stylesheet rules and 4,803 declarations admitted. |
| Search discovery | Exactly one enabled text input named `q`, observed reference `e321`, DOM id `search`; owner node 314 / form reference `e314`. |
| Observed form | Action `/search/`, method omitted and therefore native default GET. Filled `e321` with constant `requests`, checked its control value, and prepared `https://pypi.org/search/?q=requests`. No references or action URLs were guessed. |
| Native submission | `requestSubmit` reported uncanceled submission, no invalid controls, and a document navigation. |
| Destination HTTP | Search document: 200, 3,038 bytes. Its same-origin challenge stylesheet: 200, 5,747 decoded bytes. |
| Native destination | Committed a 45-node document titled `Client Challenge`, with 44 stylesheet rules; native text contained “JavaScript is disabled in your browser.” and “Please enable JavaScript to proceed.” |
| Challenge classification | All seven response-level checks and both native content checks returned `null`. The content checks used the observed primary headers, not the template's empty-header placeholder. |
| Acceptance failure | `destination-query-and-old-document-closure`: `AssertionError` / `ERR_ASSERTION`, `Destination native text does not contain the public query`. `searchTermObserved: false`. |
| Replacement and cleanup | Old document was already closed at destination inspection. Final cleanup closed both tracked documents (zero nodes each), aborted the controller, and left transport closed with zero active requests. |

This is more than HTTP-only evidence: native parsing, stylesheet admission,
control discovery, form preparation/submission and document replacement occurred.
It is **not** successful package search or challenge handling. The native text
receipt is root `textContent`, which includes inline CSS and unexecuted script
source; it is not painted text or research-reader output. No challenge JavaScript
was fetched or executed. The challenge stylesheet was fetched by ordinary native
document loading before content inspection; no subsequent action was attempted.

Styles remain partial: the homepage reports 469 unsupported-property issues,
50 unsupported/invalid values, 69 unsupported at-rules and 66 unsupported/invalid
selectors. The destination also reports subset limitations. Image requests were
zero: 16 homepage images and one destination image reported `policy-denied`.
These are not image/painting passes. No native resource-limit failure was reported.

## Exact limits and cleanup

- One allowed origin, `https://pypi.org`; initial URL `https://pypi.org/`;
  public constant query `requests`; GET only, no request body, no URL credentials,
  no explicit cookie/authorization headers, and native cookie credentials omitted.
  No identity spoofing or user-agent override.
- One live attempt; at most two document navigations, one tab and one pending
  navigation; **20,000 ms** per navigation. No scripts or page runtime configured.
- Existing network caps retained: **12 requests**, **one concurrent request**,
  **15,000 ms** per transport request, **250 ms** minimum origin request spacing,
  **five redirects** per request, **16,384 header bytes**, **one request-body byte**
  maximum (actual zero), **2,000,000 bytes per response** and **8,000,000 session
  bytes**, with encoded and decoded byte accounting. Spacing was configured in
  the native transport; wire-start intervals were not independently measured.
- Default native document bounds remained **50,000 nodes**, **256 depth**,
  **2,000,000 text code units**, and **1,024 changes**. Diagnostic native text was
  capped at **12,000 code units**; the classifier's own smaller bounds remain
  unchanged. No admission limits were enlarged.
- GNU timeout bounded the child to **30 seconds**, then **five seconds** termination
  grace. Combined stdout/stderr cap: **6 MiB = 6,291,456 bytes**. The same soft/hard
  kernel per-file cap was asserted before launch; response bodies also had the
  tighter network cap. Files were created exclusively; no receipt overwrites.
- Child environment contained only `PATH`, `LANG`, `LC_ALL`, `TZ`, and fresh
  lane-local `HOME`/`TMPDIR`, both mode 0700 and empty after execution. Stdin was
  ignored; stdout/stderr used pipes, not a TTY/PTY.
- Actual network totals: **seven requests, zero redirects, 214,048 encoded bytes,
  240,352 decoded bytes**, zero mocked requests. Stdout was **20,158 bytes**;
  stderr was empty. No timeout, output-cap event, spawn error or stream error.
  Supervisor observed child closure and process-group absence; independent
  verification checked process-group absence again.

## Receipt integrity

`verify.mjs` performed **29 passing offline checks** without importing a browser
or making network requests: immutable inventories and exact pins; harness and
prompt hashes; original local-failure preservation; response body SHA-256 and
size accounting; execution, limits and isolation; observed native stages;
challenge miss and failed acceptance; final document/transport/process cleanup.
`VERIFICATION.json` inventories 33 pre-verification receipt files. A final
`RECEIPTS.sha256` ledger covers all lane files other than itself, plus this report;
it is separately checked with `sha256sum --check` from the repository root.

| Local receipt | SHA-256 |
| --- | --- |
| `PREFLIGHT.json` | `c151e6fd8dbd2f45a63de28b7422f6c1745485dde8251f3da8eeb4fbfda371cb` |
| `INVOCATION.json` | `0c03544ccaec4bb4675e1a029e743f1c4a866b9229c71f0877d0d5779c8de108` |
| `EXECUTION.json` | `e4bd8d04db4cea4fa37ae7607417be92a0ccace4c55a9c1fadd5337de2e188c2` |
| `INTEGRITY.json` | `b9418b93c174abeaeb5cb37657ea60c375a6db681590bee56e34ecbf482f1a43` |
| `VERIFICATION.json` | `192dd9c9b8cd48a7d0b87bfb5bfd51e83e709e49ee3dd2f1dd021358277fc5a5` |
| `stdout.jsonl` | `413e6e949153ae639e3a1ae1122d36a162051975e294c6b91a416a908b06f2d4` |
| `stderr.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `response-1.body` — homepage | `fb8f8ec97b928015bd837a3a5a995fe3633744666281cac43d72a7f4aafeb74e` |
| `response-6.body` — challenge document | `32ed63159c77e21ee19ca1b9aa3213ccf0218eb59539560b132a8e68ef0e18ea` |
| `response-7.body` — challenge stylesheet | `87225b15cde41cd78090abdf055c8cb67bcc3ca365d37d04aebab12adfb27ada` |

Original validation summary SHA-256:
`fe054aa14dde796f55240b84aeb17422c8716e8283bcead1301a75f2d618f194`.
Source ledger SHA-256 (both original and this lane's before/after):
`020771e895d500a22e5a44cba91c142cd42920aef59a4ff9c0174b89f016ca0d`.
Compiled ledger SHA-256 (independent pins and this lane's before/after):
`46362dd050f3f1eb6ffe00b1fc0d8e50bb97fe524001f97e8af6db301434648a`.
Original ledgers remain in their existing round01 and
`native-stylesheet-selector-branches-compiled-september11` paths.

## Useful next issue and scope boundaries

**Investigate the native challenge-classifier gap offline.** This retained
HTTP-200 document is titled `Client Challenge` and asks for JavaScript, but the
unchanged classifier returned `null` with real HTML response headers and native
text. Its existing title/text patterns at the pinned
`snapshot01/dist/src/browser-challenges.js:157` do not cover those signals.
Any future recognition change needs bounded fixture tests and false-positive
checks, not an attempted challenge bypass. This report records one observed miss;
general challenge-classification effectiveness remains **unverified**.

Painting, image fidelity, page scripts, SafeJS, research-reader/research workflow
behavior, authenticated behavior and broader website compatibility remain
**unverified**. No alternate browser, external HTTP client, web search, runtime
dependency, installation, credential/account/password-store access, protected
historical fixture access or real TTY/PTY was used. No source, tests, `TASKS.md`,
other reports or historical evidence were changed; no commits or pushes were made.
Python.org's separate CSS-comment text-admission investigation remains with main.
