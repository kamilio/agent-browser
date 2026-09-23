# Browser priorities

- Develop the standalone native browser + maintained SafeJS toward a possible
  future replacement for the working Automations Zoom notetaker. This is
  exploratory work, not a migration; keep Automations operational and unchanged.
- Keep the engine independent of Chromium, Firefox and remote browsers. SafeJS
  is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. Approved diagnostic route:
  https://app.zoom.us/wc/7982110526/join. **No meeting has been joined.**
- Acceptance requires initialized interactive controls, admission and verified
  presence, roster/chat, audio capture/transcription, playback, live microphone
  and avatar support, then leaving and verified cleanup.
- Continue legitimate challenge handoffs, top100 compatibility, secret
  placeholders with extensible .env/pass providers and passkeys, browser-only
  research, playground/terminal and command coverage.

## Current verified state

- Maintained SafeJS source/build: /home/kjopek/project/poe-code/packages/safe-js.
  Reuse this browser's working dist; preserve unrelated dirty sources in both
  repositories. The full native and full SafeJS suites have no completed pass
  established for the current trees.
- Retained SafeJS improvements include private data snapshots/descriptors,
  bounded capture pooling, direct SDK getter dispatch, fixed-key source records,
  discarded module-snapshot elision and static import/export indexes. Recent
  local fixes: flattened symbol snapshots (84a93eecb), primitive-literal scope
  elision (a2a31bb07), and metered import deadlines (108c0fa26).
- Source-module function fix (2d1d36a8e, local only) defers unused ordinary
  function creation until lookup, while freshly accounting for pending captures and preserving a
  single function charge across materialization and older scope snapshots.
  Ordinary scripts, generators and dynamic source references remain eager.
  The selected checks cover 249 passes across 30 files, with two existing skips;
  strict typing, scoped lint, new-file formatting, selected workspace build and
  all eight built imports pass. Full suites are not established.
- Reversed compiled comparisons at 600 and 3703 hoisted functions preserve
  output, steps, data charges and zero-data cleanup. At 3703 functions, aggregate
  CPU falls about 30%; shared contention affects elapsed time. This is a fixture
  result, not proof of live startup or default-resource acceptance.
- Current unchanged Zoom module graph (7.2.0.12729) prepares seven modules but
  expires at 122.7 s / 88.4 s CPU, with 8372226 steps and 6057821 data units.
  Cleanup verifies no active requests and zero data. This isolated graph has no
  page globals or sockets and establishes no native readiness or admission.
- Default-identity native probe receives HTTP 200 after redirect to /wc/join/...
  and times out in Vue after 120.4 s; 16 scripts execute, no meeting client is
  fetched, no sockets open, and cleanup verifies zero data.
- Desktop-identity native probe receives HTTP 200, passes all 13 classic scripts
  and prepares all seven ES modules. Externals completes in 77.0 s / 67.0 s CPU;
  its timing improvement is not attributable to source-module deferral. The
  pending module import reaches its 120 s deadline; last sample is 8990449 steps
  / 6881886 data units. No readiness, admission or sockets. Cleanup verifies
  zero data and no active/pending sockets. Next: profile remaining evaluation
  cost in the complete page, including the shared browser scope retained by
  module functions; preserve fresh observations and full quotas.
- Fresh full-page classic-library profile: about 95% of sampled time is retained
  reconciliation, about 52% visitor self time, and under 1% GC. Descriptor and
  symbol inspection are visible costs; scope collection is a smaller share.
  Module profiling was not captured: one run ended before the ES client loaded,
  another hit the externals deadline (120.4 s elapsed / 62.8 s CPU). Both verified
  zero-data/socket cleanup. Shared CPU contention affects diagnostic completion.
- Strict-arguments descriptor-tracking trial is discarded: 114 selected checks,
  typing/lint, selected build and eight imports pass, but reversed comparisons
  regress repeated scans about 5–12%, with no consistent real-call gain. Results,
  data charges and provider observations match. Owned trial edits/tests removed;
  the matching previously tested build is restored and all eight imports pass.
  Profile files, comparison scripts and the temporary SDK copy are removed.
- Earlier editor profiling attributes about 96% of sampled wall time to retained
  reconciliation: 14202 walks, 59.4 million closure visits, and 3703 top-level
  functions in actual assets. The existing four-entry capture cache already
  handles almost all already-seen captures; enlarging it is not the next target.
- Native bounded canvas, worker/Wasm and socket support have separate focused
  probes. PCM handling is not a Zoom audio source. Actual meeting RTC/audio
  transport and end-to-end media/notetaker behavior remain unimplemented.

## Outstanding gates

- Finish client initialization within normal heap/time/source allowances, then
  verify interactive controls and actual joining/admission/presence. Explicit
  120 s / 256 MiB diagnostics clear no default-resource acceptance gate.
  Source-module deferral does not optimize classic-script function hoisting.
- Verify every notetaker capability listed above. The working notetaker captures
  one browser audio track with getDisplayMedia and a 16000 Hz AudioWorklet, with
  audio processing disabled. No equivalent native source, transcription,
  playback, microphone or avatar pipeline is proven.
- Verify server-selected page behavior: the default identity can receive a
  different landing page, while the desktop document has no server-rendered
  Join controls. Join requires working JavaScript handlers. Optional blocking
  of file-paa.zoom.us/cdn.cookielaw.org remains diagnostic configuration.
- Complete iframe navigation/srcdoc/policy contexts and child realms; validate
  DOM branding/prototype tables, namespaced names, library compatibility, full
  canvas rendering, React stream helper variants and interactive behavior.
- Revalidate unresolved parser nesting/depth, deep host ingress/result exports,
  prototype/capture copying, joined-callback rejections, timer/onload failures,
  idle timing reliability and fake-SDK contracts before fixing them.
- Preserve fresh property/provider observations, complete ordinary and held
  quotas, cancellation, callback ownership and credential isolation. Do not
  revive accounting shortcuts based only on tracked ownership. Private capture
  pools remain bounded at 64 physical slots. Discarded pooling/registry trials
  showed no dependable CPU gain and are not maintained changes.
- Pending imports retain deadlines; TLA expiry revokes the realm. Cooperative
  checks do not bound unmetered parsing or synchronous host calls.
- Native, SafeJS, live-network, sockets and real TTY/PTY gates remain separate.
  Native membership is native-tests.json. SafeJS, live Zoom and necessary
  sockets are already authorized; native passes prove none of those gates.

## Development inputs

- Use the maintained SDK build above and the Node24 runtime at
  /tmp/agent-browser-node24-runtime/bin/node. No isolated SDK copy is retained.
- Recovered patches in contributions/ need reconciliation before application.
- Keep artifacts ephemeral and remove owned logs/reports/redundant builds after
  owned processes terminate. No diaries or findings inventories. Commit focused
  completed changes with explicit paths; do not push.
