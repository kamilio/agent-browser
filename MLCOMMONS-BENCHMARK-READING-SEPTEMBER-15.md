# MLCommons benchmark methodology: native-browser research note

## What was actually read

One native public GET on September 15, 2026 at 01:08:28 UTC visited
`https://mlcommons.org/benchmarks/inference-edge/`. HTTP 200 returned 145,674
decoded bytes (31,798 encoded). Native whole-page Markdown contains 17,132 bytes;
offline selection of its unique `main` recovers 5,380 bytes of benchmark content.
No linked rules, paper, change log, submission or embedded results were visited.

The captured page title includes “V3.1 Results.” This is not verification of
the latest benchmark release. Its numerical results depend on an omitted
Tableau iframe: this observation recovers methodology, not scores or rankings.

## Published distinctions

- The suite measures inference with a trained model. A benchmark has a dataset
  and quality target; detailed definitions and thresholds live in linked rules.
- A standard load generator issues requests using a scenario-specific pattern
  and metric. The page describes four potential scenarios, not one universal
  “speed” score. Detailed latency constraints were not recovered here.
- Closed requires the reference model to compare hardware/software frameworks.
  Open permits different models or retraining for innovation.
- Available, Preview and RDI distinguish purchasable/rentable systems from
  next-round availability and research/development/internal configurations.
- A submission represents one software stack and hardware platform; CPU and
  accelerator counts, code and metadata links matter to interpretation.
- Reported validated power is full-system AC energy/power measured at the wall
  during the accompanying benchmark, not a component TDP or PSU rating.
- Published results may be modified or invalidated. The linked change log was
  not followed, so current validity of individual results is unverified.

## Strengths and limits inferred from that content

These are interpretation, not additional site measurements:

- **Comparability:** fixed models, quality targets and controlled scenarios make
  comparisons more meaningful than unspecified tokens-per-second claims.
  That advantage is narrower in Open: a different model introduces a different
  comparison, even if its measured speed is greater.
- **Deployment relevance:** scenario and availability labels help distinguish
  throughput-oriented, latency-oriented and not-yet-buyable submissions. A
  result still needs to match the intended local workload and real software
  stack; this page alone cannot determine the best local-LLM hardware.
- **Power interpretation:** wall-power measurements can support system-level
  efficiency comparisons for the measured benchmark. They do not establish
  energy use for another model, scenario or utilization pattern.
- **Auditability:** metadata/code links and change tracking offer useful checks,
  but this single read did not examine them. It is not an independent benchmark
  reproduction, a hardware recommendation or a claim that all benchmarks are fair.

## Evidence and remaining research

Captured body SHA-256:
`65d742a77f3baf49f80fda676ebe9cacc8fb3f5e53c0e6309d0ea433af9f8238`.
Original evidence is in `/dev/shm/agent-browser-mlcommons-edge-september15/`:
`body.html`, `extracted.md`, `main.md`, `http-events.jsonl`, `VERIFICATION.json`,
`SOURCE-STRUCTURE.json` and `REVIEW.md`. A hash-checked durable copy belongs in
`node_modules/.cache/native-validation/mlcommons-edge-september15/`.

This advances only the benchmark-methodology part of the requested research.
Hardware recommendations, broader benchmark weaknesses, Astra social chatter
and Reddit opinions about Poe are not complete. Restricted sites remain stopped;
no challenge-solving, new identity or alternate client was used. Native reports
remain `extracted-unverified`, `partial: true`, `contentSuccess: null`.
