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

## Current evidence

- SDK: /home/kjopek/project/poe-code/packages/safe-js. Reuse its working build and
  /tmp/agent-browser-node24-runtime/bin/node with --experimental-wasm-jspi.
- SDK fix 3200a1957f protects source-retention snapshots from native flatMap,
  array-species and Map iterator hooks. Five regressions reproduced private record
  exposure and a 20000-unit payload bypassing a 10000-unit limit (held/unheld).
  Final validation: 188 targeted tests, strict test typecheck, lint, maintained
  build and 16 built checks passed. Record snapshots remain stable while foreign
  scope readers and custom iterators remain fresh. No startup speedup established.
- Prototype update f12485a557 tracks String/Number/Boolean prototypes with private
  boxed values and captured native operations. All 339 focused tests, lint, the
  maintained build and 16 built checks passed. Array (c529ce093b) and Symbol/BigInt
  (cc5df51ba3) prototypes are also tracked. An earlier boxed-prototype experiment
  saved 9.2% CPU, but did not measure the hardened implementation or Zoom startup.
- The recovered baseline 029820ce86 is tree-identical to d3ec60d811. Seventeen
  omitted SDK commits were recovered; preserve these fixes and contributions/.
  Existing safeguards cover owned accounting metadata/defaults, late deferred
  materialization, bounded closure-property recursion, class-method reservations,
  sixteen positive capture slots and fresh host-prototype links after expandos.
- Latest normal live retry with 3200a1957f completed 13 classic scripts and
  prepared seven modules, then expired at the unchanged 120 s module deadline.
  No controls, name fill, join or socket attempt. Last sample: 9033009 steps,
  6940513 data units at 113.972 s. Cleanup verified zero data/sockets.
- Fresh-process full default DOM probes still time out at 1000 ms. A warmed
  unchanged run passed all 37 checks; it does not clear the cold-start gate.
  In-memory budget observations verified zero-data cleanup in cold and warm runs.
  Moving URL/Blob/Worker setup outside the Window closure also failed cold.
- A fresh Zoom CPU profile deliberately stopped at 1500 module nodes in
  rolldown-runtime.min.js after about 5.20 sampled seconds. The walker accounts
  for 49.1% of CPU directly, with further scope, membership and brand-check costs.
  No Join controls appeared; cleanup verified zero data/sockets. The diagnostic
  injected an early stop, not another normal deadline expiry. Inlined source
  positions are not independent operation timings.
- A fresh live graph at module node 1500 contained 3703 deferred functions,
  1649 closures and 37 host objects. Extracting deferred capture collection into
  a separate helper preserved 6666886 units across 1000 comparison walks, but
  increased aggregate CPU by 1.7% and wall time by 2.8%; discarded. Both probes
  stopped deliberately and verified zero data/sockets. No Join controls appeared.
- V8 startup tracing found repeated walker deoptimization at regex compiled-ticket
  reads. Moving regex accounting into a nested helper reduced walker deoptimization
  but was inconclusive for startup. On one live graph, 1000 alternating walks
  preserved 6667169 units; the helper used 4.9% more CPU and 2.4% more wall time,
  so it was discarded. All three probes deliberately stopped at module node 1500
  with no Join controls and verified zero retained data/sockets.
- Earlier full-page profiling attributed 93% CPU to accounting. The six-module
  fixture omits prior page scripts: at node 30001 it charged 6116470 units with
  about 3700 deferred functions. One walk visited 17069 scopes and appended 26333
  captures, buffering only 403 values. Most captures were already visited.
  Capture-cache hits were about 96%; alternative ordering increased comparisons.
- PcmResampler converts supplied planar Float32 audio to PCM16 with bounded
  filtering, mono/stereo mixing and source-frame timing. Its built SDK pipeline
  fed ten seconds of 48000 Hz audio to PcmCapture as exactly ten 16000 Hz chunks,
  preserving signal level and releasing all buffers. This is supplied-audio
  processing only; PcmCapture does not acquire audio. PageMedia is CSS matchMedia.
  MediaStream, mediaDevices, Web Audio/AudioWorklet, RTCPeerConnection and a live
  PCM producer remain unimplemented. The unchanged Automations capture worklet
  produces correct synthetic PCM, clock and stop output in an isolated SDK realm
  with supplied processor/port globals; this proves neither capture nor transfer.
  Earlier warmed 128-frame/8 ms blocks took 829–893 ms.
- AudioRecording owns an existing asynchronous source through conversion and
  recording, pause, graceful stop and owner cancellation. Shutdown waits for
  pending reads and source-close acknowledgement. All 236 audio tests, build,
  lint and strict test typecheck passed. The built SDK scheduled-source check
  converted 4800 frames at 48000 Hz into 1600 frames at 16000 Hz; normal and abort
  paths closed the source once with no retained buffers, reads or timers.
  This is synthetic-source evidence; actual device/meeting capture remains open.
- Post-prototype tracking, two worklet blocks made 16716696 intrinsic collector
  calls, all cache hits. An in-memory dispatch experiment saved only 1.0% CPU
  and 1.8% wall time and was discarded. Instrumented counters inflated profile
  costs. Real scheduling, transport and live throughput remain unverified.
- Faster owned-object backing storage was also investigated, without a source
  change. In-memory V8 conversion of 1804 dictionary targets preserved 6667461
  data units across 600 walks of a live Zoom graph; aggregate CPU improved only
  1.9%, with inconsistent individual rounds. The corresponding object/function
  allocation worklet experiment saved 1.3% CPU. No change retained. The valid
  Zoom probe deliberately stopped at node 1500 and verified zero data/sockets;
  an earlier probe sampled an empty teardown graph and was rejected.
- Built Node 22/24 copying checks round-trip 1000-level objects and report
  dataDepth at 1025; deep realm bridges/async cloning remain separate gates.
  Window load ordering/receivers/identity/cleanup has an offline SDK check in
  scripts/check-window-load.ts. Worker socket native/SDK/loopback checks cover
  quotas, connect-src, Blob policy, ordering and termination, not Zoom exchange.

## Outstanding gates

- Initialize within normal allowances, expose Join controls, fill the name before
  requiring enabled Join (#input-for-name), and verify admission/presence. Reduce
  reconciliation cost without skipping reads or collectors.
- Clear full default DOM initialization, including complete prototype tables and
  library compatibility. Earlier traces reached Event descriptor installation;
  isolated DOM passes excluded other initialization and do not clear this gate.
- Implement and verify every notetaker capability above. Automations references:
  capture-page.js (getDisplayMedia, 16000 Hz AudioWorklet), meeting-page.js
  (48000 Hz AudioContext/MediaStream microphone/playback), track-audio-page.js
  (incoming WebRTC). Native support requires actual media sources and transport;
  worklet math alone does not establish scheduling, transfer or throughput.
- Verify complete network Worker startup, its original WASM initialization
  callback, download/initialization protocol and actual Zoom socket exchange.
  Extracted glue initializes a 20 MiB heap; the full Worker expired before exports.
  Media root: https://st1.zoom.us/web-media/u9n13za/. application-media-v1 permits
  33554432 data units with the same 120 s deadline.
- Verify server-selected behavior. Earlier routes/browser identities selected the
  same client; no simpler join flow was established. Blocking file-paa.zoom.us
  and cdn.cookielaw.org remains diagnostic configuration.
- Complete iframe navigation/srcdoc/policy contexts, child realms, DOM namespaces,
  full canvas, React stream helpers and interaction.
- Revalidate deep host ingress/exports, prototype/capture copying, callback
  rejections, timer/onload failures, idle timing, fake-SDK contracts and deeper
  non-ladder parser grammar. Module deferral does not optimize classic hoisting.

## Development constraints

- Preserve unrelated changes, SafeJS's untracked report-unhandled-throws.test.ts,
  recovered contributions/, working builds, dependencies and the Node runtime.
- Keep artifacts ephemeral and status concise here; no diaries or findings reports.
- Use TDD for SafeJS changes; serialize heavy tests/builds/probes. Validate hooks
  against the loaded SDK, including bundled layouts. Native tests must be listed
  in native-tests.json; authorized SafeJS/live Zoom/socket probes and real TTY/PTY
  acceptance remain separate from native tests.
- Preserve quotas, fresh observations, aliases, ordering, reentry, cancellation,
  credential isolation, primitive-node awaits and full reconciliation. Keep fresh
  walk state, private captures, structured-cloneable results and bounded pools.
  Imports retain deadlines; TLA expiry revokes the realm. Cooperative checks
  cannot bound parsing or synchronous host calls.
- Do not repeat the unchanged 600 s diagnostic or raise deadlines: it still
  stopped in DOMPurify allowlist construction at 58334 module nodes.
- Require new evidence before revisiting discarded visitor/symbol splits,
  object-first dispatch, alternate visited sets or combined lookup registries,
  bound URL/function readers, Window/Event metadata, bulk Event descriptors,
  scope pruning/tags, visited-generation cells, WeakSet/ownership caches, capture
  pooling/order changes, property-layout/string-position caches or WASM factories.
  Direct pending-function reads gave less than 1% full-page improvement; an
  isolated capture collector was about 6% slower. Scope pruning changes quotas.
- Do not revive unsafe measurement-worker reuse, saved-callback leaks, stale
  Temporal/Intl guards, mutable descriptor caches or skipped collectors.
- Commit explicit owned paths only. No subagents, branches or pushes.
