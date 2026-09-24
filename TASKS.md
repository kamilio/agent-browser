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
  120 s runtime deadline expires in editor-core before name/Join controls appear
  (latest run: 8656 module nodes, offset 32711, line 25).
  An 1800 s diagnostic reached emoji-reactions initialization without controls;
  do not repeat unchanged extended runs. No join/socket attempt occurred.
  Cleanup passed with zero retained data; no diagnostic remains active.
- SafeJS e9a8214c3 reconciles functions materialized by later native callbacks,
  closing a same-walk quota bypass. Validation: 71 focused source tests, lint,
  maintained build, 13 built checks on Node 24 and a cold built reproduction.
  No established performance gain; normal Zoom still times out.
- Retained SafeJS fixes: 9fa4fc3fd makes Proxy accounting stack-safe and preserves
  delayed handler observations; aece59d34 and 1c5ce18cb fix parser costs.
- Accounting consumes about 95% of the profiled 5000-module-node interval;
  a fresh profile of the loaded public build confirms visited-object checks
  alone account for about 13% of samples; deferred collectors remain costly.
  Matching node sequences do not guarantee identical initial state: unchanged
  offline replays diverged in accounting despite consuming the same recorded
  Date/performance values, with timer delivery differing before module execution.
  Preserve underlying clock observations and real deadlines; disable replay
  networking. Archives were released and all diagnostic processes ended.
- Sampled walks perform 20–24k visited-object checks and 24–28k capture appends.
  Each includes 3703 deferred roots plus 3703 separate charge identities. Static
  module declarations match exactly: loginview 2049, editor-core 1363, i18n 166,
  lodash 124 and entry 1. Linking installs these before module execution; examine
  linked-function accounting organization while preserving every collector/read,
  aliases, cycles and TDZ behavior. Both live sampling and transport cleanup passed.
- No performance candidate is ready to retain. Direct deferred state, shared
  deferred methods, Proxy helpers, private visit marks, cache promotion/capacity
  and scope-dispatch variants failed to establish useful gains. A shared visitor
  with fresh state tied its baseline; fresh WeakSets were slower. Per-walk visited
  closures lost their initial gain on repeated, mixed and deeper fixtures, and
  direct private-array appends showed no substantial gain. No runtime changes
  were retained. The fresh live profile reached its cutoff and verified cleanup;
  no Join controls or socket attempt occurred.
  Directly bound registry methods, markers limited to deferred roots/identities,
  and a caller-side positive cache also failed to improve the main fixture.
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
- Verify diagnostic hooks offline against the loaded public SDK, which may use
  bundled chunks instead of the separate compiled source modules.
- Commit focused completed changes with explicit paths; do not push.
