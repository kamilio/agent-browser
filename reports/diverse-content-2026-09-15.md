# Diverse native content sweep — September 15, 2026

## Method and results

Twelve public HTTPS content URLs were each attempted once using native commit
`f06c81eea13af02fa54b2960d247c5616da7e4a7`, before the selector-recovery change.
Explicit offered-Markdown negotiation was enabled, but all eleven retained
responses were HTML. The over-cap W3 response has no retained MIME/body.
There were **12 GETs, no redirects, no retries, 11 verified captures**, and clean
request/process closure. No supplied credentials, page scripts, alternate browser
or challenge bypass. These are content probes, not working-application claims.

Outcomes: six extracted-unverified (five useful-looking pages and one JS notice),
three resource-limit failures, two semantic barriers and one HTTP failure.

## Every attempted URL

| # | URL | Receipt HTTP | Outcome | Decoded bytes | Markdown bytes | Diagnostic |
| ---: | --- | ---: | --- | ---: | ---: | --- |
| 1 | `https://github.com/daijro/camoufox` | 200 | extracted-unverified | 555508 | 62215 | Public repository README and navigation; not rendered application validation. |
| 2 | `https://news.ycombinator.com/news` | 200 | extracted-unverified | 34500 | 33130 | Story listing with titles and discussion links; no linked articles fetched. |
| 3 | `https://pypi.org/project/numpy/` | 200 | failure | 754398 | 0 | Output limit; small project description recovered offline after the code change. |
| 4 | `https://crates.io/crates/serde` | 200 | extracted-unverified | 5056 | 75 | Only a 75-byte JavaScript notice; not useful package content. |
| 5 | `https://docs.rs/serde/latest/serde/` | 200 | extracted-unverified | 25647 | 9411 | Substantial library documentation; sidebar/navigation remain. |
| 6 | `https://www.npmjs.com/package/typescript` | 403 | semantic-barrier | 5543 | 0 | Challenge barrier; stopped without retry. |
| 7 | `https://developer.chrome.com/docs/web-platform/passkeys` | 404 | http-failure | 75454 | 6386 | 404 page rather than requested passkey documentation; no alternate path fetched. |
| 8 | `https://webauthn.guide/` | 200 | extracted-unverified | 76777 | 24138 | Substantial tutorial and code blocks; no credential/demo execution. |
| 9 | `https://www.w3.org/TR/webauthn-3/` | — | failure | — | 0 | 2,015,232 decoded bytes exceed 2,000,000 limit; no body capture. Observer records HTTP 200. |
| 10 | `https://www.bbc.com/news/science_and_environment` | 200 | extracted-unverified | 240702 | 15263 | Useful index with nine story summaries; link-card headings flatten and labels concatenate. |
| 11 | `https://apnews.com/hub/artificial-intelligence` | 403 | semantic-barrier | 5524 | 0 | Challenge barrier; stopped without retry. |
| 12 | `https://www.rfc-editor.org/rfc/rfc9110.html` | 200 | failure | 1187554 | 0 | Output limit; selected sections recovered offline, not the complete RFC. |

The W3 observer records a 200 response, but the capped navigation has no retained
primary-response status; the table does not turn that absence into an HTTP error.
The BBC page is an index, not nine full articles. GitHub source describes another
browser project; no dependency on that browser was added or executed. Public
passkey documentation was read as content only, not credential/device acceptance.

## Useful recovery and code change

PyPI returned 754,398 bytes; its source description is small relative to repeated
file panels. Whole-page extraction fails at 256,030/256,000 bytes. Existing heading
discovery returns 256 entries and is truncated; introduction h1 selection also
fails the output limit. Code of Conduct recovery yields 418 Markdown bytes but
does not include the introduction. New explicit pinned CSS subtree recovery
yields **3,803 Markdown bytes** from `div.project-description__content`, without
refetching or raising quotas.

RFC 9110 returned 1,187,554 bytes and failed at 256,604/256,000 output bytes.
Existing recovery yields a bounded outline and Retry-After/Content Negotiation
sections of 1,719/38,474 Markdown bytes. New selector recovery returns the same
1,719-byte Retry-After section. These are selected sections, not full documents.

See `RESEARCH-SELECTOR-RECOVERY.md` for the command, API, admission and limits.
Actual final CLI/API results match baseline native extraction of the same source
subtrees. Ordinary replay of failed captures and oversized selectors remain
rejected; original failures and source bytes are unchanged. No live validation
of the new code is claimed: the code change was checked against saved bodies.

## Validation and retained limitations

All 1,312 selected tests pass across 18 explicit native files, with 80 additional
cases net. All 1,227 unchanged statuses match; five CLI admission cases were
revised/reworded for selector support. Build/types/format/lint pass. Fourteen
guarded offline children close with zero network attempts. Retained failures
include the oversized PyPI heading, initial test type/escaping errors, expected
rejection controls, and an invalid dotted-ID proof selector corrected in a
separate run. Independent static review found no concrete defect.

BBC cards lose their h2 structure inside links and concatenate dates, image
descriptions and prose. Reader doctype diagnostics differ from the captured
sources; investigate separately rather than claiming malformed websites. The
crates.io shell, npm/AP challenges, Chrome missing page and W3 over-cap body
remain unresolved. No source-backed hardware/benchmark/model/community research
conclusions or full rendering/runtime/credential/passkey/service/TTY acceptance
are established. Overall browser goal remains active.

Machine-readable report: `reports/diverse-content-2026-09-15.json`. Private raw
receipts, observer events, scopes, snapshots, tests and proofs remain under
`node_modules/.cache/native-validation/diverse-content-september15`; do not share
raw navigation logs without reviewing redirect/query values. Earlier top-100
measurements and original uncommitted work remain unchanged. No push.
