# Browser priorities

- **Future Zoom replacement:** develop native browser + SafeJS as a possible replacement
  for the working automations notetaker; this is exploratory future work, not a
  migration of the existing setup. The approved direct web-client diagnostic gets
  HTTP 200 and a server-rendered name textbox and Join button. Vue initialization
  still halts after about 75 s with `TypeError: Guest prototype links and custom
  descriptors cannot be copied as data.` Completion discard passes isolated probes
  but does not remove this live failure; investigate the remaining copying path.
  Joining, audio and notetaking remain unproven. DOM branding does not implement
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
  passed. Broader native setup also found an onload non-callable-handler failure;
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
