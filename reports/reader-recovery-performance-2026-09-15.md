# Saved-page reader recovery performance — September 15, 2026

Baseline commit: 3ac3de8e5bd164001c13064575a54a7347faa4f4. Candidate changes only namespace reads in
DocumentTree and the HTML parser/formatter, plus regression tests and documentation.
No new dependencies, caches, budget increases, live requests or page scripts.

## Results

1424 passing native tests in 24 explicit files;
68 new tests. Baseline 1356 in 22 files, all original outcomes preserved.
Build, targeted types, format and lint pass. Independent source review finds no
concrete issue. This is scoped validation, not a full native-release claim.

Ten original saved captures (Office, NASA, web.dev, PyTorch, GOV.UK, Julia, NumPy,
RFC 9110, Apple HTML and Apple Markdown) preserve all compared Markdown hashes,
reader reports, outcomes, failures and source-alternative metadata. Original
receipts and decoded-body pins stay unchanged. RFC full-output failure remains;
only the observed Idempotent Methods section is used in the recovery benchmark.

## Benchmark method

Five fresh-process pairs alternate AB/BA order. Same CPU 0,
192 MiB heap, 45-second child deadline, denied sockets/process/device I/O, empty
HOME/TMP and environment allowlist. Three workloads run in fixed RFC/Julia/NumPy
order, each with one warmup and three timed calls: 90 timed calls and 30 warmups.
All samples retained. No CPU profiler in timed runs. Timers cover actual native
recovery/navigation, not fixture verification or hash comparisons; Julia/NumPy
receive a single in-memory response and RFC uses explicit receipt recovery.

Shared host, not exclusive hardware: source review and short source-parity checks
ran during the benchmark. No statistical significance, global speed, live network
latency or block-rate inference. Julia's aggregate median hides inconsistent pairs.

| Workload | Baseline median ms (range) | Candidate median ms (range) | Median time reduction |
| --- | --- | --- | ---: |
| rfc | 1994.85 (1919.22–2147.18) | 1584.13 (1485.11–1760.10) | 20.59% |
| julia | 200.03 (120.83–434.87) | 192.11 (101.33–411.89) | 3.96% |
| numpy | 502.93 (424.49–577.63) | 345.78 (285.28–418.76) | 31.25% |

**Julia is mixed:** three of five paired medians regress, with 37.27% more time
in pair 5. Do not claim a consistent Julia improvement. RFC and NumPy improve in
all five pairs. Each aggregate median contains 15 timed calls per build/workload.

### Every pair

| Workload | Pair/order | Baseline median ms | Candidate median ms | Time reduction |
| --- | --- | ---: | ---: | ---: |
| rfc | 1 / AB | 1981.42 | 1592.29 | 19.64% |
| rfc | 2 / BA | 1990.87 | 1607.58 | 19.25% |
| rfc | 3 / AB | 2037.35 | 1549.31 | 23.95% |
| rfc | 4 / BA | 1992.22 | 1557.23 | 21.83% |
| rfc | 5 / AB | 2042.12 | 1584.13 | 22.43% |
| julia | 1 / AB | 210.05 | 229.60 | -9.31% |
| julia | 2 / BA | 200.03 | 189.01 | 5.51% |
| julia | 3 / AB | 208.00 | 192.11 | 7.64% |
| julia | 4 / BA | 183.89 | 188.86 | -2.70% |
| julia | 5 / AB | 173.88 | 238.69 | -37.27% |
| numpy | 1 / AB | 509.09 | 345.78 | 32.08% |
| numpy | 2 / BA | 499.37 | 345.16 | 30.88% |
| numpy | 3 / AB | 528.15 | 353.19 | 33.13% |
| numpy | 4 / BA | 502.93 | 333.83 | 33.62% |
| numpy | 5 / AB | 501.25 | 330.95 | 33.97% |

## Diagnostic and retained attempts

Baseline six-call RFC CPU profile sampled 12377.632 ms; attribute
snapshots account for 2635.456 ms, including
1872.659 ms under the two optimized namespace classifiers.
Profile data has overhead and is not the benchmark. Original initial probe exited 1
because deepStrictEqual rejected a hardened null-prototype failure object against
its JSON ordinary-prototype equivalent. Values matched; only the comparison was
corrected. Initial script, stderr, CPU profile and execution record are retained.

All 14 offline child groups are reaped and absent, including that failed diagnostic.
No denied-I/O attempts, no new HTTP requests. Source/compiled/fixture pins verify
before and after guarded work. No original failures or historical measurements
are rewritten. No SafeJS, credentials, passkeys, TTY or live-JS acceptance claim.

## Evidence and follow-up

- Detailed results: reports/reader-recovery-performance-2026-09-15.json.
- Design and limitations: PARSER-NAMESPACE-PERFORMANCE.md.
- Private complete lane: node_modules/.cache/native-validation/reader-recovery-performance-september15/.
- Continue diverse content checks and isolate short-workload GC/JIT variability.
- The separate top-100 sweep is reports/top100-websites-2026-09-15.md; this offline
  performance work does not rerun those 100 websites or revise their outcomes.
- Overall browser goal and separate runtime/provider/interactive gates remain open.
