# Base URL caching and two native website checks

September 18, 2026. Native browser performance/functionality progress; no alternate
browser, SDK execution, new dependency or completed Zoom-notetaking claim.

## Result

Repeated extraction from three saved pages is faster after eliminating repeated
full-document base-URL scans. **Every complete page object is unchanged**, including
content, URLs, reader provenance, references, byte counts and cursors.

| Captured selection | Entries / pages | Baseline median | Cached median | Change |
| --- | ---: | ---: | ---: | ---: |
| Hacker News comment bodies | 414 / 7 | 842.93 ms | 163.56 ms | −80.6% |
| GitHub llama.cpp build-guide code blocks | 56 / 3 | 28.57 ms | 13.56 ms | −52.5% |
| Python asyncio code blocks | 34 / 2 | 45.63 ms | 19.91 ms | −56.4% |

These are **warm in-process command-host pagination measurements**, not live
navigation, network transfer, cold-start, total browser performance or statistical
significance claims. Ten measured iterations per fixture/flavor come from two
separate children, each with one excluded warmup and five measured iterations.
Baseline runs precede candidate runs in the first round; the second round runs
candidate then baseline for each fixture. Children run sequentially on a shared
machine, without CPU pinning or cache flushing. All samples/ranges are retained.

Timing covers retrieving all shared-metadata pages at limit=100 and 32,000-byte
page/item caps. It excludes imports, source loading, evidence checks, correctness
comparisons and artifact writes. Twelve benchmark children execute 72 traversals
including warmups, with no real network calls. Each returned page stays within
its cap. Aggregate JSON bytes remain 202,463 / 67,958 / 44,406 respectively.
The previously verified content and full output match baseline/candidate in both
rounds. Trees stay unmodified; transport and child groups close.

## Root cause and implementation

Three preliminary zero-network CPU profiles identified repeated `documentBaseUrl`
and `DocumentTree.walk` work. The HN diagnostic profile sampled approximately
750 ms in `documentBaseUrl` itself and 363 ms in one `walk` frame over a 2,244 ms
profile. Those profiler-overhead samples are diagnostic, not the benchmark above.

`src/document-url.ts` now retains one last resolved URL per weak document key.
The cache uses both document revision and mutation-notification count. Revision
alone is insufficient: synchronous mutation callbacks can observe changed base
attributes or tree order before `changed()` advances the revision. The existing
notification count invalidates that intermediate state without new subscriptions.

First HTML `base[href]`, invalid/prohibited first-base fallback, missing-base
fallback, current document URL resolution and namespace/tree-order rules remain
unchanged. A root lookup preserves closed-document errors on cache hits. Failed
scans and iterator-close errors never publish a result. No strong global document
registry, additional observer/cleanup-handler budget, cap increase or network
policy change is introduced. Mutation-heavy or already-cheap first-base lookups
are not claimed to have the same speedup as this captured-source workload.

## Validation

- **578 passed, 0 failed** across 13 explicit `native-tests.json` files on the
  final immutable overlay. Build, TypeScript, formatting and lint all pass.
- **37 added cases** cover reuse, absent/invalid/foreign bases, separate documents,
  ordering/reparenting/removal, URL and other revisions, no-ops, traversal/cleanup
  errors, closed trees, handler saturation, link/form/snapshot/extraction output,
  and synchronous mutation-callback observations.
- Old production with identical final tests: **27 passed, 30 failed**, one file.
  These expected cache-contract failures are not website or SDK failures.
- Initial candidate: 578/0 native and green build/types/format, but one lint error
  for an intentionally throwing generator `finally` in a test. The final test
  instead mocks iterator `return`, retaining its failure assertion; production
  cache code is unchanged. Both runs remain preserved.
- Two initial parent test commands omitted the private environment argument and
  stopped at the runner's argument assertion before spawning any child. Correct
  invocations and all resulting process/cleanup records remain distinct.

Qualification is the prior immutable native source plus these two owned files,
not the entire changing worktree. No SafeJS, real credential/passkey, device,
socket-service, TTY or meeting acceptance follows from these native tests.

## Fresh website checks

Each target received one independently finalized anonymous native GET, with no
retry, redirect follow, credentials, script/subresource load or alternate engine.
The capture runtime reused the earlier 433-test native qualification; it is not
the new cache build. Matching fixture-only proofs made one mocked GET each and
passed hidden/raw-content, code/punctuation, guard and cleanup checks.

| Target | Receipt time, UTC | Actual result |
| --- | --- | --- |
| `https://docs.rs/tokio/latest/tokio/runtime/index.html` | 10:36:46.584 | HTTP 200; 60,566 body bytes; 31,761 Markdown bytes |
| `https://stackoverflow.com/questions/20001229/how-to-get-posted-json-in-flask` | 10:36:46.711 | HTTP 403; 5,290 challenge-body bytes; no extracted content |

Both receipts are from **September 18, 2026**. Tokio remains
`extracted-unverified`, `partial: true`, without a content-success assertion or
fallback. Stack Overflow is a confirmed Cloudflare challenge based on
`cf-mitigated: challenge`; classification says stop/request user handoff. The
request stops there. **This is not successful access or a CAPTCHA bypass.**

TLS verification, public-address checks and ordinary AgentBrowser identity remain.
Limits: 2,000,000 decoded bytes, 256,000 extraction bytes, 256 MiB V8 old space
(not RSS), 16 MiB per file, 60-second supervised child. DNS resolver tries=2 is
not HTTP retry permission or a measured DNS-query count. Both live safety checks
pass; success is not required for a safety pass. Lanes are spent and all request,
session, document and child resources close, with empty task HOME/TMP.

## Tokio content inspection

Zero-network baseline and candidate command-host inspections reproduce all
31,761 captured Markdown bytes exactly. Raw-source and reader parses agree on
**23 main-content headings and five code blocks**. Selecting `#main-content`
returns **23,992 Markdown bytes**, retaining every extracted code block; focused
Markdown/JSON and heading/code artifacts are byte-identical across builds.
The article includes runtime selection, configurations, scheduling behavior and
performance-tuning sections. This is source-content inspection using native
parsers, not an independent rendered-browser oracle or executed Rust examples.

The first inspection assumed the native `extract` command exposed the research
CLI's compact-table options and failed with `Unknown option: --compact-tables`.
Version 2 uses advertised native options. Original failed scripts/outputs remain;
there was no production workaround, raised limit or website refetch.

## Evidence and remaining work

Machine-readable report: `reports/base-url-cache-2026-09-18.json`.
Local phase: `node_modules/.cache/native-validation/docs-discussion-performance-september18`.
Raw captures/proofs: `/tmp/agent-browser-docs-discussion-preparation-s1c8zB`.
Original GitHub/HN/Python captures retain their original September 18 receipt
times and outcomes; HN's original whole-page failure is not relabeled by this
explicit captured-body inspection. No original site was refetched for profiling
or benchmarks. Private artifact paths and hashes are retained, not shipped bodies.

Access challenges, broader website/research coverage and full native runtime
compatibility remain open. Zoom classic-Script/scheduling contributions remain
unactivated; SDK qualification, client execution, native media receive/decode,
meeting admission, permitted recording, transcription and delivery are unfinished.
No meeting was joined or recorded. This checkpoint does not complete the goal.
