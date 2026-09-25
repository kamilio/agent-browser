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
- Latest normal Zoom retry with document lookup prototypes: HTTP 200, 13 classic scripts and
  seven prepared modules; expired at the unchanged 120 s module deadline.
  No controls, name fill, join or socket attempt. Last sample: 9052742 steps /
  6974314 data units at 118.741 s; external libraries took 48.175 s. Cleanup left
  zero data/sockets.
- Node 26 comparison also expired at the unchanged module deadline without Join
  controls or a socket attempt; cleanup left zero data/sockets. The explicit 16 s
  SDK probe passed 20 checks, but default cold DOM initialization still failed.
  No admission improvement was established; removed the temporary Node 26 runtime.
- Accounting remains the main measured startup cost. Retain SDK fixes for bounded
  iterative scope capture (4d1d492bc7), protected source-retention snapshots
  (3200a1957f; equivalent 6ee9d8263b), protected regex records (686d60f56b), tracked
  primitive prototypes and recovered accounting safeguards. Focused tests,
  typechecks, lint, builds and 16 built checks passed for the recent fixes;
  no meaningful startup speedup was established. Preserve recovered contributions;
  baseline 029820ce86 is tree-identical to d3ec60d811.
- At module node 12000, execution was in React property-table construction (144
  constructor calls), without evidence of a loop bug. One full accounting walk
  visited 8703 distinct objects, including 3703 deferred functions and 2156 closures.
  A later origin census attributed 275 of 2136 closures to page bootstrap, 1435
  to Zoom scripts/modules, 399 to native/generated functions and 27 to unlabeled
  source. Bootstrap closures alone do not dominate this graph.
- CPU sampling of 1000 full walks took 3.046 s with unchanged 6733390 units:
  52% of samples were in the visitor, 6% in scope traversal and 6% in visited-state
  lookup. Metadata access is distributed across several registries. A diagnostic
  mirror combining nine registries reduced aggregate CPU by 9.6% across eight
  alternating batches, but failed native mutation checks: an update charged 7
  instead of 1007 units; deletion charged 7 instead of 1. Discarded, with no SDK
  edits. A narrower private-metadata variant preserved those updates, getter
  observations and collector replacement during reentry, but used 4.6% more CPU.
  Neither approach established a safe startup gain. Zoom statically imports
  editor-core; its early evaluation is not an accidental preload execution.
- Live V8 tracing found repeated visitor deoptimizations at regex compilation
  ticket reads; 1000 unchanged-graph walks still took 3.079 s without visitor
  deoptimizations. Extracting regex accounting removed the recurring visitor
  deoptimizations but increased CPU to module node 12000 by 21.0% (49.323 s to 59.692 s),
  with elapsed time rising from 47.569 s to 63.283 s. Discarded without SDK edits.
  These diagnostics deliberately stopped at node 12000, with no Join controls;
  helper-run cleanup left zero data/sockets. Isolated editor-core parsing took 2.054 s;
  deoptimization counts alone do not establish a useful startup optimization.
- Fresh descriptor tracing counted 638 reads across 336 owners; only four arrays
  came from the Array constructor (64 reads), none from array-method allocation.
  Those factories are not a substantial target at this point. Diagnostics stopped
  deliberately at node 12000 with no Join controls and zero retained data/sockets.
- Rejected performance experiments remain unapplied: combined dynamic-source
  lookup used 23.9% more aggregate CPU; compact pending-depth storage saved only
  about 5% CPU in an isolated 3700-function case, without a full-graph gain proven.
  Bounded vector reuse reduced allocations by 41% without reducing CPU. A private
  property-lookup cache showed no steady-state gain. SDK source and working builds
  are unchanged by these experiments.
- Full default DOM initialization still fails the 1000 ms cold-start allowance.
  A warmed 37-check pass does not clear this gate.
- Document.prototype.getElementById/querySelector now support captured originals,
  borrowed same-owner documents and ordinary calls through prototype overrides,
  as used by Zoom's picture-in-picture code. Focused native checks passed 233
  tests; a maintained SDK probe passed 20 checks under the existing explicit 16 s
  application allowance and closed with zero data. This does not establish actual
  picture-in-picture operation, default cold startup or meeting admission.
- Supplied-audio support includes PCM resampling/recording, shared-source readers,
  MediaStream/MediaStreamTrack, a clocked oscillator/gain microphone graph and
  scheduled AudioBuffer playback. Latest playback validation: 532 focused native
  tests, build, strict audio test typechecks and owned-file lint passed. Maintained
  SDK playback/cancellation probes passed under an explicit 16 s application
  allowance with zero retained data/references/buffers/nodes/timers after close.
  These checks establish neither device/meeting capture nor default cold startup.
  Audio limits and delayed-reader behavior are documented in README.md.
- navigator.mediaDevices now acquires explicitly registered audio sources with
  bounded requests, basic constraints and acknowledged cancellation. Native audio/
  page validation passed 429 tests (one GC-dependent test skipped). Maintained SDK
  probes verified supplied samples, the unchanged Automations microphone wrapper,
  independently stopped virtual streams and cleanup of late acquisitions under
  the same 16 s allowance, with zero retained data/references/timers after close.
  Hardware/display capture, devicechange, advanced constraints, AudioWorklet
  scheduling/transfer, decoding, video/WebRTC and actual meeting transport remain
  open. Resume startup work; offline media support does not clear admission.
- Existing validation limitations: the module fixture has two optional-ID type
  errors. Runtime fixture expectations now include mediaDevices and its lint
  failure is fixed. Built Node 22/24 copying checks round-trip 1000-level objects
  and report dataDepth at 1025. Offline Window
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
