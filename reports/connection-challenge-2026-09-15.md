# Connection-verification handoff — September 15, 2026

## Finding and change

The original Trustpilot receipt contains a 991-byte HTTP403 verification page,
not consumer reviews. Its title is `Verifying Connection`; its text asks the
reader to wait while the browser is verified. The old classifier returns null,
leaving a generic HTTP failure with extracted verification notices.

Add bounded connection-title and browser-wait phrase alternatives to the existing
challenge rule. The observed result is a **possible challenge from an unspecified
provider**, with `html-challenge-markers` and `stop-and-request-user-handoff`.
The research caller now returns a semantic barrier before extraction while
retaining an explicitly requested body capture as evidence.

This is improved diagnosis, **not successful Trustpilot access, recovered reviews,
CAPTCHA solving or a measured reduction in crawler blocks**. No fresh request,
retry, fingerprint change, authentication or script/SafeJS execution occurs.
The original live report and all original outcomes remain unchanged.

The title/text must match the existing bounded heuristic together. Ordinary
article titles, malformed input, invalid MIME/status cases, cut words and
out-of-budget markers remain negative controls. Existing header precedence,
Cloudflare-text attribution, retry advice and early HTTP429 behavior remain.
See `CONNECTION-CHALLENGE.md` for the exact contract and limitations.

## Original 100-receipt comparison

Baseline commit: `6ddbfe729d2ab868d055ea99991ef4d5005ffaa3`. Preflight compares
1,496 committed runtime source/script/package/tsconfig inputs with the clean
pinned runtime. Final comparisons verify clean source/compiled snapshots and
original receipt/body hashes; unrelated working changes are excluded.

| Scope | Result |
| --- | ---: |
| Original receipts inspected and hash-checked | 100 |
| Complete captured bodies loaded and classified | 95 |
| Current baseline/candidate diagnostic changes | 1 |
| Other current diagnostic results unchanged | 94 |
| Receipts without a complete captured response | 5 |
| Returned native documents closed | 95 |

The sole difference is Trustpilot. The five non-body-classified receipts are
Google Play, TechRadar, Tom's Guide, CNBC and Comparor. Their original captures
are absent/incomplete; no new request is made to fill those gaps.

Both classifiers receive the same bounded native title/document diagnostic text
from the captured source. The current reader uses explicit UTF-8 fallback,
separate omitted-raw accounting and each receipt's stored source visibility
policy. Captured response headers are partial and may omit original challenge
signals. These checks therefore compare the current old/new rule; they do not
reproduce all historical live classifications or establish 94 readable websites.

## Actual caller with saved source

Eight `researchNavigation` invocations use synthetic transport responses carrying
the unchanged Trustpilot body: old/new runtime crossed with Markdown/JSON and
whole-document/main-focus extraction. These are actual caller code paths, not
live navigations or a claim that the website now responds differently.

- Four baseline calls return `http-failure`, null challenge diagnosis and notice
  extraction. Four candidate calls return `semantic-barrier`, false content
  success, explicit handoff guidance and no extraction.
- All eight retain the same captured body hash. Each issues exactly one mocked
  GET with omitted credentials and no body; no retry or alternate target occurs.
- All eight sessions/transports close, active metrics are zero, and temporary
  prototype instrumentation is restored. The independent corpus checks close
  95 returned documents; caller document closure is not separately instrumented.
- Kernel socket denial plus JS network/process guards record zero attempts.
  The successful comparison child and process group are absent afterward.

## Native regression validation

**154 new regressions** cover the marker/title/status matrices, bounded text and
lookahead, invalid headers/MIME, header precedence, input/output isolation and
research-caller behavior. Caller cases include native/reader, Markdown/JSON,
selector/focus resistance, early rate limiting and evidence-only replay admission.

| Clean run | Passed | Failed | Selected files |
| --- | ---: | ---: | ---: |
| Baseline | 1227 | 0 | 13 |
| Old production with identical final tests | 1310 | 71 expected | 15 |
| Final candidate | 1381 | 0 | 15 |

Final build, strict types, configured format and lint pass. This is not a full
923-file manifest run or actual SafeJS/interactive acceptance. No test exclusions.
Initial attempts retain two test-style lint findings and a subsequent formatting
failure; only Number namespace spelling/format changed, not expectations. The
first corpus harness attempt failed before reading any capture because it used
repository-relative paths from its private cwd. Original failed scripts/logs are
preserved; a separately named corrected harness completes the comparison.

## Evidence and remaining work

The private lane is
`node_modules/.cache/native-validation/connection-challenge-september15/`.
The JSON report pins regression logs, source/compiled manifests, all receipt/body
identities, every classification result, caller outputs, guards and invocations.
Original measurements remain in `reports/agent-citation-pages-2026-09-15.md`.

This heuristic can miss other challenge designs and is not proof of rendered
visibility or provider identity. Dynamic content, actual access/CAPTCHA handling,
the five missing original bodies, and SDK/interactive/credential/passkey gates
remain open. Unrelated work is preserved. No push; the overall goal stays active.
