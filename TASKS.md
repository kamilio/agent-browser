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

- Script-boundary diagnostics now report current SDK data charge alongside peak
  usage. Native build and actual SDK 128 MB allocation/release fixture pass: a
  20000-character payload raises current charge to 85744, clearing it drops to
  45744 while peak stays 85797; zero sockets and verified cleanup zero.
  Public externals.min.js (163960 characters, SHA256 c646c4d8a4f3b714abc1c424b4373ef70cca93f7d39cf25576a8ce90dddb8231)
  completes in an isolated native document under 128 MB: 25.7 s, 212732 steps,
  317987 peak units, zero sockets, cleanup zero. The selected 120 s diagnostic
  limit is not a default-timeout, interactive readiness or actor acceptance pass.
  Live 128 MB executes nine scripts then vendor fetch times out. Current charge
  after callback-heavy configuration is 184678 versus 1003950 peak; after all
  nine scripts it is 370122. Earlier peaks do not prove persistent retention.
  Separate native public-vendor transport requests return HTTP 200 in 47/42 ms
  for default/desktop headers, with closed/zero-active transports. Fetch timing
  during page execution remains unexplained; transport or scheduling changes need
  a controlled reproduction. No meeting joined; SDK source/build unchanged and
  no fixture/source artifacts retained.
- Global leaf/seen-identity dispatch outside the SDK classification visitor is
  rejected and reverted. Candidate passes 56 focused SDK checks and scoped core/
  new-test compilation; baseline preserves all six new checks. Exact charges,
  identity lookup counts, DFS/reentry order and held quota rejection match.
  Warmed synthetic median: 0.516 ms candidate versus 0.600/0.621 ms baseline,
  with variable samples; live vendor reaches 191979 candidate versus 196276 baseline
  steps in serial 30 s runs. Both execute nine document scripts, time out at vendor,
  peak at 1341339 units, open zero sockets and verify cleanup zero. No useful live
  gain or join established. Temporary entry census fails earlier under contention
  (four scripts execute); its 26.7 million entries / 17.3 million visitor calls
  do not profile vendor. Exact SDK source/build restored; temporary tests, counters,
  configs and benchmarks removed. Avoid repeating dispatcher-only reductions.
- Initial unsandboxed about:blank iframes now expose separate native documents,
  stable window/document links, inherited origin/base URL and child computed styles.
  Frame documents share parent/template node, text and document quotas; nested and
  repeated creation is bounded. Detach, ancestor removal and unsupported source or
  policy changes revoke retained child capabilities and release documents. All 209
  focused manifest-listed checks, native build and new-file lint/format pass. Actual
  SDK probes under 128 MB verify blank/nested documents, an awaited timer, links,
  retained-capability revocation and cleanup zero without real network/socket requests.
  FingerprintJS's public iframe helper
  can now progress beyond its otherwise endless readyState polling into font work.
  Live 192 MB: nine initial scripts execute, vendor times out after 190479 steps;
  614481 total / 1341339 peak, zero sockets and verified cleanup zero. Live 128 MB:
  nine initial scripts execute; vendor fetch times out, zero sockets and cleanup zero.
  No speedup, interactive readiness, actor acceptance or join established. Child
  script realms, navigation, srcdoc, sandbox and credentialless contexts remain
  unsupported; these sources/configurations expose no child document. Requested
  static security reviewer cannot read the repository: its read-only bwrap sandbox
  fails to configure loopback (Operation not permitted); no review pass claimed.
- Zoom initialization diagnostic now observes raw SDK evaluation failures through
  a frozen facade that preserves the SDK's descriptors. Output admits only known
  error identifiers and bounded positions; no messages, stacks or source excerpts.
  Native TypeScript build and actual SDK offline standard/custom-error fixtures
  under 128 MB pass, including private-marker exclusion, zero sockets and close
  data zero. Direct unknown-identifier and Proxy fixtures also pass. Latest live
  30 s run: HTTP 200, ten scripts discovered / nine executed / one timeout before
  vendor evaluation starts, zero sockets and verified cleanup zero. Waiting for
  earlier callback prefixes consumes the same initialization timeout.
  Earlier vendor CPU profile attributes 47.5 of 52.9 s to graph measurement;
  sampled work builds ReactDOM attribute/event metadata (14633 vendor nodes versus
  679 FingerprintJS nodes). Retried shallow capture dispatch fails earlier under
  CPU contention and is reverted; unchanged-build 120 s diagnostic still times
  out, with about 28 s spent before vendor evaluation starts. Neither is a speed
  comparison or acceptance pass. SDK builds restored, profiling artifacts removed;
  interactive initialization, default 128 MB actor and all meeting gates stay open.
- Classic script tasks now defer due timer callbacks until the script and its
  microtask checkpoint return; queued work resumes on a later task. Modules and
  interactive evaluation can still await timers. All 195 focused manifest-listed
  timer/page-script/loader/module/idle checks and the native TypeScript build pass.
  Actual SDK adapter under 128 MB verifies classic timer ordering, a module's
  awaited timer, zero network requests and close data zero. No SDK accounting
  checks are bypassed; unrelated native changes stay outside this commit.
- Explicit bounded user-agent profiles survive session/child configuration and
  agree between HTTP defaults and navigator; default remains AgentBrowser/0.1.
  All 176 manifest-listed identity checks pass. Zoom selects nine web-client
  document scripts for an opt-in desktop compatibility identity including the
  AgentBrowser marker, versus 53 legacy join-page scripts for the default identity.
  Earlier fifth-script timeout was dominated by FingerprintJS background execution:
  23962 fingerprint nodes versus 645 configuration nodes; 25795 graph measurements
  traverse 131.5 million entries during that evaluation. Temporary census builds
  are restored; no instrumentation or profiles remain. With timer task ordering,
  live HTTP 200 executes all nine document scripts (configuration completes in
  2.9 s) and discovers externals.min.js (163960 characters), which times out at
  30 s. Report: ten discovered, nine executed, one failed; 537036 total steps,
  742526 peak units, zero sockets, no join, cleanup zero. A prior temporary probe
  reaches the same vendor gate. This 192 MB diagnostic does not clear production
  actor/default 128 MB Zoom, interactive initialization or media acceptance.
- Scope-root registry reads/writes and private-name capture caches now use pinned
  native operations; private capture records/vectors are immutable and reflective
  admission cannot be spoofed by later hooks. Retained contribution:
  safejs-scope-root-registry-private-cache-ownership.patch. Baseline fails 13 of
  15 new checks; candidate passes all 15 and 91 relevant SDK checks, including the
  previously skipped GC check, scoped compilation, new-test lint/format and exact
  patch forward/reverse. Baseline new-helper API shims only preserve explicit
  registration coverage; regressions exercise unchanged baseline callers. Compiled
  quota probes keep 1000/1013 units and reject quota500, versus poisoned baseline
  0/1 units and admission. Native adapter matches baseline at 150399 retained /
  29999 cleared, behavior/quota rejection and close zero under 128 MB. Live HTTP
  200, first-script timeout, zero executed / sockets, 170019 steps / 187870 peak,
  cleanup zero; no join or speed claim. Escape-monitored private-map layout was
  separately reverted after nested/private benchmark regressions. No broader graph
  reuse enabled; other scope caches/backings and frame vectors remain unproven.
  Temporary validation artifacts removed; initialization and media gates stay open.
- Shallow capture-root dispatch outside the large visitor is rejected and reverted.
  All 66 focused SDK checks and scoped compilation pass; compiled baseline/candidate
  usage, provider/identity-lookup counts, reentry, mutation, held quota and iterator
  close order match. Small first-benchmark gains are inconclusive: repeat empty-case
  timings also swing about 30%. No live gain or join claimed. SDK source/build are
  restored exactly and temporary artifacts removed. Broader graph reuse still needs
  complete ownership/mutation witnesses; dispatch-only reduction is insufficient.
- Frozen factory-closure symbol caches now verify actual freezing and retain
  privately captured, immutable descriptors/vectors through pinned native reads,
  construction and WeakMap operations. Retained contribution:
  safejs-frozen-symbol-cache-ownership.patch. Baseline fails six of ten new checks;
  candidate passes all ten and 81 focused checks, scoped compilation, new-test
  lint/format and exact patch forward/reverse. Broader validation passes 192 checks;
  two deep-copy stack failures reproduce on baseline. Compiled quota probe keeps
  1017 units / rejects quota500 instead of leaked-cache baseline 2 units / admitted;
  mutable factory symbol growth measures 1008 instead of stale 1. Native adapter
  matches baseline: 150399 retained / 29999 cleared, closure/private/disposal/locked
  descriptor behavior, quota rejection and close zero. Empty-symbol catalogue
  optimization is removed after mixed benchmarks; no speed claim. CPU-contended
  live baseline and final fix fail the first script; final HTTP 200, zero executed,
  167407 steps / 187906 peak, zero sockets and cleanup zero. No join verified.
  Temporary validation artifacts removed; broader capture traversal remains open.
- Deep closure prototype traversal now resumes from off-stack continuations;
  parent properties/providers stay fresh after the complete prototype subtree.
  Retained contribution: safejs-closure-prototype-data-walk.patch. Baseline fails
  four of six new checks; candidate passes all six plus 116 existing SDK checks,
  scoped core/new-test compilation, new-test lint/format and exact patch forward/reverse.
  Compiled default-stack/128 MB probe measures 14343 units at depth1024 instead of
  native RangeError; excessive depth reports dataDepth, held primary quota remains
  enforced, and callback/iterator order is preserved. Native adapter matches baseline
  at 150437 retained / 30023 after clear, quota rejection and close zero under 128 MB.
  Live HTTP 200, 16 scripts then Vue timeout at 960584 steps / 895131 peak, zero
  sockets and cleanup zero; no join or speed claim. Pure closure-walker factoring
  was separately reverted after inconsistent benchmark gains (repeat private/mixed
  regressions about 7–8%). No graph reuse was enabled; temporary artifacts removed.
- Capture-root admission/cardinality census rules out empty-private-map shortcuts
  and weak-snapshot churn as major reuse targets: 24.36 million snapshot hits /
  17,696 eligible misses / 257 collected snapshots; all 7.87 million declines
  involve six populated private-name maps (three single-entry, two two-entry,
  one larger), none empty. 30.50 of 34.14 million interpreted capture-root yields
  already have seen identities. These are availability counts, not CPU attribution
  or ownership proof. Compiled alias/mutation/snapshot/with/private/module/capture/
  iterator/depth/held-quota fixtures and private/module getter counts match before,
  during and after the cardinality probe. Live HTTP 200, 16 scripts then Vue timeout
  at 958679 steps / 893365 peak, zero sockets and cleanup zero; no join or speed
  claim. SDK source unchanged, two compiled modules restored exactly after process
  exit; temporary artifacts removed. Broader primary-graph traversal remains the target.
- Tracked string-property projections now keep immutable units/edge snapshots,
  using pinned native reads, freeze and own-entry construction; inherited numeric
  setters and later push/iterator/reflection hooks cannot corrupt these caches.
  Accessor adapter read order is preserved. Retained contribution:
  safejs-string-projection-ownership.patch. Baseline fails nine of 13 new checks;
  candidate passes all 13 plus 423 existing SDK checks, scoped compilation,
  new-test lint/format and exact patch forward/reverse. Compiled quota probe:
  1013 units / quota500 rejected, versus corrupted baseline 7 units / admitted.
  Actual native adapter matches baseline: 150437 retained / 30023 after clear,
  closure/private-field/disposal/descriptor behavior, quota rejection and close zero.
  Live HTTP 200, 16 scripts then Vue timeout at 957061 steps / 892372 peak,
  zero sockets and cleanup zero. No join or speed claim; other caches and foreign
  graph ownership remain unproven. Temporary validation artifacts removed.
- A provenance census narrows the primary-walk target to interpreted capture
  graphs: Vue alone performs 13,759 measurements / 116.0 million entries,
  including 18.1 million closure visits (14.5 million interpreted) and 26.3 million
  capture yields (21.8 million interpreted). Native bindings also contribute;
  these frequency counts prove neither CPU attribution nor safe graph reuse.
  Compiled mutation/callback/iterator/scope/held-quota/symbol/prototype fixtures
  match before, during and after instrumentation. Live HTTP 200, 16 scripts then
  Vue timeout at 958505 steps / 893240 peak, zero sockets and cleanup zero.
  No join or speed claim; SDK source unchanged, compiled module restored exactly
  after process exit and all census artifacts removed. Investigate repeated
  interpreted capture traversal while preserving fresh foreign observations and
  full active-invocation accounting; escaped-capture pruning alone previously failed.
- Tracked record/function table backings now stay private across later native
  Reflect/Object/Proxy hooks; native copying/construction/mutation operations are
  pinned. Retained contribution: safejs-tracked-backing-ownership.patch. Exact baseline
  fails nine leak regressions; candidate passes ten new and 125 existing focused SDK
  checks, scoped compilation, new-test lint/format and exact patch forward/reverse.
  Compiled quota probe now measures 1006 rather than 13 units and rejects quota 500.
  Native adapter matches baseline: 90302 retained units, 29974 after clear, closure/
  private-field/disposal/descriptor behavior, dataSize rejection and close zero.
  Live HTTP 200, 16 scripts then Vue timeout at 958505 steps / 893240 peak, zero
  sockets and cleanup zero; no join or speed claim. Temporary artifacts removed.
- Empty-block scope elision is rejected and removed. Sixteen new and 77 existing
  focused SDK checks, scoped compilation and new-test lint/format pass; exact baseline
  preserves 15 cases and fails the physical-frame regression. Actual native adapter
  candidate/baseline match: closure/private-field/capture behavior, disposal order,
  90308 retained units, 29974 after clear, dataSize rejection and close zero. Serial
  live candidate/baseline reach 961458/961723 steps and 895520/895697 peak units;
  both execute 16 scripts then Vue times out, zero sockets and cleanup zero. No
  useful initialization gain or join; source/build restored exactly. Restored 77
  focused checks and scoped compilation pass; test/config/probe/log/backups removed.
- Explicit opt-in managed scope metadata/root vectors are rejected and removed.
  Seventy-one focused SDK checks and scoped compilation pass; actual native adapter
  candidate/exact baseline match closure identity, mutable captures and private fields,
  90334 retained units, 29974 after clear, dataSize rejection and close zero.
  A shared depth-6/200-closure synthetic fixture improves about 61% with unchanged
  units/provider reads, but live candidate/baseline reach 959337/961047 steps and
  894029/895469 peak units. Both execute 16 scripts then Vue times out, zero sockets
  and cleanup zero; no useful initialization gain or join. Original six source/build
  files restored byte-for-byte; 56 focused restored checks and scoped core compilation
  pass. Helpers/tests/config/probes/logs removed.
- Ownership scanning is not an initialization target: the live census records
  20 ownership scans / 4.69 ms versus 44660 primary scans / 46723.65 ms. All target
  tickets are found early in only one scan, leaving 0.00314 ms / one visit afterward.
  Early termination has negligible coverage; primary reconciliation needs the
  algorithm change. Seven compiled ownership/hold/mutation/quota fixtures match
  instrumented/restored behavior. Live HTTP 200, 16 scripts then Vue timeout at
  960093 steps / 896784 peak, zero sockets and cleanup zero; no join. Source unchanged,
  compiled module restored byte-for-byte and census/fixtures/logs removed.
- Fresh-read vector sharing is also rejected. A temporary native array index setter
  exposes a fresh object-only scope-root vector and restores the prototype before
  validation; later provider code appends 1000 units. Both frozen and reused-live
  carriers measure 19 versus baseline 1019, wrongly admitting under quota 100.
  Native push/iterator identities, dense data entries and provider/scope read counts
  all match. Twelve compiled SDK model cases pass their counterexample assertions;
  a fresh unshared live carrier preserves units/rejection in these cases only.
  Sharing needs proof against escape and late mutation, beyond fresh membership
  reads. Earlier binding/private-name carrier failures remain 29 versus 1028/1034
  under quota 900. No SDK edits, live run or join; temporary probe removed.
- Traversal-span census disfavors small segment caches: 188.63 million visits over
  42212 measurements, 58.7% in spans of 1–3 visits and 13.8% in spans of at least
  16, maximum 319. Boundaries mark closure handling, retained providers, capture
  iteration and foreign values; these availability counts do not prove ownership
  or mutation safety. Broader replay needs complete mutation witnesses across fresh
  callbacks. Eight compiled preservation fixtures match before/during/after census.
  Live HTTP 200, 16 scripts then Vue timeout at 956742 steps / 892250 peak units,
  zero sockets and cleanup zero; no join. Source unchanged, compiled module restored
  byte-for-byte and temporary artifacts removed. No speed claim from instrumentation.
- Manual capture-iterator records are rejected and removed. All-depth records slow
  warmed shallow/shared fixtures by 23–28%; preserving shallow loops speeds the
  depth-512 fixture by about 19% only. Eighteen new and 85 existing focused SDK
  checks and scoped core/test compilation pass; two host-copy depth failures also
  reproduce on baseline. Live candidate/baseline execute 16 scripts then Vue times
  out at 961275/960093 steps, 895509/894811 peak units, zero socket attempts and
  cleanup zero. Slightly more candidate CPU establishes no useful initialization
  gain or join. Source/build restored byte-for-byte; all experiment artifacts removed.
- Actual SafeJS + local WSS passes with a process-local test CA: original-host SNI
  and Origin, protocol negotiation, fragmented UTF-8, 64 KiB binary echo with
  64-bit frame length, and send snapshots surviving subsequent guest mutation.
  Wrong-host and untrusted certificates fail before HTTP upgrade. Clean close and
  document closure with another socket open leave zero peers/pending/active sockets,
  no cleanup failures and close data zero. Probe/certificates removed; no runtime
  change needed. Production trust, authenticated Zoom WSS and meeting media remain
  unverified; interactive initialization remains the immediate blocker.
- WebSocket bootstrap keeps its constructor local: global `var WebSocket` hoisting
  previously made the classic Window accessor definition fail before any socket.
  All 295 focused manifest-listed native checks, native build/noEmit and changed-code
  format/lint pass. Actual SafeJS + loopback ws verifies text, fragmented UTF-8,
  ping/pong, ArrayBuffer/view/DataView bytes, event identity/origin, protocol and
  clean close; document closure releases a second open socket, close data zero.
  Temporary probe removed. The Zoom diagnostic now configures native WebSockets
  and verifies transport shutdown. Live HTTP 200, 16 scripts then Vue timeout at
  961047 steps / 895469 peak, zero socket attempts, cleanup zero; no meeting joined.
  Meeting WSS/media acceptance remains open. Zoom ships Vue 2.6.11-csp directly;
  no runtime string-compilation setting selects a lighter implementation.
- Checkpoint attribution rules out completed-frame restructuring as the main fix:
  function-terminal scans use 1.4 s (3.2%) of 44.2 s measured traversal, versus
  Identifier 13.9 s (31.4%), MemberExpression 3.2 s and BinaryExpression 2.8 s.
  The full diagnostic records 45210 primary/ownership scans; registered-root
  collection adds 1.5 s. These instrumented timings establish attribution only.
  Focus on repeated graph traversal across node checkpoints, preserving fresh
  provider observations and complete primary checks; terminal-only work has little
  coverage. Instrumented/restored SDK fixtures match 14 stable provider reads,
  result 7 and 11 reads before identical growth/dataSize failures. Live HTTP 200,
  16 scripts then Vue timeout at 959040 steps / 892227 peak; no join, close zero.
  Source untouched; three compiled files restored exactly, census/probes removed.
- Object visitation bitsets/stamps are rejected and removed. Bitsets regress both
  warmed graph fixtures; reentrant weak stamps improve them only about 1–3%.
  Five new and 97 existing SDK checks pass, with scoped core/test compilation,
  new-file formatting/oxlint and nine compiled preservation/GC cases. Two host-copy
  depth failures reproduce on restored baseline. Actual native adapter matches:
  90173 retained units, 29976 after clear, dataSize rejection at 400000, close zero.
  Serial 30 s live stamp/baseline reach 960577/959469 steps and 893088/892568 peak
  units; both execute 16 scripts then Vue times out. About 0.7% extra interpreted
  Vue work and slightly higher CPU establish no useful initialization gain or join.
  Original source/build verified byte-for-byte; helpers/tests/probes/backups removed.
- True local declaration deferral is rejected and reverted. Functions are created
  on first exposure rather than behind an existing shell; the full lexical payload
  remains measured. Sixteen new SDK checks and 87 existing focused checks pass,
  along with scoped compilation and new-file lint/format; nine preservation checks
  and scoped compilation pass the restored baseline. Copying inherited bindings
  invalidates their actual owner; snapshot/frame/copy boundaries materialize one
  canonical function. Native candidate/baseline match: 90242 retained units before
  exposure, 90259 after, 30368 after clear, dataSize rejection at 400000, close zero.
  Admission census installs 10/123/341 deferred declarations in bootstrap/page/Vue,
  with 108 total materializations; this is admission evidence, not a speed proof.
  Serial 30 s candidate/baseline reach 957569/958789 steps, 891189/892105 peak units,
  16 scripts and Vue timeout. No useful initialization gain or join. Six original
  source/build files are restored byte-for-byte; all temporary artifacts removed.
- Closed-return eligibility census admits all 18 page and 75 Vue candidates, with
  zero runtime-guard declines. Their 1.25 million reads are 5.08% of 24.64 million
  interpreted capture reads; none come from bootstrap. Narrow scope pruning did
  target live functions but covers little of this trace. HTTP 200, 16 scripts then
  Vue timeout, cleanup zero. Source untouched; the instrumented compiled file was
  restored byte-for-byte and census/probe/backup removed. No speed or join claim.
- Narrow closed-return lexical pruning is rejected and reverted. The candidate
  physically replaces unused intermediate scopes with the original global scope,
  preserving indirect eval and its string-compilation policy. Twenty-nine new and
  43 existing focused SDK checks, scoped core/new-test compilation and new-file
  lint/format pass. The restored baseline passes 26 preservation checks and fails
  the physical-scope regression as expected. GC confirms omitted payload collection.
  Actual native adapter retention grows by
  230 candidate versus 60247 baseline units for an unused 60000-character payload;
  identity/captured writes/private fields, dataSize rejection at 400000 and close
  data zero are preserved. Serial 30 s live candidate/baseline execute 16 scripts
  then Vue times out at 958789/959040 steps and 892105/892227 peak units. No useful
  initialization gain or meeting join. All four original SDK source/build files
  are restored byte-for-byte; helpers/tests/config/probes and backup removed.
- Declaration-boundary census finds 480 ordinary declarations: first exposure by
  lookup for 109 and global publication for two; 369 have no tracked exposure before
  timeout. Snapshot/frame/property/invocation probes add no first exposures in this
  trace; this is not exhaustive access-path coverage. Of 9.15 million declaration
  capture reads, 7.80 million precede exposure. A separate executable deferred-body
  model postpones initialization until call but leaves accounting unchanged: eager
  and deferred shells both retain 60001 units and perform 101 scope reads over 101
  measurements; both reject at dataSize 40000 and clear to one unit. Deferring body
  factories behind existing function shells does not remove the reconciliation work.
  A useful deferred-binding design still needs canonical function identity, actual
  retention representation, publication/copy/import boundaries and snapshot recovery;
  unread counts do not authorize omitting captured scopes. Live census: HTTP 200,
  16 scripts then Vue timeout at 958127 steps / 891790 peak; no join, close data zero.
  Source untouched; three compiled files restored byte-for-byte and backup removed.
- Opaque compiler-scope metadata with revision-tracked private-name maps is rejected
  and reverted. Thirteen new and 58 existing focused SDK checks pass (one GC check
  skipped), along with scoped core/new-test compilation. The actual native adapter
  matches restored baseline: identity/private fields/captured writes, 150355 retained
  units, 30355 after clearing (120000 released), dataSize rejection at 400000 and
  close data zero. Serial live candidate/baseline both execute 16 scripts and time
  out in Vue: 959920/959687 steps, 892782/892630 peak units, cleanup data zero;
  233 extra total steps (0.024%) establish no useful initialization gain or join.
  A supplemental foreign
  parent-replacement probe fails candidate (25 versus 28 units; one versus two
  provider calls) and passes exact baseline. Sealed writable fields and tracked
  private-map membership do not prove ownership of the entire ancestor/provider
  chain; an exact graph reuse design needs that provenance too. All eight original
  SDK source/build files are restored byte-for-byte; helper/test/config/probe and
  backup removed. No candidate foundation remains.
- Creator-origin census attributes 19.71 million interpreted capture reads to
  browser bootstrap (4.85 million, 127 functions created), join-page inline scripts
  (8.69 million, 400), Vue (5.75 million, 960) and smaller assets (0.42 million).
  The visitor records 76.79 million entries during inline scripts and 96.97 million
  during Vue; 34.86/43.52 million respectively already have seen object identities.
  Five inspected Vue/site-helper assets have no getRandomValues/randomUUID/subtle
  references; Web Crypto is not established as the present blocker. Focus the next accounting
  design on retained library graphs across primary measurements, preserving mutable
  descendants and foreign effects; browser-bootstrap reduction alone covers only
  24.6% of interpreted capture reads. These counters establish attribution, not
  cache safety or speed. HTTP 200, 16 scripts then Vue timeout at 954776 steps /
  889177 peak units; no join, close data zero. Same-walk binding mutation (12 units)
  and data-limit rejection sanity pass. Source untouched; both instrumented compiled
  SDK files restored byte-for-byte, backup removed, no diagnostic artifacts retained.
- Owned lexical-scope snapshot sharing is rejected and reverted. The standalone
  adapter probe preserves function identity/captured writes, releases a retained
  60000-character payload and rejects excessive allocation; 91 focused SDK checks
  and scoped compilation pass before final guard additions. Both live candidates
  time out in the first inline script with zero scripts executed, regressing from
  the baseline's 16 scripts before Vue timeout. Admission instrumentation records
  5.85 million reads, 3.53 million hits, 744742 snapshots and 2.32 million guard
  declines; sharing was admitted but supplied no useful initialization progress.
  No meeting joined; both runs close with zero retained data. All 14 SDK source/build
  files are restored byte-for-byte and experimental helpers/probes removed. No
  final-guard compilation, full SDK pass or speedup is claimed.
- Mutation coverage probe confirms the existing intrinsic token is not a general
  retained-graph epoch: array membership, ordinary prototype links, private-field
  values and retained-provider output grow measured data by 101/109/100/100 units
  without changing it. The live Zoom census sees 44944 primary scans, 7183 adjacent
  matching root signatures/token, zero changed usage in those pairs and zero token
  changes during scans. This specific trace supplies no counterexample; the four
  SDK cases rule out promoting that guard to a general exact-accounting cache.
  Stable-portion reuse needs independently validated ownership/revision witnesses
  and fresh volatile-provider traversal, not a global token alone. HTTP 200,
  16 scripts then Vue timeout at 958789 steps / 892105 peak; close data zero, no
  join. SDK source untouched, both compiled files restored exactly, probe removed.
- Cross-checkpoint accounting census samples adjacent pairs every 32 scans, keeping
  all graph checks active. Two live runs agree: 45076 measurements, 1409 pairs;
  288 matching signatures cover 1473495 / 6682457 visits (22.1%). The second run
  finds a matching prefix covering 5883323 visits (88.0%), with no 32768-entry cap
  reached. Signatures include visit identity/depth, charged strings and total units;
  hashes and uncharged primitive coalescing are availability evidence, not exact
  graph equality or cache safety. Sampled closures are 69.3% interpreted; matching
  callback output does not authorize skipping its observable effects. Next accounting
  design should reuse independently validated graph portions with mutation provenance
  and volatile-provider barriers, rather than whole-result reuse. Both runs return
  HTTP 200, execute 16 scripts and time out in Vue at 958789 steps / 892105 peak
  units; close data zero, no join. Callback-read and held-limit sanity checks pass.
  SDK source untouched, exact build restoration verified, census/probe removed;
  instrumented timings establish no speedup.
- Native canvas drawImage now accepts same-document HTML canvas and loaded image
  sources at natural size, scaled or cropped. Negative sizes preserve direction;
  source/destination clipping and self-copy snapshots stay bounded. Source alpha
  and globalAlpha compose over destination pixels. Image-loader origin checks,
  including redirects, taint readback and propagate through canvas copies;
  clear/paint/save/restore preserve taint and dimension writes reset it. Thirteen
  added manifest checks and 68 existing canvas/image checks pass; native build and
  changed canvas-file lint/format pass. Actual SafeJS drawing, self-copy, loaded
  image, taint propagation/reset and native PNG pixels pass, close data zero;
  probe removed. Nearest-neighbor sampling, primitive coordinates and exact 3/5/9
  argument forms only; foreign documents, video/ImageBitmap sources and CORS image
  loading remain unsupported. SVG inherits the existing static native subset.
  This advances image/avatar primitives, not Zoom initialization or meeting media.
- Filtered later-script diagnostic denies /lib/vue/ and /fe-static/fe-frame-popups/
  only in an ephemeral script policy. It reaches 19 executed scripts, then all.min.js
  (243575 characters, jQuery/site helpers) times out at 30.1 s / 585018 total steps /
  368232 delta / 602814 peak units; cleanup data zero, no join. Source inspection
  confirms Vue supplies popup CAPTCHA via all.min.js AJAX handling, so the filter
  is not a complete workflow policy. Initialization cost also affects a separate
  library; fixing Vue alone or filtering UI assets has not established readiness.
  Probe removed; production source/build and existing Automations are unchanged.
- Native HTML canvas has bounded 2D rectangles/readback and viewport compositing:
  stable context, color/alpha state, save/restore, fillRect/clearRect/getImageData;
  resize clears pixels/state and close revokes access. Normal-flow inline/block
  layout uses bitmap intrinsics and CSS scaling; nearest-neighbor painting follows
  padding, borders, background, overflow, opacity and screenshot crop. Unpainted
  canvases allocate no backing store. One runtime/child documents share 4M pixels
  and 64 contexts. Eighteen added API/rendering checks plus 335 existing manifest
  checks pass; TypeScript/build and new-file lint/format pass. Actual native + SafeJS
  drawing-to-PNG pixel assertions pass, cleanup data zero. WebGL, paths, text,
  transforms, video drawing and canvas export remain missing. Existing
  script-dom import-order/assignment-expression lint remains. Vue initialization
  and Zoom join/media readiness remain unverified.
- Fresh line-sampled baseline profile has 21937 visitor self samples: 1501 at seen
  lookup, 1487 at insertion (13.6% combined), 925 at capture-provider reads and 869
  at closure-property reads. Cost is spread across identity, metadata and descriptor
  paths; no single line dominates. Symbol/private traversal adds 5587 self samples,
  including 982 at symbol enumeration. Samples identify source positions, not exact
  operation timings. Live run still times out at 959040 total steps with 16 scripts
  executed and cleanup zero. Profile artifacts removed; source/build unchanged.
  Next accounting candidate must reduce repeated graph-wide work, rather than
  treating one metadata lookup or one ancestry cache as sufficient.
- Isolated 240 s baseline diagnostic also times out in Vue: HTTP 200, 16 preceding
  scripts pass, 1055341 total steps / 840306 Vue delta / 934886 peak units, cleanup
  data zero and no meeting joined. The 30 s baseline reaches 959469 total steps;
  execution advances, but four minutes still does not establish initialization.
  Only the ephemeral owner's timer and existing 300 s navigation selection were
  extended; memory/step limits and production code are unchanged, harness removed.
  Stop extending timers as a proposed fix. Investigate an accounting algorithm
  change that preserves full primary reconciliation and observable foreign metadata.
- Scope epoch caching is rejected and reverted. Eight new and 113 existing SDK
  checks, scoped core/new-test compilation and the actual native retention/limit/
  cleanup probe pass. The uninstrumented candidate still times out at 954120 total
  Vue steps versus 959469 in the restored serial baseline; startup CPU is 20.0 s
  versus 16.6 s. Both execute 16 scripts and close at accounted data zero. A separate
  census confirms 23.06 million fast
  hits among 30.30 million Scope reads, zero module/untracked declines and 7.02
  million other declines; these instrumented counts are not a speed comparison.
  Exact source/build restoration and baseline core compilation pass; candidate
  test/config/backups and counters are removed. No initialization or meeting join.
- Factory closure classification is rejected and reverted: eight new and 44
  existing SDK checks, scoped core/new-test compilation and the actual native
  class retention/limit/cleanup probe pass, but serial 30 s Vue reaches 957785
  versus 957965 baseline steps; both timeout and close at zero, matching the earlier
  duplicate-entry experiment. Proxy/dynamic source retention and foreign weak/
  resource metadata observations are preserved. Exact source/build restoration
  and baseline core compilation pass; temporary artifacts are removed.
  Separate V8 probe finds the 26733-byte visitor below the 61440-byte optimization
  limit, with visitor/measurement functions TurboFan-optimized at both checkpoints.
  Baseline Vue steps split into 588470 before interpretation and 154460 execution;
  bootstrap splits 120175 / 31581. Compare execution work as well as total steps
  in future experiments. No useful initialization improvement or meeting join.
- Chain-wide local capture projection is rejected and reverted. Twelve new and
  156 existing SDK checks pass, including GC, future bindings, shared writes, TDZ,
  recursion, classic scripts, held limits and snapshot preservation; scoped core/
  new-test compilation passes. Actual native probe retains 30249 units candidate
  versus 150282 baseline, returns 7, clears to 29996, rejects excessive data and
  closes at zero. Serial 30 s Vue reaches 955895 versus 959469 baseline steps;
  both timeout, with startup CPU 18.1 versus 16.8 s and cleanup zero. No useful
  initialization improvement. Exact source/build restoration and baseline core
  compilation pass; all candidate helpers/tests/config/probe artifacts are removed.
  Census identifies interpreted functions as 80% of post-bootstrap closure visits
  and repeated identities as 45% of entries, but smaller escaped captures alone
  have not improved active primary reconciliation. No initialization/join acceptance.
- Opt-in fixed Scope metadata/snapshot sharing is rejected and reverted. Serial
  30 s Vue runs reach 959687 candidate versus 959469 baseline steps (less than
  0.03% difference); both execute 16 preceding scripts, timeout and close at zero.
  Candidate checks: 232 manifest-listed native checks, 13 new SDK checks including
  deleted-private-name GC, native build/format and scoped SDK compilation pass.
  Broader SDK checks reproduce the existing empty-child root-identity failure;
  no full-suite pass is claimed. Actual native class retention/limit/cleanup probe
  matches baseline. Experiment source/build changes are restored exactly; restored
  native build and scoped SDK compilation pass. No initialization/join acceptance.
- Private-table ownership alone is rejected and reverted. Eleven new and 240
  existing SDK checks pass, including explicit GC, class/snapshot/held-memory
  preservation; scoped core/new-test compilation and new-file formatting pass.
  Actual native class adapter matches baseline: return 60000, retain 90289 /
  peak 270300 / clear 29985 from 29965, reject excessive data at 400000 and close
  at zero. Serial 30 s Vue reaches 958575 candidate versus 958329 baseline steps;
  first-script CPU is 16.5 s for both, with 16 scripts executed, Vue timeouts and
  cleanup zero. Follow-up confirms all 2.63 million startup / 1.56 million Vue
  table reads use the owned fast path; live realms reuse scopes directly, so
  snapshot restoration is not the cause of the absent gain. Source/build baseline
  is restored exactly; candidate/probe artifacts are removed. Further sharing
  needs cheaper guarantees for Scope metadata, not private-table reads alone.
  No initialization, join or media acceptance.
- Temporary scope-snapshot census rules out weak snapshot lifetime as the main
  target: startup has 11.51 million scope reads / 7.28 million cache hits / 38
  cleared weak snapshots; 60 s Vue has 28.10 million reads / 24.56 million hits /
  238 cleared snapshots. All 4.22 million startup / 3.53 million Vue metadata
  declines are private-name scopes, with zero module/resource/import/with declines.
  Existing snapshots already cover most reads; owned private tables above do not
  change scope snapshot eligibility. Fourteen preservation checks and scoped core
  compilation pass. Counters are instrumentation, not a speed comparison; Vue
  still times out, and the source/build counters are reverted.
- Zoom initialization diagnostic now enables existing policy-aware HTML/network
  modules and logs every script's start/result, URL path and execution-step delta;
  URL credentials, queries and fragments are omitted. TypeScript/build and formatter
  checks pass, along with 176 manifest-listed native module checks. Actual SafeJS
  in-memory probe executes imported and inline modules, skips nomodule/duplicate
  entries, performs two fetches and closes at data zero. Live module-enabled route
  returns HTTP 200; all 16 pre-Vue scripts pass, then Vue times out at 30.8 s /
  951257 total steps / 878318 peak units. Module-not-supported issues disappear;
  deferred modules remain unexecuted after the halt. Cleanup data is zero. Vue
  initialization remains the next blocker; no readiness, join or media acceptance.
- Guarded per-measurement scope-read sharing is rejected and reverted. Seventeen
  new SDK checks and 27 existing focused checks pass; broader coverage passes 124
  checks across 15 files, including seven initially skipped GC checks rerun with
  explicit worker GC. Scoped core/new-test compilation and new-file formatting pass.
  Guards preserve callback/proxy mutations, getter counts, reentry, primitive
  multiplicity, snapshot recovery and held primary limits. Actual native outcomes
  match baseline: return 60007 / retain 90274 / peak 150274 / clear 29974, reject
  excessive data at 200000 and close at zero. Serial live 30 s Vue reaches 950330
  candidate versus 959687 baseline steps; both time out with 16 scripts executed
  and cleanup zero. First-script CPU regresses to 25.1 s versus 16.3 s. Exact
  baseline source/build restoration and core compilation pass; cache source/tests,
  configs/probes/backups are removed. Further sharing needs cheaper guarantees for
  interpreter-owned metadata while retaining observable foreign metadata fallback;
  the current guards cost more than the scope reads they avoid. No join/media acceptance.
- Temporary effect-barrier probe estimates 15.34 million potentially reusable
  reads among 21.01 million interpreted closure captures (73.0%) across initialization
  plus 30 s Vue. Barriers surround unknown callbacks/untracked objects, reset between
  top-level roots and reject accessor/custom scope metadata. Existing owned empty
  module environments must remain eligible; excluding them incorrectly rejected all
  live scopes. Four SDK sanity cases preserve callback/proxy mutations, six private
  getter reads and exception restoration. Native return 12 / retained 30113 / peak
  30292 / cleanup zero matches the restored baseline. Source is unchanged and all
  instrumentation/probes/backups are removed. This is an availability estimate,
  not a cache safety or speed proof. The guarded follow-up above passes preservation
  checks but regresses live initialization. Vue still times out; no join/media acceptance.
- Temporary live declaration/read/sharing counters identify repeated capture reads
  as the next target. Across initialization plus 30 s Vue, 22.71 million interpreted
  closure captures include 19.16 million (84.4%) rereads of the same Scope within
  one measurement, with zero reads outside measurement and zero generator exclusions.
  478 declarations / 1128 expressions are created; 103 / 306 are observed through
  binding or interpreter property reads and 46 / 242 invoked. 7.68 million declaration
  and 9.80 million expression captures precede either observation or invocation;
  expressions already expose a value on creation, so these counts do not authorize
  lazy instantiation. Native sanity covers export, call and construction (return 12,
  peak 30392, cleanup zero), including exact baseline restoration. Instrumentation
  in four builds and all probes/backups are removed; source is unchanged. Investigate
  sharing trusted scope reads within each measurement while preserving same-walk
  mutations, metadata/iterator effects, depth and held primary limits. These numeric
  probes are not speed comparisons; Vue still times out and no meeting is joined.
- Guarded private-name scope snapshot caching is rejected and reverted. The
  candidate passes 195 focused SDK checks across 21 files (10 new), scoped
  core/new-test compilation and new-test formatting. Nine preservation checks
  pass on the exact baseline; only whole-frame cache reuse fails there. Actual
  native adapter outcomes match: return 60007, retain 90274 units / peak 150274,
  clear to 29974, reject excessive data at 200000 and close at zero. Serial live
  30 s Vue reaches 957082 candidate versus 956381 baseline steps; both time out
  with 16 scripts executed and cleanup zero. First-script CPU is 18.3 s versus
  17.2 s; competing builds limit timing conclusions. No useful initialization
  gain established. Exact baseline source/build restoration and scoped core
  compilation pass; experiment tests/configs/probes/backups are removed. The
  declaration/sharing follow-up above guides the next target. Lazy instantiation
  still needs identity, ownership, snapshot and memory-accounting guarantees.
  No initialization/join/media acceptance.
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
  runs are not speed comparisons. The guarded private-name snapshot follow-up above
  preserves membership/read ordering but also fails to establish a useful live gain.
  Exact source/build restoration
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
  Iframe navigation, srcdoc/policy contexts and child script realms remain unsupported.
  Diagnostics block optional file-paa.zoom.us and cdn.cookielaw.org origins;
  production actor/default 128 MB heap, meeting sockets, media and transcription
  acceptance remain unverified. Invitation landing reports unsupported OS; an
  alternate duplicate script path exhausted the 192 MB heap.
- Earlier native extension-page probe reports absent RTCPeerConnection,
  AudioContext, MediaRecorder, navigator.mediaDevices/getUserMedia, Worker,
  WebAssembly and canvas getContext; cleanup data zero. The bounded canvas 2D
  subset above now passes its own adapter probe; full canvas rendering remains open.
  The working recorder uses
  media-device capture and AudioWorklet processing; native PCM chunk handling is
  not a Zoom audio source. Media transport/rendering APIs need implementation,
  separately from initialization performance and later live acceptance.
- Default-stack dataDepth for direct symbol descendants, closure property
  paths and other untested graph edges; deep-copy host ingress/result export and
  deep plain-object copying also overflow the native stack on baseline. Older
  scope-root shape expectations and a
  baseline Promise snapshot timeout. Tested capture/prototype fixes do not clear this gate.
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
