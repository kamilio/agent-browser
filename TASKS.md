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
  build and eight built-import checks pass; full native/SafeJS passes remain open.
- Retained accounting work includes private snapshots, bounded capture pooling,
  tracked fixed-key records, import/export indexes, deferred module functions,
  symbol snapshot elision and metered import deadlines. Scripts, generators and
  dynamic source references still create functions eagerly. Fresh observations,
  complete quotas and materialization identity remain required.
- Browser fix 2d43d80 keeps bounded observation open during delayed bootstrap.
  Strict typing, formatting, six scenarios and live delayed callbacks verified it.
- Earlier 120 s / 256 MiB live checks either timed out in externals.min.js or
  prepared seven modules before import expiry. None established readiness or
  joining. All completed probes verified closed runtimes, zero data and sockets.
- Startup profiling found reconciliation (~71% CPU), GC (~28%) and substantial
  temporary allocation (1.54 GB sampled over 20 s). After Object.create tracking,
  a 10 s live sample still recorded 602k ordinary-table descriptor reads. React's
  144 eight-field DOM property records contributed 66% of those reads; Zoom's
  external-library constructor source confirmed the shape. Profiles stayed in memory.
- Object.create fix 2be9a4d68 uses existing mutation-tracked property tables.
  All 286 selected tests and scoped lint passed. Compiled fixtures preserve
  charges/growth/steps, using ~42% less walk CPU and ~97% less allocation.
- Ordinary constructor receiver fix 3b9bddb3f extends that tracking to fresh
  instances while preserving native prototypes and explicit return identities.
  The React-shaped regression failed before with eight fresh descriptor reads.
  All 334 selected checks across 14 files, scoped lint, the maintained build and
  eight built imports pass. Reversed, warmed compiled fixtures preserve charges
  and native growth, using ~13% less walk CPU and ~98% less temporary allocation.
  These fixture results do not establish live startup or normal-budget acceptance.
- Source tracing maps `html-classic:59` to FingerprintJS 3.3.3, specifically its
  screen-frame polling code. One 30 s sample saw only this callback before
  shutdown released module linking. A subsequent sample linked all seven modules
  and reached editor-core evaluation before shutdown, so a queue deadlock is not
  established. Full retained-data reconciliation dominates both paths. Completed
  30 s probes closed with zero data and sockets; neither joined the meeting.
  A longer queue trace ended with SIGTERM before sampling (four modules prepared);
  its process is gone, but it emitted no runtime cleanup report. No artifacts remain.
- Array literal fix b19ea46d6 reuses descriptors for privately tracked classic
  and source-module arrays. Native mutations invalidate snapshots, including
  partially rejected length shrinks; descendants and quotas remain fresh.
  All 322 distinct selected checks, scoped lint, the maintained workspace build
  and eight built-import checks pass. Reversed compiled fixtures retain 3699
  data units, 1000 units of native growth and 803 node visits, with ~17% less
  accounting CPU and ~89% less temporary allocation. Live acceptance remains open.
- Latest live check used that SDK with a 256 MiB heap and temporary 600 s limits.
  All 13 classics passed; externals used ~59 s CPU. All seven modules linked and
  rolldown evaluated, but editor-core was still evaluating when the 600 s import
  observation ended. Last sample: 9029257 steps / 6943205 data units. The DOM
  still showed only a loading image and "Joining Meeting..."; no controls,
  admission or sockets. Cleanup verified closed runtimes, zero data and sockets;
  the process exited. Checked-in limits and working browser dist are unchanged.
- No lazy arguments change is implemented. Native canvas, worker/Wasm and socket
  probes are separate gates. PCM handling is not a Zoom audio source; actual RTC
  capture, transcription, playback, microphone and avatar support remain open.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Explicit
  120 s / 256 MiB diagnostics clear no default-resource acceptance gate.
  Source-module deferral does not optimize classic-script function hoisting.
  Profile active editor-core work and its retained graph after array tracking
  before choosing further accounting changes. No complete live startup
  speedup has been established from the fixture improvements.
- Verify every notetaker capability listed above. The working notetaker captures
  one browser audio track with getDisplayMedia and a 16000 Hz AudioWorklet, with
  audio processing disabled. No equivalent native source, transcription,
  playback, microphone or avatar pipeline is proven.
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
