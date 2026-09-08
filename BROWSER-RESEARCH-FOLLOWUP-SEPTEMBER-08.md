# Browser research follow-up — September 8, 2026

**Synthesis date:** September 8, 2026. This summarizes committed root reports;
it is not a new source visit, benchmark run or latest-web verification.
Successful source investigations still carry partial, extracted-unverified evidence,
not independent truth or performance validation. (`BROWSER-RESEARCH-SEPTEMBER-08.md`;
`MMLU-PRO-BENCHMARK-METHOD.md`.)

## 1. Local-LLM hardware: capacity is not measured suitability

- **Vendor claims, visited September 8:** Apple's reported Mac Studio configurations
  list up to 128 GB Max / 512 GB Ultra unified memory and up to 1.2 TB/s Ultra memory
  bandwidth. The export contains no numeric configuration price; it establishes
  neither shipping availability nor LLM speed. (`BROWSER-RESEARCH-SEPTEMBER-08.md`.)
- **Guide claims, visited September 7:** llama.cpp distinguishes layer and experimental
  tensor splitting; tensor mode has additional communication, attention/KV and model
  compatibility constraints. Context, concurrency and CPU offload affect the memory
  and workload comparison. No matched hardware experiment ran. (`HARDWARE-MULTI-GPU-GUIDE.md`.)
- **Inference:** neither summed memory nor vendor bandwidth decides model fit or a
  hardware winner. Specify model, quantization, context, concurrency and backend, then
  distinguish usable memory, prefill/decode latency, throughput, power and delivered
  price. These remain unmeasured here. (`HARDWARE-MULTI-GPU-GUIDE.md`;
  `BROWSER-RESEARCH-SEPTEMBER-08.md`.)
- **NVIDIA, September 8:** the proposed product endpoint returned 404 at 07:50 UTC;
  the later directory attempt stopped at network-policy denial at 08:16 UTC, with
  no admitted HTTP status or source content. Neither establishes product facts or
  the directory refusal's cause. (`BROWSER-RESEARCH-SEPTEMBER-08.md`; `NVIDIA-DIRECTORY-TRIAL.md`.)
- **ROCm, September 8:** a synthetic control failed before any live request; this is
  not an AMD access failure. The exact failed assertion remains unknown. The later
  diagnostic observed escaped hyphens and flattened table labels, not release/GPU
  compatibility associations. (`ROCM-TABLE-CONTROL-TRIAL.md`; `NATIVE-MARKDOWN-TABLE-DIAGNOSTIC.md`.)
- **Validation is not source evidence:** the table report's 239 selected passing tests
  describe structural boundaries, not columns, headers or spans. Neither those tests
  nor the 198 focused policy tests retroactively pass the ROCm/NVIDIA live gates
  or establish hardware facts. These are recorded synthetic validations, not new
  source visits. (`NATIVE-MARKDOWN-TABLE-BOUNDARIES.md`; `RESEARCH-POLICY-REASONS.md`;
  `ROCM-TABLE-CONTROL-TRIAL.md`; `NVIDIA-DIRECTORY-TRIAL.md`.)

## 2. Benchmarks: distinguish the task, scoring and repeatability

- **New MMLU-Pro findings; README visited September 8:** authors describe over 12,000
  curated questions, 14 academic domains and ten choices rather than four. They
  report a 16%–33% accuracy drop versus MMLU, lower prompt sensitivity (4–5% to 2%
  across 24 styles), and a chain-of-thought advantage. These retain the authors'
  percentage convention, not independently reproduced effects. The 24-style update
  is dated October 10, 2024, not the visit date or every reported experiment.
  (`MMLU-PRO-BENCHMARK-METHOD.md`.)
- **MMLU-Pro interpretation:** inference—expanded choices and academic coverage can
  make a useful demanding multiple-choice test, not proof of general reasoning.
  Human-review procedures, residual errors, overlap/contamination and exact prompts,
  seeds and chat formatting remain unestablished. Final-answer extraction is not
  reasoning-trace assessment. If enabled, the documented wrong-answer retry option
  differs from fixed-attempt evaluation; its actual use in published scores was not
  checked. The historical accuracy table is not a current ranking. (`MMLU-PRO-BENCHMARK-METHOD.md`.)
- **SWE-bench; README visited September 8:** repository/issue repair, patch evaluation,
  Docker and saved logs offer concrete tasks and repeatability mechanisms. The README
  warns that reused run/instance identifiers can reuse results despite changed patches.
  Agent setup matters; test-oracle coverage and broad correctness are not established
  by that workflow alone. (`BROWSER-RESEARCH-SEPTEMBER-08.md`.)
- **LM-evaluation-harness; README visited September 8:** shared task/prompt/scoring
  configuration and saved samples aid inspection, but documented backend differences
  and GPU-count-dependent cache resumption limit interchangeability. Seed procedures
  and exact chat-template application were not established by this read. Unlike a
  single benchmark, it is evaluation infrastructure. (`BROWSER-RESEARCH-SEPTEMBER-08.md`.)
- **Comparison inference:** record upstream/model revisions, task and harness versions,
  backend, prompts, few-shot/seed/template settings, attempts, answer extraction and
  test oracle. Mutable README visits are not pinned implementations or reproduced
  scores. Missing audits do not prove contamination or invalidity.
  (`MMLU-PRO-BENCHMARK-METHOD.md`; `BROWSER-RESEARCH-SEPTEMBER-08.md`.)

## 3. Astra chatter: authentication and identity remain gates

The September 8 summary retains an earlier X login/authentication boundary and a
separate official-page Cloudflare 403. It does not supply those earlier visit dates
or confirm a model announcement. No Astra identity, announcement or chatter consensus
is established by these outcomes. (`BROWSER-RESEARCH-SEPTEMBER-08.md`.)

## 4. Poe Reddit opinions: the recorded 403 is not an opinion sample

The September 8 summary retains the earlier Reddit 403, without a visit date here.
**Inference:** this provides no basis for recurring praise, criticism, popularity or
representative sentiment about Poe. (`BROWSER-RESEARCH-SEPTEMBER-08.md`.)
No alternate-endpoint/client retry or challenge bypass is authorized by this synthesis.

## Still unverified

- Which exact local model/workload fits which delivered configuration, at what measured
  speed, power and price—and what admitted NVIDIA/ROCm evidence supports compatibility?
- What pinned benchmark configurations, attempt policies, extraction rules and oracle
  coverage underlie any proposed comparison; what dataset-review/overlap evidence exists?
- What admitted primary material identifies Astra, and what dated X posts support chatter claims?
- Which admitted, dated Reddit posts/comments support specific Poe opinions, and how representative are they?
