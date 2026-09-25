# Browser priorities

- Rewrite the standalone browser in Rust with embedded QuickJS-NG via rquickjs.
  Preserve independence from Chromium, Firefox and remote browsers. Keep the
  TypeScript/SafeJS implementation and its history as the behavior reference.
- Develop toward a possible future replacement for the working Automations Zoom
  notetaker. Preserve Automations. **No meeting has been joined.**
- Acceptance includes navigation, snapshots, extraction, forms and interaction,
  then admission/presence, roster/chat, actual audio capture/transcription,
  playback, microphone/avatar, leaving and verified cleanup.
- Preserve SafeJS bug-discovery results and upstream fixes. QuickJS comparisons
  can remain useful for checking JavaScript behavior independently.

## Current status

- Rust foundation: isolated classic-script globals, Promise job checkpoints,
  engine memory/stack bounds, source byte limits, cancellation and per-evaluation
  deadlines. Timeout/cancellation destroys the page and pending jobs. All 15 Rust
  tests, rustfmt and Clippy with warnings denied passed.
- TypeScript source, tests and reusable checks are preserved before the Rust port
  in commit 8de14cc. Typechecking passed. The complete 1126-file native run finished:
  1093 files passed, 33 failed; 56660 tests passed, 104 failed, one skipped.
  Failures include older replay, capability, module, CSP, passkey and layout
  expectations plus two suites that failed to load. The archived implementation
  is not fully passing. Lint on its 118 snapshot TypeScript files also reported
  86 existing import-order, formatting and style errors; preserve this distinction
  when using the old tests as porting references.
- Rust is not yet connected to browser commands or DOM. Modules, timers, host
  objects, unhandled rejection events, networking, workers, WASM and media are
  unimplemented. Engine memory limits do not charge Rust-owned browser objects;
  interrupt handlers are cooperative, not process isolation.
- TypeScript remains the existing runnable browser. Its latest normal Zoom attempt
  expired at the unchanged 120 s module deadline after loading scripts/modules,
  before Join controls or socket attempts. Cleanup left zero data/sockets.
  Node 26 did not improve admission; default cold DOM startup also remains open.
- SafeJS accounting costs dominated measured startup. Rejected metadata caches
  and regex helper extraction are recorded in hey-boss poe-code #1549; do not
  repeat them without new evidence or skip fresh reads/full reconciliation.
- SafeJS delivery drafts: #1546 deep traversal, #1547 private accounting metadata,
  #1548 deferred accounting/replay. Local SDK HEAD fae35ae4e3 passed 99 targeted
  regressions in 11 files, including GC checks. These commits were absent from
  remote-main ancestry 26581cb7458 on 2026-09-25; publication is unverified.
  Earlier Automations issues #589/#704/#705/#706 are closed. Verify the deployed
  SDK version before removing their consumer workarounds.

## Port sequence and outstanding gates

- Establish Rust-owned DOM handles, object identity, callbacks and lifecycle;
  port HTML parsing and DOM/query behavior against existing native tests.
- Port network policy, redirects, cookies, CSP, modules and the event loop with
  explicit capability ownership, cancellation and cleanup. Keep page runtimes
  isolated and account for native allocations; do not emulate SafeJS step units.
- Port layout, rendering, input, extraction, sessions and CLI contracts. Preserve
  passkey boundaries and credential isolation. Benchmark actual workloads.
- Add Worker, WebAssembly and media support needed by Zoom. QuickJS itself does
  not provide those browser APIs. Supplied/synthetic audio tests do not establish
  device/meeting capture, WebRTC or live throughput.
- Test meeting: https://quora.zoom.us/j/7982110526; diagnostic route:
  https://app.zoom.us/wc/7982110526/join. Reach controls, fill the name before
  requiring enabled Join (#input-for-name), then verify admission and presence.
  No runtime benchmark substitutes for the full notetaker acceptance gates.

## Development constraints

- Keep useful source, tests, fixtures and configuration in Git; exclude generated
  reports, logs, caches and build output. Preserve recovered contributions and
  working builds. Keep status here concise; no standalone findings inventories.
- Use native-tests.json for TypeScript and Cargo tests for Rust. Live websites,
  sockets, SafeJS and real TTY/PTY checks are separate authorized gates.
- Preserve unrelated work. Commit explicit paths in focused changes. Push main
  when requested; never force-push or rewrite preserved history.
- Keep /home/kjopek/project/poe-code/packages/safe-js and its working build for
  reference probes using /tmp/agent-browser-node24-runtime/bin/node with
  --experimental-wasm-jspi. Do not disturb the unrelated poe-code merge conflicts.
