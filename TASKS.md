# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. Preserve
  Automations; keep the engine independent of Chromium, Firefox and remote
  browsers. SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. Approved diagnostic route:
  https://app.zoom.us/wc/7982110526/join. **No meeting has been joined.**
- Full acceptance requires controls, admission and verified presence, roster/chat,
  actual audio capture/transcription, playback, microphone/avatar, leaving and
  verified cleanup.
- Continue challenge handoffs, top100 compatibility, .env/pass secret placeholders,
  passkeys, browser-only research, playground/terminal and command coverage.

## Current state

- Maintained SDK: /home/kjopek/project/poe-code/packages/safe-js. Reuse its working
  build and /tmp/agent-browser-node24-runtime/bin/node with --experimental-wasm-jspi.
- The normal Zoom probe now enables bounded WASM and binary Worker messages.
  Its configuration passed 200 focused native tests and the browser build.
  Latest live run reached 11518 module nodes in editor-core before its 120 s
  deadline closed the realm: 12 classic scripts completed, one execution-closed.
  No name/Join controls or socket attempt; shutdown retained zero data.
  No diagnostic is active; do not repeat unchanged extended runs.
- Earlier profiling attributed 70.58 of 73.83 module seconds to accounting:
  1998 closures, 984 ordinary records and 3703 deferred functions per walk.
  Reprofile with media options enabled before comparing startup improvements.
  Compact private closure captures are retained in SafeJS 0e78d93e69: matching
  accounting in fixed-work comparisons, 216 focused tests and 13 built SDK checks
  passed; a live startup speedup is not established.
- Visitor, registry, capture-cache, absent-value filtering, shared deferred
  collectors and Node 22 variants showed no reliable gain. Private-body deferral
  reduced fixture allocations but did not improve the complete Worker's 30 s run;
  no candidate runtime changes were retained. Preserve fresh scope observations.
  Use the same walker and equal dispatch overhead for fixed-graph comparisons.
- Current Zoom media root is https://st1.zoom.us/web-media/u9n13za/. The complete
  network Worker failed source completion at both 30 s and 120 s; status 131 at
  120 s is not readiness. Both runs verified zero retained data after cleanup.
  Its source constructs WebSocket connections, but the Worker realm exposes no
  WebSocket API. Main-page sockets do not establish Worker transport support.
- Retained fixes cover callback ownership/release (SafeJS f4bb1f080a, browser
  d69cf5d), pending-function arrays (542c1fd4a), reconciliation (e9a8214c3), Proxy
  accounting (9fa4fc3fd) and parser costs (aece59d34, 1c5ce18cb). Callback validation:
  142 focused SDK tests, 198 browser tests, both builds and 13 built SDK checks
  passed. Existing dirty Window.onload work has a non-callable-value test failure.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.

## Outstanding gates

- Initialize within normal allowances, expose Join controls, fill the name before
  requiring enabled Join (#input-for-name), and verify admission/presence. Resolve
  the remaining accounting cost and timing instability during real module setup,
  preserving all reads and collectors. Longer deadlines alone do not reach readiness.
  Fixed-work diagnostics and fixture gains do not establish meeting acceptance.
- Implement and verify every notetaker capability above. Automations references:
  capture-page.js (getDisplayMedia, 16000 Hz AudioWorklet), meeting-page.js
  (48000 Hz AudioContext/MediaStream microphone/playback), track-audio-page.js
  (incoming WebRTC). Native support needs actual media sources and transport.
- Add Worker WebSocket support with explicit transport, appropriate Worker CSP,
  bounded shared connection ownership and termination cleanup. Verify the complete
  Worker and its WASM download/initialization protocol, not just extracted glue.
- Verify server-selected page behavior; identity changes landing content. Optional
  file-paa.zoom.us/cdn.cookielaw.org blocking is diagnostic configuration only.
- Complete iframe navigation/srcdoc/policy contexts and child realms, DOM branding
  and prototypes, namespaces, library compatibility, full canvas, React stream
  helpers and interaction. Worker/Wasm remains a separate gate.
- Revalidate parser depth, deep host ingress/exports, prototype/capture copying,
  callback rejections, timer/onload failures, idle timing and fake-SDK contracts.
  Source-module deferral does not optimize classic-script function hoisting.
- Preserve quotas, fresh property/provider observations, aliases, callback order,
  reentry, cancellation, credential isolation, primitive-node awaits and full
  reconciliation. Keep fast scope fields, tracked projections, fresh walk state,
  private capture snapshots and structured-cloneable public run() results.
  Capture pools stay bounded at 64 slots; imports retain deadlines and TLA expiry
  revokes the realm. Cooperative checks do not bound parsing/synchronous host calls.
- Do not revive unsafe measurement-worker reuse, saved-callback leaks, stale
  Temporal/Intl membership guards, mutable descriptor caches or skipped collectors.
  Require reproducible gains and preserved accounting before retaining optimizations.
- Native tests use native-tests.json. SafeJS, live Zoom and necessary sockets are
  authorized; their acceptance and real TTY/PTY gates remain separate from native.

## Development constraints

- Preserve unrelated changes and recovered patches in contributions/.
- Keep artifacts ephemeral and status concise here; no diaries or findings reports.
- Use TDD for SafeJS changes; serialize CPU-heavy tests, builds and probes.
- Check diagnostic hooks against the loaded public SDK, including bundled layouts.
- Commit completed changes with explicit owned paths. No subagents or pushes.
