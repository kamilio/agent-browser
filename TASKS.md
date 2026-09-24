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
  browser's working dist. Latest selected validation: 1001 tests across 13 files,
  scoped lint/formatting, maintained build and eight built-import checks passed.
  Full native/SafeJS gates remain open.
- The loader supports delayed bootstrap, classic scripts and source modules.
  SafeJS accounting uses private snapshots, bounded capture pooling, tracked
  records/arrays, import/export indexes, deferred module functions, unread unmapped
  arguments and metered import deadlines. Fresh native/provider observations,
  aliases, ordinary/held quotas, snapshots and reentry remain required.
- Maintained accounting corrections include 257e9b508 (metadata-reader edits to
  later function fields), 61d1873e4 (accessor roots), and 0e0b1a35a (sealed symbols).
  73e115d99 tracks copied host-function properties; 760d57a6b tracks reflected
  descriptors. caf15de03 fixes a reproduced public-result regression: ordinary
  run() descriptors remain natively structured-cloneable, while internal/realm
  results retain tracked storage.
- ad74592a4 tracks private native string-split results. It preserves native split
  replacements, Symbol.split hooks, altered prototype chains, iterator aliases,
  failed length shrink invalidation and quota checks. Source arrays are copied
  before callbacks can expose the result; public run() arrays stay cloneable.
  A controlled nine-array/157-slot fixture preserved 1803 accounting units and
  reduced sampled allocation from 2.04 MB to 0.24 MB per 100 walks. CPU timings
  overlapped; no live startup speedup is established.
- Latest uninstrumented Zoom check: ad74592a4 + caf15de03, 256 MiB heap and 120 s
  script/import limits. All 13 classic scripts passed; externals.min.js used
  64.3 s wall / 59.6 s CPU. Seven modules prepared, but the actual import deadline
  revoked the realm before settlement. No readiness, admission, presence or socket
  attempts. Cleanup verified closed runtime/sockets and zero retained data.
  An earlier 600 s diagnostic also expired during module execution.
- Latest origin trace: 28 untracked arrays, 179 descriptor reads (previously 37
  arrays/327 reads); raw record reads remain 353 after the reflected-descriptor
  reduction from 501. Both walkers agreed on 6667682 units on 595 roots, and cleanup
  passed. Remaining array reads include reflection results (72), Array constructor
  results (60), and other arrays (47). Constructor prototypes contribute 263 of
  the raw record reads; their tracking trial remains rejected.
- Earlier editor sampling attributed about 71% of CPU to reconciliation and 25%
  to GC, with about 12600 graph visits and 25000 capture calls per scan. The
  operation census found slow Rolldown export copying, not a proven infinite loop.
  Allocation savings have not established working startup.
- Discarded trials remain discarded: deferred-collector skipping, mutable foreign
  record descriptor reuse, constructor-prototype tracking, visit-marker/shared
  deferred identities, and local-function deferral. The eager local-declaration
  path remains. Do not use per-loop wrapper instrumentation for allocation claims.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Investigate
  retained-graph traversal and allocation costs around editor initialization and
  export copying without weakening observations. The symbol census also identified
  constructor prototypes, mapped arguments and produced records; copied values from
  copyToSandbox were absent from that branch. Measure remaining array/record and
  reconciliation costs before selecting more reuse; preserve native mutations,
  provider observations and native-cloneable public results.
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
