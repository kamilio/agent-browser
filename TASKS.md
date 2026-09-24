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
- Zoom startup remains blocked: all 13 classic scripts pass, but the normal
  120 s runtime deadline expires in editor-core before name/Join controls appear.
  An 1800 s diagnostic reached emoji-reactions initialization without controls;
  do not repeat unchanged extended runs. No join/socket attempt occurred.
  Cleanup passed with zero retained data; no diagnostic remains active.
- Retained SafeJS parser/accounting fixes passed their focused tests, lint,
  maintained builds and built checks; live startup remains unresolved. Latest
  parser commits: aece59d34 and 1c5ce18cb. Latest traversal experiments were
  discarded; source and built visitor were restored and all 11 built checks passed.
- In-memory capture/replay isolates accounting as about 94–96% of a matching
  5000-module-node startup interval. Offline replay invariants: 9844 phase steps,
  29217 additional data units, 5066 accounting calls and equal returned-accounting
  totals between replays. Preserve response completion order and recorded guest
  Date reads; keep native deadlines real and replay networking disabled.
  Live bootstrap scheduling can change the data delta; compare offline runs
  from the same capture. Diagnostic archives were released.
- Next inspect visitor optimization/deoptimization during real startup. The
  fixture visitor reaches TurboFan, but fixture gains did not transfer to Zoom:
  shared deferred methods took 24.3–25.5 CPU seconds versus 17.2–19.7 for the
  unchanged visitor, with identical replay accounting and verified cleanup.
  Private visit marks were also slower in fixtures. These changes were discarded,
  as were cache-capacity/promotion and scope-dispatch variants. The earlier
  state-classification guard lacks native-hook escape tracking and is unsafe.
  No runtime optimization was retained; startup timing variability is unresolved.
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
