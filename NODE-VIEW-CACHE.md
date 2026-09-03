# Immutable native node views

September 2, 2026. This optimization reduces repeated allocation in the native
document model; it does not add browser APIs or change the JavaScript engine.

## Design

`DocumentTree.get()` previously copied and froze a node's attributes, children
and control state on every read. It now keeps at most one immutable view per
owned node, validating ownership and the open document before consulting the
cache. Consumers never receive the mutable backing record. A saved view remains
an immutable point-in-time record rather than becoming a live object.

| Mutation | Invalidated views |
| --- | --- |
| Attributes, character data, control state | Changed node |
| Insert or move | Inserted node, new parent and former parent |
| Remove | Removed node and former parent |
| Fragment consumption | Consumed fragment and affected destination |
| Bulk child replacement | Old parent and each ordinary insertion target/parent |
| Selection repair | Every indirectly changed option's control view |
| Focus, URL, target or style-only revision | None; these do not change node-record fields |
| Close | Entire view cache, before cleanup callbacks |

Existing document revisions still invalidate derived selector/style projections.
Detached nodes remain owned until document close, so their cached records can
remain too. This is not detached-node garbage collection. Previously returned
immutable records may be held by trusted callers after close, but new owner or
capability reads reject the closed document.

## Verification

- 17 dedicated tests cover immutable reuse, targeted invalidation, owned Attr
  changes, controls, cross/same-parent moves, fragments, bulk replacement,
  contextual HTML, indirect selection repair, validation failures and close.
- A deterministic 300-step mixed-mutation test primes cached views and compares
  them against the internal mutable records after every operation.
- 1,448 unit tests pass across 66 files. Package build, strict changed-test
  checking and focused formatting pass.
- 120 actual experimental-SafeJS checks pass across class lists, selects,
  selection, mutations, HTML insertion, streaming search, storage, mock-terminal
  search and fetch. These use the existing explicitly selected experimental
  core, not an installed released SDK. Transports and terminal streams are mocked.

## Equivalent fresh-process workloads

The unchanged `check-session-resources` harness ran five profiles three times
before and three times after the change, each in a fresh Node process. Runtime,
source sizes, profile parameters, phase ordering, functional checks, document
counts, node maxima and output/truncation counters match across all six runs of
each profile. All 1,206 native correctness/cleanup assertions pass and all 186
created documents close. Seven selected compiled-module fingerprints differ
only for `src/document.js`; these are not whole-build fingerprints.

Node v22.22.0, Linux x64, AMD EPYC 9R45. Values are median (minimum–maximum):

| Profile | Before workload ms | After workload ms | Before peak RSS MiB | After peak RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| small, 100 rows | 59.9 (39.2–61.4) | 52.7 (35.4–53.9) | 63.0 (62.8–63.3) | 62.7 (61.5–62.8) |
| medium, 1,000 rows | 183.9 (180.6–196.4) | 148.9 (134.2–151.6) | 106.4 (105.4–106.6) | 95.7 (94.7–104.0) |
| large, 5,000 rows | 745.2 (740.6–750.4) | 451.5 (450.5–460.5) | 226.7 (225.6–226.9) | 164.3 (162.7–165.9) |
| eight retained sessions | 189.9 (183.0–199.6) | 148.5 (144.9–157.2) | 97.1 (96.1–100.5) | 88.1 (85.5–88.2) |
| twenty navigations | 342.0 (308.7–348.5) | 230.5 (228.6–242.4) | 101.6 (101.4–102.6) | 102.0 (95.5–103.0) |

Raw trials, selected fingerprints and derived summaries are retained under
`reports/node-view-cache-*`; `node-view-cache-comparison-2026-09-02.json` identifies
every trial and regression report. These datasets differ from the older failed
`*-before-streaming-*` observations, which are not equivalent timing baselines.
See `SESSION-RESOURCES.md` for workload reproduction and measurement definitions.

## Limits and next work

Before and after runs were sequential, not randomized. Machine activity, JIT,
filesystem caches and GC are uncontrolled; three trials do not establish
statistical significance or portable performance guarantees. Churn's peak RSS
does not improve. Peak RSS includes the Node process, fixture and instrumentation;
no forced GC or retained-heap/leak conclusion is made. Separate instrumented
CPU/heap investigations are excluded from the comparison table.

The large native-only workload still peaks around 164 MiB. Document-wide indexes,
style and semantic projections remain allocation costs to investigate. This is
not a full-browser memory result: no page scripts, public sites, network stack,
CLI service, live terminal, released SDK, layout or raster rendering are measured.
Full JavaScript/framework, real-site and deployment acceptance remain open.
