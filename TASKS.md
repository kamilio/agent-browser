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
- Retained SafeJS parser/accounting fixes passed their focused tests, lint,
  maintained builds and built checks; live startup remains unresolved. Latest
  parser commits: aece59d34 and 1c5ce18cb. Latest traversal experiments were
  discarded; source and built visitor were restored and all 11 built checks passed.
- An in-memory capture and two offline replays reached the same 5000 module-node
  sequence in React's DOM-property initialization (editor-core offset 32554).
  Both replays matched all 19 responses, made no HTTP/socket attempts, and cleaned
  up with zero retained data. The archive was released; no diagnostic remains active.
  Replay preserves response completion order and recorded guest Date reads.
  Freezing Date broke bootstrap; immediate responses changed callback ordering.
- Phase-local profiling now matches live/replay work: 9844 steps, 29217 additional
  data units and 5066 accounting calls, with no other guest scripts executing.
  Accounting consumes about 94–95% of the interval. The two profiled replays had
  identical accounting totals but still used 24.2 vs 19.6 CPU seconds; GC was about
  1% or less. Timing variability remains unresolved; bootstrap totals are not a
  substitute for phase-local comparisons. An empty classic task stays pending in
  replay while the live capture completes all 13 classics before the cutoff.
- One actual accounting walk observed 11962 objects and 24426 object captures.
  Its two busiest roots were each captured 5353 times and still needed 1360
  repeated visited-state lookups. Cache promotion and eight-entry caching did not
  give repeatable fixture gains, so both were discarded, as were earlier scope
  dispatch variants. The maintained four-entry cache remains unchanged.
- A preliminary state-classification guard cost probe showed only a small fixture
  gain and has incomplete native-hook escape tracking; it is not a safe runtime
  change. Next investigate larger visitor representation/dispatch costs rather
  than cache-capacity tuning. Preserve fresh observations and full reconciliation,
  including primitive awaits; keep native deadlines real. No runtime change was
  retained; all diagnostics stopped, and their artifacts stayed in memory.
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
- Do not revive unsafe measurement-worker reuse, saved-callback leaks, stale
  Temporal/Intl membership guards, mutable descriptor caches or skipped collectors.
  Require measured gains and preserved accounting before retaining optimizations.
- Native, SafeJS, live-network, sockets and real TTY/PTY gates remain separate.
  Native membership is native-tests.json. SafeJS, live Zoom and necessary sockets
  are already authorized; native passes prove none of those gates.

## Development constraints

- Preserve unrelated changes and recovered patches in contributions/.
- Keep artifacts ephemeral; remove owned logs/reports/redundant builds after
  processes terminate. Keep status here; no diaries or findings inventories.
- Use TDD for SafeJS changes and serialize CPU-heavy tests/builds/probes.
- Commit focused completed changes with explicit paths; do not push.
