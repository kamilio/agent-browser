# Research service backoff — September 17, 2026

## Practical change

Research now stops on HTTP 503 with accepted Retry-After advice, rather than
closing that navigation's transport and advancing the batch without its cooldown.
The stop works with or without configured pacing, applies to source subresources,
and prevents automatic long-content/JSON recovery from presenting a stopped
response as success. A service outage remains distinct from HTTP 429 and CAPTCHA
classification. No retry, sleep, identity rotation or CAPTCHA bypass is added.

An opt-in native header observation retains the first accepted 503 advisory even
if the response body later exceeds a limit, fails or is cancelled. Research reads
it on request entry, request settlement and outer navigation failure before
closing the transport. Original network/resource/abort diagnostics are preserved;
missing response bodies are not fabricated. A complete primary response still
retains requested capture and explicit header-challenge precedence.

Ordinary and specialized replay admissions reject declared service-backoff
metadata even if other caller-pinned fields inconsistently describe success.
See `RESEARCH-SERVICE-BACKOFF.md` for the API, bounds and limitations.

## Isolated validation

- Final release05: **1,266 passed / zero failed**, 23 explicit native files.
  Build, strict selected types, formatting and lint pass.
- **181 new cases** across four files cover returned responses, real transport
  header handling through mocked HTTP, body failure, nested source failures,
  cancellation, malformed advice, header precedence, redaction, batch mutation,
  replay admission and source-content wrappers.
- The identical 181 tests against the pre-change source yield **55 passes and
  126 failures**. Unchanged controls are not falsely counted as old-code failures.
- Removing only the outer-catch observation from otherwise current code makes
  both new native/reader cancellation-race tests fail because advice disappears.
  Both pass with the fix. All test child groups close; no real sockets or website
  requests are used by these tests.
- Canonical manifest: **990 entries, 968 available, 22 missing**. This is not a
  full-manifest run or acceptance of the pre-existing dirty working tree.

An offline final-candidate run uses 103 saved responses: the preceding 100 controls
retain identical recorded content hashes, reader metadata, classifications,
failures and outcomes; three additional fresh article captures match their live
content and reader/classification records. No new request occurs in these
controls. The original 100 contain no 503 responses, so they establish regression
preservation, not positive service-backoff coverage. That behavior is covered by
the explicit mocked-header and research tests.

## Fresh functionality checks

Separate anonymous native browsing tested source-linked KBB, Cleveland Clinic and
Cosmopolitan articles: **three GETs, three complete HTTP 200 responses**, with
43/43, 20/20 and 6/6 eligible body paragraphs matched respectively. All acquisition
uses the native engine; no retries, redirects, credentials or page execution.
Live uses the prior committed runtime `098f0cf`, not this backoff patch. Final
candidate checks of the same bodies are offline. Details and exact targets are in
`reports/public-deep-workflows-2026-09-17.md`.

## Review and retained failures

Independent review identified inconsistent ordinary replay admission, lost advice
on body failure, and an outer cancellation race. All three are addressed and
tested. Original review artifacts remain unchanged.

Initial release01 passes 1,054 tests. Release02 records 1,144 passes and three
fixture failures: excessive headers were refused by routed-response validation
before Retry-After parsing, and a stylesheet fixture carried a mismatched URL.
Its lint also rejects two delete operators; Reflect.deleteProperty preserves
the intended report-mutation test. These fixture/lint problems are corrected,
not erased from evidence. Release03 is a quality-only intermediate build.
Release04 passes 1,264 cases; release05 adds the two cancellation regressions.
Pre-change and isolated counterfactual failures are intentional negative controls.

## Remaining limits

No real server returned 503 during the new live checks. A reduced blocking rate,
general browsing speedup, rendered JavaScript functionality and CAPTCHA access
remain unproven. The observation does not recall requests already in flight or
coordinate separate calls/processes. Missing, rejected or out-of-bound advice
keeps prior behavior. Header-time capture here covers 503, not a new 429
body-failure diagnostic path. Full SafeJS, real credentials/passkeys/devices/TTY,
missing-test acceptance and unfinished research remain open. Historical
100-entry usefulness verdicts stay 33 useful / 67 other, not a refreshed score.

Machine-readable evidence: `reports/research-service-backoff-2026-09-17.json`.
Private validation: `node_modules/.cache/native-validation/research-service-backoff-september17/`.
