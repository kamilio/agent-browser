# Website checks — September 13, 2026, third update

This supplements `WEBSITE-TEST-INVENTORY-SEPTEMBER-13-SECOND-UPDATE.md`.
Earlier reports and their then-unfollowed links remain historical. The hosts in
this update were already attempted before; successful source reads are not a
count of fully working websites.

## New benchmark-documentation visits

| URL | Native retrieval, UTC | Actual outcome |
| --- | --- | --- |
| `https://docs.mlcommons.org/inference/` | September 13, 04:04:40 | One GET, HTTP 200, 47719 decoded bytes; one offline native parse/query, 15 excerpts including a discovered link |
| `https://docs.mlcommons.org/inference/submission/` | September 13, 04:18:03 | One GET, HTTP 200, 35340 decoded bytes; one offline native parse/query, 17 heading-content groups and 21 contextual links |

Both use the previously audited font-style runtime, code `ebac856`, with 17503
selected native passes. They do not use the concurrently developed fragment fix.
No redirects, retries, scripts, images, other subresources, authentication,
cookie reuse, SafeJS, real TTY or challenge evasion ran. Private HOME/TMP and
source/compiled integrity checks pass. Reported single-navigation times of 118 ms
and 96 ms are observations, not general performance benchmarks.

## Original NVIDIA fragment link now passes native admission

At September 13, 2026, **04:28:12 UTC**, the new audited runtime navigated the
original discovered URL:
`https://www.nvidia.com/en-us/geforce/graphics-cards/compare/#50-series`.
The guard forwarded that fragment-bearing input unchanged to the actual native
transport. One actual HTTPS GET returned **HTTP 200**, with zero redirects,
retries or mock requests. The observed HTTPS request path contained no fragment;
the guard did not strip it from the input as a workaround.

Native metadata reports matching requested/effective fragment digests and
`resolution: element`, with target `e7337`. The full heading outline includes
`Compare 50 Series Specs` at the distinct ref `e7353`. Reference numbers do not
establish their parent/child relationship or target element type, neither of
which was inspected here. The normal full-document outline was not silently
restricted to the target.

This probe uses code `59fa3b0` / audited native gate17741, not the older runtime
used for the two MLPerf visits. All1250 source and2076 compiled file inventories
match before and after. The response has542281 decoded bytes and its own SHA-256:
`5f4aa048d9a1493d5ae483f412c77ce4c635df8c3ab23c54af78a6343e561e97`.
Equal byte counts do not make it identical to the previous comparison capture.
Reported navigation elapsed399ms is not a controlled speed benchmark.

The earlier CLI admission failure and separately scoped fragmentless workaround
remain unchanged evidence. This run proves the original link can reach the
native transport and establish a DOM target, not viewport scrolling, scripted
tab activation, highlighting, text-directive support or full-site rendering.
No additional offline parse, extraction, `:target` selection or GPU measurement
ran. Previous column-checked hardware findings were not measured again here.

No scripts/assets/subresources, credentials, cookie reuse, SafeJS, real TTY,
fingerprint evasion or challenge solving ran. Request credentials were omitted;
saved Set-Cookie values were omitted. Private directories stayed empty and the
transport closed with zero active requests. Metadata URLs remain redacted;
private invocation/scope files and the original body deliberately retain their
authorized source data, so this is not a general secrecy guarantee.

## What this adds to benchmark research

The overview explicitly labels its scope as MLPerf Inference v5.0. Fresh
retrieval does not prove that version is current. It supplies workload-specific
datasets, reference accuracy and latency conditions, including separate
time-to-first-token and time-per-output-token limits for some LLM workloads.
These are required conditions, not measured results from this browser session.
Its relative-to-reference accuracy thresholds do not mean the same percentage
of correct answers on every task.

The submission guide distinguishes availability categories, system types,
scenarios and divisions. It describes Closed as holding the model/reference
setup fixed, while Open permits broader changes. It also describes accuracy
checking, result packaging, submission checking and using the appropriate
round-specific branch/tag. Those are project descriptions; the checker and
submissions were not inspected or executed, and the guide does not identify a
verified current round tag.

**Methodological interpretation:** explicit task/quality/latency conditions help
make within-scope comparisons inspectable. They do not establish one universal
model-quality score, contamination resistance, real local-LLM throughput, or
deployment usefulness. Detailed scenario rules and allowed optimizations still
need their primary policy sources. No benchmark, model download, checker,
submission upload, portal login or leaderboard evaluation occurred.

## Unresolved source issues

- The overview's high-accuracy summary omits some models whose individual entries
  say a high-accuracy variant exists. The submission guide does not settle this.
- Its blanket Datacenter statement and individual PointPainting entry differ;
  do not silently infer eligibility from one of them.
- The overview calls Datacenter/Edge submission categories; the guide calls them
  system types and uses Available/Preview/RDI for availability categories.
- Scenario details, latency percentiles, all optimization permissions, compliance
  coverage and power methodology were not established by these overview pages.
- Current frontier rankings and broader benchmark strengths/weaknesses remain
  partial research, as do the original hardware, Astra and Poe/Reddit topics.

## Discovered candidates, not tested destinations

The guide links to the inference policy document with scenario and Closed/Open
fragment targets, the submission-structure policy, preprocessing/checker source,
SUT-description documentation and a Submission CLI guide. Exact discovered URLs
and context are retained in its `EXCERPTS.md`. They use mutable branches or
unversioned pages; link discovery is not evidence of their current contents.

These fragment-bearing policy links provide further real examples of the CLI
admission friction found on NVIDIA. Their contents have not been fetched in this
update, and no successful interactive fragment navigation is inferred.

## Evidence

- Overview: `node_modules/.cache/native-validation/native-mlperf-overview-september13/RESULT.md`
- Overview body SHA-256: `e61e8519a0af7072db2cb7dce36ee404630cb96d297158a63a9fbf4bd7f81ae8`
- Submission guide: `node_modules/.cache/native-validation/native-mlperf-submission-september13/RESULT.md`
- Submission body SHA-256: `dde9a672b2bc92f57b4763a409feaeccf06837337f4c50aa3b9f997a3c4c1727`
- Earlier benchmark evidence: `node_modules/.cache/native-validation/browser-research/benchmarks/REPORT.md`
- Fixed-runtime NVIDIA probe: `node_modules/.cache/native-validation/native-nvidia-fragment-september13/RESULT.md`
- Native HTTPS-path/digest checks: `node_modules/.cache/native-validation/native-nvidia-fragment-september13/REGRESSION-CHECKS.json`
- Implementation, selected tests and separate legacy-failure scope: `RESEARCH-FRAGMENTS.md`

The semantic reader omits styling/scripts and does not establish interactive
visibility or full-site rendering. Historical failures on other pages remain
failures until separately retested; this is not their retrospective acceptance.
