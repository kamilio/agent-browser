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
- The normal Zoom probe enables bounded WASM/binary Worker messages and explicit
  1 MiB / 30 s page-fetch limits. Fresh full-page check with those settings:
  all 13 classic scripts completed; seven modules were admitted. The 120 s module
  deadline closed the realm at 15038 module nodes (13487 in editor-core), while
  extending React's unitless CSS-property table with vendor prefixes at line 29,
  offset 45058. No name/Join controls, join attempt or socket attempt; cleanup
  retained zero data. This advances beyond the earlier 9068-node observation but
  still does not reach readiness. Do not repeat unchanged extended runs.
- Maintained SafeJS df848a278b uses sixteen per-walk positive capture slots.
  Actual editor graph: 337–381 ms per 100 walks versus 451–485 ms with four slots,
  with identical 6690449-unit charges. Full-page time to 6000 nodes was broadly
  similar (31.8 vs 33.0 s); an overall startup gain is not established.
  Passed 200 focused accounting tests, 13 built SDK checks, build and focused lint.
- Fresh editor profile on that SDK: 3107 complete reconciliations during module
  nodes 3000–6000; 14.9 s sampled, including 7.3 s in visit and 1.3 s in visited
  membership checks. One real graph has 13815 entries, 4850 scope projections,
  3703 deferred roots, 2023 closures and 1005 records. Use that scope structure
  when evaluating performance, not a single-scope synthetic fixture alone.
- Rejected in-memory candidates: split visitor (slower on the real page), shared
  deferred methods, guarded visitor entry, private-field scope-root storage,
  private visit-generation records and private-brand routing. No uncommitted SDK
  implementation remains from these experiments; preserve every provider/read.
- Full network Worker still fails the normal 120 s limit before source completion
  or WASM download. One 300 s diagnostic after df848a278b completed its source in
  201.2 s, downloaded 465602 bytes and detached the donor, but did not finish WASM
  initialization. No socket attempts; cleanup verified zero data/callbacks/sockets.
  The final sampled location matches the combined Worker bootstrap at line 458,
  offset 28189: defining WASM export function name/length metadata. Earlier source
  execution also spends substantial time deriving CryptoJS SHA constants.
- Next target: shared page-wasm-bootstrap.ts export-wrapper construction. Assess
  batching/precomputing metadata through the existing PageWasm bridge before
  extending the SDK API; its public extension context currently exposes host
  objects/methods, not a standalone native-callable factory. Preserve function
  name/length descriptors, argument coercion, error identity, callback ownership,
  revocation and quotas. Measure this phase before another complete Worker run.
- Media root: https://st1.zoom.us/web-media/u9n13za/. application-media-v1 permits
  33554432 array elements/data units, without changing the 120 s deadline or
  granting capabilities. PageFetch defaults to 5 s and allows explicit 30 s.
  Isolated real WASM glue previously initialized the 20 MiB heap in 17.0 s with
  download/transfer and zero retained data after close. This does not prove full
  Worker readiness. No diagnostic is active; do not repeat unchanged extended runs.
- Worker sockets preserve explicit transport/connection quotas, response connect-src,
  Blob policy, ordering and termination. Prior 626 native tests and real SDK plus
  loopback checks cover binary exchange/receivers/close and zero retained sockets.
- Original/alternate routes and Chrome/Firefox/Safari identities selected the same
  current app client; no simpler supported join flow was established.
- Existing dirty Window.onload work has a non-callable-value test failure.
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
- Resolve complete network Worker startup and verify its WASM download/
  initialization protocol and actual Zoom socket exchange. The local Worker socket
  check and extracted WASM glue do not establish meeting/media acceptance.
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
