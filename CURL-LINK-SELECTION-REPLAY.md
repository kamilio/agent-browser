# Curl native link-selection replay — September 12, 2026

## Outcome and scope

**Isolated offline selection investigation only; replay flow FAILED.** One native captured-document navigation and one genuine `session.click` call executed. The eligible FAQ occurrence was `e408`, not the rediscovered unavailable first occurrence `e82`. The actual click stopped at a later native formatting guard:

```text
stage: native-documentation-link-click
name: AgentBrowserError
code: unsupported
message: Document width resolution requires an issue-free supported formatting profile
```

There was **zero wire**, zero socket activity attempted through the guarded APIs, no destination request, no mouse dispatch, no fallback and no retry. Native mocks are not website success. Selection eligibility was established, but a complete actionable click/navigation was not. Evidence verification passed **48/48 checks**; that does not change `replayPassed:false` or child exit **1**.

This is the distinct investigation authorized by `node_modules/.cache/native-validation/positioned-float-work-september11/curl-replay-prompt.md`, not another host attempt or a rerun of the fresh curl flow. Parent's inventory66/host accounting is unchanged. Only this report and `node_modules/.cache/native-validation/native-curl-link-selection-replay-september12` are owned. No production, build, test-suite, shared-document or commit changes.

## Execution and immutable release

- Syntax: **2026-09-12T00:16:43.168Z**, all nine prepared JS/Python files passed syntax-only checks; no runtime execution during syntax checking.
- Preflight: **2026-09-12T00:16:48.382Z**; all release, metadata, historical-evidence, environment, capacity and storage gates passed before launch.
- Single supervised child: **2026-09-12T00:16:48.399Z–2026-09-12T00:16:48.602Z** (203 ms); native report **2026-09-12T00:16:48.517Z–2026-09-12T00:16:48.589Z**.
- PID **3415292**, exit **1**, no signal, timeout, spawn/stream error or output overflow; process group independently absent. stdout **885595 bytes**, stderr **0 bytes**.
- Released commit `4d11abddf8f9a743a0066ef242a7fa07ae297e71`, audited **11025 passed / 0 failed / 2 excluded**, not parent's newer11080/dirty positioned-float source. Historical tests were verified, not rerun.
- Release-owned inputs **13 + manifest = 14**; selected **189**, strict **188**, manifest **586**; actual source **1075**, compiled **1916**. Runtime used in place from `native-font-weight-september11-round01/snapshot01`; no copy or build.
- Source inventory SHA-256 `35ab2abe5af36ba6c5f212343d681dc0fdb288f0ce67efd7d522c0201565d0d7`; compiled inventory SHA-256 `920b1efa2a3c68b7ec6fe1ff8ccf812b73bcdc42a01e9593f77aec7acdbf3ff6`. Exact before/after inventories, release receipt20, audit source, committed inputs and all pins remained unchanged; complete pins are in `RELEASE.json` and `PREFLIGHT.json`.

## Exact captured inputs and accounting

Only the original sealed `native-curl-documentation-flow-september11` response1/2 bodies were supplied, once each, through native response mocks. Original metadata is retained verbatim in `BASELINE.json` and each new response's `originalMetadata`. Both original ledgers and stdout digest were verified before replay and again during sealing.

| Captured and replayed body | Decoded bytes | Exact original/replay SHA-256 |
| --- | ---: | --- |
| `response-1.body` | 8507 | `e7ae0135882c0911eb952a7ccfeb7119899ceeee654ab68f5a4868d315bf0072` |
| `response-2.body` | 20342 | `9f9c161119f6fcb317548bca855456247cc9c2df2ae0c28042a993be279cd1c8` |

The original document URL was `https://curl.se/docs/`; stylesheet URL `https://curl.se/curl.css`. Each mocked status was the captured **200**, with zero redirects. New native receipt timestamps were **2026-09-12T00:16:48.523Z** and **2026-09-12T00:16:48.542Z**; these are replay times, not new website responses.

Header comparison used sorted **own key/value entries**, preserving exact header strings and value-array order, not object prototypes. Both canonical comparisons passed. The original `content-encoding: br` and `content-length` values **1845 / 4711** were preserved with the already transport-decoded original bodies; neither body was altered or decompressed again. Captured server Date **Fri, 11 Sep 2026 23:56:42 GMT** remains historical.

- `response-1.body` original/replay canonical header SHA-256: `0b4bf2963b887adc51e3aa68605dfdf44cfaa64713d09d284f140e29c38d9ce4`.
- `response-2.body` original/replay canonical header SHA-256: `c89bdb4066a90cd4e5dc42510b2603a5a890debb1f6e48dfafd2a44c3c8bb3e8`.

- Native adapter entries **2**, admitted native requests **2**, native request-start events **2**, transport requests **2**, mocks **2**, rejected adapter entries **0**; both bodyless GETs.
- Mocked decoded bytes **28849**; total decoded bytes **28849**; new encoded bytes **0**; actual wire requests/responses/redirect responses/closes **0**; followed redirects **0**.
- Original encoded **1845 + 4711 = 6556** bytes remain historical metadata only, not new wire bytes. Exact fixture parity: **2/2 intact bodies and canonical headers**.
- No FAQ response fixture exists or was substituted. Any unrecognized request was guarded for rejection, never wire fallback. The native click failed before making such a request.
- Original native SVG policy remained intact: `e30` at `https://curl.se/logo/curl-white-symbol.svg` was `broken / policy-denied`, zero image requests/resources. This is native policy, not a server rejection or harness pruning.

## Native visibility before deduplication

The native `body a[href]` query returned **98** refs; only the original first **96** were inspected. Every occurrence was retained through eligibility evaluation, including duplicate destinations. Each sampled native `styles.get(id).displayed/visible`, the released read-only actionability check and role-aware ARIA-disabled predicate, plus target-to-root native metadata bounded to **256** nodes. Actual maximum depth **11**; no attribute sample truncation. Native predicates were not patched; no geometry API or event dispatch was used during selection.

Exact rule: reject unsafe/nonqualifying URL/action/target/download/ping cases and incomplete ancestry; require native displayed and visible, no native availability block and no native role-aware ARIA-disabled result; then deduplicate eligible document destinations, retaining the first eligible occurrence, and prefer an observed FAQ. Arbitrary anchor `disabled` attributes were metadata only, not invented disabled semantics; native disabled-control handling applied only to its supported control types.

- URL-qualified occurrences **76**. Availability-qualified URL candidates **35**; unique eligible destinations **35**; eligible duplicates **0**.
- **61** occurrences excluded before deduplication (**20** URL-ineligible plus **41** URL-qualified but unavailable); **34** other eligible unique destinations not selected; **1** selected.
- Across all96, **48** had `displayed:false / visible:false / css-hidden`. URL reason counts were not-docs-HTML20, empty observed text1, not-different-document1, different-origin1; reasons overlap.
- All96 observed refs, URL/availability reasons, complete bounded ancestry, selected/filtered dispositions and35 eligible destinations are recorded in `stdout.jsonl`, `OBSERVATIONS.json` and `progress.jsonl`. No extra anchor query, second choice, menu opening or DOM/style mutation occurred.
- Selection preserved document revision **543**, history and mouse metrics. Initial document: title **curl - Documentation Overview**, root **e1**, nodes **541**, history key **h1-1**, index **0**, length **1**.

### Rediscovered first FAQ versus selected FAQ

| Native occurrence | Observed index (zero-based) | Native CSS | Availability | Decision |
| --- | ---: | --- | --- | --- |
| FAQ `e82` | 7 | display block; visibility visible; **displayed false, visible false** | **css-hidden**, ARIA-disabled false | Excluded before deduplication |
| FAQ `e408` | 64 | display inline; visibility visible; **displayed true, visible true** | Unblocked; ARIA-disabled false | Selected; one genuine click call |

Both actual hrefs resolved to `https://curl.se/docs/faq.html`. The first FAQ was rediscovered from the native query, not forced from the previous ref. Its11-node sampled chain included `e82 a → e81 li → e59 ul.sitenav-submenu → e51 details.sitenav-disclosure`. The `details` node had **no open attribute**; native `closedDetailsChild` was **true for e59**. No hidden/inert/disabled attribute or native inert/disabled-control/hidden-input predicate was true in that chain. These **new sampled observations** support closed-details exclusion in this replay; they were not established by the old generic error. The selected `e408` had a complete7-node chain and passed native availability.

The prior sealed fresh flow still has its original **not-actionable: Click target is hidden, inert or disabled**, selected e82 with2 FAQ occurrences. Its first failure was **not** the independent formatting census. Neither the old report nor its measurements were rewritten using this new investigation.

## Later click failure and separate formatting census

The genuine `session.click` on eligible e408 reached the width-resolution guard and returned the exact `unsupported` error quoted above. No mouse action dispatched (**0**); no second navigation committed. Before/after URL, root, nodes, revision543, history, scroll metrics and native request count2 were unchanged. Scroll builds/updates/work stayed0. No direct destination navigation, forced geometry or alternate anchor followed the error.

Exactly one bounded read-only formatting census followed failure; it is diagnostic evidence, not another click or a replacement for the first error. Raw style diagnostics and applicable formatting diagnostics stayed distinct:

| Diagnostic | Raw `styles.metrics().issues` | Applicable `styles.metrics().applicableIssues` | Formatting CSS |
| --- | ---: | ---: | ---: |
| unimplemented-or-invalid-css-value | 26 | 5 | 5 |
| unimplemented-css-property | 53 | 19 | 19 |
| unimplemented-or-invalid-css-selector | 6 | 6 | 6 |
| unimplemented-or-invalid-media-query | 5 | 5 | 5 |

Formatting keys have the `css:` prefix; media-query issues are advisory under the released predicate. Independent non-CSS formatting issues: **overflow-layout-not-supported1**, **positioned-layout-requires-coordination1**, **display-layout-not-supported9**, **element-layout-not-supported1**. No one issue is asserted to be the sole cause of the aggregate width-profile rejection.

Census: **320** visited DOM nodes, **334** boxes, **327** formatting nodes, **7** outside markers, **1689** text code units, **3516** work, **10** deferred subtrees (9 flex,1 image), all10 sampled within cap20; revision **543→543**. Native read-only color metrics continued to report preference null/effective light, no system integration or site overrides. No CSS filtering, preference changes or partial-layout fallback was applied to obtain a click.

## Bounds, cleanup and seals

Unchanged limits: **30 s + 5 s termination grace**, **6 MiB** per file/aggregate child output, **12 MiB** lane, **64 MiB** minimum free; native request cap **8**, concurrency **1**, one tab, max2 navigations, pending1, navigation20 s. Initial available bytes **1047506944**. Native DOM/style/network/image capacities retained; CSS budgets rules8192/declarations16384/code-units524288/work5000000. The configured250 ms request interval remained unchanged; native mock timing is not real-wire pacing evidence.

Private lane/HOME/TMP retained **0700**, HOME/TMP remained empty, environment allowlist unchanged. OS seccomp denied socket/socketpair/connect/bind/listen/accept/send/io_uring; Seccomp2 and NoNewPrivs1 observed, no socket self-probes. JS network/process/module guards recorded **0 attempts**. No scripts, SafeJS, credentials/providers, TTY/device, external client or alternate browser ran.

Actual cleanup sampled **1 document, 1 event owner, 1 image owner, 1 file/mouse control owner**, not empty-array inference. All closed; document nodes/text, mutation collectors, inline declarations, listeners/dispatches, image resources/work queues, retained files/bytes, pressed buttons, transport/session/queue pending work, cookies and storage reached zero. Session cleanup errors0; no settlement wait required. Native process group absent.

All **22 historical receipt ledgers**, prior reports/locks/bodies and the released runtime were reverified unchanged. `OLD-EVIDENCE-BEFORE.sha256`, `INTEGRITY.json` and `VERIFICATION.json` preserve the exact checks. Inner `RECEIPTS.sha256` has **38 evidence entries**; final `FINAL-RECEIPTS.sha256` has **44 entries**, including this report and the inner ledger, excluding itself. `CHANGED-PATHS.txt` and `REPORT-VERIFICATION.json` restrict the handoff to the new report/lane. No action is authorized after sealing.

The first post-run report-sealing invocation failed its case-sensitive lowercase `offline` wording assertion before writing any final-seal files. This was a report-packaging failure, not a new native/browser result: the original unsealed report draft and exact error are preserved in `REPORT-PRECHECK-DRAFT.md` and `REPORT-PRECHECK-FAILURE.json`. Only the unsealed report wording and this disclosure were corrected; the sealer, executed harness, runtime evidence and inner ledger remained unchanged. No native rerun occurred.

Key evidence SHA-256:
- `stdout.jsonl`: `afbe18a046bf2578468eba52c15aea71a630831f8272226c4eee29634846eb67`
- `RECEIPTS.sha256`: `07de46471ac585185aded2f1dec92aed7a3971bee51e5027f131bd01063ea29b`

**Conclusion:** availability-aware selection avoids the original first-occurrence selection failure in this isolated replay; the one genuine click still fails at the released native width-formatting guard. This is no fresh website visit, network success, completed FAQ flow or broader compatibility claim.
