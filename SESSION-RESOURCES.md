# Native session resource measurements

September 2, 2026. These measurements exercise the actual native session/command
host, HTML loader, CSS visibility, snapshots, search, actions, HTML replacement,
diffs and cleanup. They are **not full browser or JavaScript-engine benchmarks**.
All document responses are supplied by an in-memory transport; no socket, DNS,
public website, browser service or real terminal is involved.

Later September 2 checkpoint: `NODE-VIEW-CACHE.md` compares three equivalent
fresh-process trials per profile before/after immutable node-view reuse. Large
workload medians improve from 745.2 to 451.5 ms and peak RSS from 226.7 to
164.3 MiB; churn peak RSS does not improve. The single observations below are
preserved historical results, not measurements of the optimized implementation.

## Reproduce

Build the package, then run each profile in a fresh Node process:

```sh
node node_modules/typescript/bin/tsc -p packages/browser-agent/tsconfig.json --outDir packages/browser-agent/dist
node packages/browser-agent/dist/scripts/check-session-resources.js small
node packages/browser-agent/dist/scripts/check-session-resources.js medium
node packages/browser-agent/dist/scripts/check-session-resources.js large
node packages/browser-agent/dist/scripts/check-session-resources.js retained
node packages/browser-agent/dist/scripts/check-session-resources.js churn
```

`check:session-resources` is also available in the package scripts. Only the five
fixed profile names are accepted. Reports include per-phase wall/CPU times,
process memory samples, OS-reported peak RSS, source bytes, output sizes, native
document counts, cleanup assertions and runtime/CPU identification. Performance
targets are observations, not pass/fail correctness assertions.

Each navigation obtains HTML through the shared loader, makes a default snapshot,
finds the final row, fills a control, activates a native event listener, replaces
one HTML row and requests a diff. Retained sessions are loaded sequentially and
held together; this is not parallel CPU throughput. Churn replaces one session's
document twenty times. The event listener is native fixture code, not interpreted
website JavaScript.

## Historical observed run

Node v22.22.0, Linux x64, AMD EPYC 9R45. One observation per profile, with
uncontrolled filesystem caches, JIT/GC scheduling and other machine activity:

| Profile | Rows/page | Retained sessions | Navigations | Ready ms | Workload ms | Peak process RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 100 | 1 | 1 | 30.5 | 58.1 | 63.4 |
| medium | 1,000 | 1 | 1 | 29.4 | 189.0 | 107.9 |
| large | 5,000 | 1 | 1 | 28.5 | 724.7 | 226.4 |
| retained | 100 | 8 | 8 | 30.3 | 178.5 | 97.8 |
| churn | 100 | 1 | 20 | 29.8 | 328.8 | 101.2 |

`readyMs` is child `process.uptime()` after static module loading. It is not a
parent-observed CLI/service cold-start measurement. Workload time includes fixture
generation, instrumentation and cleanup. CPU time can exceed wall time because
Node/V8 work need not stay on a single thread.

The small source is 5,928 bytes and its page peaks at 318 sampled owned nodes;
the large source is 311,928 bytes and 15,018 sampled owned nodes. The large case
takes about 153 ms to open, 94 ms to search, 250 ms for fill/click and 90 ms for
the final snapshot/reset. These are whole command phases, not allocation or CPU
profiles attributing cost to a particular function.

**Memory is not yet satisfactory at larger sizes.** Even with JavaScript off,
the medium and large cases exceed 100 MiB RSS. The small result cannot establish
the requested lightweight/portable behavior for real JavaScript applications.
The next resource work should attribute projection/action allocation and index
rebuild costs, then repeat equivalent complete workloads; do not infer a leak or
claim an optimization from one RSS sample.

## Findings and correction

The initial large case could not find its final row: search first materialized a
projection capped at 10,000 entries/1 MiB. `find` now consumes semantic entries
incrementally, retains bounded result/context windows, and keeps the same matcher
work/output limits. The full 5,000-row profile now reaches its last row and
completes its action/replacement phases. `SNAPSHOT-SEARCH.md` describes the new
scan contract; default snapshot and role-locator limits were not enlarged.

The initial medium run also exposed an incorrect harness expectation: truncated
snapshots intentionally produce a reset rather than an incremental diff. The
fixed harness verifies that behavior rather than removing truncation or weakening
the complete-snapshot baseline assertion. Medium/large final runs each record one
reset; small/retained/churn runs record none.

All five `session-resources-*-before-streaming-2026-09-02.json` reports are
preserved, including the two failed initial checks. They are diagnostic baselines,
not equivalent complete before/after benchmarks: the failed large case stops
before actions/replacement, so its lower peak RSS cannot be compared directly
with the final full-workload peak. No universal speedup is claimed.

## Evidence and limits

The five final `reports/session-resources-{small,medium,large,retained,churn}-2026-09-02.json`
reports pass 201 functional/cleanup assertions in total. All 31 created page
documents close; all owned transports, tabs and navigation jobs drain without
reported cleanup errors. Output truncation is recorded rather than hiding larger
fixtures. The largest default snapshot JSON is 16,348 bytes; its rendered text
has different overhead and is not the same byte budget.

Memory includes Node, fixture strings/bytes, reports, caches and closed session
wrappers. `process.resourceUsage().maxRSS` is converted to bytes; phase memory
samples are not peaks. Document/node maxima are phase-boundary observations of
loaded pages, excluding temporary parser/staging peaks. No forced GC is used;
native closure does not promise immediate RSS reduction or prove absence of
retained JavaScript objects.

There is no page-JavaScript execution, network latency, released SDK, process
supervisor, live PTY, layout/capture, cold-cache control, steady-state statistical
sample or comparison with curl/another browser in these numbers. Separate actual
experimental-core search checks verify functionality, not interpreter performance.
Full resource acceptance and the broader browser goal remain open.

Measurement API reference inspected:
https://nodejs.org/api/process.html#processresourceusage
