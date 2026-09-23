# Browser priorities

- Develop the standalone native browser + SafeJS toward a possible future
  replacement for the working Automations Zoom notetaker. Keep Automations
  unchanged and the native engine independent of Chromium, Firefox and remote
  browsers. SafeJS is the only approved page-runtime dependency.
- This is exploratory work for a hypothetical future replacement, not a current
  migration. The working Automations setup remains the operational solution;
  the acceptance gates below describe future readiness.
- Test meeting: https://quora.zoom.us/j/7982110526. The approved diagnostic route
  https://app.zoom.us/wc/7982110526/join returns HTTP 200; the default identity has
  server-rendered name and Join controls, but interactive initialization remains unverified. No meeting
  has been joined. Acceptance requires joining/admission and presence, roster/chat,
  audio capture/transcription, playback/live microphone/avatar, leaving and cleanup.
- Reduce retained-graph accounting cost while preserving memory/depth limits,
  cancellation, callback ownership and credential isolation. Full primary graph
  reconciliation must remain active during suspended callback holds.
- Continue compatibility work, legitimate challenge handoffs, top100 checks,
  browser-only research, playground/terminal and command coverage. Opt-in 16 MB
  extraction recognizes React stream completions; unknown helper variants and
  interactive behavior remain unverified. Validate secret placeholders with
  extensible .env/pass providers and passkeys.

## Current verified state

- Maintained SafeJS reuses private closure capture buffers within each measurement
  (38656085c; local commit). Pending frames retain exclusive ownership; available
  slots release guest references. Only vectors of at most 64 slots are reused:
  an uncapped candidate exhausts a 128 MiB heap on wide duplicate captures whose
  graph charges only 243 units; the retained cap fits and preserves that charge.
  A 600-closure fixture still charges 360600 units, with about 40% less warmed CPU
  and 81% less sampled allocation. Its allocation gate falls from 22.1 MB to 44 KB
  with inlining disabled for attribution. All 130 focused tests across 16 files
  pass, including both GC checks, strict typing/lint and SDK build/eight imports.
  Compiled Node24 default-stack 1025/1026 capture-depth boundaries pass. The initial
  candidate at 30 s advances 188113 externals steps; the capped candidate at the
  explicit 120 s diagnostic limit advances 200234, still execution-timeout.
  Nine classics preserve their steps/data; normal externals entry is 1636769 units,
  capped peak 2255072. Both public runs clean up data/sockets to zero; neither
  imports the client or verifies readiness/join/media. Next: measure remaining
  full-page traversal/GC pressure without weakening metadata reads or full quotas.
  Validated reusable SDK updated; temporary probes removed. No startup pass claimed.
- Actual ES chunks, including 3.49M-unit loginview and 1.10M-unit editor-core,
  compile with the existing Unicode application regex allowances; the apparent
  editor string-limit failure was a probe omitting those allowances. Four captured
  compact parser results coexist at 90.2 MB used heap under a 128 MiB cap; this
  does not verify the initialized module graph's memory or execution.

- Maintained SafeJS keeps array snapshots/continuations private (28fb87e86) and
  reuses private frames within each measurement (389f23d75; local commits).
  Eight before-fix native push/setter/iterator regressions hide array payloads or
  frames (1008→2 units and missed quotas). All 83 focused tests across 14 files,
  SDK typecheck/scoped lint, build/eight imports and compiled Node24 default-stack
  1025/1026-closure boundaries pass. A 30196-unit branching fixture preserves
  charges with about 23% lower plain-record CPU / 10% lower tracked-record CPU;
  tracked allocation sampling estimates 4.14 MB→0.58 MB (86% lower).
  Externals-only profiling attributes 38% to traversal and 26% to GC. The diagnostic
  offline fixture injects externals as a parsed script before lifecycle callbacks,
  disables CDN detection and retains the nine initial classics' exact steps/data.
  Seven frozen responses replay with zero misses. At 30 s the array fix advances
  192392 externals steps; frame reuse 193824: no startup speedup is claimed. At the
  explicit 120 s diagnostic limit, externals passes in 52.5 s / 212732 steps /
  656763 peak units; all ten scripts pass. This proves no default deadline, normal
  CDN/client initialization, readiness, joining or media acceptance. The preceding
  public capture with CDN detection disabled times out at navigation. Every completed
  run cleans up data/sockets to zero. Temporary fixtures/profiles removed and the
  validated reusable SDK updated; initial registry-call allocation fix remains.

- Maintained SafeJS pins intrinsic record ownership checks/insertion (ab3b719f9)
  and traverses indexed native closure captures iteratively (8a148a0a3; local
  commits, no push). Two before-fix native WeakSet hooks spoof or expose ownership
  certificates. Compiled Node24 default-stack baseline raises RangeError on a
  permitted 1025-closure chain; the fix charges 1029 units and reports
  budgetExceeded/dataDepth for 1026 closures. All 104 selected SDK checks across
  12 files pass (two existing skips), strict test typing/scoped lint and SDK
  build/eight imports pass. Actual browser 21 assertions preserve 46447 steps /
  63467 current / 69477 peak and cleanup zero. Prototype/provider/copy depth paths
  retain separate gates; no general depth or startup performance pass is claimed.
  Earlier tracked-table projection is rejected: a 44–45% closure-heavy fixture
  gain loses inherited closure captures (1001→1 units) and restored iterator
  payloads (1010→1), including held quotas. Eleven runtime-state guards preserve
  baseline semantics (127d7f871); shortcut source/tests removed. Fresh public
  baseline advances 186137 externals steps / 2252153 peak; rejected shortcut
  reaches 188531 / 2644503. The retained closure-depth fix reaches 175284 /
  2644347 peak; the loader classifies execution-timeout, while its inner body log
  covers 17.9 s and excludes prefix waits. Preparation/queue variation prevents
  a speedup or regression attribution. All routes pass nine classics but no
  imports/readiness/join; cleanup data/sockets zero. Reusable SDK updated and
  temporary artifacts removed. Next: stable full-page replay and larger traversal/
  preparation costs with runtime-state ownership/invalidation, preserving full
  quotas. Every initialization/join/notetaker/media gate remains open.
- Maintained SafeJS tracks fixed-key classic data records at creation (19396ca3f;
  local commit, no push), extending existing private revision accounting to small
  records. The before-fix regression rereads two records 122 times during eight
  loop iterations; the fix performs zero repeated reads. All 278 selected SDK
  checks, strict test typing/scoped lint/format and SDK build/eight imports pass.
  Host/guest cloning, aliases, prototypes, descendants and held native-growth
  quotas remain intact. Actual browser 21 assertions preserve 46447 steps /
  63467 current / 69477 peak, cleanup zero; a separate Node24 Worker roundtrip
  preserves small-record aliases and cleanup zero before/after. Serial 128-record /
  500-pass accounting retains 4635 units; CPU median improves 138.6→108.9 ms,
  confirmed in reverse order at 127.2→102.9 ms (19–21%). Only compiled interpreter
  output differs. Fresh public 30 s/128 MiB baseline times out during navigation;
  candidate returns HTTP 200/passes nine classics, then externals times out at
  180863 delta steps / 2252153 peak. Preparation/timing variation prevents a live
  speedup claim; no imports/readiness/join, cleanup data/sockets zero. Temporary
  validation artifacts removed; reusable SDK updated. Next: larger closure/scope
  traversal and preparation cost, retaining full quotas; client initialization,
  joining/notetaker/media acceptance all remain open and Automations unchanged.
- Opt-in owned-scope capture memoization is rejected and reverted. Sealed metadata,
  tracked assignments/binding changes, empty-environment revocation and conservative
  caller/restored scope fallback preserve 263 selected SDK checks across 20 files
  (two existing skips) and 11 focused guards, including same-walk held quotas,
  context carrier changes, prototype getters and private cache/native hook isolation.
  SDK build/eight imports and initial strict test typing/scoped lint pass. Actual
  browser before/after preserves all 21 assertions and 46645 steps / 53725 current /
  69724 peak, cleanup zero. Serial 400-closure/nine-ancestor/500-pass fixture keeps
  435 units but CPU median rises 63.4→104.7 ms (about 65%); ownership guards do not
  amortize collection in this fixture. No public candidate run is warranted and no
  initialization/join/media gate is cleared. All eight owned runtime changes and
  the candidate tests are removed, maintained baseline build restored, validation
  artifacts removed and reusable SDK preserved. Next: uncached record-property
  capture and the host-copying failure that prevented broader classic-record
  tracking, preserving native growth, descendants/providers and full held quotas.
- Maintained SafeJS pins its private accessor/adaptor registries (b71bdbc7e;
  local commit, no push). Six before-fix failures expose registry insertion/read
  hooks or omit retained payloads and bypass held/unheld primary quotas. All six
  now pass, with 86 selected SDK checks, strict typing/lint, build/eight imports
  and 21 actual browser assertions; accounting remains 46645 steps / 53725 current /
  69724 peak, cleanup zero. Serial public desktop 30 s/128 MiB baseline still
  times out in externals at 188486 steps / 2252153 peak units; no imports/readiness/
  join, cleanup data/sockets zero. Accessor-table edge projections are rejected:
  141 selected plus 13 follow-up checks pass, including depth and native Array-hook
  isolation, and a 128-table fixture retains 6144 units with CPU median 210→160 ms,
  but public progress remains effectively identical at 188608 / 2644503 peak.
  Public preparation charges differ and their cause remains unverified; only the
  intended compiled accessor projection differs, and no live gain is proven.
  The baseline census counts 52.4 million fresh object entries / 22.7 million closure
  visits across 34890 walks, establishing traversal volume rather than cache safety.
  Candidate source/tests are removed, maintained baseline build restored, validation
  artifacts removed and reusable isolated SDK retains only the verified registry fix.
  Next: larger repeated closure/scope graph work with explicit ownership/invalidation,
  preserving fresh provider/descendant reads and full held primary quotas. Full
  initialization/join/notetaker/media gates remain open; Automations stays unchanged.
- Broader classic fixed-key data-table tracking is rejected and reverted: the
  public externals asset has at most 43 literal fields, below the existing
  256-string-table threshold, but tracking mixed tables from 16 fields yields no
  useful initialization gain. All 179 selected SDK checks, strict typing, lint,
  build/eight imports and 21 actual browser assertions pass; before/after browser
  accounting remains 46645 steps / 53725 current / 69724 peak, cleanup zero.
  The focused 28-field benchmark preserves 1231 units with a noisy CPU median
  36.3→35.3 ms. Public desktop 30 s/128 MiB execution still times out after nine
  classics: externals advances 178830 steps with 2644502 peak units, versus the
  earlier baseline 183176 / 2252153; no readiness/imports/join, cleanup data and
  sockets zero. Different timing/CPU contention proves no speedup or precise
  slowdown. A baseline allocation sample estimates 24.7 GB cumulative preparation
  churn and 8.9 GB externals churn, predominantly graph walks and property
  snapshots; these are sampling estimates, not retained heap. Next: reduce
  repeated capture/traversal in the primary walker with ownership/invalidation
  evidence while retaining fresh mutable descendants, provider reads and full
  held quota reconciliation. All full-client and meeting/media gates remain open.
  Owned experimental source/tests and validation artifacts removed; baseline
  maintained build restored and reusable isolated SDK preserved.
- Maintained SafeJS realm root collection uses one ordered private snapshot,
  eliminating per-host singleton arrays and native Array.from/flatMap/push hooks
  (ae2a16513; local commit, no push). Two before-fix regressions omit retained host
  data through a flattening hook and bypass held/unheld primary quotas; fixed.
  Roots remain live through writes, aliases, deletion and cleanup. All 129 selected
  SDK checks across 12 files pass, plus strict test typing, scoped lint/format,
  build and eight import checks. Actual browser before/after preserves all 21
  assertions, 46645 steps / 53725 current / 69724 peak units, cleanup zero.
  Serial 1000-host/100-pass fixture preserves 1000 units; CPU median 105.9→105.7 ms
  establishes no speedup. Fresh unprofiled desktop 30 s/128 MiB Zoom run returns
  HTTP 200 and passes nine classics; externals times out at 30.09 s / 183176 steps /
  2252153 peak units, effectively unchanged progress. No client imports/readiness/
  join; cleanup zero data / sockets verified. All startup/full-client memory/meeting/
  media gates remain open. Next: investigate larger retained-graph allocation and
  traversal costs with current live allocation evidence; the recent small collector
  changes establish no startup gain. Owned validation artifacts removed; reusable
  isolated SDK updated.
- Maintained SafeJS accounting traverses host expando roots directly through the
  existing iterative walker (262d12dd9; local commit, no push). Two regressions
  reproduce a later native array-iterator hook exposing/omitting the temporary
  root array and bypassing primary data quotas, held and unheld; both pass after
  the fix. All 95 selected checks across nine SDK files pass, including host/record/
  array depth boundaries, live descendants and revocation. Strict changed-test
  typing, scoped lint/format, build and eight import checks pass. Actual browser
  before/after checks preserve all 21 assertions, 46645 steps / 53725 current /
  69724 peak units, cleanup zero. Serial 2048-empty-host/100-pass fixture preserves
  4096 units; CPU median 211→214 ms establishes no speedup. Fresh sampled desktop
  30 s/128 MiB public Zoom run times out in navigation before externals begins;
  cleanup zero data / sockets verified, no readiness/join or default-gate pass.
  About 58.4% of active profile samples enter graph accounting, 61.8% reconciliation,
  and 34.5% are GC; these overlap and are sampled attribution, not exact timings.
  The later realm collector fix above removes the remaining per-host root arrays
  (about 1.1% of this earlier profile's self samples). Overall allocation pressure
  needs investigation; no small visitor shortcut establishes readiness.
  All startup/full-client memory/meeting/media gates remain
  open. Owned validation artifacts removed; reusable isolated SDK updated.
- Maintained SafeJS host expando storage now uses existing revision-tracked tables
  (fc6675361, rebased as ae02c6e21; local commit, no push). Unchanged accounting no longer recaptures
  expando descriptors; writes invalidate projections and descendants/providers
  remain freshly measured. The regression fails before the fix and passes after it.
  All 68 selected checks across six SDK files pass, plus strict new-test typing,
  scoped lint/format and maintained SDK build with eight import checks. The first
  build's import checks observed missing generated files that subsequently appeared;
  the fresh rerun passes. Actual browser before/after checks preserve all 21
  style/window/Image/Blob-origin/URL/node-expando assertions, 46645 steps / 53725
  current / 69724 peak units, cleanup zero. A serial 128-host/8192-field fixture
  preserves 154624 units; median CPU for 100 measurements falls 71.9→26.7 ms
  (about 63%). This is not public startup evidence. Fresh desktop-identity
  30 s/128 MiB public Zoom probe returns HTTP 200 and passes nine classics, but
  externals times out at 30.09 s, 183178 steps / 2252153 peak units. No client
  imports/readiness/join; cleanup zero data / sockets verified. All default startup,
  full-client memory and meeting/media gates remain open. Next: investigate remaining
  graph traversal and temporary root-array allocation cost while preserving mutable
  descendants and full held primary scans. Owned validation artifacts removed;
  reusable isolated SDK updated.
- Maintained SafeJS caches copied host-member charges and pins native access to
  private host/guest registries and member maps (5e6686f52; local commit, no push).
  Regression tests reproduce key/read/insertion-hook exposure before the fix;
  revocation resets charges, and mutable descendants/providers and full primary
  reconciliation during holds remain active. All 231 selected checks across nine
  files pass, plus strict test typing, scoped lint/format, SDK build and eight
  import checks. Actual SafeJS preserves all 17 style/window/Image/Blob-origin/URL
  assertions, 46266 steps / 53696 current / 69364 peak units, cleanup data zero.
  The focused 128-host/131072-member fixture preserves 1561984 data units; median
  CPU for 100 measurements falls about 30.9→6.8 ms (about 78%). This is not public
  startup evidence. Fresh desktop-identity 120 s/128 MiB Zoom diagnostic returns
  HTTP 200 and passes nine classics, but externals times out at 120.12 s; no client
  imports/readiness/join, cleanup data zero / sockets zero verified. Default 30 s
  initialization, full-client memory and every meeting/media gate remain open.
  Next: investigate remaining full-graph traversal/materialization cost; evaluate
  tracked expando projections and temporary root-array allocations without caching
  mutable descendants or weakening held primary scans. Temporary probes removed;
  the validated isolated SDK replaces the reusable desktop candidate below.
- Window construction definitions now retire after installation extracts its
  window/document/origin operations (2411ac4; local commit, no push). An actual-GC
  regression fails before the fix and passes after it for both earlier and later
  host objects, while live access survives. The controlled 256-style probe keeps
  82688 names and retains zero source definitions instead of 256; additional heap
  falls 21.3→18.1 MB. All 309 selected checks across seven manifest files pass with
  GC enabled, plus build, strict test typing and scoped lint/format with existing
  import-order/rule exclusions. Actual SafeJS before/after checks preserve all 17
  style/window/Image/Blob-origin/URL assertions, 46266 steps / 53696 current /
  69364 peak units, and cleanup data zero. The fresh 120 s/128 MiB public diagnostic
  returns HTTP 200 and passes nine classics, but externals times out; cleanup data
  zero / sockets zero verified. No client import, readiness, join or startup gain
  is established. A separate synthetic 300000-node compact index adds 14.7 MB heap;
  this is not Zoom's node count. The later maintained member-charge fix above
  addresses repeated immutable key sums while retaining mutable descendant effects
  and full held primary reconciliation.
  Full startup/memory/meeting/media gates remain open; temporary probes removed.
- Native inline styles share operations across canonical CSS aliases within each
  element (ae9fb15); window mapping shares wrappers for identical property records
  within each host definition (ea5950e; local commits, no push). The controlled
  256-style allocation probe retains 18.3 MB versus 31.7 MB, with all 82688 names
  preserved. Element separation, receiver identity, live mutation and revocation
  pass all 279 selected manifest tests across seven files. Build, strict changed-test
  typing, formatting and scoped lint with existing-rule/import-order exclusions
  pass; the legacy inline-styles suite cannot load its missing report fixture.
  Actual SafeJS/application-profile comparison keeps 45043 steps / 53695 current /
  66754 peak units and all 11 assertions; both builds close at zero data. Generic
  one-second startup times out and cleans up; that default gate is not passed.
  Fresh serial 120 s/128 MiB public runs: changed build times out in externals with
  zero-data/socket cleanup; original native control finishes externals in 75.5 s;
  changed repeat finishes in 97.7 s. The latter two admit i18n/editor then heap-OOM
  without verified cleanup. No public startup gain or readiness/join is established;
  the timing difference remains unresolved. A separate GC probe confirms unused
  source definitions remain retained after window installation. Next: investigate
  that registry's lifecycle and startup cost. Full memory/startup/meeting/media
  gates remain open. Temporary validation artifacts removed; working builds reused.
- Maintained SafeJS retains validated host-property operations in two own fixed
  slots instead of dictionary records (d6ccce08c; local commit, no push). The
  isolated 262144-property probe retains 17.4–18.3 MB additional heap versus
  55.2 MB before; it passes at 48 MiB old-space where the prior build aborts.
  Accounting remains 3265792 data / 262400 work units. Snapshot/live-state,
  revocation, prototype isolation and invalid/proxy-record behavior pass all 213
  selected tests; strict test typing, scoped lint/format and the maintained SDK
  build with eight import checks pass. A fresh authorized 120 s/128 MiB public
  probe finishes externals in 90.6 s, admits i18n/editor sources, then aborts with
  heap OOM before a final report or verified cleanup. No public startup gain,
  readiness or join is established. Next: reduce style/window getter and method
  closure retention without changing identity, validation, quotas or held scans.
  Default startup, full-client memory and all meeting/media gates remain open.
- Maintained SafeJS source graphs use compact tokens/ASTs (e8c79c840), and packing
  now uses DFS and releases copied entries from unobserved parser arrays with
  pinned property writes (8830013af; local commits, no push). A concurrent rebase
  preserves the tested source and tests byte-for-byte. The real emoji asset's
  319326 nodes, metadata, IDs, 2160147 steps and 12667140 code-buffer bytes match
  the prior build. With about 58 MB retained beforehand, both the original and
  DFS-only packers abort at 128 MiB old-space; parser-array retirement passes.
  The actual six-module i18n graph now parses AND links at the same heap limit:
  8329048 steps / 5960199 current units, 83.13 MB heap / 63.53 MB buffers retained.
  Its former build aborts. No client evaluation or realm cleanup is claimed from
  this controlled graph check; diagnostic regex limits are explicit.
  All 125 selected SDK checks across 12 files pass, including alias/cycle and
  native-hook isolation, strict new-test typing, scoped lint, the maintained SDK
  build and eight entry checks. Fresh 120 s/128 MiB public probes still abort
  during module preparation without final reports or verified application cleanup.
  Externals finishes in 91.2 s normally / 100.6 s sampled; no startup gain is
  established and the normal 30 s initialization gate remains open.
  A 128 KiB-interval live allocation sample survives before i18n: 128.6 MB actual
  heap and about 112.7 MiB sampled live allocations. Estimated stack groups include
  closures 13.1 MiB, host-record validation 10.8, inline styles 10.2 and window
  getter wrappers 6.8; samples are not exact retention totals. Next: reduce private
  capability-definition copies and style/window wrapper allocations while preserving
  validated snapshots, canonical identities, live effects, quotas and full held
  primary scans. Default heap/time, readiness/join and all media gates remain open.
- Maintained SafeJS appends private graph continuation frames with pinned native
  push to a null-prototype stack, eliminating per-frame property descriptors
  (poe-code 347f0a65b; local, no push). Depth boundaries, DFS snapshots, proxy
  order, native hook isolation and full held primary reconciliation stay active.
  All 363 selected checks across 30 files pass with actual GC, strict new-test
  typing, scoped lint, the maintained SDK build and eight entry checks. Focused
  branching scans retain 18574 units while median CPU falls 876→702 ms (~20%).
  Certified frozen SDK closures also retain the narrower 41310d3c5 optimization;
  getter caching and pinned visited-table calls remain rejected.
- Fresh serial 128 MiB/30 s public baseline/candidate probes with 30 s observation
  windows both time out in externals (187689/185084 steps, identical 2252153 peak
  units). No startup gain is established; both verify cleanup zero / sockets zero,
  with no readiness or join. The initialization probe now reports delayed callback
  failures using bounded own-data error fields (0b85967; local, no push), preserves
  invocation/phase promises and rejection identity, and avoids proxy traps in
  controlled checks. The native build, scoped lint and 40 selected native checks
  pass; native and live gates remain separate.
- A fresh waiting-callback/externals CPU profile attributes ~87% of active samples
  to reconciliation, 49.8% self to the graph visitor, 4.5% to continuation appends,
  and 7.7% to GC. Visitor line ticks identify symbol enumeration (6.85% of visitor
  ticks), closure property reads (4.31%), record key enumeration (4.26%) and frozen
  closure registry lookup (4.0%); sampled attribution is subject to contention.
  Earlier initial-script census did not reach externals: 11.47 million of 23.19
  million ordinary-object visits are closures; 48.16 million of 50.55 million
  captures are already seen; 30.85 million scope visits rebuild bindings only 1913
  times. Shared-scope visited-call experiments show no useful improvement.
- Extended 120 s/128 MiB-old-space diagnostic finishes externals in 107.3 s
  (215221 steps, 681832 current / 2925610 peak units), then reaches the webclient
  bootstrap and admits webclient.es.min.js (4383 chars), rolldown runtime (1365)
  and i18n-core (362461). The process aborts with a confirmed JavaScript heap OOM
  during module preparation, without a final result or verified application
  cleanup. This does not pass the normal startup, full-client heap, readiness or
  meeting gates. Temporary validation artifacts removed; working builds retained.
  Compact source preparation and its remaining heap gates are recorded above;
  retained Script AST/context and later module preparation still need attribution.
- Host-function metadata shortcuts remain rejected. The certified census covers
  only 52 tables / about 3% of eligible object visits; focused improvements never
  established a public startup gain. Maintained tables retain fresh observations.
- Maintained SafeJS conservative record data snapshots now stay private from
  later native Array hooks and inherited index setters (poe-code b46eddc27;
  local, no push). Reproduction drops 1015→9 units and bypasses quota500;
  pinned appends to a private array without an inherited prototype preserve 1015
  and reject the quota. Fresh capture order, aliases, cycles, mutable descendants,
  foreign proxy ordering and primary reconciliation remain active. All 168 selected
  checks across 19 files pass with actual GC, strict new-test typing, scoped lint,
  SDK compilation and eight entry checks. Focused mixed/reference/sparse scans
  retain identical charges; sampled CPU is 104→107 / 89→93 / 52→52 ms, so this
  is accounting hardening without a startup gain claim.
  First public profiling probe times out before externals; second reaches HTTP 200
  and externals but fails its execution-timeout gate (182114 steps, 2644502 peak
  units). Both verify cleanup data zero / sockets zero; no readiness or join.
  The second probe's 27.9 s sampled window attributes 20.1 s inclusive to graph
  traversal and 4.0 s self to GC, with symbol enumeration, closure properties/
  captures and fresh descriptors hot. Next: attribute remaining owner/closure
  traversal cost after dictionary tracking, preserving live reads and limits.
- Maintained SafeJS (poe-code e633427b5; local, no push) now updates SDK-owned
  scalar/key totals incrementally and reuses immutable symbol-key lists. Bulk static string dictionaries in classic
  Scripts (at least 256 fields) qualify from creation; small literals and default
  runner outputs remain native. Mutable descendants, accessors, bigint/symbol
  observations, foreign proxy ordering and held primary reconciliation stay fresh.
  Early SDK observer aliases survive construction, and native growth of a warmed
  dictionary rejects at the next checkpoint. 330 selected checks across 17 files
  pass with actual GC, plus strict new-test typing, scoped lint, SDK compilation
  and eight build-entry checks. Focused 2517-field scans retain 78325 units while
  tracked construction falls 3174→15 ms and 6000 warm scans 823→7 ms.
  Serial public Zoom probes at 128 MiB/30 s observe the actual dictionary Script
  at 20.9→4.2 s wall / 16.1→7.6 s CPU, with identical 189663 steps and
  370700 current / 565448 peak units; shared CPU contention limits speed claims.
  Baseline hits navigation timeout before externals. Candidate reaches HTTP 200
  and externals but still hits its 30 s execution deadline (174142 steps,
  2251998 peak units). Both verify cleanup data zero / sockets zero; no readiness
  or meeting join. Externals startup gains and later full-client gates remain open.
  Attribution previously identified this dictionary's 14.3 million descriptor reads;
  broad literal tracking was rejected. Next: measure remaining externals accounting
  cost and preserve volatile reads before extending ownership coverage.
- Maintained SafeJS argument data snapshots now stay private from later native
  Array hooks (poe-code 2cd7e530b; no push). The reproduced hook drops baseline
  accounting from 1039 to 25 units; the fix retains 1039 and rejects quota500.
  Fresh descriptor capture, mutable descendants and callback ordering remain active.
  All 99 selected checks across 13 files pass with actual GC, plus strict typing,
  scoped lint, package compilation and eight build-entry checks. Focused scalar/
  reference scans retain identical charges with 57–67% fewer sampled allocations;
  reference-heavy CPU rises about 14%, so no general startup gain is claimed.
  Serial 128 MiB/30 s baseline/candidate live runs both time out in the earlier
  187143-character script, with cleanup zero and sockets zero; no readiness/join.
  Coarse externals sampling attributes about 20.7 GB of cumulative allocations
  (including collected objects) chiefly to traversal/descriptors; fine sampling
  itself exhausts the heap. Next: fresh descriptor allocation cost, preserving
  mutable/foreign observations and full primary reconciliation during callback holds.
- Maintained poe-code SafeJS now has guarded live buffers, typed-array metadata
  accounting, shared forkRealm ownership and retained suspended scope/generator
  roots. Full primary graph reconciliation stays active. Full invokeCallback
  settlement still joins granted nestedOperation execution.
- Maintained SafeJS now includes classic source imports with stable saved-function/
  generator referrers, immutable source-module status and opt-in per-import elapsed
  deadlines (poe-code 7bc7da83a, d0ed7a6e9, f1b358919; no push). Deadlines cover
  resolution through top-level await, revoke the whole realm and clear on settlement
  or cancellation; synchronous host work can delay delivery. All 323 selected checks
  across 14 files pass with actual GC, strict test typing, scoped lint/new-test format,
  isolated SDK compilation/eight entry checks and offline five-case JSPI/WASM
  (cleanup zero). Working compiled modules refreshed; owned temporary artifacts
  removed. The maintained full-page
  probe now loads HTTP 200 and executes 16 scripts, clearing the previous unsupported
  sourceImportTimeoutMs loader failure. Vue still exceeds the 30 s script gate
  (30093 ms, 603265 steps, peak 807885 units); cleanup data zero, socket attempts zero,
  no interactive readiness or meeting join. Default heap/time and media gates remain.
- Maintained SafeJS now certifies permanently empty frozen module environments and
  avoids repeated namespace enumeration for them (poe-code ede5f1656; no push).
  Source loaders preserve certification only explicitly; reattachment revokes it.
  Private pinned ownership operations preserve foreign getter/growth observations.
  A reproduced proxy concealment requires checking emptiness after freezing.
  All 392 selected checks across 22 files pass, including actual GC suites, strict
  new-test typing, scoped lint/format, SDK compilation/eight entry checks and offline
  five-case JSPI/WASM; cleanup zero. Fresh serial baseline/candidate page probes both
  hit the 30 s gate in the first Script, before Vue (139718/135143 step deltas include
  compilation); cleanup zero, sockets zero, no readiness/join or useful startup gain
  established. Bounded profile still puts most cost in graph visitation. Working
  compiled SDK refreshed; owned validation artifacts removed. Next: prove native
  Scope metadata ownership before sharing repeated capture reads; preserve foreign
  effects, mutable descendants and full primary scans during callback holds.
- Native expired idle callbacks now wait for the classic script and its microtask
  checkpoint, sharing the existing timer-task gate (browser 3bbbda5; no push).
  Previously armed alarms also defer without polling; cancellation and module-await
  delivery remain live. Three baseline regressions reproduce; all 140 selected
  checks across four manifest-listed native files pass, including the added module
  await case. Browser build, strict test typing and scoped lint/format pass. Broader
  checks have eight failures reproduced with this fix disconnected: seven stale DOM
  bootstrap expectations in html-module-runtime.test.ts and an existing onload-object
  assertion in page-bindings.test.ts. Unrelated dirty work remains uncommitted.
- Desktop compatibility identity selects nine initial scripts instead of 53, with no
  legacy Vue dependency. All nine pass at the unchanged 30 s script deadline.
  Before classic compiler compaction, delayed observation at 128 MiB aborts from
  V8 heap exhaustion in externals.min.js (163960 characters), without cleanup evidence.
  With the maintained compaction below, the same asset runs without that heap abort
  and stops at the 30 s deadline (30063 ms, 185334 step delta including compilation,
  peak 2252153 SDK units). HTTP 200, cleanup data zero and sockets zero are verified;
  the main client does not load, with no interactive readiness or meeting join.
  The diagnostic now recognizes classic webclient.min.js and webclient.es.min.js,
  requiring successful classic execution or fulfilled source imports respectively;
  fetch, code execution and application readiness remain separate (browser ddc2d1a).
  Full startup, Worker and meeting/media gates remain open. Temporary evidence removed.
- Maintained SafeJS now packs classic Script ASTs and token rows, uses offset-backed
  spans and indexes cold nodes without materializing them (poe-code e40e3454d; no push).
  Public parser defaults remain eager; decoded identities/mutations, source metadata,
  private-name validation, snapshots and compilation/retention budgets are preserved.
  Reproduced lazy-body/token regressions pass; all 2393 selected checks across 107
  files pass (one fuzz test skipped), plus 97 checks across four files with actual GC.
  Strict new-test typing, scoped lint/format, isolated SDK compilation/eight entry
  checks and browser diagnostic build/seven offline asset checks pass. Fresh 128 MiB
  compiler processes retain 19.4/6.2 MB of JavaScript heap without/with compaction for
  the same 54584-node externals bundle, plus 2.1 MB of packed buffers with compaction.
  This is retained compiler memory evidence, not a total-memory or startup-speed gain.
  The live probe clears the observed externals heap abort above; its 30 s execution
  timeout remains. Next: measure delayed callback and primary graph accounting cost
  at this actual classic bundle gate. Owned artifacts removed; one working build reused.
- Actual maintained externals profiling at 128 MiB attributes 13.9 of 24.6 sampled
  seconds to graph measurement and 7.8 s to GC; createEvalSource is 1.3 s inclusive.
  The deadline probe verifies cleanup data zero and sockets zero, with no readiness/
  join. Measurement-local traversal-frame reuse is rejected and fully removed:
  serial shared-build baseline/candidate runs both stop in the earlier initial
  Script at 30 s, with 189554/188321 step deltas including compilation. Shared CPU
  contention and lower candidate work establish no useful startup gain; source and
  working build are restored. Baseline failures in checkpoint intrinsic expectations
  and microtask-only host-array proof polling are corrected, retaining hash, graph
  and provenance assertions (poe-code a6739d949, ba36236f2). A reproduced 100 ms Node
  reference-oracle startup timeout has a 1 s bound (071584199); SDK/native acceptance
  deadlines stay unchanged. Final 51 checks across those two files and eight restored
  build entry checks pass; candidate preservation also passes 117 checks with actual
  GC. Next: allocation attribution and conservative owned retention summaries,
  preserving mutable/foreign observations and full primary scans during callback
  holds. All temporary validation artifacts removed. Full meeting/media gates remain.
- Maintained SafeJS now shares immutable token/AST source positions only when source
  module graphs select them (poe-code 287924508; no push). Public parser defaults
  retain independent mutable positions. All 2093 selected checks across 100 files
  pass (one fuzz test skipped), including 20 focused allocation/diagnostic/compiler
  budget checks, strict new-test typing, scoped lint/format, isolated SDK compilation
  and eight package entry checks. Separate 128 MiB synthetic compiler processes
  retain 13.7/11.5 MB without/with sharing on 5000 declarations (~16% reduction in
  this measurement). This establishes compiler allocation savings, not Zoom startup
  progress. The subsequent idle-task fix above, rather than position sharing, clears
  the initial Script timeout. Owned validation logs removed;
  one isolated working SDK build retained for reuse. Repeated primary graph accounting
  and full client/Worker compilation at default heap/time remain open, followed by
  admission/presence, sockets and the meeting/media acceptance gates above.
- Opt-in callbackScheduling: "after-prefix" admits later source only after all
  callback prefixes finish; tails preserve data/compilation charges and their own
  rejection ownership. Source stays exclusive. Close/cancellation waits for queued
  work before releasing resources. Classic Scripts preserve intrinsic globals and
  declaration history. Immutable stringCompilation: allow|deny controls eval and
  all four dynamic function constructors. Opt-in classicScriptErrors: report
  preserves state after ordinary escaped Script throws; syntax, budget, cancellation,
  module, callback and unhandled rejection failures remain fatal.
- Verification: 122 selected scheduling/callback/ownership/module checks and 55
  generator/snapshot checks pass; subsequent policy changes pass 133 eval/function
  checks, 137 classic/error/module/nested-callback checks and all 76 scheduling/
  string-policy regressions. SDK builds/eight entry checks, strict new-test typing,
  changed-file lint/new-test formatting and browser build/script lint pass. Actual
  offline Node24 JSPI guest WASM passes five cases in both scheduling modes,
  including string compilation denied and recovery after a Script throw in a
  classic child realm. Cleanup resources/data/depth/pending return to zero.
  Full public Zoom initialization remains open, along with other required scratch
  SDK compatibility/performance fixes. These checks do not establish public Zoom
  or meeting/media readiness.
- WASM compilation CSP is now distinct from string eval: script-src/default-src
  'wasm-unsafe-eval' or 'unsafe-eval' admits WASM; script-src-elem does not grant it.
  Policies intersect and unsupported inputs deny. Document owners and network
  Worker decoding retain the policy. All 223 checks across three manifest-listed
  policy/Worker-fetch files, browser build, strict test typing and lint/format pass.
  Opt-in runtimeOptions.webAssembly: bounded-v1 now installs the guest bridge in
  pages and classic Workers, adds only the required live-buffer grant, inherits
  Blob policy and intersects network response policy. Compilation denial applies
  before native attempts; validation/memory remain available. Worker source limits
  include its WASM bootstrap, and enabled network loaders must supply explicit
  compilation policy. All 277 installer/Worker/runtime checks across four manifest
  files, browser build, strict test typing and changed-file lint/format pass.
  Actual offline PageScripts/DOM/SafeJS/Node24 JSPI verifies allowed/denied WASM in
  pages and Blob Workers with string eval denied and cleanup data/callbacks zero.
  Installation is disabled by default; modern JSPI is required. This does not clear
  Zoom's real imports/initializer, default memory/startup limits or media gates.
- Native WASM owners now provide original validation, stable bounded binary
  instrumentation, declared allocation/import/export admission, compilation leases,
  ordered imports through null-prototype maps, realm invokeCallback dispatch, owned
  memory aliases/growth and metered numeric exports. MVP/reference/bulk-memory forms
  pass; SIMD, threads, GC, exceptions and tail calls reject. Guarded memory.grow
  uses an owned i32 hook, preserves -1 maximum-failure semantics and checks SDK
  quotas before allocation; original memory export handles retain identity. Primary
  SDK scans continue during suspended callbacks. Dense host arguments reject
  accessors/proxies. Borrowed callbacks remain SDK-owned until realm cleanup.
  Eight modules/sixteen attempts/two pending compilations, eight instances/sixteen
  attempts and eight memories/2048 aggregate pages/4096 growth calls bound ownership.
  Compilation credits survive cancellation until native settlement; module credits
  survive close until instance leases release. Close instances before awaiting
  module-owner close. Native compilation is not preemptible; source/metadata and
  table/global slot charges do not measure V8 object/generated-code allocation.
- All 111 focused checks across six manifest-listed native files, browser build,
  strict new/changed-test typing and changed-file lint/format pass. Opt-in actual
  SDK/WASM at 128 MiB passes one/320-page aliases, bidirectional WASM/guest writes,
  JS/native growth and cleanup memory/data/depth zero. Actual Node24 JSPI/SafeJS
  exercises owned compilation/instantiation, callback reentry, growth and cancellation:
  99 steps, depth five, 21039185 retained bytes, cleanup instance/module/lease/memory/
  data/depth/pending zero. CPU fixtures stop at 26 for 25 steps, depth eight and
  1024 sampled deadline checks. Modern Suspending/promising is required; the working
  diagnostic runtime is /tmp/agent-browser-node24-runtime/bin/node v24.14.0 with
  explicit --experimental-wasm-jspi. Default Node v22 rejects with controlled unsupported.
- Current public net.wasm (465602 bytes) admits/compiles with actual SDK budget at
  128 MiB in 61 ms: 21 numeric function imports plus one 320/2048-page memory import,
  a fixed 1026-element table, one mutable i32 global and 41 function exports.
  Guarded output (888011 bytes/205697 checks) validates; native memory.grow and
  table.grow counts are zero. Source/metadata charge 1366307 bytes releases on close,
  as do active requests. Current admission
  rejects reference boundaries, table/global imports, defined memories and native
  table.grow; async start imports reject before guest invocation. The guest bridge
  now provides branded Memory/Module/Instance, original imports/exports reflection,
  validate, compile and both instantiate overloads. Actual offline SafeJS/Node24
  JSPI at 128 MiB verifies synchronous guest results, callback reentry, 320-page
  memory growth/detachment/identity, async overloads and compile/link/runtime-trap
  error brands; 1717 steps/depth eight and cleanup resources/data/depth/pending zero.
  Public net.wasm now also instantiates through the unmodified 18755-unit Emscripten
  glue tail with all 21 real function imports and its 320-page memory; export w's
  initializer completes. Maintained check-zoom-wasm-initialization at Node24 JSPI/
  128 MB, explicit 32 MiB quotas/120 s deadline passes: 39087 steps, 22395140 retained
  units, latest 8.4 s including two public downloads, cleanup owned resources/data/
  requests zero. This isolates the glue tail; complete Worker/page startup and
  later media callbacks remain unverified. No source is rewritten and
  no function imports are stubbed. Native build/script lint/format pass.
  Table/Global wrappers and streaming/custom sections remain absent; page/Worker
  installation is now opt-in. Shared-realm ownership is now fixed in the maintained SDK; reconcile its
  remaining guest compilation/error policies before installation.
  Diagnostic 32 MiB quotas
  do not clear default page 16 MiB/262144-element limits. Next:
  integrated Zoom Worker/page instantiation, initialization performance and
  every joining/admission/presence/roster/chat/audio/transcription/playback/microphone/
  avatar/leaving/cleanup gate. Automations is untouched; no meeting has been joined.

- Child Workers now reuse the bounded native performance clock and user timing:
  monotonic/coarsened now/timeOrigin, marks/measures, isolated JSON details and
  lifetime cleanup. All 556 selected native checks across ten manifest-listed
  files, native build, strict Worker-test typing and changed-file lint/format pass.
  Actual offline PageScripts/DOM/SafeJS at 128 MB/16 s verifies timing, detail
  isolation, clears and termination; cleanup data/page callbacks zero. Full
  Performance prototype tables, resource/navigation timing and observers remain open.
  Maintained SafeJS accepts bounded host-object expandos with guest graph/closure/
  symbol identity, publisher lifetime checks and full retained accounting: 232
  selected checks and the actual 18-check native DOM probe pass. Result-discard
  support honors the native Worker's option without exporting its completion value;
  effects, accounting and fatal errors remain active (15 new/201 existing checks).
  Explicit regex-source/compile allowances now reach 16384/65536, preserving defaults
  4096/16384, flag/depth limits and fatal work/data checks. All 140 selected regex/
  ownership/budget checks and actual native page/Blob Worker 12818-character Unicode
  regex probes pass. Local poe-code commit bd9e4a0bb.
  Controlled SDK execution now yields between nodes after 16 ms as well as 4096
  nodes, preserving FIFO guest ownership and full reconciliation. Three new host-
  turn checks and 199 selected existing scheduling/lifecycle checks pass. Nine nested
  settlement tests retain their result/join assertions with bounded deadlock checks
  instead of requiring completion before the first host turn. Typing/lint/new-test
  formatting, SDK build/eight entries, actual JSPI/WASM reentry/growth/errors and
  allowed/denied page/Blob Worker installation pass; cleanup data/resources zero.
  Local poe-code commit ba19c0538; no push. Individual native calls/scans remain
  nonpreemptible, and host-clock changes retain the node-limit fallback.
  Generic string fields now charge directly during descriptor capture; inert primitive
  fields no longer enter reference snapshots, and leaf-only records allocate no such
  vector. Full reference/symbol/bigint traversal and capture-before-mutation order stay
  active. A host snapshot hook previously reduced a 1000-character field from 1009
  units to 9; the regression now charges 1009 and rejects quota 500. Four new and 210
  selected existing SDK checks, strict typing/lint/format and SDK build/eight entries
  pass. Actual DOM 18 checks at explicit 16 s, five JSPI/WASM reentry/growth/error cases
  and allowed/denied page/Blob Worker installation pass at 128 MiB; cleanup data zero.
  Local poe-code commit 6070c8217; no push. Default 1 s timing remains open: the existing
  DOM bootstrap measured 2.7 s before 1.2 s of fixture code at the diagnostic allowance.
  Secondary escaping-ticket ownership now scans only when accounting is unheld and an
  included ticket has a positive staged charge. Hold state is checked after the full
  primary walk; captures can acquire or release the last hold. Primary limits, held
  ticket ownership, forwarding and unheld escaping transfers remain active. Five of
  six new cases fail on baseline; all 252 selected SDK checks, strict typing/lint/new-
  test formatting and SDK build/eight entries pass. Actual JSPI/WASM reentry/growth/
  errors and allowed/denied page/Blob Worker installation pass; cleanup data/resources
  zero. Local poe-code commit 7b3e2d0fe; no push. Metadata providers must not depend on
  optional ownership scans for side effects. This establishes less duplicate capture
  work, not a public startup speedup.
  Intrinsic retention caches now ignore unrelated function-table writes. A weak
  membership set identifies captured tables; their writes, registered prototype
  changes and baseline completion still invalidate caches. Other table revisions,
  live descendant accounting and conservative restored-table scans stay active.
  Baseline fails the new cache-reuse contract; all four new and 116 selected existing
  checks pass, with strict test typing, scoped lint/format and SDK build/eight entries.
  Actual five-case JSPI/WASM and allowed/denied page/Blob Worker installation pass
  at diagnostic allowances; cleanup data/resources zero. Local poe-code commit
  21cb74d71; no push. No public startup speedup is established.
  Public net_thread.min.js (390978 units) clears parent setup and enters its child,
  but source completion/readiness still fails. Latest exact-build 30 s run settles at
  30206 ms / 887566 shared steps with AgentBrowserError timeout; outer wait does not
  expire first. A subsequent exact-build 120 s diagnostic still fails source
  completion at 120457 ms / 900405 shared steps with no status messages; cleanup
  data/page callbacks/active requests zero on both. Earlier instrumented
  baseline controls varied from 2696 to 7081 child graph passes; no startup speedup is
  established. Earlier rejected string-field/frozen-symbol variants remain discarded. A coarse
  8 MiB allocation sample including collected objects estimates 28.8 GB total churn:
  visitor 12.6 GB, scope-root vectors 3.3 GB and closure-root vectors 1.6 GB. The finer
  profile exhausted the heap during export after Worker cleanup; no profile retained.
  Scope-root instrumentation counted 22.7 million calls but only two distinct name
  arrays (168 slots); name-array caching alone is unlikely to resolve startup cost.
  Zoom's wrapper overrides the glue's fetch path and asks its parent to download
  WASM with status 30 / DOWNLOAD_WASM_FROM_MAIN_THREAD_OK. The default 65536-byte
  Worker message/transfer cap cannot carry net.wasm's 465602 bytes; its default
  aggregate queue also caps at 262144 units. The opt-in binary policy below now
  admits that payload. Next: connect the parent download protocol and reduce
  binary snapshot/primary root collection/capture allocation cost
  without caching mutable descendants, then integrated initialization and every
  meeting/media gate. Diagnostic allowances clear no default startup or notetaker gate.

- Maintained SafeJS now uses object/symbol identities directly in scope accounting
  groups instead of extra cell projections; strings/bigints retain per-cell roots.
  Old/new charged values both invalidate groups, preserving object-to-primitive
  replacement, aliases, historical snapshots, copy destinations and held quotas.
  This ports the existing direct-scope-reference-roots contribution into poe-code.
  Two baseline identity contracts fail; eight preservation cases pass both.
  All 157 selected SDK checks across 15 files, strict new-test typing, scoped lint/
  new-test format and SDK build/eight entry checks pass. Actual JSPI/WASM five-case
  guest APIs pass under exclusive/after-prefix scheduling (1717 steps, 21040407
  units); public real imports/initializer passes (39087 steps, 22395140 units,
  8.8 s). Cleanup resources/data/requests zero. Local poe-code commit 973937536;
  no push. Serial full Worker baseline 30354 ms / 884264 steps versus candidate
  30155 ms / 885686 establishes no useful startup gain: both timeout before source
  completion/status messages with cleanup zero. The full mission remains open.
  Temporary execution-location attribution on the candidate records 11626 nodes /
  11655 reconciliation calls taking 28.6 s; source samples advance through early
  bundled module/helper code, with no download-status message or established new
  API/loop failure. Instrumented run times out at 30325 ms / 886265 steps, cleanup
  zero. Exact compiled restoration is verified and the ephemeral probe is removed.
  Next: repeated graph traversal across node checkpoints, preserving fresh foreign
  observations, primary quota/depth enforcement and cancellation. Scope carrier
  reuse and accounting-only omission remain unsafe without provenance guarantees.

- Maintained SafeJS now reuses immutable descriptors and scalar string charges for
  privately owned, revision-tracked property tables. Writes/deletes retire snapshots;
  descendants, symbols, prototypes, bigint conversions and accessor captures remain
  fresh. Foreign proxies/restored tables keep conservative scans. Pinned native
  operations prevent backing/cache escape through later hooks or inherited setters.
  Two baseline failures reproduce; all 180 selected SDK checks across 18 files,
  strict new-test typing, scoped lint/format and SDK build/eight entry checks pass.
  Actual quota/deletion/GC, five-case after-prefix JSPI/WASM and page/Blob Worker
  compilation-policy probes pass; cleanup zero. Public real-import/export-w
  initializer passes in 8.3 s / 39087 steps / 22395140 units with cleanup zero.
  Local poe-code commit 843951a9f; no push. Warm table/mixed fixtures retain identical
  42000/98000 units with roughly 17%/20% less CPU. Serial full Worker baseline
  30404 ms / 886789 steps versus candidate 30466 ms / 883026 establishes no useful
  startup gain; neither completes source or emits statuses, both clean up at zero.
  A temporary census counts 72.8 million entries, 38.1 million already-seen objects
  and 36.2 million capture yields across 12429 measurements. Counters establish
  traversal volume, not cache safety. Instrumentation restored; probes removed.
  Next: reduce repeated capture/graph traversal across checkpoints while preserving
  fresh observations and complete primary limits. Full startup/defaults and every
  meeting/media acceptance gate remain open.

- Current full-Worker capture census counts 4.42 million interpreted scope reads;
  3.83 million (86.6%) repeat a scope within one measurement. Across 11064 scans,
  captures yield 20.87 million objects and 8.75 million primitives; 1.52 million
  of 2.87 million generic records use owned property snapshots. The instrumented
  run times out with no statuses; cleanup zero, exact compiled restoration verified
  and probe removed. Counts establish availability, not safe capture reuse.
  Maintained SafeJS scope accounting now uses a frozen facade over a private map
  with pinned methods; registration discards the raw-map return. Both baseline
  hook-exposure cases erase a 1000-unit charge to zero. Four new and 101 selected
  existing checks, strict new-test typing, scoped lint/format and SDK build/eight
  entries pass. Same-walk replacement, historical roots, descendants, snapshots
  and held quotas remain live. Actual five-case after-prefix JSPI/WASM passes with
  cleanup zero. Local poe-code commit b0896b207; no push. Final exact-build Worker
  still times out at 30206 ms / 887566 steps with no completion/status and cleanup
  zero; no useful startup gain established. Registry escape is closed, but carrier/
  ancestor/provider provenance remains necessary before sharing capture lists.
  Full startup/default limits and every meeting/media acceptance gate remain open.

- Ordinary guest-literal tracking and owned symbol-key reuse are rejected and
  removed. Literal tracking passes 130 selected checks but regresses warm CPU
  0.282 to 0.397 ms and fails actual parent setup with TypeError before child entry.
  Symbol reuse passes 95 selected checks and retains 42000 warm units at CPU
  0.829 to 0.718 ms, but full Worker completion/status still fails. Shadow execution
  counters reach 11703 control versus 8904 candidate nodes; no useful live gain is
  established. A proxy-gated follow-up is inconclusive: heavy concurrent load and
  another workspace build deleting SDK output invalidate that comparison.
  Three SDK source files match HEAD; owned compiled modules are restored from an
  isolated baseline compiler output, with all eight import checks passing. Actual
  five-case JSPI/WASM and real public imports/initializer pass on that isolated
  baseline, cleanup zero. Initializer 39087 steps / 22395140 units is unchanged;
  loaded-host time is 53.7 s versus earlier 8.3 s, not a performance comparison.
  All candidate tests/probes/build snapshots removed; unrelated work preserved.
  Next: private interpreter capture ownership with conservative foreign-frame
  fallback, rather than further table/dispatcher tweaks. Use isolated output for
  runtime probes during concurrent builds. Every startup/join/media gate stays open.
  Maintained SafeJS binding cells now use private storage with pinned native
  operations/iterator advancement; private entry tuples use indexed reads,
  hydration avoids caller Array.map callbacks, and cells have null prototypes.
  Nine reproduced host-hook escapes let a 3-unit cached binding retain 1003 units.
  Thirteen ownership checks plus 89 existing scope/accounting checks, strict test
  typing, scoped lint/format, isolated SDK compilation and eight import checks pass.
  Actual five-case JSPI/WASM and real public imports/initializer pass, cleanup zero;
  initializer remains 39087 steps / 22395140 units. Full Worker still times out at
  30048 ms / 879429 steps with no completion/status, cleanup zero. Local poe-code
  commit 98864fd9e; no push or startup gain claimed. Private binding accounting
  vectors now use pinned own-index writes, immutable lists/records and indexed
  measurement; one optional group replaces the cached singleton wrapper array.
  Three reproduced late push/iterator/inherited-field cases erase 1000 units to
  zero. Four new and 92 selected existing checks, strict test typing, scoped lint/
  format, isolated compilation/eight imports pass (poe-code d3f172469; no push).
  Actual five-case JSPI/WASM passes serially at original limits after a concurrent
  run stops before its last two cases; real public initializer passes at unchanged
  39087 steps / 22395140 units, cleanup zero. Loaded 30 s Worker times out in parent
  setup at 448446 steps; serial 120 s diagnostic parent succeeds, child still times
  out at 120658 ms / 881068 steps without completion/status, cleanup zero. No useful
  startup gain established. Carrier/ancestor/provider ownership remains open
  before whole-frame capture reuse; retain fresh foreign-frame reads.
  Maintained SafeJS protects frozen SDK closure symbol keys and private weak visit
  generations (poe-code b2c09d20f / 9e95e10dc, no push). Descendants/classification,
  foreign frames and full primary limits stay fresh; nested walks remain isolated.
  Latest instrumented Worker diagnostic performs 9226 graph walks / 42.8 M visits,
  with 28.2 s in measurement; GC takes 25.8% of CPU samples. Separate type counts put
  closures at 62% of newly visited objects. Function and generator captures now use
  one fresh collector across native ancestors; overridden collectors are copied.
  Short vectors start with own slots; overflow/extra captures use pinned definitions.
  Ancestors, context carriers and metadata stay live; no whole-frame capture reuse.
  Baseline iterator hook drops 1002 units to 1; child capture also mutates a foreign
  parent's reused vector. Ten guards include same-walk changes, iterator errors and
  the rejected candidate's setter/getter charge loss (4 to 1). All 389 selected
  checks, strict test typing, scoped lint/new-test format, isolated compilation/eight
  imports pass (poe-code 6576531f9, no push). Final 400-function scans keep 2460 units:
  CPU 0.285/0.292 ms control versus 0.240/0.231 ms candidate (16–21% reduction), GC
  collections 39/39 versus 16/16. Actual five-case JSPI/WASM and public initializer
  pass at unchanged totals, cleanup zero; initializer takes 14.1 s on this loaded run.
  Full Worker still times out at 30279 ms / 881108 steps, parent success, no completion/
  status and cleanup zero. No useful actual startup gain established. Further
  experiments rejected: uncurried WeakMap calls do not improve full scans; wrapping
  literals in native Proxies breaks host copying; fresh bulk literal descriptors and
  a reusable Set registry are slower on representative scans. All candidate edits
  removed; no new SDK commit. Per-source AST traces locate ongoing Webpack module/
  export initialization in the 286-factory public Worker bundle, not parent cleanup.
  Unchanged Worker profile times out at 30815 ms / 879192 steps, parent success,
  no completion/status and cleanup zero. Of roughly 40 s sampled startup time,
  GC accounts for 14.9 s and recursive graph visits 11.4 s; closure root append/
  collection remains visible. Native function/generator root vectors now use indexed
  measurement via a protected weak ownership registry; caller-provided collectors
  retain iterator observations/errors. A reproduced late iterator hook erases 1001
  units to 1 on baseline. Five native function variants retain charges and reject
  a 500-unit limit even during reconciliation holds. All 129 selected checks across
  12 files, strict test typing, scoped lint/format, isolated build/eight imports pass
  (poe-code 7d25bb8a0, no push). Actual five-case JSPI/WASM and public initializer
  pass at unchanged totals with zero cleanup; initializer takes 9.0 s on this run.
  Full Worker still times out at 30705 ms / 881869 steps, parent success, no completion/
  status, cleanup zero. No useful startup gain claimed. Owned builds, profiles and
  probes removed. Next: reduce closure-capture allocation and redundant graph work
  without cross-walk caching of mutable/foreign objects or weakening full primary scans.
  Full startup/default limits and all joining/meeting/media gates remain open.

- Maintained SafeJS now releases the creating invocation's unused callee from
  closure contexts (poe-code 35db94b46, no push). Five baseline explicit-GC failures
  become collections in the compiled SDK; retained closures still return 7 at
  unchanged 26 units, while intentional self capture retains/accounts for 60081 units.
  Twelve new regressions, strict typing, lint/format, isolated build/eight imports
  pass. Initial broader validation passed 179/180 checks; the remaining Promise-
  subclass constructor timeout was reproduced without the runtime change. It was
  a fixture lifecycle error: run() finishes its queue before raw closure invocation.
  The snapshot fixture now keeps a live interpreter queue through invocation and
  restore (poe-code 057a1b2b2, no push). All 184 selected checks across 17 files pass
  with explicit GC, strict test typing and scoped lint/new-test formatting. Four
  live-realm checks verify subclass aggregate settlement, pending callback cancellation,
  closed-realm revocation and zero cleanup data in both scheduling modes. No production
  Promise lifecycle repair is indicated by this fixture. Offline five-case JSPI/WASM
  and public initializer previously passed with unchanged totals/zero cleanup;
  loaded initializer 16.8 s. Full Worker still times out at 30317 ms / 880694 steps,
  parent success, no completion/status, cleanup zero. No startup/join gain claimed;
  owned validation artifacts removed. Next: reduce full graph-accounting cost while
  preserving mutable descendant scans, held quotas and callback ownership.

- Maintained SafeJS now walks record/array descendants and transparent scope roots
  off the native stack (poe-code 92a70d7a2, no push). Actual compiled default-stack
  plain/scoped 1024-level graphs measure 6145 units instead of baseline RangeError;
  level 1025 rejects with dataDepth. Ordered children, descriptor observations,
  callback mutations and cycles remain covered. Pinned continuation writes prevent
  a reproduced late Array.push hook from erasing 1019 units to 13. All 111 selected
  checks across 14 files pass with explicit GC; strict test typing, scoped lint/format,
  isolated build/eight imports, offline five-case JSPI/WASM and public initializer
  pass, cleanup zero. Full Worker still times out at 30480 ms / 883532 steps with
  no source completion/status; no useful startup gain claimed. Private capture-buffer
  pooling was rejected and removed after no Worker gain. Working compiled values
  are refreshed; owned temporary probes/builds removed. Next: reduce repeated
  graph-wide accounting work without weakening mutable/foreign scans or held quotas.

- Maintained SafeJS now omits already visited native capture roots using only the
  current walk's protected visited set (poe-code 1e5539b49, no push). Every scope,
  provider and metadata read remains live; unseen captures are collected before
  descendants, public snapshots remain independent and held primary scans remain
  active. All 235 selected checks across 23 files pass with explicit GC, strict test
  typing, scoped lint/format, isolated SDK build/eight imports and actual offline
  JSPI/WASM/public initializer; totals unchanged and cleanup zero. Allocation sampling
  on a 286-function fixture falls from about 148 MB to 88 MB over 2000 walks at
  unchanged 1321 units; scope-vector samples fall to zero. This is fixture evidence,
  not a startup acceptance pass. Serial Worker baseline/candidate still time out at
  30013/30203 ms and 879843/880714 steps, no completion/status, cleanup zero. Working
  compiled modules refreshed; owned probes/builds removed. Next: independently prove
  scope/provider ownership before reducing repeated metadata reads, and reduce
  ordinary-record descriptor churn without losing mutation or foreign observations.

- Worker messages now accept bounded ArrayBuffer transfer lists (legacy sequence or
  options.transfer iterable), using SafeJS structuredClone for serialization and
  sender detachment. Up to 64 entries/65536 initial buffer bytes are admitted;
  existing message/queue/shared-budget limits remain active. All 365 selected native
  checks across eight manifest-listed files, native build, strict Worker-test typing
  and Worker lint/format pass. Real offline PageScripts/DOM/SafeJS at 128 MB/16 s
  verifies transfers in both directions, view aliases, getter-once/final-byte behavior
  and invalid-list/serialization rejection preserving donors; cleanup data/callbacks
  zero. MessagePort, streams and media-object transfers remain unsupported. The
  native realm bridge still copies bytes; this is ownership semantics, not zero-copy.
  Custom graph/queue limits can reject after successful serialization/detachment.
  Opt-in runtimeOptions.workerBinaryMessages: "bounded-v1" now admits up to 1 MiB
  of distinct backing buffers per message and 4 MiB of aggregate queue units in
  both directions. Graph units still cap at 65536 per message; depth, transfer count,
  shared-budget admission, packet lifetime and defaults remain active. Three new
  delivery/queue cases fail on baseline. All 473 selected native checks across nine
  manifest-listed files, native build, strict changed-test typing and lint/format
  pass, covering oversize buffers/graphs, native getter spoofing, shared-budget
  rejection, malformed policies and termination credits. Actual offline native
  PageScripts/Blob Worker/SafeJS at 128 MB verifies default donor preservation,
  ordinary copying and transfers of 465602 bytes, bidirectional byte/view aliases,
  detachment and cleanup data/pending callbacks zero. Explicit 1048577-element
  allowance and 120 s deadline are diagnostic: enabled round trips take 48.0/61.2 s;
  the initial 16 s attempt times out. Default elements/startup and full Zoom
  parent-download/Worker initialization gates remain open. Sandbox-bound typed-array
  snapshots now use maintained SafeJS metadata tracking, preserving aliases, mutable
  property/symbol charges, resizable layouts, quotas and native outbound BufferSources.
  Four new baseline failures reproduce; all 407 selected SDK checks across 22 files,
  strict new-test typing, scoped lint/format and SDK build/eight entries pass. Serial
  exact-build binary round trips improve from control copy/transfer 56.8/42.9 s to
  candidate 7.4/8.0 s with identical steps/data/results and cleanup zero. Actual
  JSPI/WASM boundary and compilation-policy probes pass; public isolated imports/
  initializer passes, but full public Worker still times out before source completion
  or status 30 (30374 ms / 886585 shared steps). This establishes local binary-delivery
  improvement, not full Zoom startup readiness. Local poe-code commit 9b92df736;
  no push. A separate isolated actual Blob Worker runs the unchanged 1725-unit
  Zoom download handler and 18774-unit glue including createWasm/run: status 30,
  parent host download/transfer of 465602 bytes, donor detachment and real 20 MiB
  WASM initialization pass in 46.8 s / 606982 steps / 22980579 retained units.
  Actual diagnostics DS/DE and cleanup data/callbacks/active requests zero. Explicit
  32 MiB quotas/120 s deadline remain diagnostic; the rest of the full Worker is
  omitted, and only its diagnostic logger is supplied by the fixture. Parent bytes
  come from restricted host transport, not guest fetch. The subsequent maintained
  check-zoom-worker-wasm-handshake now clears isolated actual page fetch/CORS,
  Worker transfer and real glue initialization at Node24 JSPI/128 MiB: 59.4 s /
  616192 steps / 22993069 retained units, status 30 then DS/DE, donor zero and
  20971520 memory bytes. Streaming accounting observes 167312 encoded/465602 decoded
  bytes with no unmetered failure; cleanup data/callbacks/retained response bytes/
  active requests zero. Complete Worker/client startup and every meeting/media
  acceptance gate remain open; explicit 32 MiB quotas/120 s deadline clear no
  defaults. Primary retained-root/capture allocation cost remains the startup target.
  Public current net_thread.min.js fetch succeeds (390978 units); instrumented actual
  source runs in a native Worker at 128 MB with the application profile, then hits its
  30 s initialization deadline at 493789 shared steps before the diagnostic marker.
  One request, no socket API, cleanup data/page callbacks/active requests zero. A
  second 128 MB/30 s CPU-profiled run also times out (493639 shared steps): about
  26.0 sampled seconds are in retained-data reconciliation, including 24.8 in graph
  measurement. The next startup target is this full accounting cost; preserve
  primary scans, quota/depth enforcement and cancellation. Profile artifacts removed.
  This proves neither source initialization nor any Zoom/media acceptance gate.

- PageFetch now accepts an explicit maxResponseBytes override up to 1 MiB while
  retaining its 256 KiB default and all other ceilings. Existing PageBindingOptions
  fetchLimits carry this opt-in; no dependency or additional policy field is needed.
  Three new baseline failures reproduce. All 275 selected native fetch checks across
  ten manifest-listed files, strict changed-test typing, native build and scoped
  lint/format pass. Coverage preserves exact binary bytes, transport limit forwarding,
  the 1 MiB boundary/oversize rejection, malformed limit rejection, clone retention
  and cumulative quotas. Local browser commit 9bfc3bc; no push. Actual public Zoom
  Worker fetch handshake above passes separately; full Worker/page readiness does not.

- Child Workers now publish the document's validated userAgent/language/languages
  profile as a frozen guest snapshot with WorkerNavigator toString branding. The
  profile is pinned by the Worker owner, uses the same identity as page/HTTP requests
  and exposes no credentials or media devices. All 74 selected native checks across
  four manifest-listed files, native build, strict Worker-test typing and Worker
  lint/format pass. Actual offline PageScripts/DOM/SafeJS at 128 MB/16 s verifies
  custom identity, frozen snapshots, Worker-to-DOM delivery/termination and cleanup
  data/page callbacks zero. This is a three-field subset; WorkerNavigator constructor/
  prototype tables, other navigator APIs and all Zoom/media acceptance remain open.

- Classic Workers now support synchronous sequential importScripts through SafeJS
  nested evaluation, HTTP(S) imports with child script-src/default-src admission,
  redirect checks and same-origin credentials, plus owned JavaScript Blob imports.
  Imported response CSP does not replace the Worker policy. Child Blob/URL reuse
  the bounded native primitives; imports enforce argument/lifetime/depth/source
  limits, retained-source credits, cancellation and deadlines. Per-realm message
  delivery lets the parent terminate a child waiting for an import while preserving
  task order within each realm. Real offline SafeJS at 128 MB/16 s verifies nested
  imports, child Blob execution, errors, timeout/budget failure, parent termination
  during pending imports and actual PageScripts/DOM allowed/denied inherited CSP;
  cleanup tracked data/page callbacks return to zero. All 358 selected native checks
  across eight manifest-listed files and native build pass; strict new-test typing
  and new Worker/import/fetch lint/format pass.
  Blob storage has separate bounded native limits; it is not fully credited to the
  shared SafeJS budget. Nonce/strict-dynamic import policies use conservative URL
  matching; sharing Blob URLs between sibling Workers is unsupported. Classic
  same-origin entry loading, worker-src, cookies/lifetime and response CSP remain
  verified. Current Zoom media assets use Blob Workers/importScripts; native fetch
  decoded net_thread.min.js; the later instrumented execution times out above. Module
  workers, MessagePort transfers, full WorkerNavigator, WebAssembly, media and every
  default/live Zoom initialization/join/
  notetaker gate remain open. Automations is untouched; no meeting has been joined.

- Blob classic Workers now use isolated, cooperative SafeJS realms with a shared
  budget, copied bounded messages, timers, CSP fallback, self-close/termination and
  page cleanup. Compatible sibling-realm SDK leases and after-prefix scheduling
  are required; these are not OS threads. Queues retain memory credits until
  callback completion, charge complete backing buffers/RegExp source and enforce
  active/lifetime quotas. Native tests reject hostile native accessors/proxies.
  All 475 selected native checks across nine manifest-listed files and native build
  pass; strict new-test typing, Worker/CSP lint and format pass. Offline real SafeJS
  at 128 MB/16 s verifies isolation/global-scope branding, copied bytes, timer
  receivers, allowed/denied Worker CSP, bounds and suspended
  callback termination/page cleanup; tracked data/callbacks return to zero. Source,
  message-callback and timer step-budget exhaustion close the whole page and release
  tracked data to zero. These diagnostic allowances clear no default timing gate.
  Module workers, MessagePort transfers, full EventTarget/MessageEvent branding, child
  navigator APIs, WebAssembly and media remain unsupported; importScripts, child
  Blob/URL and the three-field navigator identity subset are verified above.
  Default timing, live initialization/readiness/join and every notetaker gate remain
  open. Working Automations is untouched; no meeting has been joined.

- Explicit SafeJS budget views now lease sibling realms without resetting quotas
  or sharing globals/prototype caches; ordinary reentry/reset and duplicate-view
  guards remain active. Contribution: safejs-shared-realm-compile-lease.patch.
  Ten new regressions and the formerly failing shared-policy check pass. 294 SDK
  checks across 17 files pass; three joined-callback timeouts reproduce on original
  source. Strict core/new-test typing and scoped build pass; patch roundtrip exact.
  Compiled 128 MB/16 s offline fixture executes Blob-generated child code beside
  the native page, isolates globals, copies bytes, shares limits and cleans data/
  callbacks to zero. SDK source/build/tests retained; temporary probes removed.
  Page classic Blob/network Worker and import APIs are verified above; module
  Worker loading, MessagePort transfers, WebAssembly, media and every Zoom/notetaker
  gate remain open.

- Page-owned Blob/object URL primitives now provide immutable UTF-8/buffer-view/blob
  parts, bounded storage/work, slice/text/arrayBuffer/bytes, trusted origin URLs,
  snapshot resolution, revocation and cleanup. 194 selected native checks across
  four manifest-listed files and native build pass. Broader adapter selection:
  323 checks pass, two pre-existing manifest/retention expectations fail identically
  with the original window implementation. Offline real SafeJS at 128 MB passes
  Unicode, view/copy, slicing, branding and URL origin; cleanup data/pending zero.
  The diagnostic uses 16 s: its first default 1 s initialization attempt times out,
  so default timing reliability remains open. Blob records have a page-lifetime
  count limit; SafeJS array/data limits also bound binary conversion. Blob.stream,
  blob fetch/image consumers, module Worker and every Zoom/media
  gate remain open. These primitives establish no initialization/readiness/join capability.

- Nine-classification shared metadata records are rejected and reverted: revised
  candidate passes 327 SDK checks across 35 files, strict typing and scoped build.
  Four prototype/classifier freshness cases fail the initial candidate and pass
  the revision/original; four earlier mutation/reentry checks also pass original.
  Compiled default-stack/128 MB scope/record fixtures preserve 2030 / 12932 units,
  all 364000 provider calls, held quotas and weak/deletion GC. Warmed medians:
  0.411 / 0.418 ms candidate versus 0.448 / 0.560 ms control. Serial live 384 MB
  both pass 13 classics, prepare seven modules, revoke at the 120 s import deadline,
  attempt zero sockets and clean up at data zero (exit 1), without readiness/join.
  Last progress 9021958 / 9021875 steps at different observation times establishes
  no useful initialization gain. Original nine source files/rebuilt emission match
  exactly; candidate helpers/tests/patch/configs/probes/logs are removed.
  Separate private-field root layout is rejected before SDK edits: root-only median
  11.15 versus 9.75 ms and mixed 42.15 versus 28.49 ms (10000 roots, 100 scans).
  Opaque fields/prototypes and proxy isolation survive, but lookup cost regresses;
  probe removed. Full graph cost and every default/join/media gate remain open.

- Deep untracked symbol/private metadata and foreign proxy symbol chains now
  suspend traversal at depth 128: depth 1024 measures correctly, depth 1025 rejects
  with dataDepth, and held primary quotas remain active. Fresh providers, live
  private iterators, frozen symbol catalogue changes and pre-metadata array/resource
  snapshots preserve ordering. Contribution: safejs-generic-metadata-data-walk.patch.
  All 171 selected SDK checks across 24 files, strict core/new-test typing and scoped
  build pass; baseline fails seven depth/quota regressions and passes 11 preservation
  checks. Compiled default-stack/128 MB probes pass (2054 symbol/proxy / 1042 private
  units), including fresh captures and held quota rejection. New-test lint/format
  passes; three source lint warnings match baseline. Patch forward/reverse is exact.
  Serial live 384 MB candidate/control both pass 13 classics, prepare seven modules,
  revoke at the 120 s import deadline, attempt zero sockets and clean up at data zero
  (exit 1), without readiness/join. Vendor CPU is 63.25 / 57.53 s in this pair;
  prior controls vary, so no absence of live performance regression is established.
  A warmed 2000-closure fixture preserves 12933 units/all provider calls and measures
  0.645 / 0.767 ms medians; this proves no live speedup. Candidate source/build/tests
  are retained, owned probes terminate and temporary validation artifacts are removed.
  Default Zoom heap/time, readiness/join and every media gate remain open.

- Desktop module census observes 3703 top-level function declarations created
  with no lookup/copy/snapshot/frame reads before deadline (webclient 1, loginview
  2049, editor 1363, lodash 124, i18n 166). An exported-function fixture verifies
  that observed lookup/snapshot reads are counted. No capture accounting is skipped.
  Module-only physical declaration deferral is rejected and reverted: 178 selected
  SDK checks across 18 files and strict core/new-test typing/scoped build pass;
  baseline fails the physical-deferral regression and passes three preservation
  checks. Serial candidate/control at 384 MB both pass 13 classics, prepare seven
  modules, revoke at the 120 s import deadline, attempt zero sockets and clean up
  at data zero (exit 1). Last observed progress is 9015051 / 9013085 steps and
  12811623 / 12811479 data units; differing observation times prove no speedup.
  No useful initialization gain is established; candidate source-reference capture
  coverage also remains incomplete. Original six source files and rebuilt compiled
  control are restored exactly; temporary tests/configs/backups/logs are removed.
  Default heap/time, readiness/join and every media gate remain open.

- Desktop late-graph census keeps all reconciliation/callback checks active:
  final two 30 s measurement windows have 47.79% / 45.82% repeated object entries,
  69.65% / 66.57% closures among fresh objects, and 95.40% / 95.25% already-seen
  object roots returned by captures. Capture-check output averages about 1.3 roots
  per closure visit (including empty output when no provider exists); this bounds
  the aggregate entry reduction available from grouping that output.
  Max measurement reaches 22614 entries / 8536 fresh objects. Instrumented 384 MB
  live run passes 13 classics, prepares seven modules and revokes at the 120 s
  deadline: HTTP 200, zero sockets, no readiness/join, cleanup data zero, exit 1.
  Counts identify structure, not cache safety or a speedup. Fresh descriptor/provider
  and held-quota sanity pass; compiled visitor is restored byte-for-byte.

- Independent allocation maps for frozen closure records are rejected and reverted.
  Factory closures have dictionary storage after the first instance; a fresh
  constructor per instance retains fast storage without changing plain prototypes,
  unique borrowed getters or own frozen descriptors. Twenty candidate checks across
  three files pass, including inherited-setter isolation; scoped compilation passes.
  But 10000 closures retain 18514520 heap bytes candidate versus 10273752 / 10274104
  serial controls (about 80% more); accounted units match at 20015. Warmed measurement
  is 5.20 ms versus 3.92 / 3.50 ms controls. No live candidate run is warranted by
  these regressions. Thirty-five baseline checks pass with the same two existing
  deep-copy failures reproduced. Original source and scoped rebuilt visitor match
  saved bytes; owned probes terminate and all temporary tests/configs/logs are removed.
  No new initialization, heap/time, join or media gate is cleared. Continue toward
  reducing full-graph cost with explicit mutation provenance and fresh volatile effects.

- Deep SDK-owned property-table metadata now uses suspended DFS continuations:
  tracked symbol/private-field and prototype chains measure through depth 1024 and
  reject depth 1025 with dataDepth on the default stack. Fresh callbacks, descriptor
  capture order, live private-slot iteration and primary held limits stay active.
  Contribution: safejs-tracked-metadata-data-walk.patch. All 169 selected SDK checks
  across 22 files pass; scoped core build and compiled default-stack/128 MB probes
  pass (2054 symbol / 1042 private / 1025 prototype units, excessive-depth and held
  quota rejection). Live 384 MB: HTTP 200, 13 classics pass, seven modules prepared,
  deadline revocation, zero sockets, no readiness/join, cleanup data zero, exit 1.
  Strict core/new-test typing and byte-exact patch forward/reverse pass; new-test
  format/lint passes, with only three reproduced baseline source lint warnings.
  Owned probes terminate and temporary validation inputs/logs are removed.
  This is a correctness fix; no speedup or default Zoom gate is established.
  The later generic-metadata fix above covers untracked/foreign symbol chains;
  untracked prototypes and other graph edges remain open.

- Shallow recursive child traversal is rejected and reverted: avoiding continuation
  allocation below depth 16 passed 125 selected SDK preservation checks across 18
  files and scoped compilation, but supplied no useful live initialization gain.
  Serial candidate/control at 384 MB both pass 13 classics, prepare seven modules,
  revoke at the 120 s import deadline, report zero sockets and clean up at data zero.
  Vendor CPU is 55.95 s candidate versus 54.10 s control; last observed progress is
  9011089 versus 9013560 steps (observation timing is not an exact speed measure).
  Full primary graph walking remains the cost target. Exact source baseline and
  rebuilt baseline are retained; both probes terminate and temporary inputs are removed.
  No default heap/time/readiness/join/media gate is cleared.

- Desktop CPU profiling at 384 MB confirms retained-graph measurement dominates
  late initialization: 95.97% of weighted samples in the final 28 s window (excluding
  the final 2 s). Visitor self time is 53.09%, private/symbol inspection 9.38%,
  scope-root validation 8.66%, and interpreted capture-provider self time 7.05%.
  Next target: visitor/property inspection and repeated traversal work, preserving
  fresh provider/metadata effects, DFS ordering and primary limits during holds;
  scope snapshot sharing alone addresses a smaller share. This is attribution,
  not a speedup. HTTP 200 / 13 classics / seven prepared modules, deadline revocation
  at 120 s, zero socket attempts, cleanup data zero and terminal exit 1 verified.
  The profiled 192 MB run instead exhausts heap after seven prepare (exit 134),
  with cleanup unverified; the earlier unprofiled clean exit proves no reliable
  192 MB gate. No code/build changes or initialization/join acceptance. Both probes
  terminate; the profile and analysis script are removed.

- Compact AST lazy records now allocate through a constructor per accessor layout,
  preserving Object.prototype, and keep nodeId as a mutable nonenumerable data
  field from creation. Contribution: safejs-compact-record-layouts.patch. This
  avoids dictionary property storage observed on the earlier shared allocation path.
  Exact seven-module offline linking at 128 MB retains 87978000 heap bytes versus
  98158576 control (about 10.2 MB / 10.4% saved). All seven packed-code fingerprints
  match, including IDs/spans, scalar/type tables and import/export metadata; decoded
  counts, 63562723 code-buffer bytes, 8353220 steps and 5965045 current units match.
  All 175 selected SDK checks across 12 files, scoped core compilation, changed-source
  format/lint and byte-exact patch forward/reverse checks pass. Native source/build
  stays unchanged. The live 192 MB diagnostic passes 13 classics and prepares seven
  modules, then revokes at the 120 s import deadline without OOM; HTTP 200, zero socket
  attempts, no readiness/join, cleanup data zero and terminal exit 1 verified.
  This clears no default 128 MB/30 s initialization or meeting/media gate. Repeated
  capture/accounting traversal remains the initialization performance target.
  Identifier-laziness variants increased offline heap by about 24.7 MB with markers
  and 8.9 MB without markers; both are rejected and reverted. Changing ID descriptors
  alone produced no useful saving. All owned probes terminate; temporary inputs,
  candidates, drivers, configs and backups are removed.

- Finished compact AST storage now releases its parser-only persistent-boundary
  bookkeeping set; runtime lazy-boundary and decoded-identity storage stay intact.
  Contribution: safejs-release-parser-boundaries.patch. Exact seven-module offline
  linking at 128 MB retains 97923784 heap bytes versus 100027232 control (about
  2.1 MB saved), with identical 63562723 code-buffer bytes, materialized-record
  counts, 8353220 steps and 5965045 current units. All 137 selected SDK checks across
  nine files, scoped core compilation, changed-source format/lint and byte-exact
  patch forward/reverse checks pass. No native source/build changes were needed.
  The live 192 MB diagnostic passes all 13 classics and prepares seven modules,
  then exhausts heap (exit 134); cleanup/socket state is unverified. This modest
  offline saving clears no default heap/time/readiness/join/media gate. A separate
  lazy parameter-default candidate decoded 1788 fewer graph records but retained
  effectively the same heap; it is rejected and reverted. All owned probes terminate;
  temporary assets, configs, drivers, candidate tests and backups are removed.

- Dynamic imports now have an opt-in SDK elapsed host-time deadline independent of
  the originating classic task. Contribution: safejs-source-import-deadlines.patch.
  The native module adapter requires the immutable policy and uses the page execution
  timeout per import; expiry revokes the realm, including shared/cyclic module work.
  Deadlines cover resolution through evaluation/TLA and are cleared on settlement or
  revocation. Cancellation is cooperative; synchronous host work can delay delivery.
  21 SDK deadline contracts and 144 selected preservation checks pass; three
  callback-scheduling timeouts reproduce on the exact saved source baseline. All 26
  focused native network-module checks pass; broader module selection has 220 passes
  and the same 14 baseline DOM-bootstrap expectation failures. Strict test/core typing,
  scoped SDK build, native build, changed-code lint/new-test format and three-file
  byte-exact patch application/reversal pass. Actual native adapter at 128 MB verifies
  success remains usable beyond 1 s, TLA expiry prevents resume, and close data is zero.
  A longer live 192 MB run prepares seven modules, then exhausts heap (exit 134) before
  deadline delivery; cleanup is unverified for that run. The 384 MB diagnostic verifies
  deadline-triggered revocation before its 180 s observation bound, HTTP 200 / all 13
  classics / seven prepared modules, zero sockets and cleanup data zero. Exit 1 reflects
  incomplete initialization. Neither allowance clears default heap/time/readiness/join
  gates. Runtime decoding/retention and repeated capture traversal remain next targets.
  All owned probes terminate and temporary validation drivers/configs/backups are removed.

- A bounded desktop-client capture census passes all 13 classics and links all
  seven modules, then remains pending in editor-core evaluation at the 120 s import
  observation bound. Evaluation records 5653 measurements / 121604715 graph visits /
  28713611 interpreted captures across 241 distinct capture scopes; 29064134 of
  30138848 scope reads hit snapshots (96.4%). The six distinct declined scopes have
  private-name metadata; no module/resource/accessor metadata is observed among
  them. Counts include instrumentation overhead and establish no timing improvement.
  The later CPU profile above prioritizes visitor/property inspection over scope sharing,
  preserving fresh metadata/callback effects and primary reconciliation during holds;
  previously rejected guarded caches are not an established solution. HTTP 200,
  zero sockets, no readiness/join, cleanup data zero and terminal probe status verified.
  The 384 MB diagnostic allowance clears no default heap/time gate. All three
  instrumented SDK build files are restored byte-exact and temporary backups removed.

- Realm classic scripts now opt into compact ASTs and a lazy dynamic-source node
  index. Contribution: safejs-compact-classic-source-index.patch (after compact AST
  and deferred initializer patches). Public parser/factory defaults stay unchanged.
  Numeric rows preserve node lookup/order and attach source metadata on decoding;
  native Map operations are pinned, foreign source/owner rebinding rejected. Selected
  SDK checks pass 423 tests across 18 files, including 18 new tree/ID/index/mutation/
  strictness/metadata/snapshot/template/ownership contracts. Strict test typing/scoped
  build, new-file format/lint and five-file byte-exact patch application/reversal pass.
  Exact externals.min.js digest matches control: 54585 nodes / 791 function sources,
  168460 steps; cold retained heap falls from 18107256 to 6084896 bytes plus 2075356
  code-buffer bytes. This is storage improvement, not an initialization timing proof.
  The earlier native 192 MB diagnostic passes 13 classics and prepares all seven
  modules within its 60 s observation bound; the longer run above still exhausts heap.
  Preload heap measures 133198024 versus the previous
  142526696 bytes, and post-emoji compile heap 176144320. Import settlement and default
  128 MB/30 s runtime acceptance remain open. Temporary instrumentation is restored.

- Module declarators now defer initializer trees during linking. Contribution:
  safejs-deferred-module-initializers.patch (applies after compact-module-ast).
  A regression reproduces 3529 premature decoded records on the saved codec and
  passes with the fix, including evaluation exactly once and preserved values.
  All seven exact static modules compile AND link at a 128 MB heap limit: 105455216
  retained heap bytes plus 63527792 code-buffer bytes, 8353220 steps / 5965049
  current units. Emoji linking decodes 1206 records; loginview 56436, editor 21025.
  Selected SDK checks pass 223 tests across 16 files, with strict test typing/scoped
  build, format/lint and byte-exact two-file patch application/reversal. Public parser
  defaults stay unchanged. Full native initialization/default runtime heap remain open.
  Before this fix, the live 192 MB module client exhausted heap during loading;
  a transient 384 MB memory probe compiled all seven but exhausted heap during linking.
  That probe measured 142526696 retained heap bytes before the first module compiled,
  then 280511 loginview / 659645 emoji decoded records during linking. Both OOM runs
  exit 134 before cleanup verification. The default-identity legacy Vue probe still
  times out at 120 s with zero sockets and verified cleanup data zero. Probe processes
  terminate; compiled SDK instrumentation is restored exactly.

- Canonical modules now compact completed ASTs into source-local numeric rows,
  materializing ordinary mutable children on demand and retaining decoded identity.
  Contribution: safejs-compact-module-ast.patch. All seven exact static modules
  compile together at a 128 MB heap limit: 5962852 chars / 8316720 steps /
  5963350 current / 5963544 peak units, 53706336 heap bytes total (48786352 beyond
  preload baseline) plus 63527792 code-buffer bytes. Exact tree/ID/function-source/
  strictness/template digests match all seven controls: 1628032 nodes / 30762 source
  ranges. Public parsing defaults stay unchanged; canonical SourceModuleGraph enables
  the compact path. Selected SDK integration passes 405 checks / one skipped;
  the known parser nesting failure is excluded and reproduces on saved baseline.
  Final focused codec/loader checks pass 53 tests; strict test typing and scoped
  build, new-file format/lint and six-file byte-exact patch application/reversal pass.
  This clears offline static-graph compilation at 128 MB; decoded runtime growth,
  default timing, full client initialization and all meeting/media gates stay open.

- Canonical modules now trim completed parser lists into ordinary mutable arrays.
  Contribution: safejs-compact-module-arrays.patch. Exact loginview retained heap
  beyond baseline falls from 174708960 to 159669144 bytes (~8.6% less); tree, IDs,
  aliases, function/template metadata and accounting match control (889089 nodes /
  22269 functions, 4165502 steps / 3485657 current / 3506328 peak units). Streaming
  tree digest matches: b699b1ac7e7355914c870157b6f797c8a90fc24d49f40ebba4776a5b5d99f737.
  Selected SDK validation passes 370 checks, including 19 new contracts; one known
  parser nesting failure reproduces on saved source. Scoped strict typing/build,
  new-test format/lint and byte-exact patch application/reversal pass. Complete
  128 MB parsing
  still exhausts the heap before returning (exit 134); diagnostic timings establish
  no full-client speedup. No compiler, initialization, meeting or media gate clears.
  Processes terminate; temporary validation artifacts are removed; SDK retains fix.

- Canonical modules now compact source spans into two offsets with bounded
  coordinate reconstruction; public parsing stays unchanged. Contribution:
  safejs-compact-module-spans.patch. Exact loginview tree/IDs/source metadata and
  accounting digest match control: 889089 nodes / 22269 functions, 4165502 steps /
  3485657 current / 3506328 peak units. Retained heap beyond baseline measures
  174754944 bytes versus 206211744 in control (~15% less). Endpoint assignment,
  deletion, sealing/freezing, foreign ownership and cache eviction are covered;
  template coordinate mismatches keep their original representation. All 270
  selected SDK checks, scoped typing/build, new-file format/lint and exact patch
  application/reversal pass. Parsing measures 16.2 s versus 10.5 s in the 512 MB
  diagnostics; complete 128 MB loginview parsing still exhausts the heap. No
  default/full-client/meeting gate clears. Probes terminate, temporary artifacts
  are removed, and the SDK retains the candidate.

- Canonical modules now use compact numeric token rows with bounded token/position
  caches; public tokenization stays eager. Contribution:
  safejs-compact-module-tokens.patch. Exact loginview lexing (1195771 tokens) passes
  128 MB and matches the eager token digest; eager lexing alone exhausts that heap.
  Retained lexer storage drops from 152019032 to 57701692 bytes including buffers.
  Full-tree comparison preserves 889089 nodes / 22269 functions, source metadata,
  IDs and 4165502 steps / 3485657 current / 3506328 peak units. All 236 selected SDK
  checks, scoped typing/build, new-file format/lint and exact patch forward/reverse
  application pass. Measured lexing takes 2.8 vs 1.0 s; full parsing 8.5 vs 3.8 s
  in the 512 MB comparison. Complete loginview parsing still exhausts 128 MB;
  retained syntax trees remain the memory target. No full-client gain or gate pass.
  Probe processes terminate, temporary artifacts are removed, SDK retains candidate.

- The latest full-client diagnostic with compact classic-source indexing returns
  HTTP 200, passes all 13 classic scripts and prepares all seven modules under a
  192 MB diagnostic heap. The source import stays pending at its 60 s observation
  bound (one pending / zero fulfilled / zero rejected); no readiness or join is
  established. Zero socket attempts; cleanup closes the realm with accounted data
  zero. This clears the previous loading OOM at that allowance, not the default
  runtime, timing, interactive or meeting gates. All owned probes terminate and
  temporary drivers/configs/backups and instrumentation are removed.

- Earlier eager-token parsing verifies a separate default-heap blocker. Under
  128 MB, editor-core parses in 1.8 s and retains 71393848 heap bytes beyond its
  28617192-byte baseline (1396344 steps / 2101 statements). The larger loginview
  source exhausts 128 MB before parsing returns. A 512 MB diagnostic parses it:
  207673200 retained heap bytes beyond a 33412352-byte baseline, 4165502 steps /
  3297 statements. Its tree has 889089 nodes and spans and 1157912 positions.
  These are parse-only measurements, not full client/default timing or meeting
  proofs. Those parse-only probes retained no optimization. Source-tree storage
  remains the compiler-memory target after compact tokenization above, rather
  than the smaller classic-source node index. Processes terminate; no artifacts.

- Host-result allocation now excludes prototype graphs already owned by the
  realm; primary reconciliation still traverses those mutable retained roots.
  This fixes a regression exposed by the first full-client retry after linking:
  repeated DOM-node returns during FingerprintJS collection charged the connected
  prototype graph again under callback holds and exhausted the 16 Mi-unit quota.
  Live comparison with linking disabled passes fingerprint/config; linked source
  fails at that stage, while isolated config passes both paths. The contribution
  safejs-host-prototype-ingress-charges.patch preserves incoming container/payload
  and own-expando charges. Seven contracts pass; three fail on saved source.
  All 193 selected SDK checks, strict scoped typing/build, new-test format/lint and
  exact patch application/reversal pass. The corrected live retry clears fingerprint/
  config: 190783 current / 1022045 peak units after config, versus the linked
  regression above 16 Mi units. The completed retry's module outcome is above.
  No default, full initialization, meeting or media gate is cleared; retain the
  prototype fix and investigate compiler memory and retained-graph evaluation cost.

- Owned guest prototype links on SafeJS live host objects now fix the exact Zoom
  editor focus wrapper: ordinary HTML input.focus invokes the current prototype
  method; a method captured before replacement preserves its original identity and
  behavior, and restoration works. Native nodes publish guarded interface links;
  older SDK/providers keep the legacy bound-method fallback. The contribution
  safejs-owned-host-prototypes.patch covers lookup, getter receivers, inherited
  writes/enumeration, retained mutable graphs, quotas/holds, ownership and revocation.
  Thirteen new SDK contracts pass; twelve fail on saved source. All 182 selected
  SDK checks now pass, including the two older suites that previously import-failed.
  Strict scoped SDK compilation/build and exact patch application/reversal pass.
  Both new native contracts fail on saved source and pass the candidate. Native
  validation passes 327 checks with one known baseline lifecycle fixture excluded;
  working build and changed-block formatting pass. Actual SDK/native
  128 MB/30 s probes reproduce Zoom's wrapper without a return: direct/captured
  calls, modality flag, blur, restoration and prototype identity pass (5480 steps /
  16021 peak units). With expandos disabled, nested captured focus preserves event
  order and rejects four invalid receivers (5626 steps / 20085 peak units).
  Both probes terminate and clean up to data zero. General guest setPrototypeOf
  on live host objects, broader prototype tables, SVG/inert focus, full client
  initialization, default performance and meeting/media readiness remain open.

- Captured HTMLElement.prototype.focus/blur now dispatch to registered receiver
  operations through setup-time nested registration, preserving controlled-listener
  scheduling, original node publication guards and close revocation. Foreign,
  forged and non-HTML receivers reject; synchronous DOM dispatch cannot invoke
  focus operations. Five new contracts fail on saved source and pass fixed;
  252 selected native checks, build and changed-file format/lint pass. One existing
  PageScripts lifecycle fixture fails on both saved and fixed source and is excluded
  from that passing count. Actual SDK/native 128 MB/30 s probe verifies nested
  captured focus, event order, four invalid receivers and blur (5592 steps / 13372
  peak units); cleanup closes with data zero. Processes terminate; no artifacts.
  Legacy providers retain bound node-own focus methods; modern linked HTML nodes
  now use the prototype lookup above. Inert-document focus and broader DOM prototype
  behavior remain incomplete. This clears no full
  client initialization, default performance, meeting or media gate.

- Cached full-client diagnostic after the document-method fix reaches its 30 min
  observation bound: seven modules prepared, one import pending, none fulfilled
  or rejected, 8624169 total steps. Cleanup interrupts editor statement 1237
  (DOMPurify initialization) after 928.2 s / 526.3 s process CPU / 38699 steps;
  its cancellation throw is not a proven application exception.
  React DOM completes normally in 236.6 s / 151.2 s process CPU / 40979 steps.
  Host has four CPUs, load about 41 and CPU pressure about 98%, with no cgroup CPU
  throttling; wall-time comparisons under this contention are not reliable.
  Diagnostic 768 MB/120 s allowances clear no default performance, initialization,
  meeting or media gate. Realm closes with accounted data zero, process terminates,
  SDK interpreter tracing is restored byte-for-byte and temporary artifacts removed.

- Controlled editor syntax-tree identifier sharing saves 1626736 retained heap
  bytes after a separate no-assignment control walk (509808 bytes reclaimed).
  Both walks observe 136673 identifiers / 7967 unique names; parsing preserves
  1396344 steps and 2101 statements. No SDK change is retained: this saving does
  not establish a solution for the complete graph's default 128 MB gate.

- SDK numeric-only/otherwise empty child frames share their parent's accounting
  projection instead of adding zero-unit wrapper groups. Full ancestry validation,
  metadata getter order and retained callbacks remain active; charged bindings,
  object metadata and existing mutable-environment fallbacks remain represented.
  Contribution: safejs-empty-scope-projections.patch. Seven new contracts and
  existing quotas/holds, snapshots, frame/source imports and ownership cases pass
  (89 focused SDK checks). The existing empty-child sharing contract now passes;
  four older environment root-length expectations still fail on the exact baseline.
  Scoped core/new-test compilation, new-test format/lint and exact patch application/
  reversal pass. Compiled 128 MB warm closure fixture: 48 to 31 ms (~35%), charge
  2004 unchanged. Fixed-seed editor initializer with 1000 retained extra closures:
  35.5 to 30.6 s (~14%), identical 227104 steps / 230326 current / 230367 peak.
  Both compiled runs close at data zero. Actual SDK/native DOM initializer under
  128 MB renders `object`, fetches nothing and closes at data zero; its diagnostic
  allowance is 120 s, not a full default timing or application-readiness pass.
  Working SDK source/build retain the candidate; processes terminate and temporary
  fixtures/logs/profiles are removed. The full-graph trace below identifies later
  initialization costs; this candidate has no complete live Zoom speedup proof.

- Earlier full-graph statement trace reaches the 15 min import-observation bound:
  13 classics pass, seven modules prepare, counts remain 1/7/0/0, and 248561 steps
  advance across 895 s of progress reports. Editor statements 0–1352 complete
  normally; cleanup interrupts statement 1353 of 2101, not a proven application
  exception. React DOM initialization (statement 2) completes in 162.9 s / 40979
  steps. DOMPurify 3.0.9 initialization (statement 1237, `var xle=tI()`) completes
  in 460.0 s / 41304 steps. Other locale/UI initializers also add seconds.
  Zero socket attempts and cleanup data zero verified; no readiness or join.
  Temporary SDK instrumentation is restored, probe processes terminate and
  temporary fixtures/logs are removed.
  Extended 768 MB/120 s script/network allowances clear no default acceptance gate.
  The driver retains bounded 0–30 min import observation, 10 s progress reports and
  explicit 1–120 s network deadlines; prior build/format/invalid-setting checks pass.

- Native DOMParser parses `text/html` through the existing inert HTML parser.
  Parsed documents inherit the creator URL/origin, have null window/location and
  no creator credentials, retain parser-selected quirks mode, and share auxiliary
  document creation/node/text limits and cleanup. XML MIME types reject explicitly;
  DOMImplementation.createDocument remains absent. Twelve new contracts and existing
  HTML/template/window/parser-limit/namespace cases pass (132 focused native checks).
  Actual SDK/native 128 MB probe verifies parsed HTML, detached window, URL/mode,
  Document/Node branding and Window alias; cleanup releases all SDK data.

- Native NodeFilter constants and null-filter NodeIterator now support live preorder
  traversal, direction reversals, node-type masks, reference-position recovery after
  node/subtree removal, insertions, detached roots and teardown. Iterators use the
  existing guarded publication/identity registry; lifetime creation and per-operation
  work limits remain bounded, as do sibling caches. Callback filters, mask-object
  conversion, attribute roots and roots from another document remain unsupported.
  HTMLFormElement and NamedNodeMap have owner-checked branding; prototype method
  tables remain incomplete. Sixteen new contracts plus existing publication/parser/
  node-brand/attribute cases pass (55 focused checks from native-tests.json).
  Working build and new iterator/bootstrap format/lint checks pass. Actual SDK/native
  128 MB probes verify traversal/reference state, iterator/form/map brands and cleanup
  data zero. The borrowed-method regression below is now fixed for the two
  selected methods; other DOM methods and prototype tables remain incomplete.

- Page initialization now publishes retained guest methods for Document/Element
  getElementsByTagName, Document.createNodeIterator/createDocumentFragment/importNode
  and Node.cloneNode; Node
  parentNode/childNodes/nextSibling prototype getters share the same guarded port.
  Borrowed calls dispatch to
  registered receiver operations, including parsed/auxiliary/template documents,
  with interface/owner checks, publication readiness and lifecycle revocation.
  Nine retained document/node functions are shared per page and released on close;
  nested-focus contexts also retain the two HTMLElement methods above. Recycled node/
  port identities and invalid publications reject. Other methods remain bound to
  their original native node; full prototype tables remain incomplete. Callback
  filters and foreign iterator roots remain
  unsupported. Eighteen contracts plus existing parser/iterator/publication/
  extension-bootstrap/
  window-global cases pass (152 focused native checks). Five added contracts cover
  parsed/attribute/fragment cloning, live prototype relations, foreign/forged owners
  and captured-getter teardown.
  The client sanitizer captures fragment creation and import methods and explicitly
  supplies document receivers. Three added contracts reproduce the bound-method
  ownership/receiver bugs on the saved native source; the fix passes all 175 selected
  native checks, build and changed-file format/lint. Actual SDK/native 128 MB probe
  with application-unicode-v1 and a 30 s limit verifies template fragment ownership,
  imported deep-node ownership/source preservation, prototype identity and invalid
  receiver rejection (29813 steps / 45314 peak units); cleanup closes with data zero.
  The basic 1 s probe times out and cleans up to zero; this does not clear that gate
  or full client initialization, sanitizer conformance, meeting or media gates.
  The exact current public DOMPurify slice (21008 UTF-16 units) also passes benign
  RETURN_DOM_FRAGMENT calls, preserving bold/span content and attributes; enabling
  the shadowroot attribute path imports the fragment into the original document.
  Under 128 MB/120 s diagnostic limits, initialization takes 105.9 s and the two
  calls 58.3 s (134339 total steps / 85275 peak units); cleanup data zero, process
  terminal, no artifacts retained. No comparison or sanitizer security claim.
  Working build and new-source/test/bootstrap format/lint checks pass. Actual
  SDK/native 128 MB probe verifies borrowed parsed-body queries, BODY/B iterator
  traversal and prototype identity. Actual SDK/native 128 MB prototype-capture
  probe clones `<b>hello</b>`, returns the parsed body, text child and following
  SPAN, with SDK data and transport requests zero on close. The earlier isolated
  bundled DOMPurify 3.0.9 probe initializes in 21.1 s under the explicit 120 s
  diagnostic allowance. A subsequent profiled 128 MB initializer completes in
  48.1 s elapsed / 25.3 s process CPU, with 71437 steps and 76338 retained units.
  Both native-node and string `<b>hello</b>` inputs return `<b>hello</b>`; cleanup
  data and active transport requests are zero. This supersedes the two earlier
  120 s initializer timeouts before input checks in the loaded environment. The
  sampled profile attributes most initializer time to retained-graph measurement,
  with additional intrinsic-root collection cost; sampled elapsed durations are
  not process CPU totals. The earlier four benign fixtures
  preserve bold text, span attributes and form/input content, and remove a comment;
  form attribute order changes. Cleanup releases all SDK data; asset transport closes
  with active requests zero. These fixtures clear the empty-output regression,
  not sanitizer security, full library conformance or application readiness.
  The default AgentBrowser identity still selects 53 legacy scripts: HTTP 200,
  16 executed, Vue reaches its 120 s deadline at 1007007 total steps; no client
  modules prepare. Zero socket attempts and cleanup data zero verified. This is
  separate from the desktop-identity module graph. The desktop retry with 768 MB,
  120 s script/network allowances, two 30 s windows and 120 s import observation
  executes 13 classics and prepares seven modules; counts remain 1 pending /
  7 prepared / 0 fulfilled / 0 rejected at the observation bound. This is not an
  application exception or readiness pass. Zero socket attempts and cleanup data
  zero verified. Next: address full-graph initialization cost and remaining DOM
  compatibility. Default performance and every meeting/media gate remain open.
  Processes terminate and temporary fixtures/logs are removed.

- Editor initialization is narrowed to React DOM's lazy initializer. The earlier
  live root-statement trace completes statement 0 in 19.5 s / 3594 steps and
  statement 1 in 0.6 s / nine steps; statement 2 advances 25458 steps before
  cleanup interrupts it after 124.7 s. Its throw is cancellation, not evidence of
  an application exception. An offline fixture retains the first three editor
  declarations and actual rolldown helpers, excluding loginview's preload/cycle
  and later editor code. Both compiled SDK and native DOM fixtures finish under
  128 MB. Native declaration tracing isolates `Hs=Y5(sx())`: 19.3 s / 40961 steps;
  its two preceding wrapper initializers each take about 2 ms / four steps.
  The native fixture renders `object`, makes zero fetches and closes at SDK data
  zero. These are diagnostic timings, not a performance comparison or full-graph
  readiness pass. A finer live attempt instead times out fetching loginview before
  editor evaluation; its realm closes, socket attempts remain zero and cleanup
  data is zero. All probe processes terminate, temporary SDK instrumentation is
  restored and artifacts are removed. Next: reproduce the initializer's larger
  retained-graph cost offline before changing accounting; full initialization,
  default 30 s/128 MB and every meeting/media acceptance gate remain open.

- SDK live-host accounting reuses copied member-name charges and the existing
  tracked property-table projections for private expando storage. Root collection
  avoids temporary singleton arrays during measurement; mutable descendants,
  symbol catalogue changes, private fields, depth limits and held primary graphs
  remain fresh. Revocation clears charges and roots. Contribution:
  safejs-host-object-accounting-projections.patch. Seven new contracts plus existing
  expando/ownership/symbol/held-quota cases pass (84 focused SDK checks); four new
  preservation contracts pass the exact saved source. Scoped core/test typing,
  new-test format/lint and exact patch application/reversal pass. Compiled 128 MB
  host-graph fixture warm CPU median improves 271.9 to 99.3 ms (~63%), charge 318464
  unchanged. Compiled 512-host realm fixture improves 1056 to 419 ms (~60%), with
  identical 2450 warm steps / 1010 current / 1763 peak and cleanup data zero.
  The manual realm-root builder is rejected (about 32% CPU regression) and that
  source/build are restored exactly. Actual native/SDK 128 MB fixture verifies
  expando aliases/callbacks, parsed-node cloning and captured-parent getters;
  cleanup data zero. Earlier local fingerprint profiles identify measurement/GC
  cost; the intermediate candidate clears its classic call but collection still
  times out, so no complete local fingerprint conformance/performance claim.
  Latest live retry clears the earlier FingerprintJS 120 s timeout: its call
  completes in 53.5 s / 89652 steps. All initial document scripts and externals
  pass; the 30 min import observation ends with counts 1 pending / 7 prepared /
  0 fulfilled / 0 rejected, after 6.73 million additional budgeted steps. No module
  rejection is proven. Zero socket attempts and cleanup data zero verified; process
  terminates. Incorrect sourceReference-based instrumentation is restored exactly.
  Corrected live trace/profile retry instead hits externals' 120 s deadline at
  194881 script steps / 40.4 s process CPU: nine classics pass, one fails, zero
  sockets and cleanup data zero. Interpreter restored exactly; profile samples
  concentrate in retained-graph reconciliation, not a CPU-total attribution.
  Corrected 5 min component diagnostic uses the real entry and exact cached graph
  on an empty native document. Event-loop yielding restores background import
  handoff; seven modules prepare. Editor statements 0–78 complete; the trace reaches
  79 before cleanup. React DOM statement 2 completes normally in 242.8 s / 153.6 s process CPU /
  40979 steps. Import counts remain 1/7/0/0; cleanup data zero verified. Profile
  samples concentrate in reconciliation (267.7 of 305.1 sampled wall seconds),
  including function-property/capture reads, not a process CPU attribution.
  Reusing the symbol witness for single property reads is rejected: a frozen getter
  still observes stateful host-map reads. The candidate fails the benign successive-
  read contract (12 versus 18 units); exact saved source passes it. SDK source/build
  and interpreter are restored exactly, processes terminate and artifacts are removed.
  A two-read factory-getter variant preserves that contract and passes 36 focused
  SDK checks, strict core/test typing and all six new checks on saved source. Direct
  getter access alone is about 50% faster, but isolated complete 512-function walks
  are mixed: empty functions ~7% faster, property tables ~4% slower, varied shapes
  ~2% slower, with identical charges (512/5522/14546/12041). Rejected before a live
  retry; exact source/build restoration verified and temporary tests/artifacts removed.
  Extended allowances and component results remain diagnostic.
  Default performance and every readiness/meeting/media gate remain open.

- SDK intrinsic root caches now ignore writes to unrelated guest function tables.
  A weak membership set tracks tables captured by intrinsic retention groups;
  registered-table writes, prototype changes and baseline completion still invalidate
  the caches. Table projections and all descendant/quota/held-callback scans remain
  active; restored untracked tables keep their conservative scan. Contribution:
  safejs-intrinsic-table-invalidation.patch. Four new contracts cover unrelated
  writes, later registration, descendant quota rejection and shared-budget teardown.
  All 119 focused SDK checks pass, including builtin prototypes, restored realms,
  intrinsic projections, held quotas and ownership reconciliation. Exact saved source passes
  the other three new contracts and fails cache reuse as expected. Scoped core/test
  typing, new-test format/lint and exact patch application/reversal pass.
  Compiled 128 MB root-collection fixture (200 groups, four methods each, 10000
  unrelated writes per sample) warm CPU median falls from 84.1 to 24.4 ms (~71%);
  measured charge stays zero on both, as do cleanup data. This measures empty-group
  collection overhead, not complete graph or live Zoom performance. The identical
  offline native 128 MB sanitizer fixture completes on the candidate in 119.0 s
  elapsed / 27.3 s process CPU, with the same 71437 steps / 76338 retained units as
  the earlier successful run. Native-node and string bold-text inputs both remain
  `<b>hello</b>`; cleanup data and transport requests are zero. Saved-build comparison
  reaches its 120 s deadline at 70314 initializer steps and closes at data zero;
  CPU contention prevents a complete candidate/baseline initializer timing claim.
  Processes terminate and temporary profiles/fixtures are removed. The working SDK
  source/build retain the candidate; default timing and all meeting/media gates remain open.

- SDK single-read function-properties candidate is rejected and reverted. Its
  factory accessor certificate preserves derived/proxy/native-hook reads, live
  descendants and held quotas; 49 focused SDK checks and scoped core/test typing
  pass. Exact baseline passes 24 preservation checks and fails the new single-read
  contract as expected. Compiled closure fixtures charge 78890 units on both;
  noisy timings and CPU medians establish no useful gain. Two native 128 MB seeds
  with 1000 retained functions hit their 120 s deadlines before library initialization;
  callback-construction and literal-array seeds differ, so they are not a candidate/
  baseline timing comparison. Both close at data zero. Exact SDK source/build restored,
  candidate test removed; no candidate patch or relaxed production limit retained.

- SDK internal-symbol catalogue uses a private versioned Set facade; frozen factory
  closures reuse an all-internal-symbol result at the same revision. Private fields,
  captures/properties/prototypes and visible custom-symbol descendants stay fresh.
  Incremental contribution: safejs-internal-symbol-revision.patch. Normal catalogue
  operations remain compatible; borrowed native Set mutations reject the facade so
  they cannot bypass revision tracking. This catalogue is not a package export.
  193 focused SDK checks pass, including six catalogue contracts and existing marker
  removal/clear/mid-walk mutation/cache-ownership, quotas, held callbacks, imports and
  snapshot cases. Three normal-operation cases also pass the exact baseline.
  Scoped core/new-test compilation and declarations, new-file format/lint and exact
  patch forward/reverse application pass. Compiled 128 MB warm closure-census fixture
  medians: baseline 223/226 ms, candidate 177 ms (~20%); charge 6020 unchanged.
  Source-import medians: 528 to 479 ms (~9%), identical 30024 steps / 29392 current /
  29657 peak. Compiled marker removal reveals/charges a 20000-character payload and
  enforces its quota (hidden 2, visible 20017 units). Actual SDK/native 128 MB import
  renders 999 and closes with data/requests/sockets zero. Authorized 768 MB/120 s/
  30 s-observation/120 s-import-wait live run still exits nonzero: 13 classics pass,
  seven modules prepare/link, editor advances 33882 budgeted steps over 144 s before
  cleanup interrupts evaluation; import counts remain 1/7/0/0. No complete Zoom
  initialization speedup/readiness/join claimed; default 30 s/128 MB and all meeting/
  media gates remain open. Cleanup data zero and zero socket attempts verified.
  Working SDK source/build retain the candidate; instrumentation restored exactly,
  processes terminal and artifacts removed. The initializer evidence above narrows
  the remaining prototype/capture traversal investigation before further caching.

- Earlier SDK source graphs/classic loaders preserve certified immutable empty
  namespace tables; registered/wrapped namespaces retain their mutable fallback.
  Contribution: safejs-source-immutable-namespaces.patch. Its compiled 128 MB warm
  medians improve 639/640 to 520 ms with identical charges; 88 focused SDK checks,
  four exact-baseline compatibility cases, scoped compilation/declarations and
  exact patch application pass. Actual SDK/native DOM fixture renders imported 999
  and closes at data/requests/sockets zero. The earlier live trace remains pending;
  its empty-environment helper takes 0.14 s versus 4.7 s in the preceding trace.

- Authorized visitor census isolates the active editor-evaluation window, excluding
  classic startup/parsing: 11348 accounting passes, 245410200 visitor entries and
  62881400 frozen factory-closure inspections in 86 s / 23113 budgeted steps.
  Each pass averages 21626 entries and 5541 frozen closures; closures are 78% of
  classified ordinary objects. About 127 million internal-symbol checks repeat,
  whereas only 11345 inspected objects have private fields (90760 field visits).
  Target frozen factory-closure processing, preserving fresh captures/properties/
  prototype links, internal-symbol filtering, private-field changes and reentry;
  existing SDK contracts prohibit simply caching symbol membership across changes.
  Counters add overhead, so this is a work census, not a speed comparison. The
  diagnostic exits nonzero with import counts 1/7/0/0 and editor evaluation
  interrupted by cleanup; no readiness/join. Zero socket attempts and cleanup data
  zero verified. SDK dist restored exactly, helper removed, process terminal and
  all census artifacts removed. Earlier phase trace links all seven modules in
  0–15 ms each; full-graph default 30 s/128 MB gates remain open.

- SDK source-module status exposes immutable pending/prepared/fulfilled/rejected
  counts to the native runtime. The diagnostic observes imports outside classic
  tasks and requires settled successful imports separately from entry-fetch success;
  older SDKs without the method remain unverified. Actual compiled SDK/native 128 MB
  success, caught-denial and pending-TLA fixtures report distinct correct counts;
  all close with retained data/requests/sockets zero. 180 manifest-listed native
  checks and 60 relevant SDK checks pass, including four new SDK status cases and
  three native bridge contracts. Native build, scoped SDK core/new-test compilation/
  declarations, new-test formatting/lint and exact contribution forward/reverse
  application pass. The diagnostic selects/reports a bounded 4 MiB response cap
  that admits loginview; the transport's 2 MiB default rejects it. Final authorized
  768 MB/120 s/30 s-window/60 s-import-observation live check prepares all seven
  static modules but still has one pending import, zero fulfilled and zero rejected.
  It exits nonzero, verifies retained data zero and zero sockets; no interactive
  readiness/meeting join. All live/fixture processes terminated; working source/build
  remain reusable and validation artifacts are removed. The phase trace above
  identifies editor evaluation accounting as the next target; default 30 s/128 MB
  remain open.

- SafeJS canonical modules share frozen token positions, retire completed token
  prefixes and assign fresh AST IDs without a large temporary visited Set. Parser
  node literals reserve ID slots; final IDs remain non-enumerable/writable/configurable
  and public reassignment still renumbers mutated IDs. The editor's exact AST/span/
  function-source/strictness/template digest matches baseline: 328515 nodes, 2101 body
  items and 1396344 steps. Added retained compilation heap falls from 76.6 to 68.9 MB.
  Exact baseline and reserved-slots-only native fixtures exhaust 128 MB; the combined
  compiled SDK/native editor fixture now requests loginview at 128 MB. That fixture
  deliberately denies the missing dependency, then closes at retained data zero,
  active requests zero and zero sockets; no complete module evaluation claimed.
  379 focused SDK checks pass; one broader parser else-if stack failure reproduces
  on the exact baseline. Eight new ID/alias/order/descriptor checks pass; six also
  pass baseline. Scoped core/new-test compilation/declarations, new-test formatting/
  lint and exact contribution forward/reverse application pass. Public position
  defaults and all guest quotas remain effective. Earlier native build and 177
  manifest-listed profile/runtime checks establish the explicit Unicode profile's
  16384 regex-source/65536 compilation-allocation selection; ordinary profiles retain
  8192/default bounds. Working SDK source/build retain these contribution candidates.

- Prepared classic source admission is wired through ScriptLoader, PageScripts and
  the extension runtime. Original inline bases and verified external redirect paths
  remain stable; exact source validation keeps named host evaluations from borrowing
  network referrer authority. Imports default to same-origin credentials, with
  use-credentials preserved separately from a classic entry's no-cors/include fetch.
  CSP import admission derives external-fetch authority without changing inline
  entry admission. Document module fetching survives bootstrap retirement while
  stop/close/replacement and owner cancellation still revoke requests; request
  limits are shared. Native build and 428 focused manifest-listed checks pass.
  Five actual SDK/native fixtures at 128 MB render imported results for immediate,
  timer, nonce-CSP/base-change and default/explicit-credential CDN cases. A named
  host evaluation cannot borrow a cached dependency; every fixture closes with
  retained data zero, active requests zero and zero sockets. Earlier public-chunk
  probes at the original 8192 regex-source bound close their realm before host cleanup
  at 128 MB with retained data zero and zero sockets. Current chunk heap gates are
  below. Earlier direct registry
  checks pass separately; no full-suite pass is claimed. Seven older HTML-runtime
  bootstrap contracts, five static-module contracts and one classic-loader limits
  expectation reproduce on the baseline.
- SafeJS classic Scripts can now use an explicitly configured source resolver,
  sharing the realm's canonical module graph. The incremental contribution
  safejs-classic-dynamic-import.patch preserves original referrers through later
  evaluations, async host callbacks and suspended generators; frozen shared
  referrer records remain charged and registered modules retain precedence.
  Nine regressions fail the exact compiled baseline; 126 focused SDK checks
  pass (six skipped), scoped core/test compilation and exact patch forward/reverse
  application pass. Compiled SDK probes under 128 MB preserve callback/generator
  referrers in both scheduling modes, cancel pending resolution on close and
  enforce imported-source quotas; all verify cleanup zero and zero sockets.
  Scratch SDK source/build retain this fix. Native admission and loader wiring
  now pass the fixtures above; live application initialization/join remain open.
- Earlier actual SDK/native 128 MB comparison isolated the import gate: identical
  import("./dep.js") code fetches /dep.js as a module, but makes no dependency
  request as a classic script. Both guest catch handlers suppress rejection;
  both loader reports are green, with zero sockets and verified cleanup zero.
  A script report alone does not establish successful application imports.
- Completed one-shot timer retains a captured 50000-character payload: actual
  SDK/native 128 MB current charge 95882 versus synchronous control 45704.
  Both render "50000"; timer case has one fired / zero active, queued or pending
  callbacks, not running; cleanup zero. Native timers discard their callback,
  but the SDK callback registry retains it. Investigate independent registration
  ownership; blanket revocation can invalidate shared callbacks/exported aliases.
  No SDK source/build edits or memory-accounting bypass introduced by this probe.
- Document loading now settles scripts inserted by load handlers/final image
  completion before bootstrap retirement. Three new native regressions fail
  baseline; all 269 focused manifest-listed checks and native build pass, including
  stop/close cancellation and existing bootstrap-only cancellation. Actual SDK
  128 MB synthetic window-load insertion executes both scripts, zero socket
  attempts, zero active requests and verified cleanup zero. Live 192 MB/120 s
  diagnostic executes all ten initial scripts (vendor 62 s); a further observed
  run reaches twelve discovered / eleven executed and the 187-byte webclient
  bootstrap's UnhandledRejectionError. Its dynamic import of webclient.es.min.js
  never reaches the request journal. No name/Join controls rendered, no Join
  action taken, zero sockets and verified cleanup zero. This diagnostic allowance
  does not clear the default 30 s/128 MB, interactive or meeting gates.
- Zoom diagnostic keeps the page alive for a selectable 0–30 s post-navigation
  observation (default 10 s), then settles newly inserted scripts before reporting.
  Native build and three offline actual-SDK 128 MB cases at the standard 30 s
  script limit pass: zero window omits the delayed script; observation captures
  delayed success and makes delayed failure exit nonzero. All verify cleanup zero
  and no socket attempts. A preliminary 1 s bootstrap allowance times out; this
  does not clear existing timing-reliability or interactive-readiness gates.
- More frequent SafeJS host-time sampling (8 nodes versus 128) preserves guest
  ownership and full graph accounting. Incremental contribution:
  safejs-frequent-host-checkpoints.patch, after timed-host-checkpoints. New
  expensive-node regression fails baseline; all 109 focused SDK checks and scoped
  core/test compilation pass; patch applies/reverses exactly. Actual native/SDK
  128 MB controlled fetch improves 4881 to 994 ms, host delay 191 to 42 ms;
  identical 43714 guest steps / 97719 current / 98036 peak, cleanup zero.
  Live 192 MB stylesheet (1526774 bytes) completes in 4.4 s versus baseline
  timeout; vendor fetch completes in 1.2 s versus roughly 13 s baseline.
  With a 10 s post-navigation observation and loader settlement, nine scripts
  execute then vendor evaluation still times out at 30 s (198832 steps,
  1344060 peak), zero sockets, verified cleanup zero. An earlier baseline
  128 MB live run exhausts the heap at vendor start and cannot verify cleanup;
  candidate production/default-heap acceptance remains unverified. No join or
  CPU initialization speedup established; working Automations stays unchanged.
- Script-boundary diagnostics now report current SDK data charge alongside peak
  usage. Native build and actual SDK 128 MB allocation/release fixture pass: a
  20000-character payload raises current charge to 85744, clearing it drops to
  45744 while peak stays 85797; zero sockets and verified cleanup zero.
  Public externals.min.js (163960 characters, SHA256 c646c4d8a4f3b714abc1c424b4373ef70cca93f7d39cf25576a8ce90dddb8231)
  completes in an isolated native document under 128 MB: 25.7 s, 212732 steps,
  317987 peak units, zero sockets, cleanup zero. The selected 120 s diagnostic
  limit is not a default-timeout, interactive readiness or actor acceptance pass.
  Live 128 MB executes nine scripts then vendor fetch times out. Current charge
  after callback-heavy configuration is 184678 versus 1003950 peak; after all
  nine scripts it is 370122. Earlier peaks do not prove persistent retention.
  Separate native public-vendor transport requests return HTTP 200 in 47/42 ms
  for default/desktop headers, with closed/zero-active transports. Fetch timing
  during page execution remains unexplained; transport or scheduling changes need
  a controlled reproduction. No meeting joined; SDK source/build unchanged and
  no fixture/source artifacts retained.
- Global leaf/seen-identity dispatch outside the SDK classification visitor is
  rejected and reverted. Candidate passes 56 focused SDK checks and scoped core/
  new-test compilation; baseline preserves all six new checks. Exact charges,
  identity lookup counts, DFS/reentry order and held quota rejection match.
  Warmed synthetic median: 0.516 ms candidate versus 0.600/0.621 ms baseline,
  with variable samples; live vendor reaches 191979 candidate versus 196276 baseline
  steps in serial 30 s runs. Both execute nine document scripts, time out at vendor,
  peak at 1341339 units, open zero sockets and verify cleanup zero. No useful live
  gain or join established. Temporary entry census fails earlier under contention
  (four scripts execute); its 26.7 million entries / 17.3 million visitor calls
  do not profile vendor. Exact SDK source/build restored; temporary tests, counters,
  configs and benchmarks removed. Avoid repeating dispatcher-only reductions.
- Initial unsandboxed about:blank iframes now expose separate native documents,
  stable window/document links, inherited origin/base URL and child computed styles.
  Frame documents share parent/template node, text and document quotas; nested and
  repeated creation is bounded. Detach, ancestor removal and unsupported source or
  policy changes revoke retained child capabilities and release documents. All 209
  focused manifest-listed checks, native build and new-file lint/format pass. Actual
  SDK probes under 128 MB verify blank/nested documents, an awaited timer, links,
  retained-capability revocation and cleanup zero without real network/socket requests.
  FingerprintJS's public iframe helper
  can now progress beyond its otherwise endless readyState polling into font work.
  Live 192 MB: nine initial scripts execute, vendor times out after 190479 steps;
  614481 total / 1341339 peak, zero sockets and verified cleanup zero. Live 128 MB:
  nine initial scripts execute; vendor fetch times out, zero sockets and cleanup zero.
  No speedup, interactive readiness, actor acceptance or join established. Child
  script realms, navigation, srcdoc, sandbox and credentialless contexts remain
  unsupported; these sources/configurations expose no child document. Requested
  static security reviewer cannot read the repository: its read-only bwrap sandbox
  fails to configure loopback (Operation not permitted); no review pass claimed.
- Zoom initialization diagnostic now observes raw SDK evaluation failures through
  a frozen facade that preserves the SDK's descriptors. Output admits only known
  error identifiers and bounded positions; no messages, stacks or source excerpts.
  Native TypeScript build and actual SDK offline standard/custom-error fixtures
  under 128 MB pass, including private-marker exclusion, zero sockets and close
  data zero. Direct unknown-identifier and Proxy fixtures also pass. Latest live
  30 s run: HTTP 200, ten scripts discovered / nine executed / one timeout before
  vendor evaluation starts, zero sockets and verified cleanup zero. Waiting for
  earlier callback prefixes consumes the same initialization timeout.
  Earlier vendor CPU profile attributes 47.5 of 52.9 s to graph measurement;
  sampled work builds ReactDOM attribute/event metadata (14633 vendor nodes versus
  679 FingerprintJS nodes). Retried shallow capture dispatch fails earlier under
  CPU contention and is reverted; unchanged-build 120 s diagnostic still times
  out, with about 28 s spent before vendor evaluation starts. Neither is a speed
  comparison or acceptance pass. SDK builds restored, profiling artifacts removed;
  interactive initialization, default 128 MB actor and all meeting gates stay open.
- Classic script tasks now defer due timer callbacks until the script and its
  microtask checkpoint return; queued work resumes on a later task. Modules and
  interactive evaluation can still await timers. All 195 focused manifest-listed
  timer/page-script/loader/module/idle checks and the native TypeScript build pass.
  Actual SDK adapter under 128 MB verifies classic timer ordering, a module's
  awaited timer, zero network requests and close data zero. No SDK accounting
  checks are bypassed; unrelated native changes stay outside this commit.
- Explicit bounded user-agent profiles survive session/child configuration and
  agree between HTTP defaults and navigator; default remains AgentBrowser/0.1.
  All 176 manifest-listed identity checks pass. Zoom selects nine web-client
  document scripts for an opt-in desktop compatibility identity including the
  AgentBrowser marker, versus 53 legacy join-page scripts for the default identity.
  Earlier fifth-script timeout was dominated by FingerprintJS background execution:
  23962 fingerprint nodes versus 645 configuration nodes; 25795 graph measurements
  traverse 131.5 million entries during that evaluation. Temporary census builds
  are restored; no instrumentation or profiles remain. With timer task ordering,
  live HTTP 200 executes all nine document scripts (configuration completes in
  2.9 s) and discovers externals.min.js (163960 characters), which times out at
  30 s. Report: ten discovered, nine executed, one failed; 537036 total steps,
  742526 peak units, zero sockets, no join, cleanup zero. A prior temporary probe
  reaches the same vendor gate. This 192 MB diagnostic does not clear production
  actor/default 128 MB Zoom, interactive initialization or media acceptance.
- Scope-root registry reads/writes and private-name capture caches now use pinned
  native operations; private capture records/vectors are immutable and reflective
  admission cannot be spoofed by later hooks. Retained contribution:
  safejs-scope-root-registry-private-cache-ownership.patch. Baseline fails 13 of
  15 new checks; candidate passes all 15 and 91 relevant SDK checks, including the
  previously skipped GC check, scoped compilation, new-test lint/format and exact
  patch forward/reverse. Baseline new-helper API shims only preserve explicit
  registration coverage; regressions exercise unchanged baseline callers. Compiled
  quota probes keep 1000/1013 units and reject quota500, versus poisoned baseline
  0/1 units and admission. Native adapter matches baseline at 150399 retained /
  29999 cleared, behavior/quota rejection and close zero under 128 MB. Live HTTP
  200, first-script timeout, zero executed / sockets, 170019 steps / 187870 peak,
  cleanup zero; no join or speed claim. Escape-monitored private-map layout was
  separately reverted after nested/private benchmark regressions. No broader graph
  reuse enabled; other scope caches/backings and frame vectors remain unproven.
  Temporary validation artifacts removed; initialization and media gates stay open.
- Shallow capture-root dispatch outside the large visitor is rejected and reverted.
  All 66 focused SDK checks and scoped compilation pass; compiled baseline/candidate
  usage, provider/identity-lookup counts, reentry, mutation, held quota and iterator
  close order match. Small first-benchmark gains are inconclusive: repeat empty-case
  timings also swing about 30%. No live gain or join claimed. SDK source/build are
  restored exactly and temporary artifacts removed. Broader graph reuse still needs
  complete ownership/mutation witnesses; dispatch-only reduction is insufficient.
- Frozen factory-closure symbol caches now verify actual freezing and retain
  privately captured, immutable descriptors/vectors through pinned native reads,
  construction and WeakMap operations. Retained contribution:
  safejs-frozen-symbol-cache-ownership.patch. Baseline fails six of ten new checks;
  candidate passes all ten and 81 focused checks, scoped compilation, new-test
  lint/format and exact patch forward/reverse. Broader validation passes 192 checks;
  two deep-copy stack failures reproduce on baseline. Compiled quota probe keeps
  1017 units / rejects quota500 instead of leaked-cache baseline 2 units / admitted;
  mutable factory symbol growth measures 1008 instead of stale 1. Native adapter
  matches baseline: 150399 retained / 29999 cleared, closure/private/disposal/locked
  descriptor behavior, quota rejection and close zero. Empty-symbol catalogue
  optimization is removed after mixed benchmarks; no speed claim. CPU-contended
  live baseline and final fix fail the first script; final HTTP 200, zero executed,
  167407 steps / 187906 peak, zero sockets and cleanup zero. No join verified.
  Temporary validation artifacts removed; broader capture traversal remains open.
- Deep closure prototype traversal now resumes from off-stack continuations;
  parent properties/providers stay fresh after the complete prototype subtree.
  Retained contribution: safejs-closure-prototype-data-walk.patch. Baseline fails
  four of six new checks; candidate passes all six plus 116 existing SDK checks,
  scoped core/new-test compilation, new-test lint/format and exact patch forward/reverse.
  Compiled default-stack/128 MB probe measures 14343 units at depth1024 instead of
  native RangeError; excessive depth reports dataDepth, held primary quota remains
  enforced, and callback/iterator order is preserved. Native adapter matches baseline
  at 150437 retained / 30023 after clear, quota rejection and close zero under 128 MB.
  Live HTTP 200, 16 scripts then Vue timeout at 960584 steps / 895131 peak, zero
  sockets and cleanup zero; no join or speed claim. Pure closure-walker factoring
  was separately reverted after inconsistent benchmark gains (repeat private/mixed
  regressions about 7–8%). No graph reuse was enabled; temporary artifacts removed.
- Capture-root admission/cardinality census rules out empty-private-map shortcuts
  and weak-snapshot churn as major reuse targets: 24.36 million snapshot hits /
  17,696 eligible misses / 257 collected snapshots; all 7.87 million declines
  involve six populated private-name maps (three single-entry, two two-entry,
  one larger), none empty. 30.50 of 34.14 million interpreted capture-root yields
  already have seen identities. These are availability counts, not CPU attribution
  or ownership proof. Compiled alias/mutation/snapshot/with/private/module/capture/
  iterator/depth/held-quota fixtures and private/module getter counts match before,
  during and after the cardinality probe. Live HTTP 200, 16 scripts then Vue timeout
  at 958679 steps / 893365 peak, zero sockets and cleanup zero; no join or speed
  claim. SDK source unchanged, two compiled modules restored exactly after process
  exit; temporary artifacts removed. Broader primary-graph traversal remains the target.
- Tracked string-property projections now keep immutable units/edge snapshots,
  using pinned native reads, freeze and own-entry construction; inherited numeric
  setters and later push/iterator/reflection hooks cannot corrupt these caches.
  Accessor adapter read order is preserved. Retained contribution:
  safejs-string-projection-ownership.patch. Baseline fails nine of 13 new checks;
  candidate passes all 13 plus 423 existing SDK checks, scoped compilation,
  new-test lint/format and exact patch forward/reverse. Compiled quota probe:
  1013 units / quota500 rejected, versus corrupted baseline 7 units / admitted.
  Actual native adapter matches baseline: 150437 retained / 30023 after clear,
  closure/private-field/disposal/descriptor behavior, quota rejection and close zero.
  Live HTTP 200, 16 scripts then Vue timeout at 957061 steps / 892372 peak,
  zero sockets and cleanup zero. No join or speed claim; other caches and foreign
  graph ownership remain unproven. Temporary validation artifacts removed.
- A provenance census narrows the primary-walk target to interpreted capture
  graphs: Vue alone performs 13,759 measurements / 116.0 million entries,
  including 18.1 million closure visits (14.5 million interpreted) and 26.3 million
  capture yields (21.8 million interpreted). Native bindings also contribute;
  these frequency counts prove neither CPU attribution nor safe graph reuse.
  Compiled mutation/callback/iterator/scope/held-quota/symbol/prototype fixtures
  match before, during and after instrumentation. Live HTTP 200, 16 scripts then
  Vue timeout at 958505 steps / 893240 peak, zero sockets and cleanup zero.
  No join or speed claim; SDK source unchanged, compiled module restored exactly
  after process exit and all census artifacts removed. Investigate repeated
  interpreted capture traversal while preserving fresh foreign observations and
  full active-invocation accounting; escaped-capture pruning alone previously failed.
- Tracked record/function table backings now stay private across later native
  Reflect/Object/Proxy hooks; native copying/construction/mutation operations are
  pinned. Retained contribution: safejs-tracked-backing-ownership.patch. Exact baseline
  fails nine leak regressions; candidate passes ten new and 125 existing focused SDK
  checks, scoped compilation, new-test lint/format and exact patch forward/reverse.
  Compiled quota probe now measures 1006 rather than 13 units and rejects quota 500.
  Native adapter matches baseline: 90302 retained units, 29974 after clear, closure/
  private-field/disposal/descriptor behavior, dataSize rejection and close zero.
  Live HTTP 200, 16 scripts then Vue timeout at 958505 steps / 893240 peak, zero
  sockets and cleanup zero; no join or speed claim. Temporary artifacts removed.
- Empty-block scope elision is rejected and removed. Sixteen new and 77 existing
  focused SDK checks, scoped compilation and new-test lint/format pass; exact baseline
  preserves 15 cases and fails the physical-frame regression. Actual native adapter
  candidate/baseline match: closure/private-field/capture behavior, disposal order,
  90308 retained units, 29974 after clear, dataSize rejection and close zero. Serial
  live candidate/baseline reach 961458/961723 steps and 895520/895697 peak units;
  both execute 16 scripts then Vue times out, zero sockets and cleanup zero. No
  useful initialization gain or join; source/build restored exactly. Restored 77
  focused checks and scoped compilation pass; test/config/probe/log/backups removed.
- Explicit opt-in managed scope metadata/root vectors are rejected and removed.
  Seventy-one focused SDK checks and scoped compilation pass; actual native adapter
  candidate/exact baseline match closure identity, mutable captures and private fields,
  90334 retained units, 29974 after clear, dataSize rejection and close zero.
  A shared depth-6/200-closure synthetic fixture improves about 61% with unchanged
  units/provider reads, but live candidate/baseline reach 959337/961047 steps and
  894029/895469 peak units. Both execute 16 scripts then Vue times out, zero sockets
  and cleanup zero; no useful initialization gain or join. Original six source/build
  files restored byte-for-byte; 56 focused restored checks and scoped core compilation
  pass. Helpers/tests/config/probes/logs removed.
- Ownership scanning is not an initialization target: the live census records
  20 ownership scans / 4.69 ms versus 44660 primary scans / 46723.65 ms. All target
  tickets are found early in only one scan, leaving 0.00314 ms / one visit afterward.
  Early termination has negligible coverage; primary reconciliation needs the
  algorithm change. Seven compiled ownership/hold/mutation/quota fixtures match
  instrumented/restored behavior. Live HTTP 200, 16 scripts then Vue timeout at
  960093 steps / 896784 peak, zero sockets and cleanup zero; no join. Source unchanged,
  compiled module restored byte-for-byte and census/fixtures/logs removed.
- Fresh-read vector sharing is also rejected. A temporary native array index setter
  exposes a fresh object-only scope-root vector and restores the prototype before
  validation; later provider code appends 1000 units. Both frozen and reused-live
  carriers measure 19 versus baseline 1019, wrongly admitting under quota 100.
  Native push/iterator identities, dense data entries and provider/scope read counts
  all match. Twelve compiled SDK model cases pass their counterexample assertions;
  a fresh unshared live carrier preserves units/rejection in these cases only.
  Sharing needs proof against escape and late mutation, beyond fresh membership
  reads. Earlier binding/private-name carrier failures remain 29 versus 1028/1034
  under quota 900. No SDK edits, live run or join; temporary probe removed.
- Traversal-span census disfavors small segment caches: 188.63 million visits over
  42212 measurements, 58.7% in spans of 1–3 visits and 13.8% in spans of at least
  16, maximum 319. Boundaries mark closure handling, retained providers, capture
  iteration and foreign values; these availability counts do not prove ownership
  or mutation safety. Broader replay needs complete mutation witnesses across fresh
  callbacks. Eight compiled preservation fixtures match before/during/after census.
  Live HTTP 200, 16 scripts then Vue timeout at 956742 steps / 892250 peak units,
  zero sockets and cleanup zero; no join. Source unchanged, compiled module restored
  byte-for-byte and temporary artifacts removed. No speed claim from instrumentation.
- Manual capture-iterator records are rejected and removed. All-depth records slow
  warmed shallow/shared fixtures by 23–28%; preserving shallow loops speeds the
  depth-512 fixture by about 19% only. Eighteen new and 85 existing focused SDK
  checks and scoped core/test compilation pass; two host-copy depth failures also
  reproduce on baseline. Live candidate/baseline execute 16 scripts then Vue times
  out at 961275/960093 steps, 895509/894811 peak units, zero socket attempts and
  cleanup zero. Slightly more candidate CPU establishes no useful initialization
  gain or join. Source/build restored byte-for-byte; all experiment artifacts removed.
- Actual SafeJS + local WSS passes with a process-local test CA: original-host SNI
  and Origin, protocol negotiation, fragmented UTF-8, 64 KiB binary echo with
  64-bit frame length, and send snapshots surviving subsequent guest mutation.
  Wrong-host and untrusted certificates fail before HTTP upgrade. Clean close and
  document closure with another socket open leave zero peers/pending/active sockets,
  no cleanup failures and close data zero. Probe/certificates removed; no runtime
  change needed. Production trust, authenticated Zoom WSS and meeting media remain
  unverified; interactive initialization remains the immediate blocker.
- WebSocket bootstrap keeps its constructor local: global `var WebSocket` hoisting
  previously made the classic Window accessor definition fail before any socket.
  All 295 focused manifest-listed native checks, native build/noEmit and changed-code
  format/lint pass. Actual SafeJS + loopback ws verifies text, fragmented UTF-8,
  ping/pong, ArrayBuffer/view/DataView bytes, event identity/origin, protocol and
  clean close; document closure releases a second open socket, close data zero.
  Temporary probe removed. The Zoom diagnostic now configures native WebSockets
  and verifies transport shutdown. Live HTTP 200, 16 scripts then Vue timeout at
  961047 steps / 895469 peak, zero socket attempts, cleanup zero; no meeting joined.
  Meeting WSS/media acceptance remains open. Zoom ships Vue 2.6.11-csp directly;
  no runtime string-compilation setting selects a lighter implementation.
- Checkpoint attribution rules out completed-frame restructuring as the main fix:
  function-terminal scans use 1.4 s (3.2%) of 44.2 s measured traversal, versus
  Identifier 13.9 s (31.4%), MemberExpression 3.2 s and BinaryExpression 2.8 s.
  The full diagnostic records 45210 primary/ownership scans; registered-root
  collection adds 1.5 s. These instrumented timings establish attribution only.
  Focus on repeated graph traversal across node checkpoints, preserving fresh
  provider observations and complete primary checks; terminal-only work has little
  coverage. Instrumented/restored SDK fixtures match 14 stable provider reads,
  result 7 and 11 reads before identical growth/dataSize failures. Live HTTP 200,
  16 scripts then Vue timeout at 959040 steps / 892227 peak; no join, close zero.
  Source untouched; three compiled files restored exactly, census/probes removed.
- Object visitation bitsets/stamps are rejected and removed. Bitsets regress both
  warmed graph fixtures; reentrant weak stamps improve them only about 1–3%.
  Five new and 97 existing SDK checks pass, with scoped core/test compilation,
  new-file formatting/oxlint and nine compiled preservation/GC cases. Two host-copy
  depth failures reproduce on restored baseline. Actual native adapter matches:
  90173 retained units, 29976 after clear, dataSize rejection at 400000, close zero.
  Serial 30 s live stamp/baseline reach 960577/959469 steps and 893088/892568 peak
  units; both execute 16 scripts then Vue times out. About 0.7% extra interpreted
  Vue work and slightly higher CPU establish no useful initialization gain or join.
  Original source/build verified byte-for-byte; helpers/tests/probes/backups removed.
- True local declaration deferral is rejected and reverted. Functions are created
  on first exposure rather than behind an existing shell; the full lexical payload
  remains measured. Sixteen new SDK checks and 87 existing focused checks pass,
  along with scoped compilation and new-file lint/format; nine preservation checks
  and scoped compilation pass the restored baseline. Copying inherited bindings
  invalidates their actual owner; snapshot/frame/copy boundaries materialize one
  canonical function. Native candidate/baseline match: 90242 retained units before
  exposure, 90259 after, 30368 after clear, dataSize rejection at 400000, close zero.
  Admission census installs 10/123/341 deferred declarations in bootstrap/page/Vue,
  with 108 total materializations; this is admission evidence, not a speed proof.
  Serial 30 s candidate/baseline reach 957569/958789 steps, 891189/892105 peak units,
  16 scripts and Vue timeout. No useful initialization gain or join. Six original
  source/build files are restored byte-for-byte; all temporary artifacts removed.
- Closed-return eligibility census admits all 18 page and 75 Vue candidates, with
  zero runtime-guard declines. Their 1.25 million reads are 5.08% of 24.64 million
  interpreted capture reads; none come from bootstrap. Narrow scope pruning did
  target live functions but covers little of this trace. HTTP 200, 16 scripts then
  Vue timeout, cleanup zero. Source untouched; the instrumented compiled file was
  restored byte-for-byte and census/probe/backup removed. No speed or join claim.
- Narrow closed-return lexical pruning is rejected and reverted. The candidate
  physically replaces unused intermediate scopes with the original global scope,
  preserving indirect eval and its string-compilation policy. Twenty-nine new and
  43 existing focused SDK checks, scoped core/new-test compilation and new-file
  lint/format pass. The restored baseline passes 26 preservation checks and fails
  the physical-scope regression as expected. GC confirms omitted payload collection.
  Actual native adapter retention grows by
  230 candidate versus 60247 baseline units for an unused 60000-character payload;
  identity/captured writes/private fields, dataSize rejection at 400000 and close
  data zero are preserved. Serial 30 s live candidate/baseline execute 16 scripts
  then Vue times out at 958789/959040 steps and 892105/892227 peak units. No useful
  initialization gain or meeting join. All four original SDK source/build files
  are restored byte-for-byte; helpers/tests/config/probes and backup removed.
- Declaration-boundary census finds 480 ordinary declarations: first exposure by
  lookup for 109 and global publication for two; 369 have no tracked exposure before
  timeout. Snapshot/frame/property/invocation probes add no first exposures in this
  trace; this is not exhaustive access-path coverage. Of 9.15 million declaration
  capture reads, 7.80 million precede exposure. A separate executable deferred-body
  model postpones initialization until call but leaves accounting unchanged: eager
  and deferred shells both retain 60001 units and perform 101 scope reads over 101
  measurements; both reject at dataSize 40000 and clear to one unit. Deferring body
  factories behind existing function shells does not remove the reconciliation work.
  A useful deferred-binding design still needs canonical function identity, actual
  retention representation, publication/copy/import boundaries and snapshot recovery;
  unread counts do not authorize omitting captured scopes. Live census: HTTP 200,
  16 scripts then Vue timeout at 958127 steps / 891790 peak; no join, close data zero.
  Source untouched; three compiled files restored byte-for-byte and backup removed.
- Opaque compiler-scope metadata with revision-tracked private-name maps is rejected
  and reverted. Thirteen new and 58 existing focused SDK checks pass (one GC check
  skipped), along with scoped core/new-test compilation. The actual native adapter
  matches restored baseline: identity/private fields/captured writes, 150355 retained
  units, 30355 after clearing (120000 released), dataSize rejection at 400000 and
  close data zero. Serial live candidate/baseline both execute 16 scripts and time
  out in Vue: 959920/959687 steps, 892782/892630 peak units, cleanup data zero;
  233 extra total steps (0.024%) establish no useful initialization gain or join.
  A supplemental foreign
  parent-replacement probe fails candidate (25 versus 28 units; one versus two
  provider calls) and passes exact baseline. Sealed writable fields and tracked
  private-map membership do not prove ownership of the entire ancestor/provider
  chain; an exact graph reuse design needs that provenance too. All eight original
  SDK source/build files are restored byte-for-byte; helper/test/config/probe and
  backup removed. No candidate foundation remains.
- Creator-origin census attributes 19.71 million interpreted capture reads to
  browser bootstrap (4.85 million, 127 functions created), join-page inline scripts
  (8.69 million, 400), Vue (5.75 million, 960) and smaller assets (0.42 million).
  The visitor records 76.79 million entries during inline scripts and 96.97 million
  during Vue; 34.86/43.52 million respectively already have seen object identities.
  Five inspected Vue/site-helper assets have no getRandomValues/randomUUID/subtle
  references; Web Crypto is not established as the present blocker. Focus the next accounting
  design on retained library graphs across primary measurements, preserving mutable
  descendants and foreign effects; browser-bootstrap reduction alone covers only
  24.6% of interpreted capture reads. These counters establish attribution, not
  cache safety or speed. HTTP 200, 16 scripts then Vue timeout at 954776 steps /
  889177 peak units; no join, close data zero. Same-walk binding mutation (12 units)
  and data-limit rejection sanity pass. Source untouched; both instrumented compiled
  SDK files restored byte-for-byte, backup removed, no diagnostic artifacts retained.
- Owned lexical-scope snapshot sharing is rejected and reverted. The standalone
  adapter probe preserves function identity/captured writes, releases a retained
  60000-character payload and rejects excessive allocation; 91 focused SDK checks
  and scoped compilation pass before final guard additions. Both live candidates
  time out in the first inline script with zero scripts executed, regressing from
  the baseline's 16 scripts before Vue timeout. Admission instrumentation records
  5.85 million reads, 3.53 million hits, 744742 snapshots and 2.32 million guard
  declines; sharing was admitted but supplied no useful initialization progress.
  No meeting joined; both runs close with zero retained data. All 14 SDK source/build
  files are restored byte-for-byte and experimental helpers/probes removed. No
  final-guard compilation, full SDK pass or speedup is claimed.
- Mutation coverage probe confirms the existing intrinsic token is not a general
  retained-graph epoch: array membership, ordinary prototype links, private-field
  values and retained-provider output grow measured data by 101/109/100/100 units
  without changing it. The live Zoom census sees 44944 primary scans, 7183 adjacent
  matching root signatures/token, zero changed usage in those pairs and zero token
  changes during scans. This specific trace supplies no counterexample; the four
  SDK cases rule out promoting that guard to a general exact-accounting cache.
  Stable-portion reuse needs independently validated ownership/revision witnesses
  and fresh volatile-provider traversal, not a global token alone. HTTP 200,
  16 scripts then Vue timeout at 958789 steps / 892105 peak; close data zero, no
  join. SDK source untouched, both compiled files restored exactly, probe removed.
- Cross-checkpoint accounting census samples adjacent pairs every 32 scans, keeping
  all graph checks active. Two live runs agree: 45076 measurements, 1409 pairs;
  288 matching signatures cover 1473495 / 6682457 visits (22.1%). The second run
  finds a matching prefix covering 5883323 visits (88.0%), with no 32768-entry cap
  reached. Signatures include visit identity/depth, charged strings and total units;
  hashes and uncharged primitive coalescing are availability evidence, not exact
  graph equality or cache safety. Sampled closures are 69.3% interpreted; matching
  callback output does not authorize skipping its observable effects. Next accounting
  design should reuse independently validated graph portions with mutation provenance
  and volatile-provider barriers, rather than whole-result reuse. Both runs return
  HTTP 200, execute 16 scripts and time out in Vue at 958789 steps / 892105 peak
  units; close data zero, no join. Callback-read and held-limit sanity checks pass.
  SDK source untouched, exact build restoration verified, census/probe removed;
  instrumented timings establish no speedup.
- Native canvas drawImage now accepts same-document HTML canvas and loaded image
  sources at natural size, scaled or cropped. Negative sizes preserve direction;
  source/destination clipping and self-copy snapshots stay bounded. Source alpha
  and globalAlpha compose over destination pixels. Image-loader origin checks,
  including redirects, taint readback and propagate through canvas copies;
  clear/paint/save/restore preserve taint and dimension writes reset it. Thirteen
  added manifest checks and 68 existing canvas/image checks pass; native build and
  changed canvas-file lint/format pass. Actual SafeJS drawing, self-copy, loaded
  image, taint propagation/reset and native PNG pixels pass, close data zero;
  probe removed. Nearest-neighbor sampling, primitive coordinates and exact 3/5/9
  argument forms only; foreign documents, video/ImageBitmap sources and CORS image
  loading remain unsupported. SVG inherits the existing static native subset.
  This advances image/avatar primitives, not Zoom initialization or meeting media.
- Filtered later-script diagnostic denies /lib/vue/ and /fe-static/fe-frame-popups/
  only in an ephemeral script policy. It reaches 19 executed scripts, then all.min.js
  (243575 characters, jQuery/site helpers) times out at 30.1 s / 585018 total steps /
  368232 delta / 602814 peak units; cleanup data zero, no join. Source inspection
  confirms Vue supplies popup CAPTCHA via all.min.js AJAX handling, so the filter
  is not a complete workflow policy. Initialization cost also affects a separate
  library; fixing Vue alone or filtering UI assets has not established readiness.
  Probe removed; production source/build and existing Automations are unchanged.
- Native HTML canvas has bounded 2D rectangles/readback and viewport compositing:
  stable context, color/alpha state, save/restore, fillRect/clearRect/getImageData;
  resize clears pixels/state and close revokes access. Normal-flow inline/block
  layout uses bitmap intrinsics and CSS scaling; nearest-neighbor painting follows
  padding, borders, background, overflow, opacity and screenshot crop. Unpainted
  canvases allocate no backing store. One runtime/child documents share 4M pixels
  and 64 contexts. Eighteen added API/rendering checks plus 335 existing manifest
  checks pass; TypeScript/build and new-file lint/format pass. Actual native + SafeJS
  drawing-to-PNG pixel assertions pass, cleanup data zero. WebGL, paths, text,
  transforms, video drawing and canvas export remain missing. Existing
  script-dom import-order/assignment-expression lint remains. Vue initialization
  and Zoom join/media readiness remain unverified.
- Fresh line-sampled baseline profile has 21937 visitor self samples: 1501 at seen
  lookup, 1487 at insertion (13.6% combined), 925 at capture-provider reads and 869
  at closure-property reads. Cost is spread across identity, metadata and descriptor
  paths; no single line dominates. Symbol/private traversal adds 5587 self samples,
  including 982 at symbol enumeration. Samples identify source positions, not exact
  operation timings. Live run still times out at 959040 total steps with 16 scripts
  executed and cleanup zero. Profile artifacts removed; source/build unchanged.
  Next accounting candidate must reduce repeated graph-wide work, rather than
  treating one metadata lookup or one ancestry cache as sufficient.
- Isolated 240 s baseline diagnostic also times out in Vue: HTTP 200, 16 preceding
  scripts pass, 1055341 total steps / 840306 Vue delta / 934886 peak units, cleanup
  data zero and no meeting joined. The 30 s baseline reaches 959469 total steps;
  execution advances, but four minutes still does not establish initialization.
  Only the ephemeral owner's timer and existing 300 s navigation selection were
  extended; memory/step limits and production code are unchanged, harness removed.
  Stop extending timers as a proposed fix. Investigate an accounting algorithm
  change that preserves full primary reconciliation and observable foreign metadata.
- Scope epoch caching is rejected and reverted. Eight new and 113 existing SDK
  checks, scoped core/new-test compilation and the actual native retention/limit/
  cleanup probe pass. The uninstrumented candidate still times out at 954120 total
  Vue steps versus 959469 in the restored serial baseline; startup CPU is 20.0 s
  versus 16.6 s. Both execute 16 scripts and close at accounted data zero. A separate
  census confirms 23.06 million fast
  hits among 30.30 million Scope reads, zero module/untracked declines and 7.02
  million other declines; these instrumented counts are not a speed comparison.
  Exact source/build restoration and baseline core compilation pass; candidate
  test/config/backups and counters are removed. No initialization or meeting join.
- Factory closure classification is rejected and reverted: eight new and 44
  existing SDK checks, scoped core/new-test compilation and the actual native
  class retention/limit/cleanup probe pass, but serial 30 s Vue reaches 957785
  versus 957965 baseline steps; both timeout and close at zero, matching the earlier
  duplicate-entry experiment. Proxy/dynamic source retention and foreign weak/
  resource metadata observations are preserved. Exact source/build restoration
  and baseline core compilation pass; temporary artifacts are removed.
  Separate V8 probe finds the 26733-byte visitor below the 61440-byte optimization
  limit, with visitor/measurement functions TurboFan-optimized at both checkpoints.
  Baseline Vue steps split into 588470 before interpretation and 154460 execution;
  bootstrap splits 120175 / 31581. Compare execution work as well as total steps
  in future experiments. No useful initialization improvement or meeting join.
- Chain-wide local capture projection is rejected and reverted. Twelve new and
  156 existing SDK checks pass, including GC, future bindings, shared writes, TDZ,
  recursion, classic scripts, held limits and snapshot preservation; scoped core/
  new-test compilation passes. Actual native probe retains 30249 units candidate
  versus 150282 baseline, returns 7, clears to 29996, rejects excessive data and
  closes at zero. Serial 30 s Vue reaches 955895 versus 959469 baseline steps;
  both timeout, with startup CPU 18.1 versus 16.8 s and cleanup zero. No useful
  initialization improvement. Exact source/build restoration and baseline core
  compilation pass; all candidate helpers/tests/config/probe artifacts are removed.
  Census identifies interpreted functions as 80% of post-bootstrap closure visits
  and repeated identities as 45% of entries, but smaller escaped captures alone
  have not improved active primary reconciliation. No initialization/join acceptance.
- Opt-in fixed Scope metadata/snapshot sharing is rejected and reverted. Serial
  30 s Vue runs reach 959687 candidate versus 959469 baseline steps (less than
  0.03% difference); both execute 16 preceding scripts, timeout and close at zero.
  Candidate checks: 232 manifest-listed native checks, 13 new SDK checks including
  deleted-private-name GC, native build/format and scoped SDK compilation pass.
  Broader SDK checks reproduce the existing empty-child root-identity failure;
  no full-suite pass is claimed. Actual native class retention/limit/cleanup probe
  matches baseline. Experiment source/build changes are restored exactly; restored
  native build and scoped SDK compilation pass. No initialization/join acceptance.
- Private-table ownership alone is rejected and reverted. Eleven new and 240
  existing SDK checks pass, including explicit GC, class/snapshot/held-memory
  preservation; scoped core/new-test compilation and new-file formatting pass.
  Actual native class adapter matches baseline: return 60000, retain 90289 /
  peak 270300 / clear 29985 from 29965, reject excessive data at 400000 and close
  at zero. Serial 30 s Vue reaches 958575 candidate versus 958329 baseline steps;
  first-script CPU is 16.5 s for both, with 16 scripts executed, Vue timeouts and
  cleanup zero. Follow-up confirms all 2.63 million startup / 1.56 million Vue
  table reads use the owned fast path; live realms reuse scopes directly, so
  snapshot restoration is not the cause of the absent gain. Source/build baseline
  is restored exactly; candidate/probe artifacts are removed. Further sharing
  needs cheaper guarantees for Scope metadata, not private-table reads alone.
  No initialization, join or media acceptance.
- Temporary scope-snapshot census rules out weak snapshot lifetime as the main
  target: startup has 11.51 million scope reads / 7.28 million cache hits / 38
  cleared weak snapshots; 60 s Vue has 28.10 million reads / 24.56 million hits /
  238 cleared snapshots. All 4.22 million startup / 3.53 million Vue metadata
  declines are private-name scopes, with zero module/resource/import/with declines.
  Existing snapshots already cover most reads; owned private tables above do not
  change scope snapshot eligibility. Fourteen preservation checks and scoped core
  compilation pass. Counters are instrumentation, not a speed comparison; Vue
  still times out, and the source/build counters are reverted.
- Zoom initialization diagnostic now enables existing policy-aware HTML/network
  modules and logs every script's start/result, URL path and execution-step delta;
  URL credentials, queries and fragments are omitted. TypeScript/build and formatter
  checks pass, along with 176 manifest-listed native module checks. Actual SafeJS
  in-memory probe executes imported and inline modules, skips nomodule/duplicate
  entries, performs two fetches and closes at data zero. Live module-enabled route
  returns HTTP 200; all 16 pre-Vue scripts pass, then Vue times out at 30.8 s /
  951257 total steps / 878318 peak units. Module-not-supported issues disappear;
  deferred modules remain unexecuted after the halt. Cleanup data is zero. Vue
  initialization remains the next blocker; no readiness, join or media acceptance.
- Guarded per-measurement scope-read sharing is rejected and reverted. Seventeen
  new SDK checks and 27 existing focused checks pass; broader coverage passes 124
  checks across 15 files, including seven initially skipped GC checks rerun with
  explicit worker GC. Scoped core/new-test compilation and new-file formatting pass.
  Guards preserve callback/proxy mutations, getter counts, reentry, primitive
  multiplicity, snapshot recovery and held primary limits. Actual native outcomes
  match baseline: return 60007 / retain 90274 / peak 150274 / clear 29974, reject
  excessive data at 200000 and close at zero. Serial live 30 s Vue reaches 950330
  candidate versus 959687 baseline steps; both time out with 16 scripts executed
  and cleanup zero. First-script CPU regresses to 25.1 s versus 16.3 s. Exact
  baseline source/build restoration and core compilation pass; cache source/tests,
  configs/probes/backups are removed. Further sharing needs cheaper guarantees for
  interpreter-owned metadata while retaining observable foreign metadata fallback;
  the current guards cost more than the scope reads they avoid. No join/media acceptance.
- Temporary effect-barrier probe estimates 15.34 million potentially reusable
  reads among 21.01 million interpreted closure captures (73.0%) across initialization
  plus 30 s Vue. Barriers surround unknown callbacks/untracked objects, reset between
  top-level roots and reject accessor/custom scope metadata. Existing owned empty
  module environments must remain eligible; excluding them incorrectly rejected all
  live scopes. Four SDK sanity cases preserve callback/proxy mutations, six private
  getter reads and exception restoration. Native return 12 / retained 30113 / peak
  30292 / cleanup zero matches the restored baseline. Source is unchanged and all
  instrumentation/probes/backups are removed. This is an availability estimate,
  not a cache safety or speed proof. The guarded follow-up above passes preservation
  checks but regresses live initialization. Vue still times out; no join/media acceptance.
- Temporary live declaration/read/sharing counters identify repeated capture reads
  as the next target. Across initialization plus 30 s Vue, 22.71 million interpreted
  closure captures include 19.16 million (84.4%) rereads of the same Scope within
  one measurement, with zero reads outside measurement and zero generator exclusions.
  478 declarations / 1128 expressions are created; 103 / 306 are observed through
  binding or interpreter property reads and 46 / 242 invoked. 7.68 million declaration
  and 9.80 million expression captures precede either observation or invocation;
  expressions already expose a value on creation, so these counts do not authorize
  lazy instantiation. Native sanity covers export, call and construction (return 12,
  peak 30392, cleanup zero), including exact baseline restoration. Instrumentation
  in four builds and all probes/backups are removed; source is unchanged. Investigate
  sharing trusted scope reads within each measurement while preserving same-walk
  mutations, metadata/iterator effects, depth and held primary limits. These numeric
  probes are not speed comparisons; Vue still times out and no meeting is joined.
- Guarded private-name scope snapshot caching is rejected and reverted. The
  candidate passes 195 focused SDK checks across 21 files (10 new), scoped
  core/new-test compilation and new-test formatting. Nine preservation checks
  pass on the exact baseline; only whole-frame cache reuse fails there. Actual
  native adapter outcomes match: return 60007, retain 90274 units / peak 150274,
  clear to 29974, reject excessive data at 200000 and close at zero. Serial live
  30 s Vue reaches 957082 candidate versus 956381 baseline steps; both time out
  with 16 scripts executed and cleanup zero. First-script CPU is 18.3 s versus
  17.2 s; competing builds limit timing conclusions. No useful initialization
  gain established. Exact baseline source/build restoration and scoped core
  compilation pass; experiment tests/configs/probes/backups are removed. The
  declaration/sharing follow-up above guides the next target. Lazy instantiation
  still needs identity, ownership, snapshot and memory-accounting guarantees.
  No initialization/join/media acceptance.
- Internal read-only scope roots are rejected and reverted: 160 SDK checks across
  20 files (13 new), scoped core/new-test compilation and new-test formatting pass.
  Native probe creates 124780 roots arrays versus 149720 baseline; both return
  1200000, retain 90236 units / peak 150245, clear to 29988, reject excessive data
  at the 200000 limit and close at zero. Serial live 30 s Vue reaches 959469 steps
  candidate versus 959277 baseline; both time out, 16 scripts executed, cleanup zero.
  No useful initialization improvement. Separate live numeric probes find 47.9 million
  closure-capture reads across initialization plus a 60 s Vue window, and 30.5 million
  scope reads / 7.05 million private-name cache fallbacks across initialization plus
  a 30 s Vue window; zero namespace/resource/with/raw-metadata fallbacks. Instrumented
  runs are not speed comparisons. The guarded private-name snapshot follow-up above
  preserves membership/read ordering but also fails to establish a useful live gain.
  Exact source/build restoration
  and baseline core compilation pass; all experiment/probe/config/backup artifacts
  removed. No join/media acceptance.
- Automatic anonymous/deferred declaration scope selection is rejected and reverted.
  Owned frozen syntax, conservative analysis and delayed declaration-cell selection
  pass 288 focused SDK checks across 20 files, scoped core/new-test compilation and
  new-test formatting. The Promise-subclass snapshot timeout reproduces on the exact
  baseline. Actual native declared capture: 90189 retained units baseline versus
  30180 candidate; both return 7, clear to 29988, reject at dataSize 200000 and close
  at zero. Serial live 30 s Vue: baseline 958127 execution steps / 891790 peak units;
  anonymous candidate 956381 / 881930; deferred declaration candidate 958575 / 883278.
  New freeze/scan work is subtracted from candidate steps; concurrent background
  builds limit timing comparisons. All time out with 16 scripts executed and cleanup
  zero; no useful initialization improvement or join established. Primary accounting
  still includes active invocation scopes. Investigate that reconciliation cost rather
  than escaped captures alone. Exact seven-stem source/build restoration and baseline
  core compilation pass; experiment helpers/tests/config/probes/backups are removed.
- Internal plain-local scope projections now share mutable binding cells without
  retaining the original local frame or omitted data. Weak view tracking propagates
  accounting-cache invalidation; opaque snapshot cell IDs preserve sharing across
  distinct frames and repeated recovery. Legacy frames remain readable. Retained
  contribution: safejs-projected-scope-shared-cells.patch. Validation: 21 new SDK
  checks (including explicit GC), 200 existing checks, scoped core/new-test TypeScript,
  new-test formatting and exact seven-file patch forward/reverse verification pass.
  Two recovery checks fail without IDs; five cache/limit checks fail without shared
  invalidation. One Promise-subclass constructor snapshot timeout reproduces on the
  saved baseline. Automatic capture selection remains disabled after the reverted
  frozen-syntax/conservative-analysis experiment failed to improve initialization.
  No new Zoom initialization, join or media acceptance is claimed.
- Closures now discard the creating invocation's callee, which every invocation
  replaces. The retained contribution is safejs-release-creating-callee.patch;
  lexical scopes, arguments, constructor metadata and primary accounting stay intact.
  Validation: 212 focused SDK checks across 14 files and scoped core compilation pass;
  five explicit-GC regressions fail on the saved baseline, seven preservation checks
  pass both. Exact contribution forward/reverse verification and new-test formatting
  pass. Actual native adapter: a cleared caller and its 60000-character property
  collect only with the fix; the returned closure still returns 7. Both versions
  measure 30242 units versus starting/cleared 29965, reject excessive allocation
  at dataSize 200000 and close at zero. This fixes hidden physical retention;
  it does not reduce measured lexical captures. Serial live 30 s comparison:
  baseline 956381 steps / 890071 peak units, fix 956220 / 890082; both Vue timeouts,
  16 scripts executed and cleanup zero. No initialization improvement or join claimed.
- The repeatable authorized live diagnostic is scripts/check-zoom-initialization.ts:
  selects the working SDK explicitly, uses the extension adapter and correctly
  nests ScriptLoader limits (256 scripts / 64 external / 8 MB source). Earlier
  temporary probes supplied an ignored second constructor argument; their Vue
  timeout preceded the default loader limits. New scoped TypeScript and formatter
  checks pass. Actual 30 s run: Vue timeout, 959277 steps / 892499 peak units,
  16 scripts executed; failure exit, readiness/join unverified, cleanup data zero.
- App/tenant old/current web-client route variants all converge to the same
  app.zoom.us/wc/join/7982110526 page, bootstrap and Vue asset. Published join
  handler uses CAPTCHA completion and join fields; the form has no usable native
  submit action. The working notetaker selects the same /wc/7982110526/join route.
  No lighter route or supported form-only join established. Read-only native
  source inspection does not replay join/authentication/challenge requests.
- Retained SDK contributions include classic globals, callback scheduling, strict
  idle dictionary conversion, timed checkpoints, held-data enforcement, tracked
  own-field/private-name projections, frozen closure symbol snapshots, managed
  proxy descriptor capture and record/array DFS continuations. Direct and scoped
  closure captures now continue off the stack at depth 128; transparent scope roots
  use DFS continuations without adding units or depth. Tested record/array/capture
  chains reach 1024 and reject 1025 with dataDepth. Capture iterators preserve step
  failures, mutation order and inner-to-outer close order on descendant errors.
  Broader graph depth coverage remains open.
- Compiled-ticket ownership now scans escaping roots only when reconciliation is
  unheld and an included ticket has a positive staged charge. Primary graph
  measurement, held limit enforcement and ticket forwarding remain intact.
  Metadata providers must not rely on an optional ownership scan for side effects;
  release of a hold during the primary capture is covered. This change deliberately
  reduces capture invocations when the ownership result would be unused.
- Capture-continuation validation: 194 focused SDK checks across 25 files, scoped
  core compilation,
  new-test formatting and exact contribution patch forward/reverse application pass.
  All six new direct/mixed/scoped depth regressions fail on the exact saved baseline;
  ten iterator/accounting preservation checks pass on both versions. Actual native
  adapter: a 256-level guest closure graph succeeds; the larger 512-level graph
  rejects at dataDepth 1025 versus limit 1024 and releases data on close. Both native
  guest outcomes are preserved from baseline. Final nine-case actual idle checks pass
  serially at default 1 s and explicit 16 s; earlier candidate timeouts keep reliability
  open. Shallow warmed benchmarks are similar; depth-256 continuation median is
  0.081 ms versus 0.043 ms baseline, so deep traversal has a performance cost.
- Object/symbol scope bindings now use their own measurement identities instead
  of redundant cell projections. Strings/bigints retain cell roots for independent
  primitive charges. Writes invalidate snapshots based on both old and new charged
  values; full graph reconciliation, memory limits and depth limits remain active.
  Validation: 169 focused SDK checks across 23 files, scoped core compilation,
  new-test formatting and exact contribution forward/reverse application pass.
  Eight added preservation checks pass baseline and candidate; six fail if the
  changed invalidation is omitted. Four older empty-module scope-shape failures
  reproduce on both. Native capture/clear/data-limit/cleanup outcomes match baseline;
  clearing a captured 60000-character payload removes 60006 data units. The two
  manifest-listed native idle files pass 89 checks, separate from actual SDK probes.
- Last 120 s, 192 MB live diagnostic: initial 107111-character script completes in
  14.3 s; Vue times out at 120222 ms, 1006603 steps, peak data 914788 units and 16
  scripts executed. Cleanup releases all accounted data; no meeting joined. Loader
  completion does not prove application readiness. A serial 30 s baseline reaches
  958127 steps versus candidate 959687; both time out. Shallow closure measurement
  falls from 0.329 to 0.307 ms in one warmed benchmark; other fixtures are mixed.
  No reliable initialization speedup is claimed. A visitor-entry fast path was
  rejected and reverted after no live gain.
- Rejected scope-root grouping/reuse and weak-map visitation experiments were
  reverted after mixed benchmarks and no initialization gain. Extending snapshots
  to native private-name maps also failed to establish a useful live improvement:
  30 s Vue diagnostics reached 957965 baseline versus 958575 candidate steps, both
  timed out. Synthetic warmed measurements fell from 0.45 to 0.36 ms, but the
  experiment is reverted. Its 113 focused SDK checks, native suspended private-field
  data limit and removed-value GC probes passed. No experimental caches remain.
- Retained CPU evidence: graph visitor 25.4 s, private/symbol traversal 5.7 s,
  scope-root collection 4.2 s and GC 1.9 s of self samples in a 49 s profile.
  A separate live visitor probe counts 79.7 million entries / 24866 measurements
  and 12.2 million capture reads for the first script; Vue's 30 s window adds
  140.2 million entries / 14651 measurements and 19.2 million capture reads.
  Closure contexts physically retain full scope chains; filtering accounting alone
  would undercount retention. Investigate execution-context/capture compaction with
  shared cells, conservative eval/with handling and snapshot alias preservation.
  Existing lint scanners resolve lexical reads, but expose no reusable capture
  analysis. A static Vue scan finds 116 conservative parameter-only return
  candidates among 1765 functions; runtime scope/callback eligibility is unmeasured.
  A phase probe attributes 13.2 of 14.1 s in the first script and 28.5 of 30.5 s
  in Vue to reconciliation. Sampled locations advance through normal Vue CSP
  parser/AST-type setup; no alternate compatibility fallback was established.
- Closed-invocation retention diagnostics identify about 10% candidate-unused
  occurrences among sampled charged bindings. Twenty lexical-analysis checks and
  four instrumented preservation checks pass. Excluding property keys/labels and
  retaining scopes whose arguments were read leaves similar results. Binding
  counts do not establish retained units, visitor cost or a speedup.
- Physical release of unused terminal-invocation arguments is rejected and reverted.
  The bounded, uncached whole-function analysis excludes arguments/eval identifiers,
  classes/with and exposed/suspended checkpoint paths. Candidate: 145 SDK checks
  across 16 files and scoped core compilation pass; two physical-release regressions
  fail on baseline, ten preservation checks pass both. Actual native adapter:
  unused 60000-character extra argument raises retained data by 60109 units baseline
  versus 88 candidate; clear restores starting data, excessive allocation still
  rejects with dataSize, close releases all data. Serial 30 s Vue reaches 956710
  candidate versus 958789 baseline steps, both timeout; peaks 886591 versus 892105.
  No useful initialization improvement or meeting join established. Exact source/build
  baseline and declarations are restored; baseline core compilation passes and all
  candidate helpers/tests/config/probes are removed. Broader capture compaction still
  needs shared-cell snapshot identity and stable-code/escape guarantees.
- SDK-owned literal/constructor array projections are rejected and reverted:
  large array-only CPU gains did not improve live initialization. Final candidate
  and baseline both reach 957340 steps / 890986 peak units in serial 30 s runs;
  first-script CPU is 17.2 s versus 17.0 s. Unrelated builds compete for CPU, so
  mixed wall times prove no speedup. Scoped compilation and focused preservation
  checks pass, including partial failed length writes, mutable child graphs,
  snapshot recovery and intrinsic records. Exact SDK source/build baseline is
  restored; no candidate code, caches or diagnostic artifacts remain.

## Outstanding gates

- The complete seven-module static graph now clears offline compilation and linking
  at a 128 MB heap limit above. Runtime materialization retains decoded AST nodes, so
  full-client runtime heap and initialization performance remain unverified.
  Live preload now measures about 133.2 MB before module compilation; classic-script
  retention and module evaluation/reconciliation cost remain the next memory and
  performance targets. The longer 192 MB run exhausts heap after seven modules prepare.
  With the later record-layout fix, a 192 MB run prepares seven and revokes at its
  120 s import deadline without OOM, with no readiness/join and cleanup data zero.
  CPU profiling at 192 MB later exhausts heap after seven prepare; this heap allowance
  is not a reliable gate. The 384 MB profile revokes at deadline with cleanup zero.
  The instrumented 384 MB census verifies all seven link and remains pending in editor
  evaluation; the later 384 MB run also revokes at its 120 s import deadline.
  These runs clear no default heap/time gate.
  The earlier 768 MB statement trace prepares all seven but stays pending at 15 min,
  reaching editor statement 1353 after React DOM and DOMPurify complete; the later
  full-client run remains pending at 30 min. Selected borrowed document methods
  preserve receivers and the isolated sanitizer passes four benign output fixtures.
  Broader DOM/library compatibility and retained-graph evaluation cost still need
  work. Compilation, fetch completion and green classic reports prove no readiness;
  diagnostic heap/time/response allowances clear no default runtime or meeting gate.

- Background dynamic imports have a separate per-import deadline/TLA timeout above;
  expiry revokes the realm rather than allowing partially initialized work to resume.
  Shared step/data limits and document cancellation remain active. Cooperative delivery
  does not bound a blocking synchronous host call or parsing operation. Do not clear
  the default 30 s initialization gate or settle all imports inside their originating
  classic task; the full client still exceeds memory/time acceptance.
- Interactive Zoom initialization/join and every notetaker capability listed above.
  The latest maintained desktop classic route clears the observed externals heap
  abort at 128 MiB, but externals still reaches its 30 s execution deadline before
  vendors/main-client startup. Later client heap, initialization timing and the
  default identity's legacy route remain unverified.
  Iframe navigation, srcdoc/policy contexts and child script realms remain unsupported.
  Diagnostics block optional file-paa.zoom.us and cdn.cookielaw.org origins;
  production actor/default 128 MB heap, meeting sockets, media and transcription
  acceptance remain unverified. Invitation landing reports unsupported OS; an
  alternate duplicate script path exhausted the 192 MB heap.
- Earlier native extension-page probe reports absent RTCPeerConnection,
  AudioContext, MediaRecorder, navigator.mediaDevices/getUserMedia, Worker,
  WebAssembly and canvas getContext; cleanup data zero. The bounded canvas 2D
  subset above now passes its own adapter probe; full canvas rendering remains open.
  The working recorder captures tab audio through getDisplayMedia and processes
  it through an AudioWorklet at 16000 Hz; it verifies a browser surface, one audio
  track and disabled audio processing. Native getDisplayMedia and this actual audio
  source remain unimplemented; native PCM chunk handling is not a Zoom audio source.
  Media transport/rendering APIs need implementation,
  separately from initialization performance and later live acceptance.
- Baseline parser else-if nesting raises RangeError before its intended syntax
  limit diagnostic. Default-stack dataDepth for untracked prototype chains, closure
  property paths and other untested graph edges; deep-copy host ingress/result export and
  deep plain-object copying also overflow the native stack on baseline. Older
  scope-root shape expectations remain unresolved. Record/array measurement now
  reaches its depth boundary above; prototype/capture/copy paths retain separate gates.
- Three baseline joined-callback rejection failures, a PageScripts timer probe's
  generic callback script-error and
  an onload non-callable-handler failure. Prior intermittent default 1 s idle
  initialization failures keep timing reliability open despite recent nine-case passes.
- The older scratch SDK full build has unresolved tiny-mcp-client dependency types.
  The maintained poe-code SDK package build passes; the full package test suite has
  no completed pass.
- Older native capability metadata and classic-loader limit expectations; no full
  native-suite pass is claimed. DOM branding lacks full prototype method tables;
  namespaced creation currently supports only unprefixed HTML, SVG and MathML names.
  Seven HTML-runtime fake-SDK contract checks have pre-existing DOM-branding
  bootstrap source expectations that differ from the current dirty worktree.
- Keep native, SafeJS, live-network, socket and TTY/PTY gates separate. Use only
  manifest-listed native tests from native-tests.json. The user approved SafeJS,
  live Zoom and necessary sockets; native passes prove none of the other gates.

## Retained development inputs

- Native source/build: this repository. Preserve unrelated uncommitted work.
- Working SDK source/build: /tmp/agent-browser-zoom-sdk/packages/safe-js.
- Maintained SDK source/build: /home/kjopek/project/poe-code/packages/safe-js;
  direct typed-array accounting and live-buffer fixes are verified there.
- Reusable validated isolated SDK:
  /home/kjopek/project/poe-code/out/agent-browser-zoom-desktop-ihql25/candidate,
  including maintained host-member accounting fix 5e6686f52 and tracked host
  expando projections ae02c6e21, direct root traversal 262d12dd9 and realm root
  collection ae2a16513 and private accessor registries b71bdbc7e.
- Focused SDK contribution patches: contributions/. Some recovered accounting
  patches still need reconciliation; a temporary metadata patch header was normalized
  only in the retained scratch SDK.
- Keep validation artifacts ephemeral. No run diaries, inventories, page dumps or
  archives. Commit completed focused changes atomically; do not push unless asked.
