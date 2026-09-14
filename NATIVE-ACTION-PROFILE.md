# Native action CPU profile — September 14, 2026

## Verified Check

One selected native-only invocation passes **36 tests, zero failures or skips**:
9 cases in `src/nested-actionability.test.ts` and 27 in
`src/positioning-performance.test.ts`. Both are explicit entries in the frozen
`native-tests.json`. This is not a full native-gate rerun or website validation.

The profiled run is `2026-09-14T05:04:43.136883Z` to
`2026-09-14T05:04:46.298188Z`, on the frozen nested-actionability release00
snapshot corresponding to feature commit
`f5f9a0ca33d45033dc726907e8f74b99b2453017`. No source or production instrumentation
changes, rebuild, dependency addition or rerun occur.

GNU time measures **3.14 seconds wall, 4.67 seconds user CPU, 0.55 seconds system
CPU and 413,856 KiB peak RSS** (404.156 MiB). These include the whole profiled
Node/Vitest job: startup, transforms, fixtures, assertions, worker/helper threads,
JIT and garbage collection. They are not standalone-browser or per-file memory
measurements and must not be compared with the captured Python flow's 209.5 MiB.

## What The Profiles Show

Three raw CPU profiles are retained. Thread0 is runner-only and provides no
browser implementation samples. Thread1 contains positioning implementation/test
frames; thread2 separately contains nested-actionability frames.

In the positioning worker, `layoutTextContexts` has **199 self samples and
304 inclusive samples**. Of those, 26 self and 46 inclusive samples have
confirmed `withoutReuse` ancestry. The test intentionally disables static-position
reuse for baseline comparisons, so the aggregate mixes optimized paths and
deliberately unoptimized baselines. Absence of that ancestor does not establish
production-only execution. These numbers are samples, not invocation counts,
regressions or measured speedups; inclusive counts overlap.

Two raw positioning time deltas are negative (`-2` microseconds each).
The initial offline analysis rejected them; its failure is retained. Final
analysis uses sample counts and leaves weighted positioning timings unavailable,
without clamping or rewriting raw data and without rerunning tests. Raw generated
coordinates are not asserted to be original TypeScript line positions.

The repeated whole-formatting-node text-transform presence scan near
`src/text-layout.ts:275` is an investigation candidate. Source inspection and
entry-concentrated position ticks support looking there, but do not prove exact
instruction cost. Next: a production-path-only, source-mapped or deterministic
work-count check before changing behavior. No speculative persistent cache is
introduced. Preserve transform inheritance, mutation invalidation, typography,
resource limits and caller-owned formatting inputs in any future optimization.

## Integrity And Scope

Original native network guards and kernel containment remain active. One worker,
30-second per-test timeout, 180-second outer deadline, zero retries, bounded
output and empty private HOME/TMP are retained. No live/captured website,
credential, SafeJS runtime, socket, real TTY/PTY or device check runs.

All 1,343 source entries, 2,172 compiled entries and 46 release receipts verify
before and after. The parent independently rehashes those inventories and the
31-file evidence seal, confirms the 36 results and recounts the text-layout
samples from raw call trees. Owned process group1291928 is absent; the direct
child is reaped. Pre-existing working-tree changes are not part of this check.

Evidence under `node_modules/.cache/native-validation/`:
- `native-action-profile-work-september14/SUMMARY.md`: full methodology,
  function rankings, thread partitions and limitations.
- `native-action-profile-work-september14/ANALYSIS.json`: exact cases and samples.
- `native-action-profile-work-september14/EVIDENCE.sha256`:
  `648ccc9665b4700584188bc00c91c10d4d568d8036de325d87cacd2897b49b5e`.
- `mdn-ownership-work-september14/PARENT-PROFILE-VERIFICATION.json`:
  `eb137b5dee93e4320624d7e9e8bfbabbccfb90931301778196c084a8e5772025`.

The overall browser goal and live-site acceptance gates remain open. No push.
