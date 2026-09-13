# Website checks — September 13, 2026, second update

This supplements `WEBSITE-TEST-INVENTORY-SEPTEMBER-13.md` without changing its
historical outcomes or unfollowed-candidate status at the time it was written.
NVIDIA was already in the earlier 86-host attempted inventory. These checks add
URL-level evidence, not a new host or another fully working website.

## Actual attempts

| URL | Actual execution | Outcome |
| --- | --- | --- |
| `https://www.nvidia.com/en-us/geforce/graphics-cards/compare/#50-series` | Native research CLI admission, September 13 at 03:39:42 UTC | Exit 64 before transport creation; **zero GETs**, no HTTP result or extraction |
| `https://www.nvidia.com/en-us/geforce/graphics-cards/compare/` | Separately scoped native GET at 03:42:59 UTC, followed by one sealed native offline extraction at 03:45:15 UTC | HTTP 200; 542281 decoded bytes; 13 column-preserving excerpts; runtime/source integrity checks pass |

The fragment-bearing URL was an actual link discovered on the prior product
page, not a guessed URL. The pinned CLI rejects URL fragments and prints generic
usage. This is native input friction, **not an NVIDIA refusal or Cloudflare
challenge**. The fragmentless follow-up preserves `#50-series` as offline context;
it is a separately scoped resource navigation, not a retry of a website refusal.
The CLI itself has not been changed by this test.

No redirects, network retries, scripts, images, other subresources, login,
credential access, cookie reuse, fingerprint evasion or challenge solving ran.
Requests omitted credentials; saved response metadata omits Set-Cookie values.
Private HOME/TMP directories stayed empty. The native CLI reported 300 ms for
this one navigation; this is not a general performance benchmark.

## Hardware evidence, not a recommendation

The native parser finds a 61-row table within the 50-series heading section,
stopping before the 40-series section. Header/cell parentage and row/column spans
preserve the attribution below. No mapping issue was reported.

| Published GPU model | Published memory | Published bandwidth | Published graphics power |
| --- | --- | --- | --- |
| GeForce RTX 5090 | 32 GB GDDR7 | 1792 GB/sec | 575 W |
| GeForce RTX 5080 | 16 GB GDDR7 | 960 GB/sec | 360 W |
| GeForce RTX 5070 Ti | 16 GB GDDR7 | 896 GB/sec | 300 W |
| GeForce RTX 5070 | 12 GB GDDR7 | 672 GB/sec | 250 W |
| GeForce RTX 5060 Ti | 16 GB / 8 GB GDDR7 | 448 GB/sec | 180 W |
| GeForce RTX 5060 | 8 GB GDDR7 | 448 GB/sec | 145 W |
| GeForce RTX 5050 | 8 GB GDDR6 | 320 GB/sec | 130 W |

These are NVIDIA's statements, not measured local-LLM results. The system-power
footnote missing from the first product extraction is now observed: its minimum
uses a Ryzen 9 9950X-based PC, recommends a PCIe CEM 5.1-compliant PSU and warns
that requirements vary with system configuration. The table also qualifies its
specifications as Founders Edition/reference designs; add-in-card products may
differ. A published 1000 W requirement for the 5090 is not an unconditional PSU
recommendation from this browser test.

No conversion from AI TOPS or bandwidth to tokens/second was attempted. Model
fit, usable memory, quantization, context/batch sizes, inference software,
multi-GPU behavior, real throughput, pricing and availability remain unverified.
This is neither a latest/best-hardware ranking nor completed hardware research.

## Browser limitations and next candidates

- Native semantic extraction does not establish styled visibility, active-tab
  state or interactive hash navigation. Full rendering was not tested here.
- Flattening the whole comparison page would lose trustworthy model attribution;
  retain table identity, headers and section boundaries for further comparisons.
- Improve the fragment-bearing-link workflow without widening network authority
  or dropping the original fragment's selection/provenance semantics.
- An official professional-desktop-GPU link remains a discovered, unfollowed
  candidate; it is not added to this tested-URL list.
- Independent local-LLM measurements still need a separately scoped source with
  explicit model, quantization, context, batch and software details. The original
  benchmark, OpenAI Astra chatter and Poe/Reddit research topics remain open.

## Provenance

Both attempts use the already audited text-decoration runtime, code commit
`b870899`, with 17376 previously selected native passes. They do not use the
concurrent font-style candidate and do not constitute a new native test run.
The successful extraction parses 18279 nodes, performs one native selector call
with 752 matches, and retains 2136 excerpt units in 13 complete containers.
Before/after checks match all 1242 source and 2068 compiled runtime files.

- Failed fragment attempt: `node_modules/.cache/native-validation/native-nvidia-compare-september13/RESULT.md`
- Separate successful follow-up: `node_modules/.cache/native-validation/native-nvidia-compare-september13-followup01/RESULT.md`
- Column-preserving excerpts: `node_modules/.cache/native-validation/native-nvidia-compare-september13-followup01/EXCERPTS.md`
- Captured body SHA-256: `4ddd9aea6a507ebca2565d781bc3ee9fca45d2fcd00c4ef637cb55b5abda1747`

No whole-site, credential/passkey-device, SafeJS, real-TTY or challenge-handoff
acceptance is inferred from these checks. Earlier evidence remains unchanged.
