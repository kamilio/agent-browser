# Native multi-GPU guide evidence

Observed September 7, 2026. The corrected standalone native browser operation
retrieves the llama.cpp multi-GPU guide and exports its actual native extraction.
This is source evidence, not a measured hardware ranking or purchase recommendation.
The historical failure in `HARDWARE-SOURCE-ADMISSION.md` remains unchanged.

## Request and native admission

Source: `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/multi-gpu.md`,
from the previously native-read README link. Upstream `master` remains mutable;
no upstream commit was identified. The operation differs from the failed wrapper
only by removing `cookieContext` from its jarless request. No cookie jar,
credentials, authentication header, alternate browser or retry loop was added.

The separately authorized request ran at **22:08:14.436–22:08:14.583 UTC**:

- HTTP 200, UTF-8 `text/plain`, gzip; 4,281 encoded and 10,148 decoded bytes.
- Actual native transport: one request, zero redirects/mocks/active requests,
  closed after completion; no preload, routes or synthetic metric replacement.
- Actual native plain-text reader: 10,148 source/text code units; actual native
  `extractDocument` output: 10,158 UTF-8 bytes, including its original fences.
- Outcome `extracted-unverified`, `partial: true`, `contentSuccess: null`.
  No raw-body/capture decoding, raw-HTML fallback or external HTTP client.
- Native, timeout, pre-final and terminal status all zero; completed availability,
  zero input/compiled-integrity check statuses and empty stderr.

Network/body budgets remain 2,000,000 bytes, one request/no redirects; request
15 seconds, navigation 20 seconds, whole operation 120 seconds, external 125
seconds plus five-second kill grace. Native document/reader bounds are unchanged.
Complete original headers must fit the explicit classifier admission policy;
oversized or ambiguous headers fail closed, not through selective omission.
This does not establish comprehensive challenge detection or Cloudflare bypass.

## Independent verification

The separately authorized zero-request verifier ran at
**22:09:35.134–22:09:35.510 UTC**, exit zero with empty stdout/stderr. It checked
1,732 compiled engine files and 36 RUN artifacts against independently supplied
source-input, RUN-ledger and terminal-status hashes. Integrity passes with no
issues; metadata is 3,800 bytes. Only the exact native `extraction.content` bytes
are exported. No engine/native imports or network requests occur in verification.

Evidence directory:
`node_modules/.cache/native-validation/hardware-multi-gpu-source-02/`.

| Artifact | SHA-256 |
| --- | --- |
| `SOURCE-INPUT-SHA256SUMS` | `fd075a2cf7e8b508dfb59d123f3b515a8142eb026a466b8d358f52c1a1ec4519` |
| `RUN-SHA256SUMS` | `21e4eca9141f9987e4705eecf3efacf990620805ab8a88fbb0c2182367ef5e9e` |
| `exit-code.txt` | `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa` |
| `stdout.jsonl` (14,126 bytes) | `904c15fd753b291db1ed02d64dee0f3f77ef088ec2a3f79e92cd3a63893c550f` |
| `INTEGRITY.json` | `3da2ce3d1dbb7a387ff119fe1916f3d3b33c569a1c0ef3c37301e51883eb0887` |
| `extracted.md` (10,158 bytes) | `1d79e964a42b480b2ebb75669a0c81b17aaf190d5fe7a334fba98efd44194697` |
| `FINAL-SHA256SUMS` (293 entries) | `1f68e214ca99968a144409abc8f7c39895a9ac9c91be2bf29af45dd1b682b1ec` |

The frozen engine is `research-long-cli-verified`, commit label
`872a6aa4e2fd92c95722bd5988750361a77675d7`; inventory SHA-256
`3bad32d30cef7acce61c8f0a455cdebd88f5ef0c494ae1fd129ecc22b88535b2`.
Operation SHA-256 is
`1543c1c083de13d384a32d348895967dc997f12fb306e1b9bce47edd976e263d`.
The source body hash remains a native declaration, not independently retained
and revalidated body bytes. `bodyIdentity` is null and scoped replay readiness
is false. Receipt integrity is not upstream truth or current-version authority.

## Regression controls

The following fresh, separately authorized controls precede the source request:

- Five shell-only supervisor controls pass at 22:01:36.686–22:01:43.723 UTC:
  zero exit, nonzero exit, timeout, collision before invocation and collision
  during finalization. They do not run the browser or parse source receipts.
- Ten actual-native admission fixtures pass at 22:02:09.082–22:02:10.163 UTC.
  A saved native routed-request method performs real normalization/admission;
  an always-fulfilling synthetic resolver prevents network fallback. The actual
  prior operation fails before request counting/resolution in both controls.
  Current ordinary/header/challenge/MIME/empty cases exercise native reader and
  extraction where applicable. Only two mock counters are masked for the wrapper;
  separate observers retain actual metrics. These are not real source evidence.
- The actual new verifier helper passes 4,817 finite rows at
  22:07:51.444–22:07:51.476 UTC: two admitted, 4,815 rejected. Import writes no
  output and changes no direct lane artifacts. Only completed, matching all-zero
  or all-one statuses with zero input/engine checks are admitted.

The narrow status policy fixes arbitrary nonzero combinations in the new lane;
it intentionally does not admit every legitimate interrupted/finalizer-failure
state. The old verifier remains frozen and its generic gap remains a static
finding, not an executed old negative control. The actual source success exercises
export, but comprehensive malformed-input, IO and export-collision matrices remain
unrun. One initial shell-control approval review timed out; its identical single
retry was approved. That timeout was not a denial or a failed control execution.

## Hardware-selection findings

These are guide claims, not reproduced measurements. Line anchors refer to the
retained native `extracted.md`, including its outer fence:

- More GPUs can address weight capacity, but memory sum alone does not predict
  speed. Default `layer` distributes contiguous layers and KV; experimental
  `tensor` distributes weights/KV with more communication. The guide contrasts
  batch-throughput and latency priorities, respectively (lines14,25,28).
- Tensor mode has no automatic fit, requires Flash Attention and nonquantized KV,
  and excludes several architectures. Compatibility must precede a hardware
  comparison; advertised VRAM is insufficient selection evidence (lines44,87).
- Context and concurrent sequences affect KV memory. GPU offload can move layers
  to CPU, changing the workload being compared (line125).
- Collective-library availability and topology need checking. Optional P2P has
  driver/board/BIOS constraints and possible corruption/crash risks; it was not
  enabled or tested here (lines98,107).

The separately produced native-export-only analysis is
`node_modules/.cache/native-validation/hardware-multi-gpu-findings/REPORT.md`,
SHA-256 `c47cf5323080bf02813d8d9a1287205aafd843129d3d78bd78d4a138852f5e59`.
Its proposed next evaluation is an inference: compare layer/tensor only on one
existing compatible two-GPU setup with pinned model/build, matched context,
batch/KV/attention settings and recorded effective placement. Measure memory,
prefill/decode and output correctness; stop on unsupported settings or corruption.
That bounded proposal has not been authorized or executed. It supplies no GPU
ranking, current price, power result or purchase recommendation.

## Outstanding gates

No new hardware benchmark, matched model/quantization comparison, current pricing,
power measurement or device result is supplied. Password providers, passkeys,
published privacy interpretation, physical devices, page integration and consent
retain their separate acceptance gates. Stopped Reddit/Astra/X and previously
denied RP, SafeJS, socket and TTY gates are not reopened. The full browser goal
remains active.
