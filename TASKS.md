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
- SafeJS commit 4eca44c48 defers unread unmapped arguments in classic scripts and
  source modules. Binding reads and snapshots create the native arguments object;
  mapped and bigint arguments stay eager. Descendants and materialized descriptors
  remain freshly measured. Late materialization, aliases, ordinary/held quotas,
  reentrant callbacks and mutable internal-symbol membership are covered.
  Broader selected regressions passed 362 tests across 32 files (two existing
  skips); the final arguments/symbol suite passed 69 tests across eight files.
  Scoped lint, new-file formatting and the maintained build pass.
- The final compiled fixture (160 retained argument scopes, 3000 walks per CPU
  pass) used about 62% less accounting CPU and 80% less sampled allocation.
  Both paths retained 5776 units, detected 1000 units of descendant growth and
  1019 units including native mutation, and ended at 6795 after materialization.
  An earlier live sample found 164 unread unmapped arguments among 203 retained
  arguments objects. No complete live startup speedup is established.
- The deferred-arguments live attempt used a 256 MiB heap and temporary 600 s
  limits. All 13 classic scripts passed and seven modules linked, but editor-core
  evaluation ended on the source-import deadline after about 526 s. The DOM still
  showed a loading image and "Joining Meeting...". No controls, admission, presence
  or sockets were established. Cleanup verified closed runtimes, zero retained
  data and closed sockets; the process exited 1 and is gone.
- A CPU sample from that same process still showed retained-graph traversal as
  expensive, with garbage collection taking about 22% of the 10.6 s sample.
  A separate 10 s allocation sample attributed about 52 MB to the walker,
  reflection, root iteration and bound-function captures. These are diagnostic
  samples, not comparable startup benchmarks. Profiles stayed in memory and
  the diagnostic inspector was closed. No owned temporary artifacts remain.
- Correct source attribution uses each function's scope module ID: earlier hot
  offsets belonged to Rolldown's export-copy helper; later samples reached React
  initialization in editor-core. FingerprintJS polling does not establish a queue
  deadlock. The data walker reaches Node's optimizing compiler in a warmed fixture.
- Native canvas, worker/Wasm and socket probes are separate gates. PCM handling
  is not a Zoom audio source; actual RTC capture, transcription, playback,
  microphone and avatar support remain unverified.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Explicit
  120 s / 256 MiB diagnostics clear no default-resource acceptance gate.
  Source-module deferral does not optimize classic-script function hoisting.
  Investigate the remaining retained-graph traversal and allocation costs during
  editor-core evaluation without weakening native/provider observations.
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
