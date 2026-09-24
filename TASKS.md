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
  build and /tmp/agent-browser-node24-runtime/bin/node.
- Latest normal Zoom observation: all 13 classic scripts passed; the 120 s deadline
  expired in editor-core after 7722 module nodes, before name/Join controls appeared.
  The retained runtime also exhausted a bounded 1800 s run in i18n-core after
  123558 module nodes (editor-core: 108155; i18n-core: 10689). Both runs had no
  name/Join controls or join/socket attempt; cleanup retained zero data. No
  diagnostic remains active. Do not repeat unchanged extended runs.
- Retained SafeJS fixes cover late-callback function reconciliation (e9a8214c3),
  stack-safe Proxy accounting (9fa4fc3fd), and parser costs (aece59d34, 1c5ce18cb).
- SafeJS 542c1fd4a replaces pending-function wrapper allocations with separate
  state/depth arrays, preserving traversal and reconciliation. Recorded Zoom replay
  used 15–20% less CPU than two baselines with matching accounting and work.
  Validation: 109 focused source tests, lint, maintained build and 13 built checks
  on Node 24 passed. The changed build still times out during normal live startup.
- Accounting still consumes about 95% of module execution. A current 5000-node
  profile attributes 46% of sampled time to the main visitor and 10% to visited
  lookups; scope collection and deferred reads contribute further cost.
  Each walk includes 3703 deferred module functions. Static source confirms long
  startup loops build React DOM property metadata and DOMPurify allowlists.
  Type-branch and identity-layout
  experiments established no reliable Zoom gain; no changes were retained. Even
  matched replay baselines varied from 16.51 to 32.04 CPU seconds. Require stable
  timings as well as matching initial state, accounting, clocks and timer delivery.
  Replay networking stays disabled; its archive was released.
- Same-process bytecode and verbose V8 frames confirm a cold fallback at the
  visitor's Proxy target read. A local fixture reproduces both observed fallback
  reasons with ordinary Proxy state. Exercising that path early prevents both,
  but improves fixture CPU only 3–6% with identical collector counts; no runtime
  change is justified yet. Focus next on steady-state traversal and registry
  lookups, preserving fresh observations. All probes stopped and cleaned up;
  profiles and traces stayed in memory.
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
