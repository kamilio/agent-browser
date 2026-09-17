# Native reader retrieval performance — September 17, 2026

## Result

A bounded raw-script/style scanning optimization reduces median **local
in-process saved-response retrieval time** by 34–42% on the measured Best Buy
modes and 22–25% on Bankrate. Wikipedia is mixed: one mode is 3.3% slower and the
other two change by about 0.5–1.1%. This is not a universal browser speedup, a
live-network comparison, a cold-start result or a statistical significance claim.

No resource cap is increased. Source content is still inert. An exact comparison
of all recorded result fields across **96 historical complete captures plus four
fresh feed/article captures** finds no change in Markdown identity, reader
accounting, classifications, failures or outcomes. These controls do not rerate
historical usefulness or constitute another 100-site live crawl.

## Measured workloads

Milliseconds are medians of 16 measured samples per workload per runtime. A
negative change means lower latency. All nine workloads are retained:

| Saved source / mode | Baseline ms | Candidate ms | Latency change |
| --- | ---: | ---: | ---: |
| bankrate / filtered-main | 100.16 | 78.19 | -21.9% |
| bankrate / legacy-source | 54.41 | 40.87 | -24.9% |
| bankrate / source-headings | 53.54 | 41.63 | -22.2% |
| bestbuy / filtered-main | 28.01 | 16.23 | -42.0% |
| bestbuy / legacy-source | 16.80 | 11.07 | -34.1% |
| bestbuy / source-headings | 16.66 | 10.76 | -35.4% |
| wikipedia / filtered-main | 90.14 | 89.72 | -0.5% |
| wikipedia / legacy-source | 46.92 | 48.47 | +3.3% |
| wikipedia / source-headings | 47.23 | 46.72 | -1.1% |

`legacy-source` reads the existing unfiltered source view; `filtered-main` uses
explicit source-hidden-inline visibility and main-content focus; `source-headings`
uses the preceding opt-in heading feature. These are not equivalent content
scopes. Best Buy's filtered result remains the same **43-byte placeholder**;
making it faster is not fixing its rendered storefront. Its source modes remain
5,544 and 5,549 bytes, respectively. Wikipedia and Bankrate output hashes also
remain unchanged within each mode.

The experiment uses the same three pinned native captures and Node binary,
preloads response bytes outside the timed operations, and routes all requests
in memory with kernel/JavaScript network denial. Each process performs one
warmup pass followed by eight measured passes over nine workloads; publisher
order alternates between passes. Four unprofiled processes run in baseline,
candidate, candidate, baseline order. That gives 16 measured samples for each
version/workload, 324 routed operations including warmups, and zero new network
requests. Native transport/document cleanup remains part of the operation.

This small, warm repeated-read experiment excludes actual network latency and
cannot establish broad hardware/resource behavior, sustained leak freedom or
real-world statistical significance. Normal host variability remains possible;
the Wikipedia regression is reported rather than discarded.

## Why this helps

Separate V8 profiles identify the raw-discard loop and repeated per-charge
`AbortSignal.aborted` getter calls as avoidable overhead. Weighted sampled self
time for the raw step falls from about **386 ms to 65 ms**, and the abort getter
from about **281 ms to 7 ms**, across the profiled workloads. Profiles are
supporting observations, not exact per-function CPU accounting or the source
of the unprofiled timing table.

The optimized optional host callback batches at most 1,024 ordinary UTF-16 units
inside already prepaid raw windows. Script transitions and closing markers keep
the existing state machine. Successful work totals, raw step counts and exact
first-over-limit diagnostics are preserved. Reader cancellation is checked at
batch boundaries; per-character observer side effects are not claimed identical
on the opted-in path. Unbatched callers keep their original callback sequence.
See `RAW-SCAN-BATCHING.md` for the contract and limits.

## Validation

- Final release04: **870 passed / zero failed across 15 selected native files**,
  including **111 new cases**. Build, strict selected types, format and lint pass.
- Canonical manifest: **986 entries, 964 available, 22 still missing**. No full
  manifest acceptance or acceptance of pre-existing dirty runtime work is claimed.
- Tests compare all six raw names, script states, delimiters, window boundaries,
  non-ASCII/EOF behavior, exact expanded debit sequences and callback reductions.
  Reader tests preserve resource failure diagnostics/progress across 17 remaining
  budgets and verify cancellation before document initialization.
- Both 100-case saved-response runs close their resources and match every
  recorded result field. The four fresh captures also match their original live
  Markdown, reader metadata, classifications and outcomes. No new request occurs
  during this candidate validation.
- Initial test runs retain two fixture failures: an expectation that XMP would
  be discarded, and an expectation that malformed reader EOF would succeed.
  Existing behavior is preserved; the fixtures now assert retained XMP and
  malformed-input refusal. Release01 records 788/1; release03 records 869/1.
  Release02 is quality-only, not an additional native pass.
- Independent static review finds no actionable defect within its inspected
  scope, including the work-cap crossing arithmetic. It is not an independent
  execution, hard-preemption or broad performance approval.

## Additional live functionality testing

A parallel native-only worker retrieves two source-advertised feeds and their
first admissible articles from Tasting Table and ScienceInsights: **four fresh
GETs, all HTTP 200**, zero retries/redirects. Saved-source review matches 5/5 and
27/27 eligible article paragraphs, including substantive body text. Medical/legal
claims and offers are not verified. Details and exact URLs are in
`reports/feed-article-workflows-2026-09-17.md`.

Those live requests use the prior sealed source-heading runtime, not this
performance candidate. The candidate's checks of their bodies are explicitly
zero-network followups. Failed offline harness checks and original live evidence
are retained. No credentials, page scripts, SafeJS, alternate browser/client,
identity changes or CAPTCHA solving are involved.

## Remaining work

Dynamic/SafeJS execution, broader live compatibility and measured performance,
access/CAPTCHA handoff, real credentials/passkeys/devices/TTY, missing manifest
files and unfinished research remain open. Historical citation-proxy verdicts
stay 33 useful / 67 other. The overall browser goal remains active.

Machine-readable measurements, source/build pins and evidence hashes are in the
JSON sibling. Private artifacts:
`node_modules/.cache/native-validation/retrieval-performance-september17/`.
