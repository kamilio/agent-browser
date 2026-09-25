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
- Core data copying now uses an explicit operation stack (SafeJS bc3d0c9ebf).
  Built SDK checks on Node 22 and 24 round-trip 1000-level objects and report
  dataDepth at 1025 for deep imports/exports, replacing native stack overflows.
  Passed 530 unit tests (seven host-Temporal cases skipped), lint, the maintained
  build and 13 built SDK checks. Deep realm bridges and asynchronous structured
  cloning remain separate acceptance gates.
- Owned property-brand queries use private backing storage while preserving
  fresh mutations, inherited/foreign proxy traps and replaced native hooks
  (SafeJS 36a052a14b). Four alternating comparisons on the same Zoom graph at
  29945 nodes kept identical 6116415-unit charges; median CPU per 200 walks fell
  from 550 ms to 517 ms (5.9%). Every pair favored the change; this does not prove
  startup readiness. Passed 466 unit tests, lint, the maintained build, 13 built
  SDK checks and five actual browser/JSPI checks. All probe cleanup retained zero
  data/callbacks; no diagnostic artifact files were created.
- Deferred function identities retain fast native storage while remaining empty,
  frozen and null-prototype (SafeJS 3f8b5c8fc7). On the same graph of 3702 roots,
  four alternating 600-walk pairs kept identical 6116416-unit charges; median CPU
  fell from 1.535 s to 1.480 s (3.6%), with every pair favoring fast storage.
  Passed 73 unit tests including 12 GC checks, lint, the maintained build and
  14 built SDK checks, the layout/privacy regression under Node 22 and 24, and
  five browser/JSPI checks with zero retained data. Startup readiness is unproven.
- Latest normal Zoom check with the fast deferred-identity SDK completed all 13 classic
  scripts and prepared seven modules, but expired at the 120 s module deadline
  without name/Join controls, a join attempt or socket attempts. The last progress
  sample was 9039692 steps at 115.434 s. Cleanup retained zero data. The probe uses
  bounded WASM/binary Worker messages and explicit 1 MiB / 30 s page-fetch limits.
  An earlier 600 s diagnostic also expired before controls or socket attempts,
  after 58334 module nodes. Execution advanced through React startup tables and
  keyboard mapping to DOMPurify allowlist construction in editor-core.min.js
  (last position: line 237, column 4703). Cleanup retained zero data. No diagnostic
  is active; do not repeat this unchanged extended run or raise its deadline again.
- Retained accounting changes include private visited-registry bindings and
  shared deferred-function root/charge identities. Unit, GC, built SDK and browser
  checks passed; repeated same-graph measurements preserved exact charges.
  Full graph reconciliation remains the main unresolved startup cost.
- The module-only fixture preserves the six-module import cycle and samples near
  30000 nodes within normal allowances. Profiling found costs spread across the
  visitor, metadata/type checks and visited lookups. Capture-cache measurements
  do not justify expanding the sixteen slots. Call tracing found 47 retained
  tagged scopes after 1028 completed calls, not a retained scope per completed
  call; untagged scopes and other lifetimes remain outside that check. Intentional
  diagnostic stops verified cleanup, not module completion or meeting readiness.
- Updated same-graph CPU profiling still places most cost in the main visitor.
  Bounded deferred-vector reuse and an earlier visited-object guard each won only
  two of four alternating pairs; median CPU was respectively 0.4% and 3.6% worse.
  Both were discarded without source changes. Checks kept identical charges and
  verified cleanup. An empty-symbol/null-prototype brand shortcut qualified for
  7736/10292 calls but neither fresh nor tracked prototype checks improved CPU;
  both were discarded. Inherited proxy observations must remain live.
  Next, measure storage layout of owned property backings; any construction
  change must preserve initial proxy observations and subsequent mutations.
- Retained SafeJS improvements: sixteen per-walk positive capture slots, lazy
  private-token coordinates, numeric compiler-token reads, iterative else-if
  parsing with the existing 2048-level limit, and owned constructor prototypes.
  Numeric reads reduced real login-module parsing CPU by about 16%, with identical
  parse results. Latest parser validation passed 230 focused tests, lint, SDK
  build, 13 built SDK checks and six browser SDK/JSPI checks. Application readiness
  and an overall Worker startup gain remain unproven.
- Window load handlers preserve listener order, Window receivers and guest object
  identity. Replacements/rejections release references. Passed 368 native tests,
  build and five SDK checks under a 32-reference quota, with zero retained data
  and callbacks. Offline check: scripts/check-window-load.ts.
- WASM export metadata batching improves isolated setup, but full network Worker
  initialization remains unverified. The latest extended diagnostic evaluated
  source in 265.1 s and downloaded 465602 bytes of WASM, then expired before donor
  transfer/export setup. Cleanup passed. Extracted glue initializes a 20 MiB heap;
  neither isolated result proves the original Worker initialization callback.
- Worker sockets retain transport/connection quotas, connect-src and Blob policy,
  ordering and termination. Native, SDK and loopback checks cover binary exchange
  and cleanup; actual Zoom socket exchange remains unverified.
- PcmCapture accepts supplied PCM16 only; PageMedia implements CSS matchMedia.
  MediaStream/mediaDevices capture, RTCPeerConnection, Web Audio/AudioWorklet and
  a live PCM producer remain unimplemented.

## Outstanding gates

- Initialize within normal allowances, expose Join controls, fill the name before
  requiring enabled Join (#input-for-name), and verify admission/presence. Resolve
  the cost of reconciling large module scopes during small library initialization
  loops, without skipping reads or collectors.
  Longer deadlines, fixed-work diagnostics and fixture gains do not prove readiness.
- The DOM constructor probe times out under its default 1000 ms profile with both
  the original and identity-sharing SDK. Application-profile checks do not clear
  this separate default-profile limit.
- Implement and verify every notetaker capability above. Automations references:
  capture-page.js (getDisplayMedia, 16000 Hz AudioWorklet), meeting-page.js
  (48000 Hz AudioContext/MediaStream microphone/playback), track-audio-page.js
  (incoming WebRTC). Native support needs actual media sources and transport.
- Verify complete network Worker startup, its original WASM initialization callback,
  download/initialization protocol and actual Zoom socket exchange. Media root:
  https://st1.zoom.us/web-media/u9n13za/. application-media-v1 permits 33554432
  array elements/data units without changing the 120 s deadline or capabilities.
- Verify server-selected page behavior. Routes and Chrome/Firefox/Safari identities
  selected the same current app client; no simpler join flow was established.
  Optional file-paa.zoom.us/cdn.cookielaw.org blocking is diagnostic configuration.
- Complete iframe navigation/srcdoc/policy contexts and child realms, DOM branding
  and prototypes, namespaces, library compatibility, full canvas, React stream
  helpers and interaction. Worker/Wasm remains a separate gate.
- Revalidate deeper non-ladder parser grammar, deep host ingress/exports,
  prototype/capture copying, callback rejections, timer/onload failures, idle timing
  and fake-SDK contracts. Module deferral does not optimize classic-script hoisting.

## Development constraints

- Preserve unrelated changes, SafeJS's untracked report-unhandled-throws.test.ts,
  and recovered patches in contributions/. Reuse working builds and the Node runtime.
- Keep artifacts ephemeral and status concise here; no diaries or findings reports.
  Do not repeat unchanged extended diagnostics.
- Use TDD for SafeJS changes; serialize CPU-heavy tests, builds and probes. Check
  diagnostic hooks against the loaded public SDK, including bundled layouts.
- Native tests use native-tests.json. SafeJS, live Zoom and necessary sockets are
  authorized; their acceptance and real TTY/PTY gates remain separate from native.
- Preserve quotas, fresh property/provider observations, aliases, callback order,
  reentry, cancellation, credential isolation, primitive-node awaits and full
  reconciliation. Keep tracked scope projections, fresh walk state, private capture
  snapshots and structured-cloneable public run() results. Capture pools stay
  bounded at 64 slots; imports retain deadlines and TLA expiry revokes the realm.
  Cooperative checks do not bound parsing/synchronous host calls.
- Do not revive unsafe measurement-worker reuse, saved-callback leaks, stale
  Temporal/Intl membership guards, mutable descriptor caches or skipped collectors.
- Already rejected without reproducible real-workload gains: visitor splits/guards,
  shared deferred methods, private-field/brand scope routing and visit generations,
  declaration deferral, direct owned getter reads, position/line and balanced-scan
  caches, dense numeric visited markers, fresh per-walk Set/WeakSet registries,
  a combined private accounting metadata/visited registry,
  bounded deferred-vector pooling and moving visited-object checks earlier,
  empty-symbol/null-prototype brand shortcuts with fresh or tracked prototypes,
  token-cache FIFO ring and an alternate
  WASM export factory. Require new evidence before revisiting these candidates.
- Commit completed changes with explicit owned paths. No subagents or pushes.
