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
  Reuse this browser's working dist; preserve unrelated changes in both trees.
  The selected current SafeJS workspace build and eight built-import checks pass.
  Full native and full SafeJS suites remain unestablished.
- Retained SafeJS work includes private accounting snapshots, bounded capture
  pooling, direct SDK getter dispatch, tracked fixed-key records, module snapshot
  elision, import/export indexes, flattened symbol snapshots (88e23ce0c), primitive
  literal scope elision (dde38754b), and metered import deadlines (bbf28b754).
- Deferred source-module functions (b4102164c) preserve fresh captures, complete
  quotas and one charge across materialization/old snapshots. Scripts, generators
  and dynamic source references remain eager.
- Browser diagnostic fix 2d43d80 keeps bounded observation open while delayed
  callbacks bootstrap the client, and reports pending callbacks. Strict typing,
  formatting and six observation scenarios pass. Live validation observed two
  pending callbacks after both windows, then the delayed external-library load.
- Latest live Zoom 7.2.0.12729 check used the rebuilt maintained SDK, desktop
  identity, 120 s script / 180 s import-observation limits and 256 MiB heap.
  HTTP 200; all 13 classic scripts passed and seven modules were prepared before
  module evaluation exceeded its deadline. Client readiness and joining failed
  verification; no socket attempts. Process exited; cleanup verified closed
  runtimes, zero retained data and closed sockets. No debug listener remains.
- Profiling points to retained-data reconciliation (~71% of module CPU) and GC
  (~28%). Classic-library allocation sampling points to descriptors and walk
  snapshots. Actual module allocation attribution remains open. Extended 600 s
  diagnostics also failed to initialize; no normal-resource gate is cleared.
- Single-symbol snapshot fix 55ac5eba2 keeps the first descriptor in visit-local
  storage and allocates a private vector only for additional symbols. Fresh reads,
  foreign enumeration, callback order, depth and ordinary/held quotas stay intact.
  Reversed compiled fixtures preserve charges/results/steps: single-symbol scans
  use about 24% less CPU and 22% less allocation; argument scans use 13%/11% less.
  Plain/multiple-symbol controls and real guest calls show no material regression.
  All 303 selected checks across 35 files, scoped lint, formatting, the selected
  workspace build and eight built imports pass. These are not joining evidence.
- Fixed-key guest records are already tracked; no lazy arguments change is
  implemented. Profiles/comparisons stayed in memory. The completed SafeJS build
  log and empty scratch patch were removed; working builds are retained.
- Native bounded canvas, worker/Wasm and sockets have separate focused probes.
  PCM handling is not a Zoom audio source; actual RTC/audio transport and the
  complete media/notetaker pipeline remain unimplemented and unverified.

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
  pools remain bounded at 64 physical slots. Strict-arguments tracking, broader
  capture caches and optional-state registry trials remain discarded.
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
