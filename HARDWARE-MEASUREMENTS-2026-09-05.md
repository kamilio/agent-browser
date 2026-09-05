# Local-LLM hardware: published measurements, not a ranking

This followup used only the native browser on September 5, 2026,
03:54:42–03:55:36 UTC. Eight attempts yielded seven readable HTTP-200 responses
and one sandbox network failure. It adds primary submission records and a
publisher's context tables to `BROWSER-RESEARCH-2026-09-05.md`; it does not change
the earlier report's attempt counts or measurements. No benchmark ran locally.

## What the submitted records actually establish

These two community records use the same `chat-short` label, but are **not a
controlled comparison**. Numbers are rounded from retained payloads. Submission
times have no stated timezone and need not be execution times.

| Submitted setup | Recorded workload metadata | Reported result |
| --- | --- | --- |
| RTX 5090 32GB, llama.cpp; Qwen2.5-Coder-32B-Instruct; submission July 1, 2026 | Runtime version and explicit quantization null; target input 128 but recorded input/context 0/0; output 256, batch 1 | Decode 67.41 tokens/s; prefill null; TTFT 383.53 ms |
| M3 Ultra 60-core GPU, 96GB unified, MLX 0.31.3; mlx-community/Qwen2.5-Coder-32B-Instruct-4bit; submission April 28, 2026 | Name includes 4bit but explicit quantization field null; target input 128, recorded input/context 131/131; output 256, batch 1 | Decode 34.48 tokens/s; prefill 144.05 tokens/s; TTFT 909.38 ms |

Do not treat the ratio as a measured hardware advantage. Runtime/CLI versions,
quantization evidence and token counts differ; exact weight artifacts/digests,
cache precision, offload, drivers, warmup, repetitions and uncertainty are not
established. The zero input/context fields remain zero, not silently repaired.
Attribution is null in both payloads. These are hosted community submissions,
not authenticated named testers or independently reproduced measurements.

The site's article, published July 2, 2026, selects fastest workloads rather than
a matched experimental condition. Its methodology descriptions do not fill absent
fields in individual records. The RTX record's 16-stream point also contains
12 successful and four failed streams: a reported aggregate rate is not evidence
of sixteen successful clients. There is no retrieved matched Mac concurrency
curve. These are useful benchmark-quality warnings, not reasons to invent missing
measurements or a purchasing recommendation.

## Context changes the reported workload

Hardware Corner's March-2026-updated page attributes tests to its publisher.
For its printed RTX 5090 / Qwen3 8B Q4_K / llama.cpp build 8189 labels:

| Printed context tier | Prompt processing, tokens/s | Generation, tokens/s |
| --- | ---: | ---: |
| 4k | 11,933.4 | 200.4 |
| 32k | 6,034.2 | 129.8 |
| 128k | 1,209.1 | 58.8 |

This reports lower rates at higher context on one setup; it does not compare
Mac, Spark, AMD and NVIDIA under matched conditions. Exact context semantics,
artifact/Q4_K variant, output length, batch, cache settings and uncertainty are
not established. The page also conflicts with itself on some other context
labels and VRAM text. Its relative-ranking, price and model-fit claims are not
adopted. Omitted graphics/scripts cannot be used to fill these gaps.

## Sources and provenance

All seven readable sources were retrieved by the native reader, not an alternate
browser or benchmark SDK. Their exact public URLs are preserved here for a future
authorized reproduction:

- Article: `https://llm-speed.com/blog/rtx-5090-vs-m3-ultra-local-llm`
- RTX record: `https://llm-speed.com/r/r_v983y0y3r2u`
- Mac record: `https://llm-speed.com/r/r_721b4bls_oq`
- Methodology: `https://llm-speed.com/methodology`
- RTX payload: `https://api.llm-speed.com/v1/results/r_v983y0y3r2u`
- Mac payload: `https://api.llm-speed.com/v1/results/r_721b4bls_oq`
- Context tables: `https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-5090/`

The payload endpoints were documented by the methodology, not alternative routes
around an access barrier. Raw records, exact commands, source dates, body hashes,
payloads and full-precision values remain in
`node_modules/.cache/native-validation/browser-research/local-llm-hardware/measurement-followup/`.
See `REPORT.md`, `ATTEMPTS.json`, `MEASUREMENTS.json`, `AUDIT.json` and
`EVIDENCE.sha256`. The parent independently verified the saved checksum manifest
without rerunning the worker audit that writes evidence files.

Runner, loader, session and identity build hashes stayed fixed during the round.
Concurrent uncommitted source edits were recorded separately and left untouched;
there is no blanket unchanged-checkout claim. The reader reports partial,
extracted-unverified content and omits scripts/graphics/math and hidden semantics.
Decoded-body hashes do not imply that original HTML was archived.

**Remaining gap:** controlled same-artifact/context/runtime settings, quality,
power and current-price evidence suitable for a hardware or price/value ranking.
This round makes no purchase recommendation and supplies no SafeJS, live-login,
real model-execution, socket-service or TTY acceptance evidence.
