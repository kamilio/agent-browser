# Native website compatibility — September 11, 2026

These are separate native-browser operations and local diagnostics, not a
single successful browsing session. Historical reports and measurements remain
unchanged. The original four research topics are not complete.

## SWE-bench: response admission is not document admission

The first default-profile attempt at 04:09:47 UTC exceeded the 2,000,000-byte
decoded-response limit. SWE-BENCH-WEBSITE-PROBE.md retains that operation's exact
result: no admitted HTTP status or extracted content.

A separate explicit long-v1 operation retrieved https://www.swebench.com/ at
04:29:15.934–04:29:16.093 UTC. It received HTTP200 and captured 2,392,125 decoded
bytes, but failed at the existing reader.text limit: 2,364,591 observed code
units against 2,000,000. There was one request, no redirects or mocks, 342,899
encoded bytes, no active requests at exit and a closed transport. Exit status
was 1. The 159ms report interval is a failed-operation measurement, not page
completion latency. No headings or JSON document extraction were produced.

The complete response capture does not make this failed receipt eligible for
RESEARCH-JSON-REPLAY.md. Classification did not complete; null challenge fields
do not prove absence of a challenge. The operation used the unchanged c13667a
compiled engine, with all 2,748 source/dist hashes verified before and after.

Evidence: `node_modules/.cache/native-validation/native-swebench-long-september11/`.
The 3,191,698-byte receipt has SHA256
`3bf9ea7aa82695594d3d61d8fba85fa5d5887e98a53cc6d9dd6e072f31a426ed`.
The captured body was subsequently independently checked by the local source
diagnostic: 2,392,125 bytes, SHA256
`c862011a4ee1d1a7199fad6ca0905fa5c64f58216f7217ac1eddf37f28788433`.

A subsequent local accounting pass at 05:05:40.858–05:05:40.954 UTC instruments
the existing native tokenizer while invoking the unchanged native sanitizer
once. It reproduces the exact reader.text failure and attributes the crossing
to one raw script contribution of 2,362,382 code units. The counter was 2,209
before that contribution and 2,364,591 afterward. Through the failure, ordinary
text accounts for 1,615 units and raw-method text for 2,362,976 units. This is
prefix accounting, not a full-document or visible-text measurement: 20,835
source units remain unprocessed. Script contents were not exported/interpreted.

The root cause is confirmed: the reader charges omitted script text against its
shared text limit before deciding not to emit it. The diagnostic changes no
policy, keeps exit 1 and performs no network operation. A future change should
separately bound omitted/raw scanning work and retained text without removing
source, work or memory limits. It is not yet proven that this alone makes the
whole page extractable. Evidence:
`node_modules/.cache/native-validation/native-swebench-text-accounting-september11/`.

## SWE-bench: a separate heading-image limitation

A first zero-network source-heading diagnostic failed without retaining its
structured cause. Its original evidence remains unchanged in
`node_modules/.cache/native-validation/native-swebench-source-diagnostic-september11/`.
Missing counters are unknown, not zero.

A corrected diagnostic made exactly one fresh local native source-heading call
at 04:48:22.211–04:48:22.263 UTC. It retained AgentBrowserError code unsupported,
structure reason heading-inline-structure, and inline condition non-inline-start
for img in an h1, with inline depth zero. The position 6482 means last committed
UTF-16 source position, not an exact tag byte offset or rendered coordinate.
This is an unsupported source pattern under balanced-source-elements-v1, not
evidence that the site's HTML is invalid.

No resource diagnostic was returned. This source-heading failure therefore does
not identify the text responsible for the separate reader.text overflow. The
native call returned no report or heading count. It made no network or guarded
child/worker attempts, cleared its owned decoded body buffer and preserved the
original failed capture's evidence-only status. No limits or policies changed.

Evidence: `node_modules/.cache/native-validation/native-swebench-source-diagnostic-september11-round02/`.
The structured diagnostic receipt is 2,154 bytes, SHA256
`d7dcf4231d188a709b84cdf96d0ddbfe5440f9938946d77e662b5b5ad42bb5c0`.

## SWE-bench: image-aware source reading now succeeds

Commit ba0defd adds the explicit balanced-source-elements-v2 policy, preserving
v1 and all existing budgets. It accepts void image starts within source headings
while ignoring image attributes/alt, with an explicit report limitation. Both
discovery and source-section extraction carry the selected policy. Production
build, strict two test roots, three-file lint and 1,312 native cases pass;
SOURCE-HEADING-IMAGES.md records the 90 new regressions and baseline comparison.

A fresh local check at 05:14:28.177–05:14:28.563 UTC uses that tested engine and
the independently pinned original capture. One source-heading call reaches EOF
at source position 2,392,125 and returns 11 lexical heading candidates. It uses
1,219 tokens, 1,280 operations and 15,524,679 work units, with zero issues.
The pre-existing bounded raw-discard policy processes 23 script elements in 59
steps, advancing 2,367,316 code units. These are native accounting quantities,
not CPU, heap or rendered-text measurements. All original limits remain intact.

The new 4,028-byte heading report has SHA256
`8b2242393d7fc23c0aae2529e15c57d16113cc6d78b62ba88e8662b7c7b9018c`.
Evidence: `node_modules/.cache/native-validation/native-swebench-image-policy-september11/`.
Its network/child/worker guard counters are zero, source/compiled inputs and
original receipt remain unchanged, owned receipt/body buffers are cleared and
the process exits zero. This is real captured-source compatibility evidence,
not a new HTTP request or rendered-page/DOM-reader success.

Using that observed outline, a separate local operation at
05:15:49.824–05:15:50.467 UTC extracts exactly two identity/anchor-bound sections:
ordinal 4, SWE-bench, and ordinal 7, Verified. Both return three prose blocks,
terminate at the next completely validated same-level heading, and retain
lexical-not-dom, partial true and null contentSuccess. Two native calls,
unchanged budgets, zero guarded network/process attempts, successful cleanup,
stable source/compiled/capture hashes and exit zero. No sections are selected
from guessed CSS or fabricated offsets; the prior outline supplies the anchors.

Evidence: `node_modules/.cache/native-validation/native-swebench-method-sections-september11/`.
The 3,306-byte section-4 report has SHA256
`6515949b9723e3d0391a4a4d7b9835cf1b0e6129b21b25eba6aec5692ee4176c`;
the 3,273-byte section-7 report has SHA256
`12de15a045822b75ae183422cb2c536961aebdd97acaf219ed30ccf7516b57d2`.

The site describes its original set as 2,294 issues drawn from 12 Python
repositories, and Verified as a human-filtered 500-instance subset. These are
publisher descriptions, not independently counted/reviewed tasks. Inference:
repository issues offer a different task format from MMLU-Pro's multiple-choice
questions, while the stated Python/repository scope limits breadth. The brief
descriptions do not establish filtering quality, contamination resistance,
evaluation-harness fairness, scoring reliability or any current model ranking.
No linked posts, scripts, task instances or scoring implementation were opened.

The original DOM reader result remains a failure, and its receipt remains
ineligible for JSON replay. The successful source-only operations neither alter
that historical result nor silently raise its reader.text ceiling.

## AMD ROCm: an actual access challenge

A separate long-v1 capture of
https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html
ran at 04:46:34.218–04:46:34.274 UTC. It returned HTTP429 with a confirmed
Cloudflare challenge, using cf-mitigated-challenge evidence. Native outcome was
semantic-barrier, contentSuccess false, failure policy-denied at semantic-barrier,
and diagnostic action stop-and-request-user-handoff. No handoff was performed.

There was one request, no redirects or mocks, 5,598 encoded/decoded bytes,
zero active requests at exit and a closed transport. Exit status was 1. No
heading entries, selectors or compatibility-table content were obtained. No
retry, alternate endpoint/client, identity change or challenge bypass followed.
The unchanged c13667a engine passed all 2,748 before/after hash checks.

Evidence: `node_modules/.cache/native-validation/native-rocm-replay-capture-september11/`.
The 9,872-byte receipt has SHA256
`0de79d68d6e94ead0b2ff0b37844fda2d00f6895a900a78245f76db72edc28df`.
The reported capture body pin is not an independently decoded/admitted body
claim. The receipt is ineligible for JSON replay. The successful September 10
source report in ROCM-COMPATIBILITY-SOURCE.md remains historical evidence; this
new result neither rewrites that success nor establishes why today's request
was challenged.

## arXiv: successful native JSON extraction

The MMLU-Pro abstract page at https://arxiv.org/abs/2406.01574 was retrieved with
the newly validated batch-stop engine at 05:04:25.632–05:04:25.686 UTC. HTTP200,
one request, zero redirects/mocks, 45,161 encoded and decoded bytes, exit zero,
closed transport and zero active requests. Native outcome remains
extracted-unverified, partial true and contentSuccess null. No challenge was
detected. All 984 validated source inputs and 1,776 compiled files were unchanged.

The JSON reader exposes the abstract as a text node and reports zero tokenizer
issues. It also retains surrounding site content, so this is not an abstract-only
extractor. Scripting, styling, hidden-content semantics, interactive features,
visual layout and full-paper rendering are not validated by this check.

The abstract describes harder reasoning questions, ten rather than four answer
choices and removal of trivial/noisy questions. The authors report 16%–33%
lower accuracy than MMLU and prompt sensitivity reduced from 4%–5% to 2% across
24 prompt styles, plus a chain-of-thought advantage. These are author claims,
not reproduced results; the percentage convention is not independently resolved.
Inference: those comparisons address difficulty and prompt robustness, but do
not establish general real-world capability, contamination resistance or
universal prompt stability. The abstract does not establish cleaning methods,
sample details, uncertainty or a current model ranking. No full paper or linked
dataset was opened. The source page identifies revision v6, November 6, 2024.

Evidence: `node_modules/.cache/native-validation/native-mmlu-pro-arxiv-september11/`.
The 61,066-byte native JSONL receipt has SHA256
`1d9e24b0d81c57326cbfa88f91428e73c59e2784879d808e9a6e4407a709aaf1`.
There was no raw-body capture, retry, alternative client or followed content link.
This is fresh abstract-page evidence, separate from the September 8 README
investigation in MMLU-PRO-BENCHMARK-METHOD.md.

## Apple: successful native hardware-specification extraction

One native reader/JSON operation retrieved https://www.apple.com/mac-studio/specs/
at 05:07:08.956 UTC. HTTP200, one request, zero redirects/mocks, 40,582 encoded
and 215,392 decoded bytes, exit zero, empty stderr and a closed transport with
zero active requests. The report interval is 308ms, not an LLM performance
measurement. Outcome remains extracted-unverified, partial true and
contentSuccess null; no barrier was classified. All 984 validated source inputs
and 1,776 compiled files were unchanged.

The returned page labels the chips M5 Max and M5 Ultra. It lists configuration-
dependent maxima of 128GB unified memory and 614GB/s bandwidth for M5 Max,
and 512GB and 1.2TB/s for M5 Ultra. These are manufacturer-page specifications
observed on this date, not independent hardware tests. The higher capacities
require the listed higher processor configurations; they are not base-model
specifications. No prices, model fitting, tokens/second, concurrent throughput,
power under inference or best-value comparison were established. Memory
capacity/bandwidth alone do not establish the best local-LLM system.

The reader reports zero tokenizer issues and retains useful technical text.
It does not validate scripts, styling, hidden-content semantics or interactive
configurators. Native metadata describes the reader-loaded document as quirks
mode with missing-doctype and quirks-layout-not-implemented diagnostics; that
does not establish a defect in the uninspected original response body. No raw
body was captured and no alternative parser was used.

Evidence: `node_modules/.cache/native-validation/native-mac-studio-specs-september11/`.
The 151,467-byte native JSONL receipt has SHA256
`6ed9df4ec99b088336bec1d730fb887a76e64dc3e6656235831c1b405c1f28fa`.
RESULT.md records individual configuration qualifications and native node refs;
semantic-evidence.json preserves the selected semantic text and JSON paths.
No links were followed, challenge workaround attempted or models executed.

## Changes and outstanding work

- The actual AMD restriction exposed a batch-control gap: later URLs could still
  run after a terminal challenge. Commit 794583a stops after yielding an access
  barrier or HTTP429 report. All 561 focused synthetic cases pass, including 11
  new regressions; RESEARCH-WORKFLOW.md preserves the exact validation scope.
- Heading images now have explicit, tested source-policy support with a real
  captured-source check; image attributes are not rendered heading text.
- Large-page reader work now has measured script-text attribution but still
  needs bounded handling, not silent cap increases or failed-receipt promotion.
- No reduced-block rate, CAPTCHA solver, fingerprinting improvement, completed
  live JSON table extraction or browser-wide performance gain is established.
- Hardware and benchmark research remain partial. Earlier X/Astra and Reddit/Poe
  access failures do not support claims about model identity, chatter or opinions.
- Real credential-vault integration, full passkey acceptance, page-runtime/device
  gates and the broader browser objective remain tracked in TASKS.md. Already
  authorized native checks and website work do not need another general approval.
