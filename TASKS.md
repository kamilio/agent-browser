# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. This is
  exploratory work, not a migration; keep Automations operational and unchanged.
- Keep the engine independent of Chromium, Firefox and remote browsers. SafeJS
  is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. Approved diagnostic route:
  https://app.zoom.us/wc/7982110526/join. **No meeting has been joined.**
- Acceptance requires initialized interactive controls, admission and verified
  presence, roster/chat, audio capture/transcription, playback, live microphone
  and avatar support, then leaving and verified cleanup.
- Continue legitimate challenge handoffs, top100 compatibility, secret
  placeholders with extensible .env/pass providers and passkeys, browser-only
  research, playground/terminal and command coverage.

## Current verified state

- Maintained SDK: /home/kjopek/project/poe-code/packages/safe-js. Reuse this
  browser's working dist and preserve unrelated changes. The selected workspace
  build and all eight built-import checks pass; full native/SafeJS gates remain open.
- The native loader observes delayed bootstrap and loads classic scripts plus
  source modules. Accounting uses private snapshots, bounded capture pooling,
  tracked records/arrays, import/export indexes, deferred module functions and
  metered import deadlines. Object.create tables, ordinary constructor receivers
  and classic/module array literals reuse mutation-invalidated descriptors;
  scope storage avoids per-operation argument arrays.
- Maintained SafeJS defers unread unmapped arguments in classic scripts and
  source modules. Binding reads and snapshots create the native arguments object;
  mapped and bigint arguments stay eager. Descendants and materialized descriptors
  remain freshly measured. Late materialization, aliases, ordinary/held quotas,
  reentrant callbacks and mutable internal-symbol membership are covered.
  Broader selected regressions passed 362 tests across 32 files (two existing
  skips); the final arguments/symbol suite passed 69 tests across eight files.
  Scoped lint, new-file formatting and the maintained build pass.
- SafeJS commit 03068ccf9 avoids empty fallback iterators for closures without
  retained-value providers. Real providers, including custom iterators on empty
  arrays, remain freshly observed. Selected capture/ownership/quota regressions
  passed 70 tests across 12 files; scoped lint, build and eight imports pass.
  Alternating both walkers on one retained Zoom graph preserved 6656473 units
  across every pass. Sampled allocation fell about 3% (29.8 MB to 28.9 MB per
  50 walks), with no CPU improvement established. No startup speedup is claimed.
- The final compiled fixture (160 retained argument scopes, 3000 walks per CPU
  pass) used about 62% less accounting CPU and 80% less sampled allocation.
  Both paths retained 5776 units, detected 1000 units of descendant growth and
  1019 units including native mutation, and ended at 6795 after materialization.
  An earlier live sample found 164 unread unmapped arguments among 203 retained
  arguments objects. No complete live startup speedup is established.
- The latest uninstrumented built-runtime check used a 256 MiB heap and 120 s
  script/import observation bounds. All 13 classic scripts passed and seven
  source modules were prepared, but the import observation expired with editor
  evaluation still pending. No readiness, admission or presence was verified;
  there were no socket attempts. Cleanup closed the runtime, cleared retained
  data and closed sockets; the process exited 1.
- A fresh early-editor census found about 12600 visits per scan: 3703 deferred
  functions, 1604 materialized closures, 935 ordinary objects and 223 arrays.
  Each scan made about 25000 capture calls. The graph walker was already V8
  optimized in all 20 live samples (status 81, matching an optimized control),
  so failure to optimize is not established as the startup bottleneck.
- A fresh 10-second editor CPU profile (4133 samples) attributed about 71% of
  sampled time to data reconciliation and 25% to garbage collection, with less
  than 1% idle. Allocation sampling attributed about 37% to visit, 20% to native
  descriptors, 16% to iterator next and 9% to property-name arrays. A descriptor
  census identified untracked string arrays and class prototypes (including XHR
  and WebSocket). Two prominent arrays came from reflection; JSON was not a
  prominent owner. Capture/frame allocation is too small to prioritize pooling.
- Tracking newly created constructor prototypes passed 441 tests across 18 files,
  the maintained build and eight import checks. The mixed fixture allocated 22%
  less with overlapping CPU timings. Live allocation per accounting pass fell
  only from about 800 KB to 770 KB; a separate repeat used 24.9 ms versus 29.8 ms
  process CPU per pass. Page state and scheduling varied, so these are not clean
  speed measurements. The marginal allocation benefit did not justify retaining
  a possible slowdown: the trial and its test were discarded. The baseline build
  and all eight imports were restored and verified. No change from that trial remains.
  All probes closed with zero retained data and closed sockets; none
  established controls or joined. Inspect remaining visitor/iterator allocations.
- An identity-sharing trial saved 8-15% CPU in an isolated deferred-function
  fixture but retained all 3703 deferred-state objects after materialization;
  the current implementation released all of them. The trial and its tests were
  discarded, and the maintained build plus eight imports were restored and verified.
  Its 120 s live retest still hit the source-import deadline: 12 classic scripts
  completed, the last aborted with the realm, and only "Joining Meeting..." was
  visible. All completed probes verified runtime/data/socket cleanup.
- Correct source attribution uses each function's scope module ID: earlier hot
  offsets belonged to Rolldown's export-copy helper; later samples reached React
  initialization in editor-core. FingerprintJS polling does not establish a queue
  deadlock. Profiles and diagnostics stay in memory; no owned artifacts remain.
- Native canvas, worker/Wasm and socket probes are separate gates. PcmCapture
  accepts supplied PCM16 frames but has no live producer wired to it. PageMedia
  implements CSS matchMedia, not capture. The native page runtime currently lacks
  MediaStream, mediaDevices capture, RTCPeerConnection and Web Audio/AudioWorklet
  implementations; these are implementation gaps, not merely untested features.

## Outstanding gates

- The 30-minute import diagnostic ended on its deadline after about 1741 s in
  editor-core evaluation. All 13 classics passed and seven modules linked, but
  the DOM still showed only loading/"Joining Meeting...". No socket attempts or
  admission occurred. Cleanup closed the runtime, cleared retained data and
  closed sockets; the process exited 1 and is gone. Longer allowances alone
  have not established readiness. A visit-marker reuse trial passed 120 selected
  regressions but did not reduce CPU on the mixed-graph fixture; it was discarded.
  No runtime change from that trial remains.
- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Extended
  diagnostic allowances clear no default-resource acceptance gate.
  Source-module deferral does not optimize classic-script function hoisting.
  Investigate the remaining retained-graph traversal and allocation costs during
  editor-core evaluation without weakening native/provider observations.
  Fixture improvements have not established a complete live startup speedup.
- Implement and verify every notetaker capability listed above. Automations'
  packages/zoom-notetaker/src/capture-page.js captures one browser audio track
  with getDisplayMedia and a 16000 Hz AudioWorklet, with audio processing disabled.
  Its meeting-page.js uses a 48000 Hz AudioContext/MediaStream destination for
  virtual microphone and playback; track-audio-page.js optionally captures cloned
  incoming WebRTC tracks, in addition to the mandatory mixed recording. Native
  support needs actual media sources and transport before PCM/transcription can
  establish meeting audio. Keep the working Automations implementation unchanged.
- Verify server-selected page behavior: the default identity can receive a
  different landing page, while the desktop document has no server-rendered
  Join controls. Join requires working JavaScript handlers. Optional blocking
  of file-paa.zoom.us/cdn.cookielaw.org remains diagnostic configuration.
- Complete iframe navigation/srcdoc/policy contexts and child realms; validate
  DOM branding/prototype tables, namespaced names, library compatibility, full
  canvas rendering, React stream helper variants and interactive behavior.
- Revalidate unresolved parser nesting/depth, deep host ingress/result exports,
  prototype/capture copying, joined-callback rejections, timer/onload failures,
  idle timing reliability and fake-SDK contracts before fixing them.
- Preserve fresh property/provider observations, complete ordinary and held
  quotas, cancellation, callback ownership and credential isolation. Do not
  revive accounting shortcuts based only on tracked ownership. Private capture
  pools remain bounded at 64 physical slots. Strict-arguments tracking, broader
  capture caches and optional-state registry trials remain discarded.
- Pending imports retain deadlines; TLA expiry revokes the realm. Cooperative
  checks do not bound unmetered parsing or synchronous host calls.
- Native, SafeJS, live-network, sockets and real TTY/PTY gates remain separate.
  Native membership is native-tests.json. SafeJS, live Zoom and necessary
  sockets are already authorized; native passes prove none of those gates.

## Development inputs

- Use the maintained SDK build above and the Node24 runtime at
  /tmp/agent-browser-node24-runtime/bin/node. No isolated SDK copy is retained.
- Recovered patches in contributions/ need reconciliation before application.
- Keep artifacts ephemeral and remove owned logs/reports/redundant builds after
  owned processes terminate. No diaries or findings inventories. Commit focused
  completed changes with explicit paths; do not push.
