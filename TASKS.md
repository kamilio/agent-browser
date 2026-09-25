# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. Preserve
  Automations; keep the engine independent of Chromium, Firefox and remote
  browsers. SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. Approved diagnostic route:
  https://app.zoom.us/wc/7982110526/join. **No meeting has been joined.**
- Full acceptance requires controls, admission and verified presence, roster/chat,
  actual audio capture/transcription, playback, microphone/avatar, leaving and
  verified cleanup.
- Continue challenge handoffs, top100 compatibility, .env/pass secret placeholders,
  passkeys, browser-only research, playground/terminal and command coverage.

## Current state

- Maintained SDK: /home/kjopek/project/poe-code/packages/safe-js. Reuse its working
  build and /tmp/agent-browser-node24-runtime/bin/node with --experimental-wasm-jspi.
- SafeJS 43082cd48d gives private scope accounting records a uniform layout,
  preserving public snapshots and fresh readers, collectors and reconciliation.
  The full-page comparison preserved 6664737 units; four paired 300-walk samples
  used about 3–37% less CPU. The initial smaller fixture was mixed; reversing
  comparison roles after the build preserved 6116470 units and used about
  0.5–16% less CPU in four pairs. Sampled gains do not establish a startup speedup.
  All 163 focused tests (including GC), lint,
  the maintained build and 16 built SDK checks pass. All three full DOM attempts
  still timed out at 1000 ms and closed with zero data.
- SafeJS 09db17fdb4 gives frozen closure metadata explicit own fields and one
  layout. Host Object.prototype properties previously replaced private metadata,
  reducing a 1010-unit payload to 2 units or breaking deferred initialization.
  Four regressions failed before the fix; 107 focused tests, lint, the maintained
  build, 16 built SDK checks and four built quota cases pass. The in-memory
  layout comparison preserved 6116470 units and reduced sampled CPU cost 10–26%;
  all three full DOM attempts still timed out at 1000 ms. Isolated DOM checks
  also timed out, including both matched checks with the prior metadata code;
  initialization remains unresolved. Every probe closed with zero data.
  Live outcome is below.
- SafeJS 984d2e1c28 bounds closure-property recursion: valid deep chains work on
  cold Node 22/24 stacks; excessive chains report dataDepth. Validated 127 focused
  tests and 16 built checks. Cost is comparable; fully iterative traversal was slower.
- SafeJS 84b31e2875 rechecks deferred materializations caused by later readers,
  including across nested measurements. All 16 quota regressions and 168 focused
  checks passed. Both fixes preserve fresh readers, collectors and cleanup.
- Full-page profiling on 09db17fdb4 shows accounting dominates module execution:
  a 10.14 s window used 9.32 CPU seconds for 1558 measurements and 2021 steps.
  A separate warmed walker measured 6670404 units across 7440 graph entries;
  200 walks used 1.09 CPU seconds. It retained 3703 deferred roots and 1664
  closures; 1275 function-table observations were absent, 260 materialized and
  128 deferred. Most observed functions therefore do not have eager tables
  to defer. Counting used a separate walker to avoid distorting timing.
  All 13 classic scripts completed and seven modules were prepared, then the
  diagnostic deliberately aborted at its sample. No controls or socket attempts;
  cleanup verified zero data/sockets. This does not establish normal startup.
  Preserve fresh reads, collector order and full reconciliation.
- SafeJS 3e064c2e37 defers class-method name/length tables while reserving their
  full charge. Reflection materializes ordinary tables; late materialization,
  native double reads, aliases, metadata, depth, quotas, snapshots and GC are
  covered. Matching browser graphs charged 54118 units; sampled 200-walk CPU
  cost fell from about 68 ms eager to 59–60 ms deferred. Two warm full DOM runs
  passed all 37 assertions at 46328 steps within the unchanged 1000 ms limit;
  other runs timed out, so reliable full initialization remains outstanding.
  Focused tests, lint, maintained build and 14 built SDK checks passed.
  Follow-up 8c654edc09 preserves guest-state classification before reflection,
  including rejection of capability-only replay; 55 focused checks passed.
- SafeJS 8aa116e371 fixes the extra host-type lookup introduced by prototype
  linking. The existing owned-closure regression and 28 host-prototype/replay
  checks pass; host ownership and publisher guards remain enforced.
- SafeJS 69576b7714 adds owned live-host prototype links. Inherited reads, setters,
  reflection, for-in, proxy traps and borrowed array methods preserve host identity,
  ownership, publisher guards and quotas. Prototype accounting reads links after
  expando collectors and keeps full reconciliation, deep traversal and existing
  Proxy read ordering. Held host-result allocations avoid recharging owned
  prototypes; mutable primary graphs remain fully charged. Validated 384 focused
  tests, lint, the maintained SDK build and 14 built SDK checks.
- Browser's existing optional prototype bridge now activates with that SDK.
  The expanded actual-SDK DOM fixture passed 37 assertions: constructor brands,
  prototype identity, captured methods, overrides, late nodes and cloned nodes.
  It used 11669 steps and closed with zero retained data. Window/URL/Blob/Worker
  and Event setup were excluded from that diagnostic. Browser build, lint and
  247 selected native tests passed. That isolated fixture does not prove full
  default initialization; newer full-run comparisons are summarized above.
- Native DOM interface constructors are installed through SafeJS c2307c51ca and
  browser 5bf1dfc, with fallback for older SDKs. Construction retains ownership,
  revocation, argument retention, reentry and serializable-result restrictions.
- Latest normal live Zoom retry with 43082cd48d completed all 13 classic scripts
  and prepared seven modules, then reached the unchanged 120 s deadline.
  The import observation also expired. Name/Join controls never appeared; no name
  fill, join or socket attempt occurred. The last sample was 9008567 steps and
  6918712 data units at 113.049 s. Cleanup verified zero data and sockets; the
  probe is terminal. The accounting optimization did not clear live module startup.
- An earlier 600 s diagnostic also expired before controls or socket attempts,
  after 58334 module nodes, at DOMPurify allowlist construction in editor-core.
  Do not repeat that unchanged extended run or increase its deadline.
- Full graph reconciliation remains the main unresolved startup cost. A bounded
  six-module fixture preserves the real import cycle. At module node 30001 the
  current graph charges 6116470 units across 7650 entries, including 3699 deferred
  functions. Collectors append 26333 times; only 403 values need buffering, so
  the existing positive-membership cache already removes most duplicate work.
  Comparing nodes 6004 and 30001 shows materialized closures growing from 921
  to 1795 and closure collectors from 650 to 1521, while deferred functions stay
  near 3700. Of the 874 added closures, 592 are editor-core method functions;
  declarations add only 45. Full-page profiling above also includes earlier-script
  functions missing here. Preserve identity, homeObject, private fields and fresh
  collector reads.
  JIT tracing observed at least 46 walker deoptimizations. Splitting cold cases
  or object dispatch gave no useful startup gain; disabling Maglev also failed
  all three full DOM attempts at the unchanged 1000 ms limit. These experiments
  remain in memory only; no runtime changes or flags were retained.
- Native URL getter/method experiment was discarded. Explicit private receiver
  binding preserved ordinary URL reflection, freezing, subclasses and quotas in
  focused tests and an actual-SDK probe. Warm URL read loops used less CPU, but
  URL initialization was slower and both modes timed out in all three full DOM
  attempts at the unchanged 1000 ms limit. No new SDK API or browser runtime
  change remains; all six full probes cleaned up to zero retained data. This
  does not justify another unchanged live Zoom retry. Continue with the large
  module graph cost rather than URL getter dispatch.
- Combining private scope/closure lookup storage produced no reliable gain.
  A fresh Set per walk was about 21% slower than the existing weak registry on
  the same 6048518-unit graph. Both experiments were discarded without runtime
  source changes. Earlier object-first and property-storage-cache comparisons
  improved median CPU about 1% or less; Window metadata snapshots also failed
  to clear full initialization. Scope pruning would change quota semantics.
  All probes are terminal and closed with zero retained data; no reports or
  profiles were written to disk.
- Retained accounting improvements include private ownership queries, fast
  deferred-function records, sixteen positive capture slots, explicit traversal
  continuations and shared deferred-function charges. Numeric compiler-token
  reads reduced login-module parsing CPU about 16% with identical results.
  These focused gains do not prove complete startup readiness.
- Core copying uses an explicit stack (SafeJS bc3d0c9ebf): built Node 22/24 checks
  round-trip 1000-level objects and report dataDepth at 1025. Deep realm bridges
  and asynchronous structured cloning remain separate acceptance gates.
- Window load handlers preserve order, Window receivers, guest identity and
  reference cleanup. Offline actual-SDK check: scripts/check-window-load.ts.
- Worker sockets cover quotas, connect-src, Blob policy, ordering and termination
  in native, SDK and loopback checks. Actual Zoom socket exchange is unverified.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  Actual media capture, WebRTC, Web Audio/AudioWorklet and a live PCM producer
  remain unimplemented.

## Outstanding gates

- Initialize within normal allowances, expose Join controls, fill the name before
  requiring enabled Join (#input-for-name), and verify admission/presence. Reduce
  large-module reconciliation cost without skipping reads or collectors.
- Clear the full default DOM initialization gate. The last baseline trace stopped
  at Event prototype descriptor installation. An in-memory bulk Event descriptor
  experiment also timed out and was discarded. Full DOM prototype tables and
  library compatibility remain incomplete despite the new linking capability.
- Implement and verify every notetaker capability above. Automations references:
  capture-page.js (getDisplayMedia, 16000 Hz AudioWorklet), meeting-page.js
  (48000 Hz AudioContext/MediaStream microphone/playback), track-audio-page.js
  (incoming WebRTC). Native support needs actual media sources and transport.
- Verify complete network Worker startup, its original WASM initialization
  callback, download/initialization protocol and actual Zoom socket exchange.
  Extracted glue initializes a 20 MiB heap; the full Worker run still expired
  before export setup. Media root: https://st1.zoom.us/web-media/u9n13za/.
  application-media-v1 permits 33554432 data units with the same 120 s deadline.
- Verify server-selected behavior; prior routes and browser identities selected
  the same app client. No simpler join flow was established. Optional blocking
  of file-paa.zoom.us/cdn.cookielaw.org remains diagnostic configuration.
- Complete iframe navigation/srcdoc/policy contexts, child realms, DOM namespaces,
  full canvas, React stream helpers and interaction.
- Revalidate deep host ingress/exports, prototype/capture copying, callback
  rejections, timer/onload failures, idle timing, fake-SDK contracts and deeper
  non-ladder parser grammar. Module deferral does not optimize classic hoisting.

## Development constraints

- Preserve unrelated changes, SafeJS's untracked report-unhandled-throws.test.ts,
  and recovered patches in contributions/. Reuse working builds and the Node runtime.
- Keep artifacts ephemeral and status concise here; no diaries or findings reports.
- Use TDD for SafeJS changes; serialize CPU-heavy tests, builds and probes. Verify
  diagnostic hooks against the loaded SDK, including bundled layouts.
- Native tests use native-tests.json. SafeJS, live Zoom and necessary sockets are
  authorized; their acceptance and real TTY/PTY gates remain separate from native.
- Preserve quotas, fresh observations, aliases, ordering, reentry, cancellation,
  credential isolation, primitive-node awaits and full reconciliation. Keep fresh
  walk state, private captures, structured-cloneable public results and bounded
  pools. Imports retain deadlines; TLA expiry revokes the realm. Cooperative
  checks do not bound parsing or synchronous host calls.
- Do not revive unsafe measurement-worker reuse, saved-callback leaks, stale
  Temporal/Intl guards, mutable descriptor caches or skipped collectors.
- Require new evidence before revisiting discarded visitor splits, scope pruning,
  scope tags, visited-generation cells, WeakSet/ownership caches, capture pooling,
  property-layout changes, string-position caches or alternate WASM factories.
- Commit completed changes with explicit owned paths. No subagents or pushes.
