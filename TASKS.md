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
- Current source: 029820ce86, tree-identical to d3ec60d811. Seventeen completed
  SDK commits were recovered after the shared checkout's rebase omitted them;
  prior local patches and unrelated work remain preserved. All 195 restored and
  adjacent regression tests and 16 checks against the reused SDK build pass.
- SafeJS d3ec60d811 gives SDK-created measurement options explicit owned defaults.
  Inherited host flags previously reduced closure/prototype charges from 1001 or
  1010 units to 1, bypassed held/unheld quotas, and exposed compile tickets to an
  inherited collector. Ten regressions failed before the fix. All 111 focused
  tests (including GC and live caller getters), lint, the maintained build,
  16 built SDK checks and four compiled quota cases pass. All three full DOM
  attempts still timed out at 1000 ms and closed with zero data.
- The option-layout comparison preserved 6116470 units using the same walker,
  but timing was mixed. Do not claim a startup speedup. Caller-owned option
  getters and inherited settings remain live; only SDK-created defaults changed.
- Existing safeguards include owned scope/closure/descriptor-cache metadata,
  late deferred-materialization reconciliation, bounded closure-property
  recursion, class-method table reservations, sixteen positive capture slots,
  and fresh host-prototype links after expando traversal. Preserve these.
- Latest completed normal live Zoom retry, with d3ec60d811, completed all 13
  classic scripts and prepared seven modules, then reached the unchanged 120 s
  deadline. Import observation also expired. No name/Join controls, fill, join
  or socket attempt. Last sample: 9021496 steps and 6748982 units at 112.884 s.
  Cleanup verified zero data/sockets; that probe is terminal.
- Full-page profiling on 43082cd48d attributed 93% of sampled CPU to accounting,
  almost all through post-node reconciliation: 1606 measurements and 1876 steps
  took 10.09 s wall/9.99 s CPU. The warmed graph charged 6682693 units; 200 walks
  used 1.19 CPU seconds. Symbol loops, metadata/brand lookups, scope collection
  and function-property readers remain costs. Inlined code can affect line
  attribution. The diagnostic deliberately stopped at its sample and cleaned up;
  it did not establish module startup or admission.
- The six-module fixture preserves the real import cycle but omits earlier page
  scripts. At module node 30001 it charged 6116470 units with about 3700 deferred
  functions. A fresh path count found 17069 scope visits and 26333 capture appends,
  with only 403 values buffered; 511 of 617 ordinary records used projections.
  Most appended captures were already visited. The earlier full-page
  graph had 1275 absent function tables, 260 materialized and 128 deferred;
  extending table deferral is not an established shortcut.
- An earlier 600 s diagnostic also expired before controls/socket attempts,
  after 58334 module nodes at DOMPurify allowlist construction in editor-core.
  Do not repeat that unchanged extended run or increase its deadline.
- Visitor splits (including symbol accounting), object-first dispatch, alternate
  visited sets, combined private lookup storage, bound URL/function readers and
  Window/Event metadata experiments did not reliably improve initialization.
  They were discarded. Scope pruning changes quota semantics; reconsider
  discarded approaches only with new evidence.
- Direct pending-function state reads gave less than 1% aggregate full-page gain;
  an isolated capture collector was about 6% slower despite passing GC probes.
  Both were discarded. Corrected diagnostics verified cleanup, not admission.
- Full-page capture-cache profiling found 21296 hits among 22190 object appends
  (about 96%). Existing order used 110416 comparisons; reversed order would use
  280224. Moving hits to the front or one slot forward also increased comparisons
  and writes. No cache policy change is warranted by this trace. The sampled
  6667468-unit graph closed with zero data/sockets; no Join controls appeared.
- Native DOM constructors and the optional host-prototype bridge are installed.
  Older isolated 37-check DOM passes excluded Window/URL/Blob/Worker/Event setup;
  later isolated checks also timed out. They do not prove current full DOM
  compatibility. Latest full-default failures are recorded above.
- Core copying uses an explicit stack: built Node 22/24 checks round-trip
  1000-level objects and report dataDepth at 1025. Deep realm bridges and async
  structured cloning remain separate gates. Window load handlers preserve order,
  receivers, identity and cleanup; offline SDK check: scripts/check-window-load.ts.
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
