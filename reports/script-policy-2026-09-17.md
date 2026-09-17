# Native classic-script policy checkpoint — September 17, 2026

## Outcome

External classic scripts declaring `crossorigin` or `integrity` now have a native
policy-aware loading path instead of an unconditional skip. Before submission to
the runtime, CORS/credential/redirect checks and supported integrity verification
must succeed. Missing providers retain the old skip; failures never retry through
plain fetch. See `SCRIPT-POLICY.md` for the interface and limits.

**948 selected native tests pass. Positive live script loading is still unverified.**
A fresh OutdoorGearLab check finds enforced CSP and correctly stops before its
script request. The captured HTML remains readable: a separate source-only view
produces **22,688 Markdown bytes** without a new request or JavaScript execution.

## Implementation and validation

- Native script fetch reuses existing CORS, cookie and network helpers, with
  manual redirects, origin/credential taint, mixed-content checks and cancellation.
- The loader verifies eligible response bytes using the existing bounded
  SHA256/384/512 integrity helper before decoding. Classic ordering, MIME/source
  limits, error events, and unsupported CSP/module behavior remain explicit.
- BrowserSession supplies the policy port, resource-credentials omit override,
  shared 16-script budget and request journal. The owned-process child and three
  committed diagnostics wire it; runtime defaults are not activated or changed.

Clean release01 is archived baseline `70b1209` plus ten explicit source/test
overlays and three manifest entries. It passes **948 tests, zero failures, across
19 selected files**: 83 fetch-policy, 43 loader-policy and 23 session-policy cases
are new; 799 cases cover existing behavior. Build, selected test types and scoped
format/lint all pass. The preliminary core01 run passes 882 tests across 17 files.

All **1,614 source and 2,396 compiled pins** match the candidate. Its canonical
1,009-entry manifest retains 22 paths absent from the isolated committed tree but
present in the dirty workspace's 1,012-entry manifest. This is not full-suite or
dirty-runtime qualification. Existing uncommitted work, including an untracked
response-archive checker, is preserved rather than included in the change.

## Real website check

Passive inspection of 70 saved HTML bodies (32,732,601 bytes total, each under
2 MB) finds source-listed anonymous-CORS classic scripts on OutdoorGearLab,
Target and Alibaba. None declares integrity. All saved receipts have selected
headers that omit CSP, so none proves page-pipeline eligibility. The source tags,
byte spans, body hashes and this limitation are retained.

The first candidate is OutdoorGearLab's literal Bootstrap 5.3.3 jsDelivr script
URL. The scoped native check allows only the fresh homepage and that exact asset,
conditional on a current eligible tag, no access barrier and no enforced CSP.
A two-response synthetic proof passes first under kernel/JavaScript network
denial. It is not website evidence.

The actual homepage GET at **2026-09-17T11:35:19.186Z** returns **HTTP 200** and
**203,590 transport-decoded bytes**. Inspecting the actual native response headers
shows enforced CSP, not merely a report-only policy. The custom script-policy
probe stops before parsing/submitting a script; the asset receives **zero GETs**.
The surfaced `Document loader failed` error belongs to that probe's deliberate
CSP stop, not evidence that the native reader cannot read this HTML. The CSP
directive values were not retained; do not infer which script URLs they permit.

One wire GET, no redirects/retries, no additional resources, no credentials,
no alternate client, no SDK, no website JavaScript and no challenge bypass occur.
The child/group, request/socket and native session close. Private HOME/TMP remain
empty. Live CORS response eligibility and source-declared SRI remain unverified.

## Content remains available

A separate offline check verifies the fresh body hash, admits it as unverified
raw HTML, uses the native synchronous parser without script hooks, and extracts
Markdown under kernel/JavaScript network denial. It yields **22,688 bytes** with
review and category links, including the hiking/camping and clothing sections.
The source document closes; no additional network or runtime execution occurs.

This view does not claim rendered/CSP equivalence or convert the script-policy
refusal into a successful live script load. Its Markdown SHA256 is
`498621975afc01abad39030871ccaac728960c6638fef16c188adcf4ed4f6536`.
The fresh source body SHA256 is
`f49f7e7b967301b019b1ca4226f640c0e749b1a786760568b0c298a69876c959`.

## Evidence and remaining work

Evidence roots under `node_modules/.cache/native-validation/`:
`script-policy-september17/`, `script-policy-candidates-september17/`,
`script-policy-live-september17/`, and `script-policy-source-read-september17/`.
The accompanying JSON retains the measurements, evidence hashes and limitations.

Historical 100-entry **33 useful / 67 other** results stay unchanged. Actual
SafeJS 0.1.640 execution has not occurred; the requested offline 19-core and
10-page-extension scope still needs authorization and launcher qualification.
The recorded callback/source-admission mismatch is not fixed by this feature.
CSP semantics, live scripted tasks, wider content retrieval, performance,
access/CAPTCHA friction, credentials/passkeys and research keep the goal open.
