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
- Latest uninstrumented Zoom check (restored runtime, Node heap 512 MiB) passed all 13 classic scripts and
  prepared seven modules, but the 120 s import deadline revoked the realm before
  settlement. No readiness, admission, presence or socket attempts. Cleanup closed
  runtime/sockets and retained zero data. A 600 s diagnostic also expired.
- The 512 MiB heap advanced to 9015061 steps at 115 s, versus 8998346 at 111 s
  in the recent 256 MiB cache check; this comparison includes backend/timing
  differences and does not establish a precise speedup. Normal startup still
  misses its deadline. A 600 s diagnostic with the restored backend and 512 MiB
  heap is running, observing module positions and attempting Join if actionable
  controls appear. Its extended deadline is not normal-startup acceptance.
- Positive visited cache ccb727ac1 was reverted by a7a496449. Its apparent gain
  came from a benchmark with duplicated visitor functions. Separate processes
  using the unchanged visitor did not confirm it: a deterministic 34269-unit
  fixture took 0.291–0.293 s baseline versus 0.294–0.313 s cached per 200 walks.
  Live graphs of about 6.657 million units took 0.226–0.344 s baseline versus
  0.337–0.474 s cached per 50 walks. These live graphs differed slightly and wall
  times showed contention; neither supports a startup-speedup claim. Both probes
  closed runtime/sockets with zero retained data. The maintained runtime is back
  to the implementation before the cache; 58 focused accounting tests, the
  maintained build and all 11 built checks pass. Do not reuse split-visitor timings.
- Fast scope accounting fields (db983eba8) retain immutable null-prototype
  records and pinned construction. A controlled live comparison preserved
  6656514 units on 597 roots; CPU per 50 walks fell from 0.34–0.39 s to 0.23–0.30 s.
  Allocation did not improve. Validation: 63 focused tests (including GC-enabled
  cases), scoped lint, maintained build and eleven built checks passed. The layout
  regression fails before the fix and passes on Node 22/24. Startup still times out.
- Earlier validated optimizations remain: tracked array projections (7a0adb82d),
  retained visitor code with independent per-walk state (d7052a82d), and private
  bound-capture snapshots preserving replaced/accessor providers (838ff9c0a).
- Profiling uninterrupted editor-core execution after the cache revert attributes
  32% to visitor self time, 31% to GC and 11% to visited-object lookups. Enabling
  profiling invalidated visitor code once; tracing showed no repeated visitor
  deoptimization during the window. Treat profiler startup effects separately.
- A descriptor census preserved 6657475 units on 607 roots: 798 records already
  use accounting projections, most arrays use projections, and only 200 symbol
  descriptors are captured. Remaining snapshots include arguments and guest/host
  prototype tables. Broad descriptor caching is not supported by this evidence.
  Both diagnostics closed with zero retained data and no socket attempts.
- Pinning native registry methods as own WeakMap properties also showed no gain
  in separate-process fixtures (0.292–0.314 s baseline versus 0.298–0.315 s per
  200 walks); no runtime change was made.
- An object-first dispatch comparison preserved 6657238 units on 616 roots but
  showed overlapping CPU ranges and unchanged allocation; it was not adopted.
- A corrected live observer reused session queries and found no name input or
  Join button before or after the 120 s import window (complete snapshots).
  Cleanup passed; no socket attempts. Statement counts reached 1551 nodes in
  rolldown-runtime and 2011 in editor-core, ending at offset 32612 in React DOM's
  property-info constructor during attribute-table initialization. An earlier
  observer exhausted cleanup registrations; its late observations are superseded.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.

## Outstanding gates

- Investigate the measured React DOM attribute-table constructor workload and
  retained-graph costs, including optimization/deoptimization during uninterrupted
  interpreter execution. Use the unchanged visitor when comparing backends.
  Do not repeat the rejected positive visited cache, object-first dispatch or
  fresh-Set visited-storage approaches without new evidence.
  Preserve per-walk callbacks and avoid retained guest roots.
  Initialize within normal allowances and verify JavaScript Join controls,
  actual joining, admission and presence.
  Diagnostic limits and fixture improvements do not establish live acceptance.
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
