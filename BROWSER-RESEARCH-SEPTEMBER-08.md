# Native-browser research: September 8, 2026

Three successful source investigations use this repository's native BrowserSession,
transport, document loader/reader and extraction. Neither uses an external
browser, web-search tool, raw-body fallback or host HTML/Markdown parser.
Native exports are read only after separately approved artifact verification.
These are additions to the historical research, not replacements for its dates,
paths, measurements or blocked outcomes.

## Local LLM hardware: capacity evidence, not a winner

Primary URL: `https://www.apple.com/mac-studio/specs/`.

Apple's Mac Studio specification page is retrieved once at07:40:45.998Z,
HTTP200 with zero redirects. The native export identifies M5 Max and M5 Ultra
configurations. It lists up to128GB unified memory for the40-GPU-core Max and
up to512GB for the36-CPU/80-GPU-core Ultra. Listed memory bandwidth is460GB/s
or614GB/s for the Max variants and1.2TB/s for the Ultra variants. These are
vendor claims from this exact retrieval, not independently measured performance.

The export's configure-to-order list corroborates the flattened specification
associations. Its Price heading has no numeric configuration price; that absence
does not establish that pricing is unavailable elsewhere. A preorder label is
not verified shipping or stock information. No store or linked page is opened.

The larger stated memory option is relevant to nominal capacity, but it does not
prove a particular model fits. Usable allocation, runtime/backend support, weight
format, workspace, KV cache, context and batching remain unmeasured. Vendor memory
bandwidth is not tokens/second; external Gb/s link ratings are not memory GB/s,
pooled accelerator memory or demonstrated distributed inference.

**Decision boundary:** no best-hardware or purchase recommendation yet. A useful
comparison still requires an exact model/quantization/context/concurrency target,
compatible backend, measured prefill/decode latency and throughput, sustained
power and delivered configuration price. Earlier native llama.cpp multi-GPU
research remains in `HARDWARE-MULTI-GPU-GUIDE.md`; it is not a matched Apple test.

Evidence: `node_modules/.cache/native-validation/native-hardware-apple-specs-source-01/`.
Its REPORT.md retains the first failed control execution: exit1, zero completed
cases and no requests. A new revision fixes two fixture expectations; fresh
12/12controls pass before the one live GET and separate successful verifier.
All45regular-file artifacts pass static final-ledger audit. Verified export:
`revision-02/verification/extracted.md`,23058bytes, SHA256
`22c848a2a3eb32a37d4a67b1e3bd53be4a1e13fbae37f926397b26ce6165b540`.
Final ledger SHA256:
`620b3a970654b7c68e6d14667861bdca25cb47222df1bd29398092b115a1f94b`.

### NVIDIA endpoint failure

A separate, freshly approved native investigation receives HTTP404 from the
proposed NVIDIA RTX PRO6000 specification endpoint at07:50:05.198Z. It stops
before document loading/extraction, with no redirect, retry or alternate endpoint.
Fresh12controls pass; native and verification processes both exit1. The verifier
admits failure integrity (`verified:true`, `usefulOutput:false`), not an export.
This provides no GPU specification, product-existence, current-generation or
server-cause claim. The path name is not source content.

Evidence: `node_modules/.cache/native-validation/native-hardware-nvidia-pro-source-01/REPORT.md`.
Its final ledger SHA256 is
`62d45480cab3783f1d1476cb52556a0ceccc6e63066fa7c6b8cf2f43dc8482a6`.
This failed investigation is separate from the two-source static cross-check.

## Benchmarks: SWE-bench's concrete task and reporting risks

Primary URL: `https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/README.md`.

The official SWE-bench README is retrieved once at07:36:20.843Z, HTTP200,
zero redirects. Mutable main is not an observed pinned upstream revision.
The native plaintext reader and extractor supply the verified report source.

The README describes repository-and-issue repair tasks with proposed patches,
Docker evaluation, retained build/evaluation logs and run-specific results.
These are useful mechanisms for concrete task evaluation and reproducibility,
not proof of broad software correctness or interchangeable environments.

A specific documented pitfall matters: cached results use run and instance
identifiers rather than changed patch content. Reusing those identifiers can
reuse an earlier result; the README directs changing the run identifier when
changing predictions. This is a source-documented operational caveat, not a
newly reproduced bug. Its named agent-framework example also cautions against
treating every result as a measurement of an isolated model.

**Assessment:** comparisons should record dataset/revision, environment/harness,
predictions, run identity and agent configuration. This is an inference from the
documented workflow. The README alone does not establish exact test-oracle
coverage, hidden-test quality, contamination, generalization or current rankings.
Its August13,2024 Verified solvability announcement remains a dated source claim,
not a fresh audit of the current dataset.

Evidence: `node_modules/.cache/native-validation/native-benchmark-swebench-readme-source-01/`.
Fresh8native synthetic plus4status controls pass with zero forwarded requests.
The one native GET and separate zero-GET verifier both pass;1732engine files and
36RUN artifacts are checked. All82regular-file artifacts pass final-ledger audit.
Verified `extracted.md`:13312bytes including native fences, SHA256
`89d5b90d357ebe935f80fa36fa2e52e393197d954af685214a66bd6593098f94`.
Final ledger SHA256:
`b72ebdd5ca3952e96bcfbd231c8e4ba5cf0a8cedf9017f297778cbcc3dc63079`.

## Benchmarks: evaluation-harness configuration is part of the result

Primary URL: `https://raw.githubusercontent.com/EleutherAI/lm-evaluation-harness/main/README.md`.

The official EleutherAI lm-evaluation-harness README is retrieved once at
07:52:52.732Z, HTTP200, zero redirects. Its mutablemain content describes shared
task configuration, prompts, output post-processing/answer extraction and saved
samples/results. It advises inspecting small generative-task samples to check
whether extraction and scoring behave as intended. These are maintainer-described
mechanisms, not independently validated metrics or deterministic-run guarantees.

The README warns of backend differences, including vLLM versus Hugging Face and
possible MPS correctness differences. Its cache discussion also conditions some
resumption behavior on GPU count. **Inference:** common harness interfaces and
reused results do not by themselves establish comparable model outputs; record
backend, configuration, extraction/scoring settings and resume conditions.

Few-shot configuration is described, but the verified README does not establish
seed defaults/procedures or exact chat-template selection/application. Those are
source gaps, not claims that the software lacks such features. No comparator,
task implementation, model inference or evaluation is run. No score, ranking,
contamination finding or cross-backend equivalence is established.

Evidence: `node_modules/.cache/native-validation/native-benchmark-lm-eval-readme-source-01/REPORT.md`.
Fresh8native plus4status controls pass; source and verifier exit0. The verifier
checks1732engine and44RUN files. Verified export:58584bytes including native fences,
SHA256 `8a99d6f56f1903f14aca9c23029c7f92acdf0f5e4edf71a4e14a1675a2b8c859`.
Static review checks all90final-ledger entries and exact inventory coverage;91files
include the self-excluded ledger. Finalizer terminal status is external conversation
evidence, not a second status artifact manufactured by this review. Final ledger:
`486d707008082b7ae9f1fb781f43ee6ab2de9a0deb343aa337f406f90b34a003`.
Review: `node_modules/.cache/native-validation/native-benchmark-lm-eval-review/REVIEW.md`.

## Shared limits and remaining topics

All three successful investigations retain `extracted-unverified`, `partial:true` and
`contentSuccess:null`. Integrity admission binds native artifacts; it is not
source truth, rendered visibility or independent measurement. No raw response
body is read for prose; native body identities remain transport declarations.
The frozen engine is the previously tested committed872a6aa build with1732dist
files, not the mixed working tree or a new whole-browser validation.

Static cross-check:
`node_modules/.cache/native-validation/native-research-september08-review/REVIEW.md`.
It finds no actionable discrepancy, checks both final ledgers and source claims
against verified exports, and explicitly discloses that its reviewer previously
authored the SWE-bench lane. That part is not a second independent author review.

Twitter/X Astra chatter remains blocked by the previously observed login boundary;
the separately observed official-page Cloudflare403 is not a model announcement
confirmation. Reddit Poe research remains at its recorded403. No alternate client,
endpoint or challenge bypass is used to evade those boundaries. Password-provider,
passkey, fingerprint identity and browser acceptance gates remain tracked in
`TASKS.md`; these useful source runs do not satisfy those unrelated gates.
