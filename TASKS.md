# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. This is
  exploratory work, not a migration; keep Automations unchanged and operational.
- Keep the native engine independent of Chromium, Firefox and remote browsers.
  SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. The approved diagnostic route
  is https://app.zoom.us/wc/7982110526/join. No meeting has been joined.
- Acceptance requires initialized interactive controls, admission and verified
  presence, roster/chat, audio capture/transcription, playback, live microphone
  and avatar support, then leaving and verified cleanup.
- Continue legitimate challenge handoffs, top100 compatibility, secret
  placeholders with extensible .env/pass providers and passkeys, browser-only
  research, playground/terminal and command coverage.

## Current verified state

- Maintained SafeJS source/build: /home/kjopek/project/poe-code/packages/safe-js.
  Reuse this browser's working dist; preserve unrelated dirty sources in both
  repositories. The full native suite and full SafeJS suite have no completed
  pass established for the current trees.
- Retained SafeJS improvements include private retained-data snapshots and
  descriptor access, bounded capture pooling, direct SDK-owned getter dispatch,
  fixed-key source records, discarded module-snapshot elision and static module
  export/import indexes. Indexes preserve live bindings and cycle/ambiguity
  handling; a 600-export fixture uses 3604 rather than 183304 steps.
- Live allocation sampling estimates 22.1 GiB cumulative allocation, not heap
  use; almost all is under reconciliation. Native descriptors account for about
  30%, visitor self allocations 29%, symbol snapshot capture 10%. Only about 17%
  of externals symbol descriptor reads are on tracked tables; caching only those
  descriptors has limited coverage and is not implemented.
- Maintained symbol-snapshot fix (84a93eecb, local only) replaces per-symbol
  wrapper objects with alternating keys/descriptors in the private vector.
  Before-fix allocation test observes two wrappers; candidate observes zero.
  Fresh descriptor/provider reads, pre-callback ordering and full quotas remain.
  Initial 97 selected checks across 13 files pass; final 30 checks across four
  files include native hook privacy for records/closures and ordinary/held quotas.
  Strict typing, scoped lint, maintained selected build and eight built imports
  pass. Reversed compiled comparisons preserve charges/provider reads and reduce
  CPU about 19% for symbol records, 14% for closures, 11–21% for mixed roots.
  Accepted isolated SDK updated; its eight built imports pass.
- Earlier authorized live candidate: HTTP 200, 12/13 classics pass; an empty
  classic task reports execution-closed when the module lifetime expires.
  Externals passes in 110.7 s elapsed / 67.2 s CPU. Seven modules prepare, but
  the main import hits its 120 s deadline. Last sampled 8992329 steps / 7022883
  units. Sockets zero; cleanup data zero. No startup gain, readiness or joining
  established. These diagnostic allowances do not clear default-resource gates.
- Latest full-browser diagnostic before the deadline fix returns HTTP 200,
  passes nine classics, then times out in externals after 120.2 s elapsed /
  46.0 s CPU. No ES client fetch; no sockets or joining. Cleanup data zero.
- Maintained import-deadline fix (108c0fa26, local only) connects pending import
  deadlines to sampled budget checks during metered synchronous source work.
  Timers still cover awaited work; completion/abort releases private guards.
  The earlier isolated graph overran its 120 s timer until 146.2 s during source
  preparation. Controlled compiled comparison: previous SDK finishes after the
  simulated deadline (19644 steps); candidate aborts at 2048 steps, notifies once,
  prepares no record and releases the guard. The 110 focused checks, refreshed
  regression, strict typing/lint, selected build and eight built imports pass.
  Accepted isolated SDK updated; its eight built imports pass.
- Isolated candidate graph with the actual Zoom assets, without page globals or
  sockets, links all seven remote modules in about 175 ms. Rolldown evaluates in
  589 ms / 48 steps. Editor evaluation spends 42.5 s elapsed / 20.1 s CPU across
  18493 steps before the import expires at 120.015 s total. Last 8347672 steps /
  6034520 units; cleanup data and active requests zero. This narrows the next
  performance target to editor evaluation, but establishes no native page
  readiness, admission or default-resource pass.
- Sparse editor CPU profile attributes about 96% of sampled wall time to
  retained-data reconciliation, with little GC. A fresh census using the normal
  main-module entry point records 14202 walks and 59.4 million closure visits
  (about 4200 per walk), mostly hoisted module functions. Parsing the actual
  assets counts 3703 top-level declarations: 2049 in loginview and 1363 in
  editor-core. Investigate physical hoist/binding retention rather than omitting
  retained scopes from accounting. Of 121.7 million
  already-seen object captures, the existing four-entry cache handles 121.1
  million; enlarging it is not the next target. The diagnostic expires at
  120.050 s, with cleanup data/active requests zero; no page globals or joining.
- Shared optional-state registry trial is discarded. The 62 initial and 123
  additional selected checks, strict typing, selected build and eight built
  imports pass, but reversed compiled comparisons show no reliable closure gain
  and ordinary records tend to regress. Charges/provider counts are identical.
  Owned trial sources/tests removed; maintained restoration build and eight
  built imports pass. No live candidate probe or accepted runtime change.
- Maintained primitive-literal fix (a2a31bb07, local only) avoids an empty child
  CompileScope and context copy while preserving await and full retained-data
  reconciliation. Before-fix
  tests create one empty scope for each of five primitive kinds; candidate
  creates zero. The 43 selected checks cover string limits/error locations,
  regex accounting, job scheduling and fresh ordinary/held retained-data quotas.
  A final strengthened nine-case rerun proves retained-quota errors occur at
  the literal, including during callback holds. Strict typing, scoped lint,
  selected SDK build and eight built imports pass.
  Reversed serial comparisons preserve results, steps and units; literal-heavy
  expressions use about 13–15% less CPU. Table/function setup has no consistent
  gain. The final candidate live diagnostic returns HTTP 200, passes nine
  classics, then hits execution-timeout in externals before ES imports.
  Externals takes 117.1 s elapsed / 43.7 s CPU; shared contention prevents
  startup attribution. No readiness/join; sockets zero and cleanup data zero.
- A zero-window candidate diagnostic passes nine classics but fetches no client
  and reports an unhandled callback rejection; cleanup verifies data/sockets zero.
  Normal 10 s delayed-script windows are required to observe timer-loaded client
  scripts. Source fetch/compilation and green classic checks prove no readiness.
- Empty optional closure-metadata filtering and function-prototype/accessor
  tracking trials are discarded for lack of consistent gain. Full primary
  reconciliation must remain active during suspended callback holds. Preserve
  fresh property/provider reads, memory/depth limits, cancellation, callback
  ownership and credential isolation. Do not revive graph-accounting shortcuts
  based only on tracked ownership. Capture pools stay capped at 64 physical slots.
- Cross-measurement private buffer pooling is discarded: five repeated vector
  allocations fall to zero and 87 selected checks across 12 files pass, including
  explicit success/failure GC. Strict typing/lint and candidate build/eight imports
  pass, but compiled CPU regresses: 600 records use 84.1→100.7 ms per 100 walks;
  1000 module functions use 13.8→16.5 ms. Charges remain 26007/1000 units.
  No live candidate probe; owned runtime/test changes removed. Maintained build
  restoration and eight built imports pass. Further work must target measured
  traversal costs. Temporary candidate artifacts removed.
- Native bounded canvas 2D, worker/Wasm and socket support have separate focused
  probes; their availability does not establish full Zoom media compatibility.
  Actual meeting audio transport/source remains unimplemented. Native PCM chunk
  handling is not a Zoom audio source.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances. Target
  repeated traversal of hoisted functions during editor evaluation before
  retesting the complete native page. Any retention redesign must account for
  physically retained scopes and preserve fresh provider/property reads and
  full ordinary/held quotas. Seven
  modules clear offline compile/link but live evaluation remains too costly.
  Explicit 120 s / 256 MiB diagnostics clear no default-resource acceptance gate;
  earlier larger/longer runs also established no interactive readiness.
- Verify actual joining/admission and presence in the test meeting, then every
  notetaker capability above. The default identity's server-rendered Join button
  requires installed JS handlers (type=button, javascript: form action).
  Desktop HTML has no server-rendered Join controls. Invitation landing can
  report unsupported OS. Optional file-paa.zoom.us/cdn.cookielaw.org blocking
  remains diagnostic configuration; production behavior is unverified.
- Implement and verify native RTC/audio/media transport and capture APIs. The
  working notetaker uses getDisplayMedia plus an AudioWorklet at 16000 Hz with
  one browser audio track and disabled audio processing. No native equivalent
  audio source or end-to-end transcription/playback/microphone/avatar is proven.
- Iframe navigation/srcdoc/policy contexts and child script realms remain open;
  broader DOM branding/prototype tables, namespaced names, library compatibility
  and full canvas rendering need validation. Unknown React stream helper variants
  and interactive behavior remain unverified despite opt-in extraction support.
- Revalidate earlier unresolved parser nesting/depth, deep host ingress/result
  export/prototype/capture copying, joined-callback rejections, timer/onload
  failures, idle timing reliability and fake-SDK contract expectations before
  fixing them. Focused measurement depth passes do not clear other graph paths.
- Background imports retain per-import deadlines and TLA expiry revokes the
  realm. Shared step/data limits and cancellation remain active. Cooperative
  scheduling does not bound unmetered parser segments or synchronous host calls.
- Keep native, SafeJS, live-network, socket and real TTY/PTY acceptance separate.
  Native tests must come from native-tests.json. SafeJS, live Zoom and necessary
  sockets are authorized; native passes prove none of those other gates.

## Development inputs

- Reusable accepted isolated SDK:
  /home/kjopek/project/poe-code/out/agent-browser-zoom-desktop-ihql25/candidate.
- Focused SDK contributions are in contributions/; some recovered patches still
  need reconciliation. Do not apply them blindly to the maintained runtime.
- Keep artifacts ephemeral; remove owned logs, reports and redundant builds after
  all owned processes terminate. No run diaries or findings inventories. Commit
  completed focused changes atomically with explicit paths. Do not push.
