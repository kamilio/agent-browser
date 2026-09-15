# Saved native-browser reference notes

## Scope and evidence

These notes use only the four saved capture receipts and the three available
`extracted.md` files under `live/`. Their `RESULT.json` timestamps place capture
on September 15, 2026 (UTC); this is not a source publication date. No new
requests, alternate clients, SDKs, or research scripts were used.

Hugging Face, MLCommons, and Apple have HTTP 200 receipts with
`outcome: extracted-unverified` and `contentSuccess: null`. Readable saved text
supports the summaries below, not a claim of independently validated extraction
or reproduced results. Hashes are copied from each capture's `RESULT.json`,
not newly computed. Summaries are paraphrases; no prose quotations are included.

## Hugging Face — Transformers quantization overview

- URL: `https://huggingface.co/docs/transformers/en/quantization/overview`
- Document date: not visible in the saved extraction.
- Capture: `live/001-huggingface.co/`.
- Receipt SHA-256: `6068e7227482eeb5698118d133775b82ac5742b8e738bb444574c08fc739916f`
- Body SHA-256: `976f7ff24d4ea426d034c741fd72ce660428946a8423fd80b785cef9acb896d1`

**Source claims:** Lower-precision weights reduce memory requirements while
seeking to retain accuracy. Methods differ in calibration requirements,
on-the-fly conversion, bit widths, hardware support, fine-tuning, and
serialization. The saved matrix marks GGUF/GGML support for CPU, CUDA, and
Apple Metal; bitsandbytes has yellow rather than green markers for ROCm and
Metal. These are documentation entries, not measured performance results.

**Our conclusion:** Use this capture to identify compatibility questions, not
to rank hardware or assume every listed backend works in a particular setup.
Memory savings alone do not establish latency, throughput, or quality.

## MLCommons — MLPerf Inference: Datacenter

- URL: `https://mlcommons.org/benchmarks/inference-datacenter/`
- Document date: not visible; the 2026 copyright is not a publication date.
- Capture: `live/002-mlcommons.org/`.
- Receipt SHA-256: `f0255478f7bd1ae254a67d9dfc6f074e5df92705b3f68c794332bebf3d8b1599`
- Body SHA-256: `016fa3ca57750ddccc33f21cfb46278de443d017a6cf2cc58e5e551a1a7cf670`

**Source claims:** Benchmarks specify datasets and quality targets; load
patterns determine scenario metrics. Closed submissions retain the reference
model, while Open permits different models or retraining. Availability
categories distinguish purchasable systems from previews and experimental
systems. Validated power measures the whole system at the wall during the
accompanying benchmark, not component TDP. Published results may be revised
or invalidated.

**Our conclusion:** Compare matched workloads, scenarios, divisions, availability,
and measured system power. The extraction describes an interactive results
table but provides no numerical submission rows; it cannot establish rankings
or a latest benchmark release.

## Apple — LLM in a Flash: Efficient Large Language Model Inference with Limited Memory

- URL: `https://machinelearning.apple.com/research/efficient-large-language`
- Document date: August 2024, explicitly shown beside the paper designation.
- Capture: `live/004-machinelearning.apple.com/`.
- Receipt SHA-256: `787d935f6eaf550e88f2bb1a9f732602928c97042e6d6749e550ef79d30fff5f`
- Body SHA-256: `8ce56f0c5c25d57655c8f4337f81eb0b24225508eee4123783edb2a5c8a77aca`

**Source claims:** The authors store parameters in flash and load them into
DRAM as needed. Reusing previously activated neurons reduces transfers;
bundling rows and columns enables larger contiguous reads. They report models
up to twice available DRAM capacity and inference speedups of 4–5× on CPU
and 20–25× on GPU relative to naive loading.

**Our conclusion:** These are paper-specific claims, not reproduced measurements
or comparisons against optimized contemporary systems. They motivate examining
data movement alongside memory capacity, not recommending a device. Dates in
related-reading cards do not update this paper's publication date.

## GitHub — failed capture, excluded from research claims

- URL: `https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md`
- Document date: unavailable from a successful extraction.
- Capture: `live/003-github.com/`.
- Receipt SHA-256: `c3d8868f71e2f1b7d71a9bcf676e9fbf8fa4ea1ff6c2ac1da12154a60a3afedc`
- Body SHA-256: `5198660e809f45c004a1da0add7c3baff6f9b4d5565aabb7587314bf54410f1e`

**Receipt observation:** HTTP 200 did not mean usable content: exit code 1,
`outcome: failure`, `contentSuccess: false`, unsupported loader failure, and
zero Markdown bytes. No `extracted.md` is present.

**Our conclusion:** No build or hardware-support claims are taken from this
capture. Raw HTML was not used as substitute extracted content. Main must
fix/replay; no retry was performed here.

## Outstanding research and acceptance limits

- Astra/Twitter and Poe/Reddit topics remain unresolved; these captures provide
  no evidence resolving them.
- Price/power/performance comparisons remain missing, including matched
  model/quantization quality, workload, latency, throughput, and measured
  whole-system power. No purchase recommendation follows from these notes.
- This is not current hardware buying advice, a latest benchmark/model claim,
  or full research completion. Linked papers, rules, dashboards, repositories,
  and related articles were not fetched or independently evaluated.
- No browser tests, live replays, socket, real TTY/PTY, or SafeJS probes were
  run. This documentation-only review does not clear those acceptance gates.
