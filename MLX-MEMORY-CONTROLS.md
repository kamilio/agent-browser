# MLX-LM memory controls are comparison variables

One native-browser read of the upstream MLX-LM README at **September 6, 2026
00:21:17.729 UTC** adds documentation evidence to the local-LLM hardware research.
It is not an executed benchmark, a hardware ranking or a purchase recommendation.
The URL uses mutable `main`, not a pinned release or proof of installed/latest
behavior: `https://raw.githubusercontent.com/ml-explore/mlx-lm/main/README.md`.

## What the source establishes

The README describes quantization with a 4-bit conversion example, rotating KV
cache sizing, prompt-prefix caching and configurable prefill steps. Cache size
trades memory against output quality; prefill steps trade peak prompt-processing
memory against speed, with a documented default of 2048. A saved prompt cache
supplies the model selection and avoids recomputing its prefix. Large-model
guidance describes attempted model/cache memory wiring on macOS 15+, not guaranteed
fit. These are documented controls, not verified artifact identities, measured
free memory or equivalent quality. The retrieved README provides generation
examples but no numerical generation-throughput or latency benchmark.

## Implications for a fair comparison

Proposed controls, **not executed measurements**:

- Record the exact runtime revision, model/quantization artifacts and effective
  settings. A conversion example does not authenticate a downloaded model or
  establish equivalent quality between quantizers and backends.
- Treat rotating-cache size as part of the workload and quality condition, not
  a free memory reduction. Do not compare different retained-context policies as
  though both systems performed identical long-context work.
- Record prefill step size when comparing peak memory and prompt-processing
  speed. A lower-memory configuration may do different scheduling work.
- Separate fresh-prompt and prefix-reuse experiments. Record cache provenance,
  the selected model and actual processed versus reused tokens; do not infer
  weight revision or cache precision from a model label alone.
- Establish peak memory, headroom, failures and client-observed latency through
  a separately authorized experiment. Installed unified-memory capacity and
  attempted memory wiring are not evidence that a particular workload fits.

The source does not establish tested context capacity, repetition/uncertainty
controls, end-to-end latency, cache precision, quality equivalence or matched
Mac/GPU/backend comparisons. It therefore does not resolve the unmatched hardware
submissions in `HARDWARE-MEASUREMENTS-2026-09-05.md`. Use the explicit comparison
procedure in `HARDWARE-BENCHMARK-PROTOCOL-2026-09-05.md` without rewriting those
historical measurements or changing system memory/security settings.

## Preserved evidence

The separately approved native request recorded HTTP 200, one GET, zero redirects
or retries, no classified barrier and closed transport. It remains
`partial: true`, `outcome: extracted-unverified`, `contentSuccess: null`.
The native text extent is 8,590 code units; rendered extraction is 8,600 UTF-8 bytes
including fences. The transport body is 8,590 decoded bytes / 3,240 encoded bytes.

- Receipt SHA256: `c806676ecfcfa62cb3052f30f9a63f01d4d8a39052eaf0a7e2d9969d2e2c0fd2`.
- Body SHA256: `625b4478800ad2fd5d393792f7ca8d4006be9c95b725cc239a9e67b7aa891875`.
- Native extraction SHA256: `0d7e75a60a378cffa79803f1fe563ebbfe1aec21822c95934fcaf696eea794b7`.

Exact request, arguments, source locations and artifact inventory are in
`node_modules/.cache/native-validation/mlx-memory-research/REPORT.md`; the unique
run directory is `run-20260906T002022Z-d5b04173/`. Its 22-file frozen ledger and
1,664 input identities are retained. Parent verified the ledger and read native
extraction; body capture was used only for byte integrity, not fallback source
text. The report records an initial display of base64 metadata without adopting
it as source text. No model, benchmark, install, system tuning, SDK/device probe,
real account or alternate browser request occurred. Existing stopped research
lanes and actual browser/passkey acceptance gates remain unchanged.
