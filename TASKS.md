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
  browser's working dist and preserve unrelated changes. Selected workspace
  builds and all eight built-import checks pass; full native/SafeJS gates remain open.
- Browser fix 2d43d80 keeps bounded observation open during delayed bootstrap;
  strict typing, formatting, six scenarios and live delayed callbacks verified it.
- Accounting now uses private snapshots, bounded capture pooling, tracked records
  and arrays, import/export indexes, deferred module functions and metered import
  deadlines. Object.create (0636e351d), ordinary constructor receivers (cb5460953)
  and classic/source-module array literals (b19ea46d6) reuse mutation-invalidated
  descriptors. Selected tests and compiled fixtures verified fresh descendants,
  ordinary/held quotas and lower accounting cost; no complete startup gain is proven.
- Scope storage fix 4e8956eb5 pins direct native calls, removing per-operation
  argument vectors without exposing binding cells or changing iteration. The
  regression went from 206 vectors to zero. All 197 selected tests across 20 files
  pass (two existing skips), as do scoped lint, formatting, the maintained build
  and eight built imports. Reversed fixtures retain 4107 data units and 1000 units
  of native growth, using about 6% less CPU and 32% less temporary allocation.
- The last extended live check used a 256 MiB heap and temporary 600 s limits.
  All 13 classics passed, all seven modules linked, and rolldown evaluated.
  editor-core was still evaluating when the import observation ended; the DOM
  showed only a loading image and "Joining Meeting...". No controls, admission or
  sockets were established. Closed runtimes, zero retained data and sockets were verified.
- Corrected node attribution uses each function's scope module ID. Earlier hot
  offsets belong to Rolldown's export-copy helper, not the calling editor-core
  source. A fresh pre-scope-fix 30 s sample reached React's property constructor
  in editor-core: 2168 reconciliations consumed 24 s, with about 2.2 GB of sampled
  temporary allocation. Accounting and property reflection dominate. A separate
  10 s sample found many repeated arguments-object descriptors and ordinary
  arrays; reflection-result arrays did not dominate the reported top shapes.
  The walker reaches Node's optimizing compiler in a warmed local fixture.
- Post-fix live validation again passed all 13 classics and linked seven modules.
  During a bounded 30 s editor-core sample, 2506 reconciliations consumed 28.5 s;
  React's property constructor continued executing. About 2.45 GB of allocation
  was sampled. Workload/timing differences prevent a complete startup speed claim.
  Intentional shutdown after sampling verified zero retained data and closed
  runtimes/sockets (exit 1). No meeting admission or application readiness was verified.
- FingerprintJS screen-frame polling dominated an earlier callback-only sample,
  but later probes linked and evaluated modules before shutdown: a queue deadlock
  is not established. Completed probes verified runtime/data/socket cleanup.
  One older queue trace ended with SIGTERM and no runtime cleanup report; its
  process is gone. Profiles and traces stay in memory; no artifacts remain.
- No lazy arguments change is implemented. Native canvas, worker/Wasm and socket
  probes are separate gates. PCM handling is not a Zoom audio source; actual RTC
  capture, transcription, playback, microphone and avatar support remain open.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Explicit
  120 s / 256 MiB diagnostics clear no default-resource acceptance gate.
  Source-module deferral does not optimize classic-script function hoisting.
  Investigate repeated arguments-object reflection and retained graph traversal
  during editor-core evaluation without weakening native/provider observations.
  Fixture improvements have not established a complete live startup speedup.
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
