# Local-LLM hardware research — September 13, 2026

**Outcome: useful new workstation specifications, not a hardware winner.** Two
official pages were captured using only the audited native browser. NVIDIA yielded
capacity, power and form-factor rows; Apple's bounded selection yielded only its
product title. No hardware benchmark, purchase, price or stock verification ran.

## Prior coverage, not new measurements

- September 5: `BROWSER-RESEARCH-2026-09-05.md` already synthesizes vendor capacity
  and model/runtime evidence. `HARDWARE-MEASUREMENTS-2026-09-05.md` retains published
  RTX 5090/M3 Ultra submissions with incompatible runtime, quantization and context
  metadata; their throughput must not be treated as a controlled comparison.
- September 7: `HARDWARE-MULTI-GPU-GUIDE.md` admits a native-read llama.cpp guide,
  not measured scaling or proof that summed GPU memory fits a workload.
- September 8: `BROWSER-RESEARCH-SEPTEMBER-08.md` reports Apple source-labelled
  **M5 Max/M5 Ultra**, up to 128/512 GB unified memory and up to 1.2 TB/s Ultra
  bandwidth. These remain September 8 source claims, not freshly confirmed facts.
  Its NVIDIA 404 used `/en-us/design-visualization/rtx-pro-6000/`; today's separately
  authorized products/workstations path is different, not a retry of that failure.
- September 11: `WEBSITE-RESEARCH-SEPTEMBER-11-FOLLOWUP.md` adds quantization
  documentation but no matched hardware experiment; its DGX Spark attempt failed.
- September 13, 03:19:40 UTC: the earlier `native-nvidia-hardware-september13/RESULT.md`
  already records RTX 5090's 32 GB GDDR7 and 575 W TGP. Its 1000 W system-power row
  has an unselected qualifying footnote. This page was **not requested again**.

Historical reports, dates, measurements and paths are unchanged. Cache directory
names in this report are relative to `node_modules/.cache/native-validation/`.

## New manufacturer evidence

**[N]** `https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/`

Captured September 13, 2026, **12:01:06.505 UTC**. Native heading `e968` identifies
**NVIDIA RTX PRO 6000 Blackwell Workstation Edition**. The complete admitted rows
state the following; they are vendor specifications, not measurements by us:

| Field | Source-listed value | Native reference |
| --- | --- | --- |
| Memory | 96 GB GDDR7 with ECC | `e2831`, corroborated by `e3146` |
| Memory bandwidth | 1792 GB/sec | `e2840` |
| Maximum power consumption | 600 W | `e2849`, corroborated by `e3164` |
| Form factor | 5.4 inches high × 12.0 inches long; dual slot | `e3173` |
| Thermal design label | Double Flow Through | `e3182` |

**Interpretation:** this is a capacity-oriented single-card candidate when the
specific workload needs more nominal GPU memory than the previously documented
32 GB RTX 5090. The chassis, cooling and whole-system power budget must support
the listed card constraints; 600 W is not a recommended system PSU or measured
LLM wall power. Connector, motherboard, driver/backend and sustained-load
requirements were not established by these excerpts.

The retained page also includes a paragraph explicitly referring to **Max-Q**
(`e2128`) and vendor superlatives (`e1299`). Neither is adopted as a capability or
performance claim for the Workstation Edition. No cross-variant MIG inference.

**[A]** `https://www.apple.com/mac-studio/specs/`

Captured September 13, 2026, **12:01:16.690 UTC**. The reader load succeeds, but the
bounded heading query and section selection admit only “Mac Studio - Technical
Specifications” (`e238`). **No fresh Apple memory, chip, dimensions or electrical
specification is established.** This is a selection limitation, not proof the
page lacks those facts, and not a reader-depth failure. No full-DOM fallback was
authorized for a successful reader load, so none was used. Earlier Apple evidence
is left dated September 8; neither its generation labels nor capacity are silently
promoted to today's verification. The unused third navigation was not spent
duplicating the already-covered RTX 5090 page.

## Conditional shortlist and missing comparisons

- **RTX PRO 6000 Workstation:** consider if workload memory and a compatible
  workstation budget justify evaluating [N]'s 96 GB capacity and physical/power
  constraints. Larger capacity and advertised bandwidth do not establish faster
  prefill, decode or better value.
- **RTX 5090:** retain as the earlier September 13 32 GB discrete-GPU candidate,
  conditional on measured workload fit and system constraints; not a new visit.
- **Mac Studio:** retain as the September 8 high-unified-memory candidate pending
  a properly associated configuration extraction and compatible-backend tests.
  Shared system memory is not established usable GPU allocation or dedicated VRAM.

There is **no absolute best or price/value ranking**. Model-fit and throughput
claims require an exact weight artifact/digest and quantization; runtime/backend,
driver and OS versions; context/prompt/output lengths; KV-cache precision;
workspace, offload and concurrency; plus measured peak memory, quality, prefill,
decode, latency, repeated sustained wall power and configuration-specific delivered
cost. These are missing, not supplied by a GB/GB-per-second specification. No
model execution, current pricing, current availability or purchase recommendation.

## Actual native website tests

| Source | Actual GET / redirects | HTTP; decoded / encoded bytes | Native reader/query result |
| --- | --- | --- | --- |
| [N] RTX PRO 6000 | 1 / 0 | 200; 306,293 / 47,125 | 3,570 nodes; 1 query, 57,379 work; 12 complete blocks, 1,759 text units; useful specs |
| [A] Mac Studio | 1 / 0 | 200; 215,392 / 40,582 | 2,426 nodes; 1 query, 28,112 work; 1 complete block, 37 text units; title only |

Totals: **2 document requests, 2 actual GETs, 521,685 decoded bytes; 2 sealed reader
loads, 0 DOM fallbacks, 0 retries/subresources/scripts.** Native challenge diagnostics
are null for both, not proof of universal barrier detection. Both default-raw-policy
`long-v1` readers report partial content and no styling, scripting or hidden-content
semantics. No browser rendering, visual equivalence or four-topic research completion.

Per-body ceilings: 3 MiB body; 50,000 nodes, depth 128, 3,000,000 text units,
1,024 changes; 4 queries/2,000,000 query work; 12 complete blocks/12,000 text units/
100,000 walk work. Actual walk work: 13,482 and 1,056. Each live/offline phase had
30 seconds + 5 seconds grace and 10 MiB combined streams; all four exit zero,
9,849 combined stream bytes overall, no surviving process groups. Cookie jars start
empty, credentials are omitted, and no outgoing Cookie/Authorization is allowed.
Private HOME/TMP remain empty and are removed. Offline seccomp and JS guards admit
no network/process attempts; document/query/transport/cookie owners are closed.

## Receipts and integrity

Evidence: `native-local-llm-hardware-research-september13/`. `EXCERPTS.json` preserves
complete admitted native text and references; `LIVE-AUDIT-0.json`,
`LIVE-AUDIT-1.json`, `reader-0-AUDIT.json`, `reader-1-AUDIT.json`, per-phase execution,
integrity and cleanup receipts, `RESULT.json`, and `EVIDENCE.sha256` supply the audit.
`source-0-response-1.body` SHA-256:
`7a455bb2c3a4da9d3033481cc4e49eb1f58ff29816276bdc3701ad6ee2d02198`.
`source-1-response-1.body` SHA-256:
`30358c53dc69af1d99b3ebd63d686cbe8e8e5362536a9376bc93a3aff28608f4`.

Only `native-generated-content-september13-round01/snapshot01/dist` was used:
base `10660476b8db478ba78606eeab9edb80e8374528`, historical **18,903 passed / 2 excluded**
native tests, not rerun here. All 1,280 source and 2,116 compiled files were rehashed
before/after each phase and at seal. Source inventory:
`103b83ae613a6dd623d4ae9c3f80d4b0be70ff8f3bfcb65d175c448405d2860e`;
compiled inventory:
`19c6ebc3433ef71d807300f9f7b400bd5d40d819f0074ea2a89c6f9b8b04363e`.
No production/test/TASKS/manifest edits, commits, pushes, other browsers, credentials,
SafeJS, real TTY, devices or socket self-probes. Cache receipts are not a new native
test-suite pass; the title-only Apple outcome remains incomplete hardware coverage.
