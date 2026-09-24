# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. This is
  exploratory work; keep Automations operational and unchanged.
- Keep the engine independent of Chromium, Firefox and remote browsers. SafeJS
  is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. Approved diagnostic route:
  https://app.zoom.us/wc/7982110526/join. **No meeting has been joined.**
- Acceptance requires interactive controls, admission and verified presence,
  roster/chat, audio capture/transcription, playback, live microphone/avatar
  support, then leaving and verified cleanup.
- Continue legitimate challenge handoffs, top100 compatibility, extensible
  .env/pass secret placeholders and passkeys, browser-only research,
  playground/terminal and command coverage.

## Current verified state

- Maintained SDK: /home/kjopek/project/poe-code/packages/safe-js. Reuse this
  browser's working dist. The selected SDK build and eight built-import checks
  passed; full native/SafeJS gates remain open.
- The loader supports delayed bootstrap, classic scripts and source modules.
  SafeJS accounting uses private snapshots, bounded capture pooling, tracked
  records/arrays, import/export indexes, deferred module functions and unread
  unmapped arguments, and metered import deadlines. Fresh descendant/native
  observations, aliases, ordinary/held quotas and reentry remain required.
- Latest retained optimization: SafeJS 03068ccf9 avoids fallback iterators for
  closures without retained-value providers. Selected regressions passed 70 tests
  across 12 files; scoped lint, build and eight imports passed. Comparing walkers
  on the same live graph preserved charges and reduced sampled allocation about
  3%; no CPU or complete startup improvement was established.
- Latest uninstrumented Zoom check: 256 MiB heap, 120 s script/import observation
  bounds, 13 classic scripts passed, seven modules prepared. Import observation
  expired while editor evaluation remained pending. No readiness, admission,
  presence or socket attempts. Cleanup closed the runtime and sockets and cleared
  retained data. Longer diagnostics have also failed to establish readiness.
- Editor profiling attributed about 71% of CPU samples to data reconciliation
  and 25% to GC; the walker was already V8 optimized. About 12600 graph visits
  and 25000 capture calls occurred per scan. Largest allocation buckets were
  visit, native descriptors, iterator next and property-name arrays. Fixed read-site
  helpers attributed about 11% of sampled allocation to own-symbol enumeration;
  this is diagnostic attribution, not baseline throughput. Loop-wrapping probes
  added excessive allocation and are unsuitable for judging optimization targets.
- Reflection arrays occupied only 72 slots across two arrays in a retained live
  graph. Reusing their descriptors preserved charges and reduced allocation about
  4%, but CPU timings overlapped. No runtime change is justified by that comparison.
  All completed probes verified closed runtimes/sockets and zero retained data.
- Latest operation census found repeated work in Rolldown's export-copy helper
  during two 10 s windows (254 and 292 evaluator entries). This establishes slow
  copy-loop work, not an infinite loop; instrumentation affects timing.
- Constructor-prototype tracking, visit-marker and deferred-identity trials were
  discarded for insufficient representative benefit or retention/accounting
  failures. No changes from these trials remain; maintained builds were restored.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Investigate
  retained-graph traversal and allocation costs around editor initialization and
  export copying without weakening observations. Trace the remaining untracked
  arrays/records behind symbol and descriptor enumeration to their creation sites;
  any reuse must preserve native mutations and provider observations.
  Fixture improvements and longer diagnostic allowances do not establish
  live/default-resource acceptance.
- Implement and verify every notetaker capability above. Automations reference:
  capture-page.js uses getDisplayMedia and a 16000 Hz AudioWorklet for mixed audio;
  meeting-page.js uses a 48000 Hz AudioContext/MediaStream destination for virtual
  microphone/playback; track-audio-page.js optionally captures incoming WebRTC
  tracks. Native support needs actual media sources and transport.
- Verify server-selected page behavior and working JavaScript Join handlers.
  Default identity may receive a different landing page; desktop HTML has no
  server-rendered Join controls. Optional blocking of file-paa.zoom.us and
  cdn.cookielaw.org is diagnostic configuration only.
- Complete iframe navigation/srcdoc/policy contexts and child realms; validate
  DOM branding/prototypes, namespaced names, library compatibility, full canvas,
  React stream helpers and interactive behavior. Worker/Wasm remains a separate gate.
- Revalidate unresolved parser depth, deep host ingress/result exports,
  prototype/capture copying, callback rejections, timer/onload failures, idle
  timing and fake-SDK contracts before fixing them. Source-module deferral does
  not optimize classic-script function hoisting.
- Preserve complete ordinary/held quotas, fresh property/provider observations,
  cancellation, callback ownership and credential isolation. Capture pools stay
  bounded at 64 physical slots. Do not revive shortcuts based on tracked ownership.
  Strict-arguments tracking and broader capture/optional-state caches remain
  discarded. Pending imports retain deadlines; TLA expiry revokes the realm.
  Cooperative checks do not bound unmetered parsing or synchronous host calls.
- Native, SafeJS, live-network, sockets and real TTY/PTY gates remain separate.
  Native membership is native-tests.json. SafeJS, live Zoom and necessary sockets
  are already authorized; native passes prove none of those gates.

## Development inputs

- Node24 runtime: /tmp/agent-browser-node24-runtime/bin/node. No isolated SDK copy.
- Preserve unrelated changes and recovered patches in contributions/.
- Keep artifacts ephemeral; remove owned logs/reports/redundant builds after
  processes terminate. Keep status here; no diaries or findings inventories.
- Commit focused completed changes with explicit paths; do not push.
