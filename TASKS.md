# Browser priorities

- **Future Zoom replacement:** develop native browser + SafeJS as a possible replacement
  for the working automations notetaker; this is exploratory future work, not a
  migration of the existing setup. The approved direct web-client diagnostic gets
  HTTP 200 and a server-rendered name textbox and Join button. Vue now completes
  after converting idle timeout dictionaries in the guest and resolving bare
  requestIdleCallback through its Window property. Vue's replacement of
  Object.getOwnPropertyNames had made ordinary options fail strict data export.
  General SafeJS record copying stays strict. Time-aware SDK checkpoints now
  sample host time every 128 nodes and yield when elapsed time reaches 16 ms, keeping the
  4096-node backstop and guest job ownership. Two live runs completed Vue in
  10–12 s and the previously stalled component library in 10–14 s. The first
  run then timed out in the 171510-character CAPTCHA popup library; the page
  reported execution-timeout and cleaned up normally at 194 s, without a forced
  kill. A repeat took a different script path and exhausted the 192 MB Node heap
  in the 243575-character all.min.js; the intended popup profile was not captured.
  Investigate retained-data accounting cost and host-memory use across these
  paths. SDK-owned tables cache own string-field accounting, remeasure descendants
  and release invalidated captures; untracked/exotic values stay conservative.
  Interactive joining remains unverified. The full replacement gates also include
  presence/admission, roster/chat, audio capture and transcription, playback/live
  microphone/avatar support, leaving and cleanup. DOM branding does not implement
  full prototype method tables; namespaced creation currently supports unprefixed
  HTML, SVG and MathML names only. The invitation landing application executes but
  reports an unsupported OS; a duplicate fallback script exhausted the 192 MB Node
  heap. Neither route passes live acceptance. No meeting was joined.
- Reduce retained-graph accounting cost without weakening memory, depth,
  cancellation or credential isolation. Opt-in ordinary classic-script exception
  recovery works; syntax, module, callback and resource failures remain fatal.
- Open test gates: SDK default-stack depth tests, older scope-root shape expectations
  and a baseline Promise snapshot timeout; existing native capability-metadata and
  classic-loader limit expectations.
- Opt-in 16 MB extraction now projects recognized React stream completions;
  unknown helper variants and interactive behavior remain unverified. Finish
  compatibility work, legitimate challenge handoffs, top100 checks, browser-only
  research, playground/terminal and command coverage.
- Validate secret placeholders with extensible .env/pass providers and passkeys.
- Keep native, SafeJS, live-network, socket and TTY gates separate. Native tests
  must come from `native-tests.json`; do not claim unverified acceptance.

- Recovery gate: isolated SDK compiles with scoped compilation policy, scope-root
  caching, literal/constructor tracking, closure allocation and callback reuse.
  The user approved SafeJS, live Zoom and necessary socket testing. Policy/classic
  runtime tests: 75/76 passed; shared-budget realm isolation still fails with reentry.
  Broader SDK callback ownership, shared-data, descriptor reuse and depth failures
  remain unresolved. Bounded DOM guest fields: 102 SDK tests, 41 native tests and
  18 actual SafeJS checks passed. Namespaced DOM creation: 58 native tests and
  25 actual SafeJS constructor checks passed. Regex allowances: 31 SDK tests and
  both native-profile probes passed. Completion discard: build, formatter,
  12 SDK tests, 150 manifest-listed native tests and 3 actual SafeJS adapter checks
  passed. Idle dictionary conversion: native build and formatter, 157 manifest-listed
  native tests and 9 actual SafeJS checks passed. SDK core compilation passes;
  a fresh full-package build currently fails resolving tiny-mcp-client types through
  the shared local dependency tree. String-field projections: 111 selected SDK
  tests across 13 files, including all 6 literal descriptor-reuse checks, pass;
  SDK core compilation, new-test formatting, contribution forward/reverse apply
  checks and all 9 actual SafeJS idle adapter checks pass. A fresh SDK probe of
  1100 nested tracked records still raises RangeError on the default Node stack,
  rather than the required dataDepth budget error; that gate remains open.
  Timed host checkpoints: 73 focused scheduling/control/cancellation checks and
  SDK core compilation pass; the new timer-order regression fails on the baseline.
  A broader five-file run passes 78/82 checks; all four failures reproduce with
  baseline checkpoints (joined rejection handling and shared tail data limits).
  All 9 actual idle adapter checks pass serially; a concurrent run hit its default
  1 s initialization timeout. New-test formatting and patch round-trip checks pass.
  Broader native setup also found an onload non-callable-handler failure;
  the full native suite has not been claimed green. Live diagnostics block optional
  file-paa.zoom.us and cdn.cookielaw.org origins and use a direct process;
  production actor, meeting join, socket, media and transcription acceptance stay
  open. No Automations changes or Chromium/remote-browser fallback were used.

## Retained development inputs

- Build native code from this repository; redundant scratch sources/builds are removed.
- Previous temporary SDK inputs are missing. Local baseline: `/home/kjopek/project/poe-code/packages/safe-js`.
- Recovered working SDK source/build: `/tmp/agent-browser-zoom-sdk/packages/safe-js`.
  Includes classic globals, callback scheduling, exception reporting and recovered
  scope/module caching. Some remaining retained-accounting patches still need
  reconciliation. The metadata-test patch header was normalized only in `/tmp`.
- SDK code patches: `contributions/`.

No run diaries, research inventories, logs, page dumps or archives. Keep only
essential docs and development inputs; remove generated validation files after use.
