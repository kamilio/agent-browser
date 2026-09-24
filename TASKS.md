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
- Latest normal Zoom check with the scalar-array fix passed all 13 classic
  scripts and prepared seven modules, but hit the 120 s runtime deadline during
  editor-core initialization (10056 module nodes; offset 32558, line 25).
  The corrected observer saw no name field or Join button. No join/socket
  attempts occurred; runtime/socket cleanup passed with zero retained data.
- The completed 1800 s diagnostic (restored runtime, 512 MiB heap) passed through
  editor-core, localization and Lodash, reaching emoji-reactions data initialization.
  It executed 141444 module nodes, then hit the runtime deadline at emoji-reactions
  offset 49274, line 9, a numeric literal. No name field, Join button, join attempt
  or socket attempt appeared. Runtime/socket cleanup passed with zero retained data.
  No diagnostic remains active. Investigate accounting cost before another long run;
  extending the deadline again without a change does not address normal startup.
- Scalar-array accounting (39e147ad6) now updates string totals and non-scalar
  counts on owned indexed writes, avoiding full descriptor snapshots for scalar
  arrays. The failing linear-work regression now passes; 79 tests across nine
  files, scoped lint, the maintained build and all 11 built checks passed.
  For 4000 append/projection steps, descriptor reads fell from 8006000 to 16000.
  Eight 1024-element append/measure fixtures fell from 3.040 s to 0.049 s CPU;
  small nested-array timings showed no clear change. Live startup still fails;
  these fixture gains do not establish a Zoom startup improvement.
- Retained optimizations: fast scope accounting fields, tracked array projections,
  retained visitor code with independent per-walk state, and private bound-capture
  snapshots preserving replaced/accessor providers. The positive visited cache was
  reverted after separate-process measurements failed to confirm a benefit.
  Restored runtime validation passed 58 focused accounting tests, the maintained
  build and all 11 built checks. Preserve foreign uncommitted changes.
- Current performance evidence points to retained-graph traversal and GC.
  Repeated visitor deoptimization was not observed. Descriptor census already
  found broad accounting-projection coverage; broad new descriptor caching lacks
  supporting evidence. Validate optimizations using the unchanged visitor in
  separate processes without a profiler; duplicated visitor timings misled earlier
  comparisons. Do not infer startup gains from fixture timings.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.

## Outstanding gates

- Continue initialization beyond emoji-reactions data to expose Join controls or a
  concrete compatibility failure. Reduce retained-graph
  reconciliation cost; repeated visitor deoptimization is not supported by the
  latest trace. Use the unchanged visitor when comparing backends.
  Do not repeat the rejected positive visited cache, object-first dispatch,
  own-property WeakMap methods or fresh-Set visited storage without new evidence.
  Preserve per-walk callbacks and avoid retained guest roots.
  Initialize within normal allowances and verify JavaScript Join controls,
  actual joining, admission and presence.
  Diagnostic limits and fixture improvements do not establish live acceptance.
- Correct the next join observer to fill the name before requiring enabled Join.
  Zoom's preview uses #input-for-name and disables Join for invalid form data.
  The corrected observer passed simulated immediate/delayed enable, fill-failure
  and single-action checks and was used in the latest normal run. No form appeared,
  so its live fill/click behavior remains unverified.
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
  Public run() results must remain natively structured-cloneable. Capture pools
  stay bounded at 64 physical slots. Pending imports retain deadlines; TLA expiry
  revokes the realm. Cooperative checks do not bound parsing/synchronous host calls.
- Keep rejected shortcuts discarded: whole measurement-worker reuse leaks saved
  callbacks across walks; mutable foreign-record descriptor caches, constructor
  prototype tracking, deferred-collector skipping, shared mutable visit state,
  local-function deferral, strict-arguments tracking and broader capture caches
  have not met correctness/performance requirements. Do not use per-loop wrapper
  instrumentation to claim allocation improvements.
- Native, SafeJS, live-network, sockets and real TTY/PTY gates remain separate.
  Native membership is native-tests.json. SafeJS, live Zoom and necessary sockets
  are already authorized; native passes prove none of those gates.

## Development constraints

- Preserve unrelated changes and recovered patches in contributions/.
- Keep artifacts ephemeral; remove owned logs/reports/redundant builds after
  processes terminate. Keep status here; no diaries or findings inventories.
- Use TDD for SafeJS changes and serialize CPU-heavy tests/builds/probes.
- Commit focused completed changes with explicit paths; do not push.
