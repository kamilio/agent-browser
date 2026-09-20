# Browser priorities

- **Future Zoom replacement:** develop native browser + SafeJS as a possible replacement
  for the working automations notetaker; this is exploratory future work, not a
  migration of the existing setup. The approved direct web-client diagnostic gets
  HTTP 200 and a server-rendered name textbox and Join button. Idle timeout
  dictionaries are converted in the guest and bare requestIdleCallback resolves
  through its Window property. Vue's replacement of
  Object.getOwnPropertyNames had made ordinary options fail strict data export.
  General SafeJS record copying stays strict. Time-aware SDK checkpoints keep
  host timers responsive, but the earlier fast Vue/component runs are insufficient
  evidence: pending callback tails had skipped retained-graph reconciliation.
  The SDK now enforces data limits during those holds, avoids double charging
  included compile tickets and keeps suspended async frames/scopes visible until
  settlement or disposal. The retained build's last 192 MB live run timed out
  in Vue at its 120 s window (985715 steps, peak data 905901 units; 16 scripts
  executed; cleanup completed). A bounded
  256 MB allocation diagnostic estimates cumulative churn falling from 17.8 GB to
  13.1 GB after private-array indexing and removal of a per-visit callback context.
  These totals include collected allocations, not live RAM; initialization still
  times out. A subsequent weak-map membership experiment was reverted: it removed
  fresh visited-set allocation callers but did not improve initialization or show
  a reliable benchmark gain; corrected paired samples increased total churn. Investigate
  graph traversal rather than visitation-set reuse. Private-name projections reduce
  collection cost in larger maps, but do not resolve initialization; an earlier
  alternate script path exhausted the 192 MB heap in all.min.js. SDK-owned tables
  cache own string-field accounting and remeasure descendants; other paths stay
  conservative. Neither those faster runs nor profiling proves live acceptance.
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
- Open test gates: SDK default-stack depth for arrays and mixed graphs,
  older scope-root shape expectations
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
  Held-data limits: 212 selected SDK checks across 26 files and core compilation
  pass; all 4 new regressions fail against the saved baseline. Browser scheduling
  now passes 44/47 checks, fixing the shared tail data-limit failure; three baseline
  joined-rejection failures remain. Actual native adapter probe: suspended 60000
  units plus a later 60000-unit value correctly rejects at the 100000-unit data
  limit. Included-ticket accounting, ownership and cleanup checks pass. After
  enforcement, the default 1 s idle probe times out even serially; an explicit
  16 s large-source diagnostic passes all 9 idle semantics checks. Keep the
  default timing failure open; a larger-profile pass does not resolve it.
  Local Set visitation experiment reverted: record and closure benchmarks showed
  no measurable benefit. Alternating default idle checks passed 2/3 with each
  visitor, so the 1 s timing gate is intermittent and remains open. The metadata
  depth failure also reproduces with baseline WeakSet visitation.
  Symbol snapshots reuse SDK-owned table inspection and invalidate on symbol
  writes. Frozen factory closures cache their actual symbol descriptors, including
  custom factory fields; private fields, properties, prototypes and captured
  descendants are remeasured. Derived/restored records and proxies stay conservative.
  SDK checks: 330/332 pass; two baseline failures remain (proxy managed-state
  capture and default-stack descendant depth). All 8 new closure checks pass;
  inspection reuse fails on baseline. Core compilation, new-test formatting and
  patch round trips pass. Wide-table benchmark: 34 ms to 3 ms; closure benchmark:
  115 ms to 92 ms. Latest live run still times out in Vue after 120 s. Follow-up
  profiling reduces symbol inspection, but graph visitation dominates and GC is
  roughly 10% of samples. Attribute allocation callers before the next optimization.
  Data-walk allocation patch: final focused SDK checks pass 176/179 across
  16 files; the three failures reproduce on baseline (proxy managed-state capture,
  constructor descendant depth and scope metadata depth). Core compilation, new-test
  formatting and patch round trips pass. Indexed traversal applies only to private
  metadata arrays; callback-provided iterators and retained-graph reconciliation
  remain intact. Bytecode confirms removal of the per-visit function context.
  Latest actual idle checks pass 9/9 at both default 1 s and explicit 16 s; prior
  default failures keep timing reliability open. No full native-suite pass is claimed.
  Weak-map visitation experiment reverted: no initialization gain; paired 15 s
  cumulative churn estimates 11.4 GB baseline versus 12.1 GB experiment; final
  closure benchmark 13.6 versus 13.4 ms with equal 25000 units. Focused SDK checks
  showed only the three baseline failures. Corrected diagnostic wiring must supply
  the existing session fetch transport to enable XMLHttpRequest; CSRF succeeds on
  both builds with that wiring. Experimental patch and test removed.
  Scope diagnostics identify private-name metadata as the dominant miss reason:
  1.45 million misses in 9.3 million calls; only 134 weak snapshots collected.
  Native private-name maps now project actual object membership into transparent
  accounting roots; descendants are remeasured and raw primitives/custom iterators
  stay conservative. SDK checks: 295/297 across 13 files; both depth failures reproduce
  on baseline. All six preservation cases pass on both versions. Core compilation,
  formatting, patch round trips and removed-value GC probe pass. Shared-scope benchmark:
  16 names 17.6 to 12.2 ms; eight names 14.5 to 13.6 ms; small maps show little gain.
  Actual page maps have one, two and eight names. Live Vue still times out at 120 s;
  clean cleanup does not prove application readiness, joining or media acceptance.
  Early frozen-closure dispatch experiment reverted: warmed benchmarks and live
  initialization showed no reliable gain. Managed proxy descriptor capture now
  includes hidden fields when a trap registers managed accounting during capture,
  fixing the existing 9-versus-23-unit failure and enforcing the data-size limit
  without extra descriptor traps. The new regression fails on the exact saved
  baseline; both directly related files pass all 25 tests after the fix. Focused
  SDK checks pass 87/89 across nine files; the two baseline default-stack depth
  failures remain. Core compilation, new-test formatting, contribution patch
  round trips and all nine actual native idle adapter cases pass. Earlier idle
  timing failures remain unresolved.
  Instrumented live Vue initialization adds roughly 146 million value visits in
  a 30 s window; closures dominate newly visited objects. Pure scope-root grouping
  experiment reverted after slower warmed benchmarks. Record and tracked-table
  string children now use explicit DFS continuations, preserving descriptor
  snapshots, callback order, shared identities and retained-graph checks. Both
  previously failing constructor/metadata depth tests pass; new record chains
  reach depth 1024 and reject 1025 with dataDepth in either child order. Those
  two boundary cases fail on the saved baseline. Final focused SDK checks:
  171/171 across 24 files; core compilation, test formatting, contribution round
  trips and all nine actual idle adapter cases pass. Benchmarks are mixed; no
  reliable initialization speedup is claimed. Array depth 1024 still raises
  RangeError on the default stack; arrays and mixed graphs keep the depth gate open.
  Actual final-build 192 MB Zoom diagnostic still times out in Vue after 120465 ms:
  985715 steps, peak data 905901 units and 16 scripts executed; cleanup completes.
  No meeting joined. Continue reducing repeated accounting without suppressing
  checks, and extend continuation handling to arrays before clearing the depth gate.
  Native extension adapter still rejects suspended 60000 plus later 60000 at
  data limit 100000 and releases data on close. The separate PageScripts timer
  version reaches suspension but closes with a generic callback script-error
  during the later source; that integration gate remains unresolved.
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
