# Native source-chart tables — September 16, 2026

## Outcome

Public Infogram chart documents now return bounded, typed `sourceChartTables` metadata through the native reader and the actual research-browser CLI. This fixes the evidenced content gap where PCMag chart iframes contained benchmark/specification matrices in an inline literal but ordinary Markdown was empty. No page code executes; no viewer, tracker or image is fetched.

The four previously captured documents yield **15 matrices and234 cells**, exactly matching the independently reviewed source export. One new live CLI GET returns **six productivity matrices and84 cells**, preserving five empty strings. The result remains `extracted-unverified`, `contentSuccess:null`; source retrieval is not rendering, verification of benchmark claims or a full article-to-chart workflow.

See `SOURCE-CHART-TABLES.md` for usage, exact recognition/limit/value contracts and exclusions. Production edits are one codec plus integration in the reader loader, extraction metadata fitting and research content predicate. No dependency or normal visible Markdown/JSON tree change.

## Native regression and quality

- **2,762 passed,0 failed across32 explicitly selected native files**:369 new cases (167 codec,202 integration) and2,393 existing cases. Build, strict types, formatting and lint pass. Processes close; isolated HOME/TMP remain empty.
- The identical202 integration cases over prior production integration give32 passes/170 failures; all202 pass with the feature. This red checkout deliberately includes the new codec and tests so imports resolve. It is not an unchanged baseline checkout or a claim that the codec existed previously.
- Tests cover exact final-response routes and schema, whole literal assignments, ambiguity, source-hidden/noscript/script-type exclusions, all scalar/missing states, resource/UTF-8 byte bounds, metadata priority, source offsets, profiles/raw policies, JSON/Markdown, lifecycle/immutability, selections and diagnostics. Line-selection metadata testing uses an explicitly annotated text document, not unsupported HTML line selection.
- Initial core01:2,744 passes/18 new-fixture failures plus test typing/lint errors. Existing credential URL and long-reader admission rejections and Markdown punctuation were incorrectly assumed by tests. Correct those expectations; production remains identical between core01 and release01. Initial receipts are retained.
- Clean git-archive candidate pins1,528 source/config/manifest entries and2,304 compiled artifacts. Relative to prior production:four new codec artifacts,11 changed integration artifacts and2,289 unchanged. The canonical committed manifest becomes946 entries; working tree remains949 due to three pre-existing unrelated additions.

This is a selected native gate, not a full-suite/SafeJS/device/credential/rendering acceptance. Earlier62 broad failures in26 files and22 missing committed manifest tests remain open.

## Captured-page differential

Replay99 earlier captured bodies plus four chart documents under kernel network denial: **103 comparisons;100 successful extraction pairs and three identical non-HTML admission failures**. All old extraction fields and content classifications remain unchanged. Only the four chart documents acquire the new metadata and change the content predicate from false to true; their ordinary Markdown stays empty. All returned documents close.

Compare each of the15 matrices,234 typed cell states/values, names, sheet indices and explicit chart-type/modifier/axis qualifiers with the prior reviewed source export. No numeric conversion, sorting, interpolation, guessed missing values or inferred units. This is saved-body testing, not103 fresh website visits.

## Actual CLI and live receipt

Four actual compiled CLI runs use the saved chart bodies through explicit native request routing under kernel network denial. All four return source-only content with native mocked-request accounting. An initial proof failed on the preload's relative input paths before any network attempt; correct the path base and add metadata-hash validation, retain that receipt and the original scripts.

Only after native, quality, differential and four final CLI proofs pass, execute one anonymous GET to the previously source-derived productivity URL. The probe enforces exactly that URL, GET, omitted credentials and no redirects; redirect restriction is an acceptance-probe policy, not a changed CLI default.

- Received: **2026-09-16T14:02:06.244Z**, HTTP200;40433 decoded/12136 encoded bytes. One actual native request, zero mocked requests, redirects or retries.
- Body SHA256: `7d18c21f6a861c1796adf43c86e897524ade25726f8a542c14a2943cc3729f9e`.
- One authorized TLS connection; request, socket, transport and child group close. Native active requests0; empty HOME/TMP. Scripting/styling remain false.
- Ordinary Markdown0 bytes, six source matrices/84 cells/five empty values. New source metadata exactly matches independent strict-JSON traversal of this freshly captured response, checked offline under kernel denial.
- The fresh body is **not byte-identical** to the earlier capture: four root embed-code strings change short URL/WordPress tokens. Full source elements, all chart values and qualifiers remain identical. The initial whole-literal equality assumption failed offline and is retained; there was no second live request.

The live receipt and exact typed extractions are retained in the companion JSON. No access, credential or anti-bot restriction is bypassed.

## 100-page status and next work

The complete100-entry checklist remains `reports/agent-citation-revalidation-v2.md` with adjacent JSON/CSV and source corpus. All100 were navigated and individually reviewed earlier on September16;33 useful,19 navigation-only,23 consent/access,3 login,6 empty,8 HTTP,2 transport and6 other. This is a citation-derived entry-page proxy, **not an established worldwide agent-visit ranking**, and this fix does not retroactively change those root-page verdicts.

Continue source-justified article/embedded-content workflows and other captured failures. Automatic chart discovery/navigation and generic dynamic rendering remain unimplemented; chart source metadata is document-scoped, not the selected visible subtree. Invalid optional qualifiers can be omitted with truncation and must never imply unitless/unscaled values. Credentials/passkeys/devices, actual SDK, TTY, rendering and human access handoffs retain their own gates.

## Evidence and review

Evidence: `node_modules/.cache/native-validation/source-chart-tables-september16`. Manifest: `ARTIFACTS.json`, SHA256 `8dac9c7e1c0852f184e47ac7dae58c196b61fecd61a0465cb323da07b6f23ff2`;151 files/8778150 bytes sealed at2026-09-16T14:07:26.238Z. Initial failures, red/green gates, all four CLI proofs, the single live receipt and both offline live-comparison attempts are retained. Supervisors' observed cleanup is not a guarantee against host loss or forced termination.

Independent static review found no concrete blocker in codec/integration/limits/lifecycle and the local captured schema. It did not run the tests or live comparison; main owns those results. Preserve42 pre-existing dirty tracked files and697 pre-existing untracked files, with selective manifest/TASKS staging. Overall browser goal remains active; no push.
