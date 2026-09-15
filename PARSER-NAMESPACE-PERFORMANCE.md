# Namespace-only parser reads

`DocumentTree.namespaceOf(id)` returns the same effective namespace as
`elementNamespace(tree.get(id))` or `elementNamespace(tree.elementInfo(id))`
without constructing a node view or copying attributes. It validates document
liveness and node identity through the existing private node accessor. Nodes
without an explicit namespace retain the existing HTML fallback; this helper is
not the DOM `namespaceURI` property for non-element nodes.

The parser uses this scalar read only in HTML namespace classification, special/
scope-boundary classification, formatting-entry namespace comparison and stack
tag-position checks. Foreign-content integration points that inspect attributes,
insertion targets that inspect node kind/tag, original formatting attributes,
repair work accounting and all resource limits remain unchanged. No new cache,
mutable node exposure, runtime dependency or renderer is introduced.

## September 15, 2026 measurement

A six-call CPU profile of saved RFC 9110 section recovery attributed 2635.456 ms
of 12377.632 sampled ms to attribute snapshots. Of that, 1872.659 ms occurred under
the two optimized namespace-only classification callers. This diagnostic includes
profiler overhead and is not a claim about unprofiled website latency.

Five unprofiled baseline/candidate pairs use fresh guarded processes, alternating
AB/BA order, the same allowed CPU, a 192 MiB heap and a 45-second deadline. Each
of three fixed-order captured workloads has one warmup and three timed calls per
process: 15 measured calls per build/workload, 90 total plus 30 warmups. Output
hashes and source/failure provenance match outside timing. No HTTP requests occur.

| Saved workload | Baseline median ms | Candidate median ms | Interpretation |
| --- | ---: | ---: | --- |
| RFC 9110 explicit Idempotent Methods section | 1994.85 | 1584.13 | 20.59% lower time; all five pairs improve |
| Julia Performance Tips, full extraction | 200.03 | 192.11 | Mixed; three of five pairs regress, no consistent speedup |
| NumPy Absolute Beginners, full extraction | 502.93 | 345.78 | 31.25% lower time; all five pairs improve |

This is a shared host, not exclusive hardware: source review and short saved-page
parity checks ran during the benchmark. Workload order, JIT/GC effects and wide
Julia sample ranges limit conclusions. No statistical significance, global-browser
speed, network-latency or CAPTCHA/block-rate improvement is claimed. RFC's original
full-document output-limit failure remains; the benchmark extracts one explicitly
selected section rather than silently increasing limits.

## Validation

Clean archived baseline: 1356 tests in 22 explicitly selected files. Candidate:
1424 tests in 24 files, including 68 new namespace/formatting/parser cases. Every
baseline test outcome matches; build, targeted types, format and lint pass.
Ten saved response captures preserve Markdown hashes, reader reports, failures and
source-alternative metadata. Independent read-only source review has no concrete
finding. This is not a full native-suite, live-candidate or interactive acceptance
claim. The earlier PARSER-METADATA-PERFORMANCE.md measurements remain historical
and are not combined with this run.

Full per-pair results and evidence: reports/reader-recovery-performance-2026-09-15.md
and its JSON companion. Private execution/pin records are in
node_modules/.cache/native-validation/reader-recovery-performance-september15/.
