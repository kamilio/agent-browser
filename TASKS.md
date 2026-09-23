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
  The full native and full SafeJS suites have no completed pass established for
  the current trees. A concurrent SafeJS rebase changed commit IDs; the live
  probes below used the existing compiled build, not a rebuild of rebased sources.
- Retained SafeJS work includes private accounting snapshots, bounded capture
  pooling, direct SDK getter dispatch, tracked fixed-key records, module snapshot
  elision, import/export indexes, flattened symbol snapshots (88e23ce0c), primitive
  literal scope elision (dde38754b), and metered import deadlines (bbf28b754).
- Deferred source-module functions (b4102164c, formerly 2d1d36a8e) preserve fresh
  captures, complete quotas and one charge across materialization/old snapshots.
  Scripts, generators and dynamic source references remain eager. Before rebase,
  249 selected tests across 30 files passed, with two existing skips; typing,
  scoped lint, selected build and eight built imports passed. Reversed 3703-function
  fixtures used about 30% less CPU with equal outputs, steps, charges and cleanup.
  This does not establish live startup or validate the entire rebased tree.
- Browser diagnostic fix 2d43d80 keeps bounded observation open while delayed
  callbacks bootstrap the client, and reports pending callbacks. Strict typing
  against working declarations, formatting and six observation scenarios pass.
- Earlier desktop-identity Zoom 7.2.0.12729 probe passed all 13 classic scripts and
  prepared seven modules, but its import expired at 120 s. No readiness, joining
  or sockets; cleanup verified zero data. The default AgentBrowser identity
  receives a different landing page and has not reached the meeting client.
- Latest desktop live probe used temporary in-memory 600 s script/import limits
  with 256 MiB heap; checked-in limits were unchanged. HTTP 200, seven modules
  prepared, then import deadline failure. Last sample: 9021025 steps / 7060475
  data units. The report records 12 scripts executed and one execution-closed
  failure. No socket attempts or meeting admission; zero-data/socket cleanup passed.
  This extended diagnostic clears no normal-resource acceptance gate.
- Actual module CPU profile: 42006 samples over 510.8 s; about 71% retained-data
  reconciliation, 28% GC, 34% visitor self time and 9% visited-set lookup.
  Earlier classic-library profiling showed about 95% reconciliation and under
  1% GC. Module allocation pressure now needs attribution before choosing a fix.
  Profiles and small comparison probes stay in memory; no report files retained.
- Fixed-key guest records are already tracked. A generic shared-record allocation
  fixture points to descriptor/key snapshots, but does not identify the actual
  Zoom allocation sites. Strict-arguments tracking, broader capture caches and
  optional-state registry trials showed no reliable gain and remain discarded.
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
