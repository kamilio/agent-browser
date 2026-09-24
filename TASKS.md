# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. Keep Automations
  operational and unchanged; keep the native engine independent of Chromium,
  Firefox and remote browsers. SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. Approved diagnostic route:
  https://app.zoom.us/wc/7982110526/join. **No meeting has been joined.**
- Acceptance requires interactive controls, admission and verified presence,
  roster/chat, audio capture/transcription, playback, live microphone/avatar
  support, then leaving and verified cleanup.
- Continue legitimate challenge handoffs, top100 compatibility, extensible
  .env/pass secret placeholders and passkeys, browser-only research,
  playground/terminal and command coverage.

## Current state

- Maintained SDK: /home/kjopek/project/poe-code/packages/safe-js. Reuse working
  builds and /tmp/agent-browser-node24-runtime/bin/node.
- Latest normal-allowance Zoom line profile passed all 13 classic scripts and
  prepared seven modules, then hit the 120 s runtime deadline in editor-core
  (9926 module nodes; offset 32558, line 25). No name field, Join button or
  join/socket attempt appeared. Cleanup passed with zero retained data.
  No diagnostic remains active; diagnostics stayed in memory.
- Startup remains blocked. A completed 1800 s diagnostic reached emoji-reactions
  data initialization (141444 nodes; offset 49274, line 9) without Join controls.
  Do not repeat unchanged extended runs.
- Before the position-cache fix, the phase profile measured about 47 s of module
  preparation and 72 s of execution.
  Position decoding led preparation samples; retained-data traversal dominated
  execution. Preparation overlaps late classic callbacks. Investigate measured
  costs without weakening accounting; node-count variation is not a speedup.
- Parser improvements: bounded position-cache FIFO eviction (aece59d34), then
  coordinate comparison without allocating packed-span positions (1c5ce18cb).
  Separate built parsing fixtures improved by 12–13%, then another 7–9% on
  minified input, with identical metering. Multiline timings improved but varied.
  All 115 focused tests across nine files, lint, the maintained build and 11 built
  checks passed. Endpoint mutation, ownership, getter order and rebased spans
  remain covered. The live check above still timed out. Token FIFO changes gave
  mixed results and remain discarded.
- Line profiling confirms distributed costs in visited-object lookup, capture
  callbacks, classification and property reads. Some inlined ticks name lines
  outside their attributed file; do not treat those as exact source attribution.
  Moving capture state into its callback was about 40% slower; prototype guards
  showed no gain. A shortcut for unchanged native property getters looked mildly
  faster initially, but compiled comparisons were mixed. All three are discarded;
  source and built visitor were restored exactly and all 11 built checks passed.
  Next compare a fixed amount of Zoom initialization work, with responses kept
  in memory, to evaluate traversal changes against the real workload. Preserve
  fresh observations and full reconciliation, including primitive-node awaits.
- Retained SafeJS fixes: tracked handler/descriptor isolation (bace0875c),
  incremental scalar-array accounting (39e147ad6), detached completed measurement
  callbacks (5ee62fa5e), and the Temporal/Intl helper (bee81e32f). Focused tests,
  lint, maintained builds and built checks passed; live startup remains unresolved.
  Handler isolation fixes stale quota charges but adds some write overhead.
  The helper improved a controlled fixture by 12–13%, preserving fresh checks.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.

## Outstanding gates

- Continue initialization beyond emoji-reactions data to expose Join controls or a
  concrete compatibility failure. Reduce retained-graph reconciliation and module
  preparation costs. Compare the actual unchanged visitor in separate processes
  without profiling; duplicated visitor timings misled earlier comparisons.
  Initialize within normal allowances and verify JavaScript Join controls,
  actual joining, admission and presence.
  Diagnostic limits and fixture improvements do not establish live acceptance.
- Keep filling the name before requiring enabled Join in future diagnostics.
  Zoom's preview uses #input-for-name and disables Join for invalid form data.
  The corrected observer passed simulated checks; live fill/click remains unverified.
- Implement and verify every notetaker capability above. Automations reference:
  capture-page.js uses getDisplayMedia and a 16000 Hz AudioWorklet for mixed audio;
  meeting-page.js uses a 48000 Hz AudioContext/MediaStream destination for virtual
  microphone/playback; track-audio-page.js optionally captures incoming WebRTC.
  Native support needs actual media sources and transport.
- Verify server-selected page behavior. Default identity may receive a different
  landing page; desktop HTML has no server-rendered Join controls. Optional
  file-paa.zoom.us/cdn.cookielaw.org blocking is diagnostic configuration only.
- Complete iframe navigation/srcdoc/policy contexts and child realms; validate
  DOM branding/prototypes, namespaced names, library compatibility, full canvas,
  React stream helpers and interactive behavior. Worker/Wasm is a separate gate.
- Revalidate unresolved parser depth, deep host ingress/result exports,
  prototype/capture copying, callback rejections, timer/onload failures, idle
  timing and fake-SDK contracts. Source-module deferral does not optimize
  classic-script function hoisting.
- Preserve ordinary/held quotas, fresh property/provider observations, aliases,
  snapshot/callback order, reentry, cancellation and credential isolation.
  Keep primitive-node awaits and full reconciliation, fast scope fields, tracked
  projections, fresh walk state and private bound-capture snapshots.
  Public run() results must remain natively structured-cloneable. Capture pools
  stay bounded at 64 physical slots. Pending imports retain deadlines; TLA expiry
  revokes the realm. Cooperative checks do not bound parsing/synchronous host calls.
- Keep rejected shortcuts discarded: whole measurement-worker reuse leaks saved
  callbacks; shared Temporal/Intl guards miss native-installed state (2 units
  instead of 4). Mutable foreign-record descriptor caches, constructor prototype
  tracking, deferred-collector skipping, shared mutable visit state, local-function
  deferral, strict-arguments tracking and broader capture caches remain unproven.
  Positive visited caches, object-first dispatch, own-property WeakMap methods,
  fresh-Set storage, rotating visited tables, carrier/symbol helpers and bound
  deferred callbacks showed no gain. Repeated visitor deoptimization and capture
  pooling lack supporting evidence. Avoid per-loop allocation instrumentation.
- Native, SafeJS, live-network, sockets and real TTY/PTY gates remain separate.
  Native membership is native-tests.json. SafeJS, live Zoom and necessary sockets
  are already authorized; native passes prove none of those gates.

## Development constraints

- Preserve unrelated changes and recovered patches in contributions/.
- Keep artifacts ephemeral; remove owned logs/reports/redundant builds after
  processes terminate. Keep status here; no diaries or findings inventories.
- Use TDD for SafeJS changes and serialize CPU-heavy tests/builds/probes.
- Commit focused completed changes with explicit paths; do not push.
