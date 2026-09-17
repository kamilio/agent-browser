# Rate-limit header retention — September 17, 2026

## Change

Research now retains a real HTTP 429 status before body consumption. A body limit,
stream error or navigation cancellation can no longer erase an observed rate
limit and allow the batch to continue. Missing or malformed Retry-After does not
prevent the stop. This closes the 429 counterpart of the preceding 503 fix.

The native opt-in `captureRateLimit`/`rateLimit()` pair keeps the first immutable
observation until close, independently of pacing and the existing 503 observer.
Research checks it before requests, at settlement and in outer failure handling;
it preserves the original error and redacts the reported URL. No complete body
or response is invented when transport fails. Returned-response fallback remains
for routed fixtures, and completed-response header challenge precedence remains.

Ordinary replay admission now rejects declared rateLimit metadata even when
other caller-pinned fields inconsistently describe success, matching existing
specialized recovery guards. No retry, waiting, identity change, proxy rotation,
CAPTCHA solving or runtime dependency is added. Native capture defaults off;
research explicitly enables it. See `RESEARCH-RATE-LIMIT-HEADERS.md`.

## Validation

- Final release03: **1,352 passed / zero failed across 24 explicit native files**.
  Build, selected strict types, formatting and lint pass.
- **86 new cases**: 70 native-header/research cases and 16 admission cases added
  to the existing admission suite. Every prior selected case remains present.
- Against pre-change source, the new cases produce **75 failures and 11 passes**;
  unchanged controls are not counted as old-code failures. Including the 20
  existing cases in the two touched test files gives 31 passes / 75 failures.
- Cases cover absent/invalid/bounded advice, first-record immutability, independent
  503 observation, pacing, body overflow/error, held-body cancellation, swallowed
  stylesheet failure, source recovery, routed/cache responses and cleanup.
- A **105-response offline run** preserves all 103 preceding recorded projections
  and matches the two fresh article captures. These are saved-response controls,
  not another live crawl. No real network request occurs in the run.
- Canonical manifest: **991 entries, 969 available, 22 missing**. There is no
  full-manifest or pre-existing dirty-runtime acceptance claim.

Independent scoped static review found no actionable defect. Release01 passes
1,282 cases before the new header test file is added. Release02 retains 1,349
passes and three fixture failures: routed requests were incorrectly expected
not to increment the attempted-request metric. Two expectations are corrected
across those three cases; production is unchanged between release02/release03.
The original failures and both baseline runs remain recorded.

## Separate Native Website Work

Three actual GETs use the preceding committed runtime `372a5c8`, not this new
header patch. No request is repeated, no default limit raised, and no scripts,
SDK, credentials, alternate clients or identity changes are used.

| Target | Actual observation |
| --- | --- |
| EngineerFix, source-linked fuse article | Complete HTTP 200; 7,291 Markdown bytes; 19/19 eligible body paragraphs matched |
| Biology Insights, source-linked bird article | Complete HTTP 200; 3,408 Markdown bytes; 10/10 eligible body paragraphs matched |
| Python's explicitly advertised searchindex.js | HTTP 200 headers; decoded body exceeds the 2,000,000-byte cap; no complete asset |

The two articles are new URLs from previously navigation-only homepage captures,
not newly discovered working publishers or rerated homepages. Git's saved search
page exposes only a UI-script reference, so no Git asset is guessed or fetched.
Python's actual asset grammar, full length and search results remain unknown.
Search functionality is not demonstrated by this asset request.

Parent verification covers 64 sealed deep-page artifacts and 77 sealed search-
asset artifacts, their runtime/input pins, receipts and lifecycle. Both article
proof/live pairs and all five asset proof/live child groups close. Earlier
asset-harness failures are preserved, not counted as successful content checks.

Exact targets and limitations: `reports/thin-entry-deep-workflows-2026-09-17.md`
and `reports/source-search-assets-2026-09-17.md`.

## Remaining Work

No real 429 occurs during these live checks, and no reduced blocking rate or
general speedup is established. Already-started requests are not recalled and
separate calls/processes do not share observations. Unadmitted or absent headers
cannot establish status. Full SafeJS/dynamic pages, practical search support,
CAPTCHA access, real credentials/passkeys/devices/TTY, missing tests and unfinished
topic research remain open. Historical 100-entry usefulness stays 33/67.

Machine-readable evidence: `reports/rate-limit-headers-2026-09-17.json`.
Private validation: `node_modules/.cache/native-validation/rate-limit-headers-september17/`.
