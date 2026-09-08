# Native MMLU-Pro methodology investigation

One native-browser retrieval on September8,2026 supports a bounded description
of MMLU-Pro, not a new benchmark result or current model ranking. The primary
README endpoint is `https://raw.githubusercontent.com/TIGER-AI-Lab/MMLU-Pro/main/README.md`.
Its mutable `main` revision was not observed or pinned; native document revision2
is not a Git revision. No linked dataset, paper, leaderboard or discussion opened.

## Supported strengths and limitations

The authors describe more than12000 curated questions across14 academic domains,
with reasoning-oriented questions and ten answer choices instead of four. These
are source descriptions, not independently counted items or validated difficulty.
Inference: broader academic coverage and expanded choices can support a more
demanding multiple-choice design. They do not establish balanced sampling,
real-world competence, broad reasoning ability or universal validity.

The README refers elsewhere for Dataset Creation details. Filtering criteria,
reviewer qualifications/counts, independent passes, adjudication, agreement and
residual error rates remain unestablished here. This does not mean no human
review occurred. No contamination, memorization or overlap audit was performed.

Author-reported experiments describe an accuracy drop of16%–33% relative to MMLU,
prompt sensitivity reduced from4–5% to2% over24styles, and a chain-of-thought
advantage. These expressions retain the source convention; they are not converted
to percentage points or relative changes, reproduced or generalized. The update
adding24prompt styles is dated October10,2024, not the retrieval date or every
experiment. Actual prompt files, seeds, few-shot choices and chat formatting were
not inspected. Testing several prompts is relevant to sensitivity, not invariance.

Alternative answer-extraction mechanisms and a minor effect on results are
advertised, but algorithms, malformed-answer handling, populations and effect
sizes are not established. Inference: preserve the extraction rule when comparing
methods, and distinguish final-answer scoring from reasoning-trace quality.

Example local/API workflows expose workers, token limits, saved answers and
retries. A documented wrong-answer retry option warrants a methodological
distinction: correctness-dependent retries, if enabled, are not fixed-attempt
evaluation. No implementation or historical use of that option was checked;
this observation implies neither misconduct nor how any published score arose.
The17-row accuracy table is historical author reporting, not a September2026
ranking. Per-row evaluation dates, exact revisions, uncertainty and matched
configurations are absent. No model or evaluation command was run.

## Actual native evidence

The native operation runs08:37:39.853–08:37:40.003Z; response observed08:37:39.996Z
on September8,2026. One GET returns HTTP200/plaintext/gzip,2656encoded and5993
decoded bytes, with zero redirects/mocks, no active requests and closed transport.
The supervisor interval is08:37:38.842887753–08:37:40.765309105Z. No reported
barrier is observed; that is not a general challenge-detection guarantee.

The unchanged historical `research-long-cli-verified` engine is used, with1732
compiled files and committed package identity, not dirty root code or a rebuild.
Eight native synthetic controls and four status controls pass with zero forwarding.
Separate source execution and independent zero-GET verification exit0. The verifier
runs08:38:03.839–08:38:04.210Z and checks1732engine/44RUN files. These are distinct
freshly authorized actions, not a full suite or socket/device/live acceptance gate.

The6003-byte/105-line native export, including fences, has SHA256
`9eb8e7da2fb7f97c610861e80c6b8eba9cbd6d16fe0c3fbd45672116fcdff007`.
It remains `extracted-unverified`, `partial:true`, `contentSuccess:null`.
Integrity admission establishes eligible artifact identity, not source truth,
rendered visibility or an independently recomputed response-body hash. No raw body
capture exists; no host parser, direct HTTP fallback or old source replay occurs.

Evidence: `node_modules/.cache/native-validation/native-benchmark-mmlu-pro-source-01/REPORT.md`.
The final ledger has90entries across91regular files including itself; its SHA256
is `ae7352bede96887c1d0a05b4a7ee4e9d0517d68516946835a02a6ca8471385bd`.
Static review checks all90hashes, inventory coverage and new-export claims without
rerunning validators. It finds no actionable discrepancy and discloses its
reviewer's prior SWE harness authorship. Finalization terminal status remains
external conversation evidence, not a newly manufactured local status artifact.
Review: `node_modules/.cache/native-validation/native-benchmark-mmlu-pro-review/REVIEW.md`.

The parent independently checks all90opaque hashes after correcting a manual
working-directory mistake; the first audit's missing-file failures are retained,
not digest mismatches or a failed native investigation. No frozen evidence changes.
All broader goals and outstanding access/secret/passkey/fingerprinting gates remain
in `TASKS.md`; this source does not reopen blocked X, Reddit or challenge endpoints.
