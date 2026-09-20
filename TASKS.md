# Browser priorities

- **Zoom first:** native browser + SafeJS only. Last observed: with optional analytics blocked,
  `application-v1` hits the regex-compilation quota, not the page heap limit.
  `application-unicode-v1` avoids that failure, but Vue still times out at 120 s;
  retained-data accounting dominates its CPU profile. Joining, audio and
  notetaking do not work yet. No challenge or meeting access is bypassed.
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
  Eight affected cache/optimization regression files type-check; runtime tests
  remain unrun. The cache foundation and compilation policy proposals are saved
  in `contributions/`; 360 focused native CSP/runtime tests passed. SafeJS execution
  tests and a fresh live Zoom join check await separate authorization after
  automatic approval review rejected the SafeJS probe. Runtime behavior is unverified.

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
