# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. Preserve
  Automations and independence from Chromium, Firefox and remote browsers.
  SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. Approved diagnostic route:
  https://app.zoom.us/wc/7982110526/join. **No meeting has been joined.**
- Acceptance requires controls, admission and verified presence, roster/chat,
  actual audio capture/transcription, playback, microphone/avatar, leaving and
  verified cleanup.
- Continue challenge handoffs, top100 compatibility, .env/pass secret placeholders,
  passkeys, browser-only research, playground/terminal and command coverage.

## Current status

- Reuse /home/kjopek/project/poe-code/packages/safe-js and its working build with
  /tmp/agent-browser-node24-runtime/bin/node --experimental-wasm-jspi.
- Latest normal Zoom retry: HTTP 200, 13 classic scripts and seven prepared
  modules; expired at the unchanged 120 s module deadline. No controls, name fill,
  join or socket attempt. Last sample: 9049639 steps / 6970494 data units at
  111.821 s; external libraries took 47.189 s. Cleanup left zero data/sockets.
- Accounting remains the main measured startup cost. Retain SDK fixes for bounded
  iterative scope capture (4d1d492bc7), protected source-retention snapshots
  (3200a1957f; equivalent 6ee9d8263b), protected regex records (686d60f56b), tracked
  primitive prototypes and recovered accounting safeguards. Focused tests,
  typechecks, lint, builds and 16 built checks passed for the recent fixes;
  no meaningful startup speedup was established. Preserve recovered contributions;
  baseline 029820ce86 is tree-identical to d3ec60d811.
- Full default DOM initialization still fails the 1000 ms cold-start allowance.
  A warmed 37-check pass does not clear this gate.
- Supplied-audio support includes PCM resampling/recording, shared-source readers,
  MediaStream/MediaStreamTrack, a clocked oscillator/gain microphone graph and
  scheduled AudioBuffer playback. Latest playback validation: 532 focused native
  tests, build, strict audio test typechecks and owned-file lint passed. Maintained
  SDK playback/cancellation probes passed under an explicit 16 s application
  allowance with zero retained data/references/buffers/nodes/timers after close.
  These checks establish neither device/meeting capture nor default cold startup.
  Audio limits and delayed-reader behavior are documented in README.md.
- Next media step: implement navigator.mediaDevices backed by explicitly registered
  audio sources and exercise the unchanged Automations microphone wrapper.
  Device acquisition, AudioWorklet scheduling/transfer, compressed decoding,
  video/WebRTC and actual meeting transport remain open.
- Existing validation limitations: the module fixture has two optional-ID type
  errors; the runtime fixture has a noDelete lint failure. Built Node 22/24 copying
  checks round-trip 1000-level objects and report dataDepth at 1025. Offline Window
  load and Worker socket checks do not establish complete Zoom operation.

## Outstanding gates

- Initialize within normal allowances, expose Join controls, fill the name before
  requiring enabled Join (#input-for-name), and verify admission/presence. Reduce
  reconciliation cost without skipping reads or collectors.
- Clear full default DOM initialization, complete prototype tables and library
  compatibility; isolated or warmed passes do not clear this gate.
- Verify every notetaker capability above. Reference files under
  /home/kjopek/automations/packages/zoom-notetaker/src/ are capture-page.js
  (getDisplayMedia, 16000 Hz AudioWorklet), meeting-page.js (48000 Hz microphone
  and playback) and track-audio-page.js (incoming WebRTC). Synthetic worklet math
  does not establish actual capture, scheduling, transfer or live throughput.
- Verify complete network Worker startup, original WASM initialization callback,
  download protocol and actual Zoom socket exchange. Extracted glue initializes
  a 20 MiB heap; the full Worker expired before exports. Media root:
  https://st1.zoom.us/web-media/u9n13za/. application-media-v1 allows 33554432 data
  units with the same 120 s deadline.
- Verify server-selected behavior; no simpler join flow was established.
  Blocking file-paa.zoom.us and cdn.cookielaw.org remains diagnostic configuration.
- Complete iframe navigation/srcdoc/policy contexts, child realms, DOM namespaces,
  full canvas, React stream helpers and interaction.
- Revalidate deep host ingress/exports, prototype/capture copying, callback
  rejections, timer/onload failures, idle timing, fake-SDK contracts and deeper
  non-ladder parser grammar. Module deferral does not optimize classic hoisting.

## Development constraints

- Preserve unrelated work, including SafeJS report-unhandled-throws.test.ts if
  present, recovered contributions, working builds, dependencies and Node runtime.
  Keep artifacts ephemeral and status concise; no diaries or findings reports.
- Use TDD for SafeJS changes; serialize heavy tests/builds/probes. Validate against
  the loaded SDK, including bundled layouts. Native tests must be listed in
  native-tests.json. Authorized SafeJS/live Zoom/socket probes and real TTY/PTY
  acceptance remain separate gates.
- Preserve quotas, fresh observations, aliases, ordering, reentry, cancellation,
  credential isolation, primitive-node awaits and full reconciliation. Keep fresh
  walk state, private captures, structured-cloneable results and bounded pools.
  Imports retain deadlines; TLA expiry revokes the realm. Cooperative checks
  cannot bound parsing or synchronous host calls.
- Do not raise deadlines or repeat the unchanged 600 s diagnostic: it stopped in
  DOMPurify allowlist construction at 58334 module nodes. Default Node settings
  remain preferred; --no-maglev did not improve startup.
- Require new evidence before revisiting discarded experiments: visitor/symbol
  splits, object-first dispatch, alternate visited sets/lookup registries,
  URL/function readers, Window/Event metadata or bulk descriptors, scope
  pruning/tags, generation cells, WeakSet/ownership caches, capture pooling/order,
  prototype prechecks, cached brand-check callbacks, property-layout/string-position
  caches, deferred final-scan omission, helper extraction or WASM factories.
  Final brand-check comparison was 4.5% worse CPU / 4.7% worse wall time; restored
  source and working build. Small isolated wins did not establish startup gains.
- Do not revive unsafe measurement-worker reuse, saved-callback leaks, stale
  Temporal/Intl guards, mutable descriptor caches or skipped collectors.
- Commit explicit owned paths only. No subagents, branches or pushes.
