# Fresh native NetBSD guide flow — September 12, 2026

## Primary outcome

**Flow FAILED after a successful initial website load.** On audited11268, the single genuine click on visible native anchor **e129**, text **1. What is NetBSD?**, targeting `https://www.netbsd.org/docs/guide/en/chap-intro.html`, failed at the native width-formatting guard:

`stage: native-documentation-link-click`  
`name: AgentBrowserError`  
`code: unsupported`  
`message: Document width resolution requires an issue-free supported formatting profile`

First failure UTC **2026-09-12T00:53:57.090Z**. This is an observed native compatibility failure, not a preflight failure, unavailable-anchor error or website access restriction. The initial document and stylesheet each returned HTTP200. No destination request, mouse dispatch, second target, retry or fallback followed the failure. **51/51 evidence checks passed; that does not turn the failed flow into success.**

Only `NETBSD-GUIDE-FLOW.md` and `node_modules/.cache/native-validation/native-netbsd-guide-flow-september12` are owned. The sole authorization is the current `float-integration-work-september12/NETBSD-TASK.md`; all earlier authorizations remain consumed. No production/shared-document/manifest changes, builds, test-suite reruns or commits. Parent retains the separate production float investigation.

## Exact execution and released runtime

- Syntax-only checks passed for all9 prepared JS/Python files at **2026-09-12T00:53:50.708Z**. No runtime execution during syntax checking.
- Exact pins, release receipt, committed owned inputs, historical evidence, private environment, original capacities and free-space preflight passed at **2026-09-12T00:53:56.074Z**, before launch.
- One supervised child: **2026-09-12T00:53:56.094Z–2026-09-12T00:53:57.130Z**; native report **2026-09-12T00:53:56.208Z–2026-09-12T00:53:57.104Z**. Child PID **3445399**, exit **1**, no signal, timeout, spawn/stream error or output-cap event; process group independently absent.
- Captured stdout **1037734 bytes**, stderr **0 bytes**. No additional browser launch.
- Release commit `8daf14b35b31a6ce086480861bb9ab60baedcec3`; audit base `c41a545b2e3dda888c7d49bd5f3162c481a8d32b`. Runtime used in place from `native-float-foundation-september12-round02/snapshot01/dist`, not old11025 or in-progress source.
- Audited historical gates: **11268 passed / 0 failed / 2 excluded**; **195** selected, **194** strict, **591** manifest entries; **7 owned sources + manifest = 8** committed inputs; **20** release-receipt files. Actual source **1082**, compiled **1924**, verified before and after without copy/build/gate rerun.
- Source inventory SHA-256 `c114aba28d071dfb4acee782a005b4cacd60cc79417eda23f2ba1ef593908056`; compiled inventory SHA-256 `0d1b4709183b6a331273cd40276a2a9c1e9062b09a59887ecba216de24b0ed01`. Exact release metadata is archived byte-for-byte in `RELEASE-PINS-SOURCE.md` and represented in `RELEASE.json`.

Additional release pins independently checked:
- `nativeHash`: `61fe18cfc359ebe6efd35dc81269a2f0c0818d9b6442025e77fa5f1f6e7a3468`.
- `summaryHash`: `1d5b69b4f9562543f7f88c4f94df9133c02af2f5952b65f6ce66474c64da7974`.
- `auditHash`: `7aa2e149390ff7b2d63e26960d26d659846641128d83be0a1fc0d1782e5913df`.
- `gateReceiptsHash`: `082121bd20b3fc76ae7b4a76d4f1d51c0475643c0c8e43e52aff374d925ddea2`.
- `commitVerificationHash`: `0e2747a1d99c1b78e051bde2f52268ff2676cdd5a8f4f684c07bf5924756e25d`.
- Audit source SHA-256: `57f4160a04b68ed040f8038bbb5851b52992749f813486f36133a150b08e0064`.

Release metadata explicitly says full float DOM/text/height/paint coordination remains absent and two legacy grid assertions fail in separate extended suites. The selected11268 gate pass is not an all-repository pass, and this flow does not establish full float support.

## Website, request and response evidence

Initial actual URL `https://www.netbsd.org/docs/guide/en/`, title **The NetBSD Guide**, root **e1**, nodes **3705**, revision **3707**. The only additional request was the original native stylesheet loader's `https://www.netbsd.org/global.css`. Both statuses were **200**, classifications had no observed access barrier; no Retry-After or CAPTCHA was observed. Only `https://www.netbsd.org` was authorized. No redirect, new host admission, identity change or global host inventory edit occurred.

- Native request-start events **2**; adapter entries **2**, admitted **2**, rejected **0**; native transport requests **2**; actual wire requests **2**, responses **2**, final trace closes **2**; mocks **0** and mocked decoded bytes **0**.
- Both were bodyless GETs. Wire starts **2026-09-12T00:53:56.306Z** and **2026-09-12T00:53:56.991Z**, **685 ms** apart, satisfying the unchanged250 ms pacing.
- Fresh encoded bytes **83873**, decoded bytes **83873**. Native receipt times **2026-09-12T00:53:56.930Z** and **2026-09-12T00:53:57.003Z**. No Content-Encoding header was present. Counts are native transport instrumentation, not packet capture.
- Wire closes: request1 **2026-09-12T00:53:56.989Z**; request2 **2026-09-12T00:53:57.108Z**. The stdout snapshot at **00:53:57.104Z** contains only the first close; the append-only `progress.jsonl` records the second4 ms later, before supervised exit. Final accounting uses that full trace. No late browser action was taken.
- Native input context records `nativeCredentials: include` as observed metadata, but the adapter enforced credentials **omit**, an empty fresh jar and no Cookie/Authorization/Proxy-Authorization headers on either wire call. Public-address checks, TLS certificate validation and original browser identity remained in force.

### Byte-preserving archives and cross-file claims

Original native **transport-decoded body Buffers** were saved exclusively and compared immediately against the source Buffer, byte length and actual saved-file SHA-256. These are original captured native response bodies, not raw TLS/HTTP framing or modified DOM serialization.

| Saved body | Bytes | SHA-256 |
| --- | ---: | --- |
| `response-1.body` | 72843 | `d31e30dd0d968ee031346362f080712b21505d97a0be598534443be2d515d967` |
| `response-2.body` | 11030 | `f5f1120f9ae2cd2db8ed875bf0681b23ac891c8f07d314d1c235ac05bb94edca` |

Full **parsed native response headers**, including complete value arrays, were captured separately. They preserve the original parsed header values, not raw wire header casing/order/framing. Wire-event summaries retain the established restricted header subset; the following files contain the full safe parsed headers for these actual responses:

| Saved parsed-header JSON | Bytes | Actual file SHA-256 |
| --- | ---: | --- |
| `response-1.headers.json` | 546 | `59b37f52f96d2caa8cc0421d852dd1042b456f4d85a593880d5c327d435ed925` |
| `response-2.headers.json` | 544 | `bd5f3beebf66a302fe5ff3d7ece7aab984a92a40a04758441c2018d56a6c8204` |

- `response-1.headers.json` canonical own-header-entry SHA-256: `a391c5d96aa38ed81a8474f95493e931617a922d31b777c831b601c9e0267bf6`.
- `response-2.headers.json` canonical own-header-entry SHA-256: `b7ea45f2ad406222f4b3202016ea87ce46319ffcd85de6338f1411d0a003fbc8`.

Header data was compared as sorted own key/value entries without changing value-array order or comparing dictionary prototypes. Body metadata `savedBodyBytes/savedBodySha256/bodySha256` and header metadata `savedHeaderBytes/savedHeaderSha256/originalHeaderSha256` were checked against the actual saved files, not accepted merely because a ledger hashes the surrounding JSON. No protected response-header payload was encountered or archived.

The task prompt2770 bytes, release Markdown1878 bytes and preservation rule1386 bytes were also archived with exclusive Buffer writes, immediate equality checks and hashes computed from saved bytes. `ARCHIVES.json` cross-checks all3 source/archive pairs before launch and sealing. No trimming, newline normalization or text patch emitter was used for historical raw evidence. New authored report Markdown uses normal patch editing; its claims are hashed from the actual saved report in `REPORT-CLAIMS.json` before final sealing.

## Availability-aware native selection

The native `body a[href]` query returned **588** refs, but only the first **96** were inspected, without increasing the original cap. Every one of those96 occurrences was evaluated before URL deduplication. All96 were URL-qualified and passed native displayed/visible, native actionability and role-aware ARIA-disabled checks. After deduplication: **13** eligible document destinations and **83** duplicate occurrences. No hidden duplicate displaced an available anchor.

Rule: same-origin public HTTPS HTML/HTM under `/docs/guide/en/`, different document, no query/credentials/account/download/ping/unsafe target; complete bounded native ancestry, `styles.get(id).displayed/visible` true, no native actionability block and no native role-aware ARIA-disabled result; then retain the first eligible ref per document URL and prefer an observed Introduction text/filename match. Arbitrary anchors' disabled attributes were not invented as disabled-control semantics.

Chosen **e129** was inspected index **3** (zero-based), observed text **1. What is NetBSD?**, href resolving to **chap-intro.html**. It was preferred via the actual observed Introduction document filename, not a fabricated label or guessed request. Its7 eligible occurrences share that destination; the broader Introduction text/filename predicate matched8 inspected occurrences. Selected native CSS: display inline, visibility visible, **displayed true / visible true**, actionability unblocked, ARIA-disabled false. Its complete ancestor chain had11 nodes; maximum observed chain depth15, cap256.

All96 observations, reasons/dispositions, bounded ancestor metadata and13 eligible destinations remain in `stdout.jsonl`, `progress.jsonl` and `OBSERVATIONS.json`. Selection itself changed neither revision3707, history nor mouse state and performed no geometry refresh or dispatch. No other target was selected after the single click failed.

## Click state and separate formatting census

Before/after failure, URL/title/root/nodes/revision were unchanged. History key **h1-1**, index0, length1; session history retained45 bytes. Native request count remained2, navigation commits1. Mouse actions/buttons/pressed remained0; scroll x/y/maxima/builds/updates/work stayed0, scroll revision stayed-1. There was no destination content to classify or claim as loaded.

Exactly one bounded read-only formatting census followed the genuine click failure. It is separate evidence, not a retry or a substitute first error:

| CSS diagnostic | Raw styles.metrics().issues | Applicable styles.metrics().applicableIssues | Formatting CSS |
| --- | ---: | ---: | ---: |
| unimplemented-or-invalid-css-value | 13 | 1 | 1 |
| unimplemented-css-property | 38 | 3 | 3 |
| unimplemented-or-invalid-css-selector | 1 | 1 | 1 |

Formatting CSS keys have the `css:` prefix; all five applicable entries are non-advisory here. Independent non-CSS issues: **html-presentation-hint-not-supported12** and **display-layout-not-supported2**, also non-advisory. The2 deferred samples are actual table nodes **e24** and **e3674**, each display/content-mode table with reason display-layout-not-supported. No float-specific issue or sole-cause attribution is inferred from this census; the thrown guard is an aggregate supported-profile requirement.

Census metrics: **3690** visited DOM nodes, **4510** boxes/formatting nodes, **19311** text code units, **56760** work, **2** deferred subtrees; revision **3707→3707**. Cap20 deferred samples and original formatting capacities remained unchanged. No raw CSS issue filtering, stylesheet pruning or partial-layout fallback was used to obtain a click.

## Native policies, bounds and cleanup

The stylesheet request came from `original-native-loader.fetchStylesheet`, Accept text/css, source document the guide, requestedPolicy null; no policy-bearing stylesheet override was observed (`stylesheetPolicies: []`). The wrapper preserved the original native loader rather than inventing resource requests. CSS budgets:524288 code units,8192 rules,16384 declarations,5000000 work,32 sheets. Original DOM/network/style/image capacities stayed in place.

An actual native image owner was instrumented even though the document had0 image elements/resources/requests: this is an observed empty workload, not missing ownership evidence. No synthetic image requests or policy changes were introduced. Read-only native color metrics reported preference null/effective light, native-ua-color-preference profile, no system integration or site override; no preference setter ran.

Bounds: **8 bodyless GET maximum**, concurrency1,250 ms pacing, **30 s + 5 s termination grace**, **6 MiB file/aggregate output**, **12 MiB lane**, **64 MiB minimum free**; one tab, max2 navigations, pending1, navigation20 s. Preflight available storage was **2749689856 bytes**; volume-percent warnings did not prevent satisfying the exact free-space gate. Private lane/HOME/TMP mode0700 and explicit environment allowlist were established before use; HOME/TMP remained empty. No page scripts, SafeJS, devices, real TTY, credential provider, alternate client/browser or cap increase.

Actual cleanup sampled **1 document,1 event owner,1 image owner,1 file/mouse control owner**. All closed; document nodes/text, mutation collectors, inline declarations, listeners/dispatches, image resources/queues/waiters, files/bytes/controls, buttons/pressed and active work reached0. Session/transport/request queue, cookies and storage closed with0 pending work and0 cleanup errors. No settlement wait was needed. OS Seccomp2/NoNewPrivs1 and file/core bounds were observed; the live filter retained public outbound native networking but denied listeners/process-memory/io_uring capabilities. No guard attempt or socket self-probe occurred.

## Verification, preservation and limitations

`VERIFICATION.json` records **51/51** evidence checks, **flowPassed:false**, checked **2026-09-12T00:54:19.941Z**. Exact source/compiled inventories, executed harness, security executables, parent gate inputs and prior evidence remained unchanged. All **27** historical receipt ledgers were checked for byte integrity; existing packaging exceptions remain preserved, not silently repaired or declared fully audited by this task.

Inner `RECEIPTS.sha256` contains **43 entries**. Final `FINAL-RECEIPTS.sha256` contains **54 entries**, including this report, actual-file-hashed `REPORT-CLAIMS.json`, report verification and the inner ledger; the final ledger excludes itself. `CHANGED-PATHS.txt` lists only this new report/lane. A final-packaging failure occurred and is preserved with byte-identical versioned archives as described next. No syntax/preflight failure or native retry occurred.

### Preserved final-packaging failure

The original `seal.mjs report` invocation failed with **ENOENT** while constructing its final ledger: its static `relativeLane` mistakenly retained `native-netbsd-guide-flow-september11`, not the actual September12 lane. It had written unsealed `CHANGED-PATHS.txt` and `REPORT-VERIFICATION.json`, but **no final ledger**. This is a harness packaging defect, separate from the completed native `unsupported` click failure. The executed sealer and43-entry inner ledger remain unchanged.

`PACKAGING-FAILURE.json` records the exact failed path, partial-output timestamp and actual observation time; no unavailable failure timestamp is invented. Before any unsealed correction, the report draft, report claims, partial path inventory and partial report verification were each archived by exclusive **Buffer** copy, immediate byte equality, length and saved-file SHA-256 checks. Their `FAILED-*` files retain the exact original bytes, including newlines. Archived claim/verification hashes are checked against `FAILED-REPORT-DRAFT.md`, not incorrectly compared to the later corrected report.

Only this still-unsealed report/current claims and byte-archived partial packaging outputs are corrected. The separate `finalize-packaging.mjs` performs filesystem-only verification, derives and asserts the actual September12 lane, and writes the first complete final ledger. It does not relaunch the browser, edit the executed harness, increase caps, or repair any earlier sealed evidence. Current `REPORT-CLAIMS.json` is recomputed from this actual saved report; all3 initial archives,4 failed-packaging archives and2 body/header cross-file claims are independently rechecked.


- stdout SHA-256: `6f94033e74c42633aba8b04a5be86122a3ca90fdbffc4bf12ea8d69b7570c49f`.
- Inner ledger SHA-256: `47add651e6e42b1221a335dc0fb81f32f7ea311c7fffe6c80106a85cf9e31275`.

**Unresolved blocker:** the released native engine rejects width resolution with applicable CSS and independent table/presentation-hint issues still present. One initial website load succeeded; one real click failed before destination navigation. No retry, fallback, broad compatibility claim or attribution to the parent's unfinished float work is authorized or established.
