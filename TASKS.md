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
- SafeJS 257e9b508 fixes a reproduced quota undercount when a native metadata
  reader grows a later function property. Invalidated descriptors are refreshed
  in the original key order, including under held quotas. Earlier accessor-root
  fix 61d1873e4 and sealed-symbol optimization 0e0b1a35a remain.
- SafeJS 73e115d99 uses existing tracked tables for copied host-function properties.
  Combined validation: 150 tests across nine files, scoped lint, test formatting,
  maintained build and eight built-import checks. Native edits, metadata baselines,
  aliases, snapshots and reentrant callbacks remain observable.
- A live graph comparison of fresh versus cached metadata descriptors covered
  47 tables and preserved 6656677 units on 606 roots. Sampled allocation fell from
  24.90 MB to 24.37 MB per 50 walks; CPU timings overlapped. The focused 179-function
  fixture showed a much larger allocation reduction; no startup speedup is proved.
- SafeJS 760d57a6b tracks reflected property-descriptor results using existing
  privately owned storage. TDD reproduced 20 native descriptor reads per five
  unchanged walks; the result is now zero. Validation: 120 tests across nine files,
  scoped lint/formatting, maintained build and eight built-import checks. Mutations,
  aliases, accessor order, reentry and ordinary/held quotas remain covered.
  A controlled 37-result fixture preserved 1517 units while sampled allocation
  fell from 2.49 MB to 0.22 MB per 100 walks; this is not a live startup speedup.
- Latest Zoom check of 760d57a6b: 256 MiB heap, 120 s script/import limits.
  All 13 classic scripts passed; externals.min.js used 55.8 s wall / 51.9 s CPU.
  Seven modules prepared but did not settle before the actual import deadline
  revoked the realm. No readiness, admission, presence or socket attempts. Cleanup
  verified closed runtime/sockets and zero retained data. The earlier 600 s
  diagnostic also expired during module execution; longer waits alone do not
  establish working startup.
- Editor profiling attributed about 71% of CPU samples to reconciliation and 25%
  to GC; the walker was already optimized. About 12600 graph visits and 25000 capture
  calls occurred per scan. The operation census found slow Rolldown export-copy
  work, not a proven infinite loop. Native descriptors and iterator allocations
  remain significant; small allocation savings have not established startup gains.
- Live origin tracing before 760d57a6b found 44 constructor prototypes with 263
  descriptor reads, 37 reflection results with 148 reads, and 37 untracked arrays
  with 340 reads. Host-bridge records contributed only 16 reads. Both accounting
  walkers agreed on 6667663 units; cleanup succeeded. Constructor-prototype
  tracking remains rejected; trace unknown array factories before selecting reuse.
- Omitting deferred collection diagnostically found 14812 already-seen roots and
  about 10% lower average CPU with overlapping timings. This shortcut is unsafe and
  was not retained. Native-record descriptor reuse reduced sampled allocation about
  23%, without established CPU benefit; no such cache was retained. Completed probes
  verified cleanup. Rejected constructor-prototype, visit-marker and deferred-identity
  trials remain discarded; loop-wrapping allocation instrumentation is unsuitable.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.
- Discarded the local-function deferral trial: both controlled live variants
  created 450 declarations and retained about 108 MB after externals.min.js.
  CPU varied across runs without a consistent gain. Both probes verified cleanup;
  the maintained eager local-declaration path is restored.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Investigate
  retained-graph traversal and allocation costs around editor initialization and
  export copying without weakening observations. The symbol census also identified
  constructor prototypes, mapped arguments and produced records; copied values from
  copyToSandbox were absent from that branch. Trace remaining untracked arrays and
  records to their creation sites before considering further reuse; preserve native
  mutations and provider observations.
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
