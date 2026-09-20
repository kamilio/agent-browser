# Browser priorities

- Develop the standalone native browser + SafeJS toward a possible future
  replacement for the working Automations Zoom notetaker. Keep Automations
  unchanged and the native engine independent of Chromium, Firefox and remote
  browsers. SafeJS is the only approved page-runtime dependency.
- This is exploratory work for a hypothetical future replacement, not a current
  migration. The working Automations setup remains the operational solution;
  the acceptance gates below describe future readiness.
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

- Internal read-only scope roots are rejected and reverted: 160 SDK checks across
  20 files (13 new), scoped core/new-test compilation and new-test formatting pass.
  Native probe creates 124780 roots arrays versus 149720 baseline; both return
  1200000, retain 90236 units / peak 150245, clear to 29988, reject excessive data
  at the 200000 limit and close at zero. Serial live 30 s Vue reaches 959469 steps
  candidate versus 959277 baseline; both time out, 16 scripts executed, cleanup zero.
  No useful initialization improvement. Separate live numeric probes find 47.9 million
  closure-capture reads across initialization plus a 60 s Vue window, and 30.5 million
  scope reads / 7.05 million private-name cache fallbacks across initialization plus
  a 30 s Vue window; zero namespace/resource/with/raw-metadata fallbacks. Instrumented
  runs are not speed comparisons. Investigate scope snapshots for native private-name
  maps while preserving actual membership, raw primitive multiplicity, custom iterator
  fallback, metadata read order and primary held limits. Exact source/build restoration
  and baseline core compilation pass; all experiment/probe/config/backup artifacts
  removed. No join/media acceptance.
- Automatic anonymous/deferred declaration scope selection is rejected and reverted.
  Owned frozen syntax, conservative analysis and delayed declaration-cell selection
  pass 288 focused SDK checks across 20 files, scoped core/new-test compilation and
  new-test formatting. The Promise-subclass snapshot timeout reproduces on the exact
  baseline. Actual native declared capture: 90189 retained units baseline versus
  30180 candidate; both return 7, clear to 29988, reject at dataSize 200000 and close
  at zero. Serial live 30 s Vue: baseline 958127 execution steps / 891790 peak units;
  anonymous candidate 956381 / 881930; deferred declaration candidate 958575 / 883278.
  New freeze/scan work is subtracted from candidate steps; concurrent background
  builds limit timing comparisons. All time out with 16 scripts executed and cleanup
  zero; no useful initialization improvement or join established. Primary accounting
  still includes active invocation scopes. Investigate that reconciliation cost rather
  than escaped captures alone. Exact seven-stem source/build restoration and baseline
  core compilation pass; experiment helpers/tests/config/probes/backups are removed.
- Internal plain-local scope projections now share mutable binding cells without
  retaining the original local frame or omitted data. Weak view tracking propagates
  accounting-cache invalidation; opaque snapshot cell IDs preserve sharing across
  distinct frames and repeated recovery. Legacy frames remain readable. Retained
  contribution: safejs-projected-scope-shared-cells.patch. Validation: 21 new SDK
  checks (including explicit GC), 200 existing checks, scoped core/new-test TypeScript,
  new-test formatting and exact seven-file patch forward/reverse verification pass.
  Two recovery checks fail without IDs; five cache/limit checks fail without shared
  invalidation. One Promise-subclass constructor snapshot timeout reproduces on the
  saved baseline. Automatic capture selection remains disabled after the reverted
  frozen-syntax/conservative-analysis experiment failed to improve initialization.
  No new Zoom initialization, join or media acceptance is claimed.
- Closures now discard the creating invocation's callee, which every invocation
  replaces. The retained contribution is safejs-release-creating-callee.patch;
  lexical scopes, arguments, constructor metadata and primary accounting stay intact.
  Validation: 212 focused SDK checks across 14 files and scoped core compilation pass;
  five explicit-GC regressions fail on the saved baseline, seven preservation checks
  pass both. Exact contribution forward/reverse verification and new-test formatting
  pass. Actual native adapter: a cleared caller and its 60000-character property
  collect only with the fix; the returned closure still returns 7. Both versions
  measure 30242 units versus starting/cleared 29965, reject excessive allocation
  at dataSize 200000 and close at zero. This fixes hidden physical retention;
  it does not reduce measured lexical captures. Serial live 30 s comparison:
  baseline 956381 steps / 890071 peak units, fix 956220 / 890082; both Vue timeouts,
  16 scripts executed and cleanup zero. No initialization improvement or join claimed.
- The repeatable authorized live diagnostic is scripts/check-zoom-initialization.ts:
  selects the working SDK explicitly, uses the extension adapter and correctly
  nests ScriptLoader limits (256 scripts / 64 external / 8 MB source). Earlier
  temporary probes supplied an ignored second constructor argument; their Vue
  timeout preceded the default loader limits. New scoped TypeScript and formatter
  checks pass. Actual 30 s run: Vue timeout, 959277 steps / 892499 peak units,
  16 scripts executed; failure exit, readiness/join unverified, cleanup data zero.
- App/tenant old/current web-client route variants all converge to the same
  app.zoom.us/wc/join/7982110526 page, bootstrap and Vue asset. Published join
  handler uses CAPTCHA completion and join fields; the form has no usable native
  submit action. The working notetaker selects the same /wc/7982110526/join route.
  No lighter route or supported form-only join established. Read-only native
  source inspection does not replay join/authentication/challenge requests.
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
  analysis. A static Vue scan finds 116 conservative parameter-only return
  candidates among 1765 functions; runtime scope/callback eligibility is unmeasured.
  A phase probe attributes 13.2 of 14.1 s in the first script and 28.5 of 30.5 s
  in Vue to reconciliation. Sampled locations advance through normal Vue CSP
  parser/AST-type setup; no alternate compatibility fallback was established.
- Closed-invocation retention diagnostics identify about 10% candidate-unused
  occurrences among sampled charged bindings. Twenty lexical-analysis checks and
  four instrumented preservation checks pass. Excluding property keys/labels and
  retaining scopes whose arguments were read leaves similar results. Binding
  counts do not establish retained units, visitor cost or a speedup.
- Physical release of unused terminal-invocation arguments is rejected and reverted.
  The bounded, uncached whole-function analysis excludes arguments/eval identifiers,
  classes/with and exposed/suspended checkpoint paths. Candidate: 145 SDK checks
  across 16 files and scoped core compilation pass; two physical-release regressions
  fail on baseline, ten preservation checks pass both. Actual native adapter:
  unused 60000-character extra argument raises retained data by 60109 units baseline
  versus 88 candidate; clear restores starting data, excessive allocation still
  rejects with dataSize, close releases all data. Serial 30 s Vue reaches 956710
  candidate versus 958789 baseline steps, both timeout; peaks 886591 versus 892105.
  No useful initialization improvement or meeting join established. Exact source/build
  baseline and declarations are restored; baseline core compilation passes and all
  candidate helpers/tests/config/probes are removed. Broader capture compaction still
  needs shared-cell snapshot identity and stable-code/escape guarantees.
- SDK-owned literal/constructor array projections are rejected and reverted:
  large array-only CPU gains did not improve live initialization. Final candidate
  and baseline both reach 957340 steps / 890986 peak units in serial 30 s runs;
  first-script CPU is 17.2 s versus 17.0 s. Unrelated builds compete for CPU, so
  mixed wall times prove no speedup. Scoped compilation and focused preservation
  checks pass, including partial failed length writes, mutable child graphs,
  snapshot recovery and intrinsic records. Exact SDK source/build baseline is
  restored; no candidate code, caches or diagnostic artifacts remain.

## Outstanding gates

- Interactive Zoom initialization/join and every notetaker capability listed above.
  Diagnostics block optional file-paa.zoom.us and cdn.cookielaw.org origins;
  production actor/default 128 MB heap, meeting sockets, media and transcription
  acceptance remain unverified. Invitation landing reports unsupported OS; an
  alternate duplicate script path exhausted the 192 MB heap.
- Actual current native extension-page probe reports absent RTCPeerConnection,
  AudioContext, MediaRecorder, navigator.mediaDevices/getUserMedia, Worker,
  WebAssembly and canvas getContext; cleanup data zero. The working recorder uses
  media-device capture and AudioWorklet processing; native PCM chunk handling is
  not a Zoom audio source. Media transport/rendering APIs need implementation,
  separately from initialization performance and later live acceptance.
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
