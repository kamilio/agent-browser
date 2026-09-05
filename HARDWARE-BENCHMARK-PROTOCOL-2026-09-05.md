# Local-LLM hardware: a reproducible measurement protocol

Native-browser-only followup on September 5, 2026, **05:03:29.975–05:04:54.348
UTC**: five attempts, one sandbox network failure, four HTTP-200 documentation
reads, zero redirects or classified barriers. Three pages describe tool options
and methodology; the root README supplies link provenance, not another benchmark.
No benchmark, model download, tooling installation or hardware purchase occurred.

This addresses measurement-design gaps in `HARDWARE-MEASUREMENTS-2026-09-05.md`;
it does not repair those historical submissions or establish a hardware ranking.

## Findings

- Separate prompt processing, generation at an explicitly recorded KV-cache
  depth, and combined work. A depth-zero decode rate is not decode after a long
  prompt. The benchmark documentation excludes tokenization and sampling, so its
  throughput is not end-to-end time to first token.
- Logical token batch and physical microbatch sizes are not simultaneous users.
  Server slots, continuous batching, client concurrency and KV layout require a
  separate serving experiment; do not infer completed concurrency from a setting.
- Prompt reuse changes the amount of work. The retrieved server documentation
  enables prompt caching by default and distinguishes cached, newly processed
  and generated tokens. Record those counts, not only nominal prompt length.
- Automatic fit and resolved offload/context settings can change the workload.
  Record effective startup configuration and measured memory use; GGUF file size
  alone does not demonstrate usable RAM/VRAM fit at the intended context/load.
- Preserve warmup behavior, per-repetition samples and failures. A mean and
  standard deviation are not automatically a confidence interval, and internal
  server timings are not a measured client wall-clock latency.

## Proposed comparison procedure — not executed

1. Pin the exact model files and hashes, model revision/quantization, tokenizer
   and template, full tool revision/binary hash, build/backend/driver/OS and
   hardware. Match KV precision, threads, offload, flash attention and loading
   mode. Verify options against the selected build, not mutable online defaults.
2. Demonstrate fit at the intended prompt/output lengths and concurrent load.
   Record peak process/device memory, paging, headroom, truncation, allocation
   failures and any automatic context/offload adjustment as a distinct condition.
3. Measure prefill, depth-specific decode and combined work separately. Retain
   warmup and raw repetitions; separate cold loading from steady-state rates.
   Do not silently drop caches or change system power/security policy.
4. For serving, fix arrival schedule, slots, client concurrency and prompt-cache
   policy. Measure client time to first token, per-token/total latency, completed
   requests, timeouts and actual token counts. Report unfinished/failed work;
   do not add per-request rates to invent aggregate throughput.
5. Compare only matched conditions. Publish mismatches explicitly. Quality,
   power and current-price evidence remain necessary for those respective claims.

These are proposed experimental controls derived from documented interfaces,
not a validated benchmark standard or an executed measurement recipe.

## Primary sources and evidence

All sources are mutable upstream `master` documents, not pinned releases or
proof of installed-tool behavior. Receipt times below are UTC on September 5.

| Document | Official URL | Receipt |
| --- | --- | --- |
| Benchmark | `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/llama-bench/README.md` | 05:03:39.305 |
| Completion/performance | `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/completion/README.md` | 05:04:10.061 |
| Root navigation | `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/README.md` | 05:04:33.912 |
| Server/timings | `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md` | 05:04:54.348 |

Original JSONL, commands, failures, receipt times, extracts, source qualifications
and the detailed proposed recipe remain in
`node_modules/.cache/native-validation/browser-research/hardware-benchmark-protocol/`.
Its `AUDIT.json` verifies all four transport-decoded body hashes through exact
plaintext reconstruction. This is not an archive of compressed wire bytes or
headers. The parent verified all 31 saved artifact checksums; the audit log is
`node_modules/.cache/native-validation/hardware-protocol-parent-integrity.log`.

The native reader remains explicitly partial and extracted-unverified; exact
plaintext reconstruction does not establish execution or external truth. No
account, SDK, vault, device, real TTY or local server gate ran. Existing reader,
browser and authenticator acceptance limitations remain unchanged.
