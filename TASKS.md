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
  1 MiB / 30 s page-fetch limits. Latest instrumented full-page check completed
  all 13 classic scripts and admitted seven modules, but the 120 s module deadline
  closed the realm at 11149 nodes (9598 in editor-core), at line 25, offset 32711.
  No name/Join controls, join attempt or socket attempt; cleanup retained zero data.
  An earlier run reached 15038 nodes. Without per-node tracing, all 13 classics
  completed and seven modules prepared, but the same deadline expired without
  name/Join controls, a join attempt or sockets; cleanup retained zero data.
  No diagnostic is active. Do not repeat unchanged extended runs.
- Maintained SafeJS uses sixteen per-walk positive capture slots.
  Actual editor graph: 337–381 ms per 100 walks versus 451–485 ms with four slots,
  with identical 6690449-unit charges. Full-page time to 6000 nodes was broadly
  similar (31.8 vs 33.0 s); an overall startup gain is not established.
  Passed 200 focused accounting tests, 13 built SDK checks, build and focused lint.
- Fresh editor profile on that SDK: 3107 complete reconciliations during module
  nodes 3000–6000; 14.9 s sampled, including 7.3 s in visit and 1.3 s in visited
  membership checks. One real graph has 13815 entries, 4850 scope projections,
  3703 deferred roots, 2023 closures and 1005 records. Use that scope structure
  when evaluating performance, not a single-scope synthetic fixture alone.
- Profiling after externals.min.js and before the first client-module instruction
  measured 49.0 s: visitor 12.9 s, source-position decoding 4.9 s, AST encoding
  2.9 s and GC 2.6 s. Seven modules prepared; the intentional stop cleaned up
  with zero retained data/sockets. Parsing the real 3.49 MB login module made
  8548753 position requests and allocated 3860297 uncached coordinates.
- SafeJS a9d68d5e67 defers coordinates on private compiler tokens; ordinary token
  records remain eager. The rebuilt SDK reduced login-module position requests to
  3934203 and allocations to 1984101. Alternating runs used 10.06–10.23 s CPU
  versus 11.67 s for the warmed eager baseline. This is a parsing gain, not proven
  application readiness. Passed 226 focused tests, lint, maintained build,
  13 built SDK checks and six browser SDK/JSPI checks with zero retained resources.
  Execution comparison over nodes 3000–6000 used 18.06 s CPU eager versus 13.57 s
  lazy, both with 3107 complete reconciliations and verified cleanup. No regression
  reproduced; separate page-load timing does not establish a reliable execution gain.
- SafeJS 71a4da72cf fixes the parser's native stack overflow on long else-if
  ladders. Iterative continuations preserve the 2048-level limit, source spans and
  nearest-else binding; deeper non-ladder grammar remains a separate validation gate.
- Worker source nodes 15000–35000 required 21009 complete reconciliations and
  31.5–34.2 s sampled time; the visitor accounted for 16.9–17.9 s. Optimization
  tracing separated 35 warm-up deoptimizations from four in the measured interval;
  repeated steady-state deoptimization is not established as the main cost.
  Fixed-work stop at 35000 nodes verified cleanup, not Worker initialization.
- SafeJS 57717c7ef9 tracks newly owned guest constructor prototypes. The real
  Worker graph now has 97 fallback records versus 142, with the same 1040257-unit
  charge. Focused prototype walks improved from 59 to 39 ms, but fresh unprofiled
  Worker segment CPU was effectively unchanged (32.05 versus 32.00 s), with all
  21009 reconciliations and zero retained resources after close. Earlier apparent
  gains did not survive the fresh comparison. Passed 104 focused tests, lint,
  maintained build, 13 built SDK checks and six browser SDK/JSPI checks.
  Remaining fallback records include host metadata that requires fresh reads;
  these counts do not imply every fallback recaptures descriptors.
- Rejected in-memory candidates: split visitor (slower on the real page), shared
  deferred methods, guarded visitor entry, private-field scope-root storage,
  private visit-generation records and private-brand routing. A narrower special-
  type visitor split stayed within Worker timing variation. Local declaration
  deferral did not demonstrate an editor-segment gain (16.2 s, 3107 reconciliations)
  and would require caller/source-reference capture normalization. No SDK changes
  remain from these experiments; preserve every provider/read.
  Direct owned getter reads also failed a same-graph comparison (roughly
  135–145 ms per 50 walks, identical charges). Repeated-position/line caches and
  balanced-group scan reuse did not demonstrate reliable real-module parse gains;
  all remained in memory and were discarded.
- The last normal 120 s network Worker check failed before source completion
  or WASM download. A 300 s diagnostic with batched WASM metadata completed
  source evaluation in 181.6 s, downloaded 465602 bytes, detached the donor and
  completed export-wrapper setup (31.6 s), but expired before Zoom's original WASM
  initialization callback. The subsequent rebuilt-SDK diagnostic took 265.1 s
  for source evaluation and downloaded the same WASM, but expired before donor
  transfer or export setup. Both cleaned up with zero retained data/callbacks/
  sockets and no socket attempts. Startup remains unverified; shared-host timing
  varies substantially. Earlier source execution spends substantial time deriving
  CryptoJS SHA constants; metadata batching acts afterward.
- PageWasm now supplies fresh function name/length descriptors for one captured
  Object.defineProperties call per export. Isolated real Zoom WASM export setup
  took 0.70–0.86 s versus the 1.15 s baseline (CPU 664–678 versus 797 ms), with
  2937 additional accounted data units. This does not establish normal startup.
  Build, 114 native WASM tests and all six actual SDK guest API checks pass,
  including descriptors, coercion/error identity, callbacks, reentry and cleanup.
- Next: reduce remaining source/setup cost and observe the complete original WASM
  callback. A separate export factory reduced retained data but increased isolated
  export setup CPU to 1.03 s; discarded. Keep every fresh read, collector, quota
  and ownership check. The SDK exposes
  host objects/methods, not a standalone native-callable factory. Do not repeat
  unchanged extended diagnostics or treat isolated initialization as Worker success.
- Media root: https://st1.zoom.us/web-media/u9n13za/. application-media-v1 permits
  33554432 array elements/data units, without changing the 120 s deadline or
  granting capabilities. PageFetch defaults to 5 s and allows explicit 30 s.
  Final built isolated real WASM glue initialized the 20 MiB heap in 6.7 s with
  download and zero retained data after close. This does not prove full
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
