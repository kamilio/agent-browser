# llama-bench controls and hardware comparison limits

A native-browser observation at **September 6, 2026, 06:47:34.855 UTC** adds
upstream documentation evidence to the local-LLM hardware investigation. This is
not an executed benchmark, hardware ranking or purchase recommendation. The
retrieved URL is mutable `master`, not a pinned or proven latest revision:
`https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/llama-bench/README.md`.

## What this source establishes

The README distinguishes prompt processing, token generation and combined work,
with optional context-depth prefill. It documents five default repetitions,
mean throughput and standard deviation; JSON can include individual samples.
Controls include batching/microbatching, cache types, threads/CPU scheduling,
GPU offload/splitting, warmup and memory-fit settings. Example output records
build/hardware/model descriptions, configuration, timestamps and samples.
Tokenization and sampling time are explicitly excluded. These are interfaces
and illustrative output, not measurements performed by this browser. The example
April 24, 2025 timestamps and build IDs do not identify the retrieved revision.

The syntax marks mmap/direct-I/O controls deprecated in favor of `--load-mode`
without fully describing that replacement, while example output retains older
fields. Installed behavior and the reason for this mismatch remain unverified;
no linked documentation, command, build or benchmark was executed.

## Implications for the measurement protocol

These are proposed experimental controls, not additional source measurements:

- Keep the exact invocation with raw output. The displayed JSON fields alone do
  not preserve every listed warmup, repetition, NUMA, priority and delay choice.
  Record the actual runtime revision and artifact digests, not just filenames
  and descriptive hardware strings.
- Match scheduling and memory conditions explicitly: microbatch size, CPU mask
  and strictness, polling, offload, device/tensor split and fit policy can vary.
  A setting named "fit" does not demonstrate measured peak memory or headroom.
- Separate prompt, depth-specific generation and combined work. Internal
  tokens/second excluding tokenization and sampling cannot establish total
  request latency or serving behavior under concurrency.
- Retain every repetition and failure with the stated warmup policy. Standard
  deviation describes spread; it is not by itself a confidence interval or
  evidence that a difference between machines is significant.
- Do not equate llama-bench depth-prefill with saved MLX prompt reuse or rotating
  context. Nor does similarly named microbatch/prefill sizing prove equivalent
  scheduling. Record processed/reused/retained tokens, effective cache precision,
  quality conditions and runtime-specific settings before comparing rates.

Use these controls with `HARDWARE-BENCHMARK-PROTOCOL-2026-09-05.md` and
`MLX-MEMORY-CONTROLS.md`. They do not repair the unmatched observations in
`HARDWARE-MEASUREMENTS-2026-09-05.md`, which retain their original measurements
and qualification. Matched artifact/workload/quality evidence, memory, latency,
power/thermal conditions and separately authorized trials are still missing.

## Preserved native evidence

One separately authorized GET recorded HTTP 200, no redirects/retries or
classified barrier, and closed transport with zero active requests. Status
remains `partial: true`, `outcome: extracted-unverified`, `contentSuccess: null`.
The body is 22,159 decoded bytes (5,199 encoded); native extraction is 22,169
UTF-8 bytes including fences, representing 22,115 source UTF-16 code units.

- Receipt SHA256: `d88154ef0169bc7e6638f810c0c122fcb6f9f26c8b5aa8d8d858fc38d289077a`.
- Body SHA256: `8a35d8107c859cda096e70b6d74adb69bb91094a39e63f9c501641aab8db6db0`.
- Extraction SHA256: `74ca3d882e2b4910c3f0966c0e93d311bc4ac15e0556074e855d30196265a6ec`.

The exact request, timestamped receipt, native-only extraction, integrity checks
and 28-file frozen inventory are under
`node_modules/.cache/native-validation/llama-bench-controls-source/`. Its 1,037
input identities were checked unchanged. Captured bytes were length/hash checked
only, never used as source-text fallback. This research used no alternate browser,
model download, credential or device probe and clears no browser acceptance gate.
