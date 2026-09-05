# Benchmark format robustness: bounded research

## Historical source and limits

On September 5, 2026, the native browser followed an ordinary saved BFCL link to
`https://gorilla.cs.berkeley.edu/blogs/17_bfcl_v4_prompt_variation.html`.
The article labels its release July 17, 2025 and update July 20, 2025. Those are
historical source dates, not the latest benchmark release or current model rankings.

It describes 26 prompt variants over 200 selected single-turn cases, excluding
multi-turn, Java, JavaScript and hallucination categories. Its subset comparison
covers 20 models. Prose and a chart caption disagree about the ordering of Python
versus XML function documentation. Do not resolve that discrepancy into a winner
without inspecting the underlying data. No implementation or results were rerun.

## What this helps evaluate

The useful question is whether a model's tool-call behavior survives changes in
how otherwise comparable requests and tool interfaces are represented. My
assessment is that this is a valuable compatibility stress test, but not a
standalone measure of agent task completion. A syntactically valid call can have
the wrong arguments or cause the wrong action; a parser rejection does not by
itself explain whether the underlying selection was semantically correct.

For this browser's future evaluation, retain separate observations for:

- Input acceptance and exact emitted representation.
- Parsing/validation failures, tool selection and argument correctness.
- Actual tool execution and independently checked task outcome.
- Retry count, latency, resource consumption and stateful failure recovery.

These are proposed evaluation controls, not new measurements. Use paired cases,
pinned model/runtime/tool versions and saved raw results when comparing formats.
Record unsupported input formats instead of silently converting them and claiming
native support. Keep a holdout set separate from fixtures used while developing
compatibility. A format ranking from one harness should not be generalized to
another parser or production workload without testing that transfer.

## Native-browser provenance

Evidence remains at
`node_modules/.cache/native-validation/pass-runner-cancellation/research/benchmarks/`.
The ordinary link was found before fetching in the saved BFCL V4 extraction at
`node_modules/.cache/native-validation/page-user-timing/research/bfcl-v4/01-bfcl-v4.extraction.md:60`.

Exactly one independently authorized native request returned HTTP 200 with zero
redirects, received September 5, 2026 at 12:40:47.085 UTC. The captured
transport-decoded body contains 86,446 bytes with SHA-256
`bd9f4badb8e9a756345b53226605245d1ec319757b707996d9c1ed74b95e367d`.
`verification.json` records the receipt, capture and unchanged extraction hashes.
`REPORT.md` gives source locations, the contradictory prose/caption and limitations.

The native result remains `extracted-unverified`, `partial: true`, with
`contentSuccess: null`. Capture integrity does not establish complete rendering,
independent authenticity, chart correctness, reproduced scores or real-world task
success. No chart asset, second endpoint, benchmark, model, credential, SDK or
page code was executed. Original artifacts and dates were not rewritten; stopped
Reddit/Astra/X lanes and all existing denied gates remain unchanged.
