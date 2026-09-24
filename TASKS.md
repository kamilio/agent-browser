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
- Latest normal Zoom check completed all 13 classic scripts and prepared seven
  modules, but expired at the 120 s module deadline without name/Join controls,
  a join attempt or socket attempts. Cleanup retained zero data. The probe uses
  bounded WASM/binary Worker messages and explicit 1 MiB / 30 s page-fetch limits.
- No diagnostic is active. The final in-memory accounting profile completed
  1000 walks over a fixed real Zoom graph with identical 6696205-unit charges,
  taking 3.43 s CPU. It stopped intentionally and verified zero retained data
  and no socket attempts. Full graph reconciliation remains the main startup cost;
  visitor dispatch and visited-membership checks dominate the profile.
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
  accounting cost and timing instability without skipping reads or collectors.
  Longer deadlines, fixed-work diagnostics and fixture gains do not prove readiness.
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
  caches, dense numeric visited markers, token-cache FIFO ring and an alternate
  WASM export factory. Require new evidence before revisiting these candidates.
- Commit completed changes with explicit owned paths. No subagents or pushes.
