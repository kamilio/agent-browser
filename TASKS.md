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
- Fresh post-download Worker CPU sample: retained-data visitor self time was
  20.1 of 30.6 s; typed-array classification was only 0.15 s. Earlier startup
  profiling also identifies graph accounting; the visitor is already optimized.
  Private visit-generation records and
  private-brand routing showed no gain; discarded without source changes.
- Maintained SafeJS df848a278b extends the per-walk positive capture cache from
  four to sixteen slots, preserving fresh providers, quotas and reconciliation.
  One actual editor measurement had 3703 deferred roots, 2023 closures, and 7662
  extra positive registry lookups with four slots. On the same retained graph,
  sixteen slots took 337–381 ms per 100 walks versus 451–485 ms, with identical
  6690449-unit charges. Full-page time to 6000 module nodes was broadly similar
  (31.8 vs 33.0 s); a clear overall startup gain is not established.
  Passed 200 focused accounting tests, including the previously failing
  sixteen-root lookup bound and success/failure GC cleanup, 13 built SDK checks,
  the selected workspace build and focused lint. No runtime deadline increase.
- Splitting the visitor improved a retained-intrinsic fixture, but regressed the
  actual Zoom page. At the same 6000 module nodes / editor-core offset 32525,
  baseline took 33.0 s wall / 27.4 s CPU versus 47.2 / 36.2 s for the split.
  Both diagnostics intentionally stopped there and cleaned up to zero retained
  data; neither establishes readiness. Discarded the in-memory split.
- A baseline editor-core profile between module nodes 3000 and 6000 also exposed
  deferred-function collect/read costs (1.03 / 0.58 s). A shared-method prototype
  preserved the fixture's 57797-unit charge but showed no clear speedup
  (227–250 vs 227–244 ms per 100 walks); this prototype was not retained.
  Actual editor traversal includes 13815 entries, 4850 scope projections and
  1005 records per sampled measurement. Further accounting work must use this
  scope structure, not the earlier single-scope synthetic fixture alone.
  Preserve fresh reads, every provider/collector and full reconciliation.
- Fresh original/alternate join-route checks found the launch page and the same
  app webclient route. Chrome, Firefox and Safari request identities selected
  the same current client; no simpler supported join flow was established.
- Worker WebSockets now reuse the explicit document transport and connection
  quotas, with fetched-response connect-src, inherited Blob policy, initialization
  ordering and termination cleanup. Passed 626 focused native tests and build;
  real SafeJS + loopback sockets verified binary exchange, event receivers, close,
  termination and zero retained data/open peer sockets after cleanup.
- Zoom advertises https://st1.zoom.us/web-media/u9n13za/. Extended Worker startup
  reached a concrete arrayLength failure at 135 s: its 20 MiB heap exceeds the
  application profile's 262144-element ceiling. Explicit application-media-v1
  now permits 33554432 array elements/retained-data units without raising the
  120 s time limit or granting capabilities. Passed 395 native tests and build.
  Real SDK Worker check rejects the heap under the old profile, accepts it under
  media, and releases all data. Isolated Zoom parent fetch/CORS, binary transfer,
  and unchanged WASM glue initialized the 20 MiB heap in 17.0 s with the final
  profile/fetch limits; donor detached, no guest errors, zero data/pending
  callbacks after shutdown.
- Complete network Worker source now finishes: 152–166 s with a temporary 300 s
  diagnostic runtime allowance. Parent WASM download took 6.1 s, exceeding the
  five-second fetch default. PageFetch now accepts explicit deadlines up to 30 s
  while keeping the default; 426 focused native tests and build passed.
  The complete Worker downloaded all 465602 bytes and detached the transfer donor,
  then reached actual WASM startup environment/stringToUTF8Array imports. Overall
  initialization exceeded 300 s; no initialized signal or socket attempt. Data
  stayed near 25.3 million units and cleanup verified zero data/callbacks/sockets.
  Full startup within normal 120 s limits and meeting admission remain unverified.
  No diagnostic is active; do not repeat unchanged extended runs.
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
