# Browser priorities

- Develop the standalone native browser + SafeJS toward a possible future
  replacement for the working Automations Zoom notetaker. Keep Automations
  unchanged and the native engine independent of Chromium, Firefox and remote
  browsers. SafeJS is the only approved page-runtime dependency.
- Test meeting: https://quora.zoom.us/j/7982110526. The approved diagnostic route
  https://app.zoom.us/wc/7982110526/join returns HTTP 200 with server-rendered
  name and Join controls, but interactive initialization still fails. No meeting
  has been joined. Acceptance requires joining/admission and presence, roster/chat,
  audio capture/transcription, playback/live microphone/avatar, leaving and cleanup.
- Reduce retained-graph accounting cost while preserving memory/depth limits,
  cancellation, callback ownership and credential isolation. Full primary graph
  reconciliation must remain active during suspended callback holds.
- Continue compatibility work, legitimate challenge handoffs, top100 checks,
  browser-only research, playground/terminal and command coverage. Opt-in 16 MB
  extraction recognizes React stream completions; unknown helper variants and
  interactive behavior remain unverified. Validate secret placeholders with
  extensible .env/pass providers and passkeys.

## Current verified state

- Retained SDK contributions include classic globals, callback scheduling, strict
  idle dictionary conversion, timed checkpoints, held-data enforcement, tracked
  own-field/private-name projections, frozen closure symbol snapshots, managed
  proxy descriptor capture and record/array DFS continuations. Direct and scoped
  closure captures now continue off the stack at depth 128; transparent scope roots
  use DFS continuations without adding units or depth. Tested record/array/capture
  chains reach 1024 and reject 1025 with dataDepth. Capture iterators preserve step
  failures, mutation order and inner-to-outer close order on descendant errors.
  Broader graph depth coverage remains open.
- Compiled-ticket ownership now scans escaping roots only when reconciliation is
  unheld and an included ticket has a positive staged charge. Primary graph
  measurement, held limit enforcement and ticket forwarding remain intact.
  Metadata providers must not rely on an optional ownership scan for side effects;
  release of a hold during the primary capture is covered. This change deliberately
  reduces capture invocations when the ownership result would be unused.
- Capture-continuation validation: 194 focused SDK checks across 25 files, scoped
  core compilation,
  new-test formatting and exact contribution patch forward/reverse application pass.
  All six new direct/mixed/scoped depth regressions fail on the exact saved baseline;
  ten iterator/accounting preservation checks pass on both versions. Actual native
  adapter: a 256-level guest closure graph succeeds; the larger 512-level graph
  rejects at dataDepth 1025 versus limit 1024 and releases data on close. Both native
  guest outcomes are preserved from baseline. Final nine-case actual idle checks pass
  serially at default 1 s and explicit 16 s; earlier candidate timeouts keep reliability
  open. Shallow warmed benchmarks are similar; depth-256 continuation median is
  0.081 ms versus 0.043 ms baseline, so deep traversal has a performance cost.
- Object/symbol scope bindings now use their own measurement identities instead
  of redundant cell projections. Strings/bigints retain cell roots for independent
  primitive charges. Writes invalidate snapshots based on both old and new charged
  values; full graph reconciliation, memory limits and depth limits remain active.
  Validation: 169 focused SDK checks across 23 files, scoped core compilation,
  new-test formatting and exact contribution forward/reverse application pass.
  Eight added preservation checks pass baseline and candidate; six fail if the
  changed invalidation is omitted. Four older empty-module scope-shape failures
  reproduce on both. Native capture/clear/data-limit/cleanup outcomes match baseline;
  clearing a captured 60000-character payload removes 60006 data units. The two
  manifest-listed native idle files pass 89 checks, separate from actual SDK probes.
- Last 120 s, 192 MB live diagnostic: initial 107111-character script completes in
  14.3 s; Vue times out at 120222 ms, 1006603 steps, peak data 914788 units and 16
  scripts executed. Cleanup releases all accounted data; no meeting joined. Loader
  completion does not prove application readiness. A serial 30 s baseline reaches
  958127 steps versus candidate 959687; both time out. Shallow closure measurement
  falls from 0.329 to 0.307 ms in one warmed benchmark; other fixtures are mixed.
  No reliable initialization speedup is claimed. A visitor-entry fast path was
  rejected and reverted after no live gain.
- Rejected scope-root grouping/reuse and weak-map visitation experiments were
  reverted after mixed benchmarks and no initialization gain. Extending snapshots
  to native private-name maps also failed to establish a useful live improvement:
  30 s Vue diagnostics reached 957965 baseline versus 958575 candidate steps, both
  timed out. Synthetic warmed measurements fell from 0.45 to 0.36 ms, but the
  experiment is reverted. Its 113 focused SDK checks, native suspended private-field
  data limit and removed-value GC probes passed. No experimental caches remain.
- Retained CPU evidence: graph visitor 25.4 s, private/symbol traversal 5.7 s,
  scope-root collection 4.2 s and GC 1.9 s of self samples in a 49 s profile.
  A separate live visitor probe counts 79.7 million entries / 24866 measurements
  and 12.2 million capture reads for the first script; Vue's 30 s window adds
  140.2 million entries / 14651 measurements and 19.2 million capture reads.
  Closure contexts physically retain full scope chains; filtering accounting alone
  would undercount retention. Investigate execution-context/capture compaction with
  shared cells, conservative eval/with handling and snapshot alias preservation.
  Existing lint scanners resolve lexical reads, but expose no reusable capture
  analysis. No experimental caches or diagnostic instrumentation remain.

## Outstanding gates

- Interactive Zoom initialization/join and every notetaker capability listed above.
  Diagnostics block optional file-paa.zoom.us and cdn.cookielaw.org origins;
  production actor/default 128 MB heap, meeting sockets, media and transcription
  acceptance remain unverified. Invitation landing reports unsupported OS; an
  alternate duplicate script path exhausted the 192 MB heap.
- Default-stack dataDepth for direct symbol descendants, closure property/prototype
  paths and other untested graph edges; older scope-root shape expectations and a
  baseline Promise snapshot timeout. The tested capture fix does not clear this gate.
- Three baseline joined-callback rejection failures, earlier shared-budget realm
  reentry failure, a PageScripts timer probe's generic callback script-error and
  an onload non-callable-handler failure. Prior intermittent default 1 s idle
  initialization failures keep timing reliability open despite recent nine-case passes.
- Full SDK package build: unresolved tiny-mcp-client dependency types through the
  shared local dependency tree. Scoped core compilation is not a full-package pass.
- Older native capability metadata and classic-loader limit expectations; no full
  native-suite pass is claimed. DOM branding lacks full prototype method tables;
  namespaced creation currently supports only unprefixed HTML, SVG and MathML names.
- Keep native, SafeJS, live-network, socket and TTY/PTY gates separate. Use only
  manifest-listed native tests from native-tests.json. The user approved SafeJS,
  live Zoom and necessary sockets; native passes prove none of the other gates.

## Retained development inputs

- Native source/build: this repository. Preserve unrelated uncommitted work.
- Working SDK source/build: /tmp/agent-browser-zoom-sdk/packages/safe-js.
- Local SDK baseline: /home/kjopek/project/poe-code/packages/safe-js.
- Focused SDK contribution patches: contributions/. Some recovered accounting
  patches still need reconciliation; a temporary metadata patch header was normalized
  only in the retained scratch SDK.
- Keep validation artifacts ephemeral. No run diaries, inventories, page dumps or
  archives. Commit completed focused changes atomically; do not push unless asked.
