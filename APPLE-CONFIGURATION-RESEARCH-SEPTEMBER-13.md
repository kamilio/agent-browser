# Retained Apple configuration extraction — September 13, 2026

**Bounded offline follow-up complete; hardware ranking and the original four-topic
research remain OPEN.** This repairs the extraction procedure in this evidence
lane, not production browser code or the sealed prior report. No new website
request, independent specification verification, or model-performance measurement.

## Source and dates

The retained manufacturer response identifies `https://www.apple.com/mac-studio/specs/`.
It was captured **September 13, 2026, 12:01:16.690 UTC**, with retained status 200,
215,392 decoded bytes and 40,582 encoded bytes. Those are historical capture
measurements, not new HTTP results. New native offline extraction occurred at
**12:20:11.872–12:22:05.726 UTC** on September 13, 2026.

Source, unchanged:
`node_modules/.cache/native-validation/native-local-llm-hardware-research-september13/source-1-response-1.body`.
SHA-256: `30358c53dc69af1d99b3ebd63d686cbe8e8e5362536a9376bc93a3aff28608f4`.
Adjacent metadata SHA-256:
`d6e6a149331621c906d4978e99dd37bc243b7577c94ecc8044a3503f92c2ef69`.

All evidence below is in
`node_modules/.cache/native-validation/native-apple-configuration-september13/`.
Native references are phase-local: reader and full-DOM references are not
interchangeable. `EXCERPTS.json` preserves complete unnormalized selected text,
its hashes, references, and configuration associations.

## Why the old extraction returned only a title

The sealed prior Apple extraction queried `h1, h2, h3, h4` and recognized target
sections only by exact heading-text matches. The new heading-structure phase
queries all six heading levels: **22 headings**, none named Chip, Memory, or
Electrical and Operating Requirements. It again finds the title at reader
`h1 e238` (`id=tableheader`). Those target labels are instead ordinary reader
`div` nodes: **Chip `e297`, Memory `e456`, electrical requirements `e919`**.
The old predicate never reached its ancestor-selection branch for these labels;
its empty `missingSections` list therefore did not establish coverage.

This is a **selection/schema mismatch**, not a depth failure or absence of specs.
Both reader loads succeed with 2,426 nodes. The full DOM explains the schema:
the labels are `div[role=rowheader]` at `e585`, `e766`, and `e1268`, inside ARIA
table rows, rather than HTML heading elements. The reader's existing attribute
allowlist drops `role`, class and ARIA attributes, while retaining the div
ancestry and source text. No change to that allowlist is made here.

## Association proof, not proximity guesses

The associated reader load selects complete label-containing native ancestors:
Chip **`e295`**, Memory **`e454`**, electrical requirements **`e917`**.
The separately authorized successful full-DOM load finds the corresponding rows
**`e583`, `e764`, `e1266`**. Each pair has **identical complete-text SHA-256**,
recorded in `RESULT.json` and `EXCERPTS.json`.

The full-DOM hierarchy establishes configuration scope:

- **`e522`** is `div[role=table][aria-labelledby=tableheader]`. Its first element
  child, **`e524`**, is the column-header row. Its three column headers are a blank
  row-label header **`e526`**, **“Mac Studio, Model1” `e529`**, and
  **“Mac Studio, Model2” `e532`**, in native document order.
- Chip row **`e583`** has row header `e585`, then cells **`e588` / `e674`**, each
  `aria-colspan=1`. Memory row **`e764`** has row header `e766`, then cells
  **`e769` / `e790`**, also each `aria-colspan=1`. Their rowgroups are actual
  children of the same table `e522`. Ordered table columns associate Model1
  with the first chip/memory cells and Model2 with the second, corroborated by
  the explicit chip names and memory-option qualifiers inside those cells.
- Electrical row **`e1266`** has row header `e1268` and one complete cell
  **`e1271[role=cell][aria-colspan=2]`**. This is an explicit shared two-column
  source statement, not an inferred transfer from one variant to another.

The proof uses native DOM ancestry, role attributes, order and spans. It does
not depend on rendered position, neighboring prose, historical generation
labels, or executing website scripts. No separate `tr`/`dl` interpretation was
needed for this div-based table.

## Manufacturer claims admitted from these retained bytes

These are **claims of the retained source**, not independently verified product
facts. The M5 names below are present in these bytes; they are neither imported
from the September 8 report nor evidence of a new September 13 website visit.

| Source configuration | Complete chip cell | Complete memory cell |
| --- | --- | --- |
| Model1, column header `e529` | `e588`: Apple M5 Max; 18-core CPU, 32-core GPU, 16-core Neural Engine, 460GB/s memory bandwidth. Configurable to an 18-core CPU / 40-core GPU / 16-core Neural Engine M5 Max with 614GB/s bandwidth. | `e769`: 36GB unified memory; configurable to 48GB, 64GB, or 128GB, with the source qualifier “M5 Max with 18-core CPU and 40-core GPU.” |
| Model2, column header `e532` | `e674`: Apple M5 Ultra; 30-core CPU, 64-core GPU, 32-core Neural Engine, 1.2TB/s memory bandwidth. Configurable to a 36-core CPU / 80-core GPU / 32-core Neural Engine M5 Ultra, also 1.2TB/s. | `e790`: 96GB unified memory; configurable to 256GB or 512GB, with the source qualifier “M5 Ultra with 36-core CPU and 80-core GPU.” |

Shared electrical cell **`e1271`**, spanning both configuration columns, states
100–240V AC, 50–60Hz single phase, and **“Maximum continuous power: 480W.”** It
also retains the complete operating/storage temperature, humidity and altitude
statements. The 480W statement is not a wall-power measurement, model workload
power, GPU-only power, or evidence of sustained performance. Complete chip-cell
text includes media-engine and other claims not individually summarized here.

No claim equates unified memory with dedicated VRAM or available model allocation.
No model fit, backend compatibility, throughput, price, availability, purchase
recommendation, or absolute-best ranking is established.

## Actual bounded native phases

All times are September 13, 2026 UTC. Each row represents one unchanged-byte load.

| Phase | New offline start–finish | Nodes | Queries / query work | Walk work | Complete blocks / text units |
| --- | --- | ---: | ---: | ---: | ---: |
| `reader-structure` | 12:20:11.872–12:20:11.996 | 2,426 | 1 / 41,478 | 1,958 | 22 / 899 |
| `reader-associated` | 12:21:34.551–12:21:34.671 | 2,426 | 1 / 7,823 | 32,228 | 4 / 2,675 |
| `dom-associated` | 12:22:05.591–12:22:05.726 | 3,241 | 2 / 56,841 | 42,545 | 15 / 5,265 |

Totals: **2 reader loads, 1 full-DOM load, 0 HTTP requests**, 4 queries / 106,142
query work, 76,731 walk work, 41 complete blocks / 8,839 text units across three
separate budgets. Blocks overlap intentionally: full rows plus their complete
columns; this is not 41 independent specifications. Combined streams: **612 bytes**.
All three phases exit zero, have empty stderr, zero guard/process attempts,
unchanged document revisions, closed query owners and document node counts of
zero, absent process groups, and empty removed private HOME/TMP directories.

Per-load ceilings: **50,000 nodes / 128 depth / 3,000,000 document text units /
1,024 changes; 4 queries / 2,000,000 query work; 100,000 walk work / 24 complete
blocks / 20,000 admitted text units**. Each phase uses **30 seconds plus 5 seconds
grace and 10MiB combined streams**, pipes, Node 22.22.0, reused kernel seccomp and
JS guards, child-process denial, and the specifically authorized TMPDIR location.
No limits were raised. The full-DOM load was separately authorized even after
reader success; it was not relabeled as a failed-reader fallback.

One **preparation failure** occurred before any native load: the shell could not
create its default here-document temporary file, so the patch did not run and
Node then reported `MODULE_NOT_FOUND` for the not-yet-created wrapper. Exact
diagnostics remain in `PREPARATION-FAILURE.md`. Preparation then used the approved
TMPDIR. This is neither a hidden failed extraction nor a fourth native load.

## Runtime pins, validation and seal

Only `native-reader-colgroup-september13-round00/snapshot01/dist` is used, base
`ee8237a8f3383c360a9e7db03e69d71ec43467a9`. Its **18,931 passed / 2 old exclusions**
are historical audited results, **not a test suite rerun by this worker**.
All **1,281 source and 2,116 compiled files** are rehashed before and after every
phase and at final validation; inventories are unchanged:

- Source: `0118f871692b76a20d5150f8fc15e5928dffb98d54fad801d4dab049905223ba`.
- Compiled: `b2a50c6b1f62b880c7c2c00c1d5d34f7f62caa3971703804ae2d8336f9ac756c`.

`finalize.mjs` validates counters, complete-text hashes, reader/full-DOM agreement,
table association metadata, source/runtime pins, script-version pins, owner
closure and execution receipts. Earlier selection-script versions are retained
so their phase hashes remain verifiable. Per-phase `*-EVIDENCE.sha256` manifests
and read-only receipts preserve the runs; final `EVIDENCE.sha256` and `SEAL.json`
cover all new evidence, this report and the handoff. These are hash/read-only
seals, not claims of filesystem-level immutable storage.

The sealed `LOCAL-LLM-HARDWARE-RESEARCH-SEPTEMBER-13.md` remains byte-identical to
parent commit `36c7125` (SHA-256
`4cc223fb8815dbcbbbc66b19ad5df1e1aeaf73d1a77e056d747ac26363e769fb`). No production,
tests, manifests, TASKS, historical reports or unrelated work were changed;
no commits or pushes. Parent W3C/WHATWG checks were not duplicated or relabeled.
No browser rendering, scripts, resources, sockets, SafeJS, devices, TTY/PTY,
credentials or live probes. Both native loaders identify partial parsing;
reader styling, scripting and hidden-content semantics are absent. This seal
does not close those acceptance gates or the wider research goals.
