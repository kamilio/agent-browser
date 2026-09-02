# Foundation evidence — September 1, 2026

These files record **foundation and partial-frontend probes**, not general browser compatibility.
Checking a marker in downloaded HTML does not prove parsing, page JavaScript,
element actions, rendering, terminal browsing or playground operation.

- `routing-focused-2026-09-02.json`: 263 passes across thirteen files, including
  bounded glob matching/oracle cases, atomic limits, copies/cleanup, actual HTML
  and stylesheet replacement, named-session commands, attribution and safe
  handling of automatic redirects while routes are active.
- `routing-safejs-fixture-2026-09-02.json`: twenty checks pass; existing-core interpreted
  fetch reads routed JSON and updates the DOM, checks CORS, follows a manual
  redirect into a route and restores ordinary transport after removal. In-memory
  transport only; not a published-SDK, live-site or separate-CLI acceptance gate.

- `callback-phases-safejs-fixture-2026-09-02.json`: eight passing checks against
  the existing experimental public SafeJS core. Separates synchronous effects
  from pending/failing async tails, checks progress of another listener and owner
  cleanup. Supports the consumer contract in poe-code #547; not an independent
  test of the published extension API, DOM conformance or a live site/terminal.

- `cors-journal-focused-2026-09-02.json`: 228 passes across twelve files. Adds
  per-hop CORS outcomes separate from HTTP completion, preflight/actual/redirect
  cases, cancellation, observer failures, bounded late annotations, trusted
  context wiring and playground text. Strict package/changed-test builds pass.
- `cors-journal-safejs-fixture-2026-09-02.json`: sixteen passing checks with the
  existing experimental SafeJS core and an in-memory transport. Interpreted
  cross-origin fetch updates the DOM; the session distinguishes allowed and
  rejected CORS checks even for successful HTTP statuses. No published-SDK,
  public-site, server, PTY or visual UI acceptance is claimed.

- `page-cors-focused-2026-09-02.json`: 215 passes across eleven files, including
  safelists, CORS permissions, credential/header wildcards, preflights, redirect
  tainting and cancellation with mock transports. Strict builds pass; Biome 168 files.
- `page-cors-safejs-fixture-2026-09-02.json`: fifteen real-SafeJS mock-origin checks;
  cross-origin PUT/preflight/JSON changes the live DOM, denied preflight sends no
  DELETE, and pending requests clean up. No new live network/server/process/UI gate.

- `page-fetch-focused-2026-09-02.json`: 198 passes across ten files. Request/body/
  header/redirect/retention/timeout behavior, document-port ownership, CSP,
  capability metadata and loader/command/playground regressions use fake transports.
  Strict package/changed-test builds pass; Biome checks 166 files.
- `page-fetch-safejs-fixture-2026-09-02.json`: ten passing real-SafeJS checks with
  parsed HTML, external script, fetch Promise/JSON callbacks and live DOM updates.
  Pending mocked requests cancel without adapter cooperation. No server, actual
  network request, child process, PTY or visual UI run; live gates stay unverified.

- `network-journal-focused-2026-09-02.json`: 130 passes across six files, covering
  bounded/redacted metadata, redirects, cancellation, tab/navigation ownership,
  failed/no-content attempts, actual HTML-loader stylesheet callbacks with a fake
  transport, CLI/detail reads and playground formatter/mock actor forwarding.
  Strict package and changed-test compilation pass; Biome checks 163 files.
  No new public-site, server, process, PTY or visual UI acceptance is claimed.

- `extraction-focused-2026-09-02.json`: 95 passes across five files, including
  14 extraction cases and command/parser/snapshot/process-host regressions.
  Strict package and changed-test compilation pass; Biome checks 161 files.
- `extraction-safejs-fixture-2026-09-02.json`: seven passing checks against the
  selected real SafeJS core in memory. Script-created HTML, native-action callback
  changes, stable refs, field exclusion and repeated non-replaying reads pass.
  No HTTP server, PTY, child process or public request is used; the denied live
  terminal/site gate remains unverified.
- `extraction-bun-fixture-2026-09-02.json`: two public-core Markdown/JSON fixture
  checks pass on the recorded Bun version. Not whole-browser or SafeJS portability.

- `terminal-reading-focused-2026-09-02.json`: 80 passes across four files, including
  27 terminal cases. Ten new cases exercise wrapping, lossless scrolling, search,
  stable refs, protected values and resize/refresh anchors. Strict package and
  changed-test builds pass; Biome checks 158 files.
- `terminal-reading-resources-2026-09-02.json`: three synthetic million-code-unit
  projection cases at 1/80 columns. All bounded-frame, readable-tail and search
  checks pass. This is not real TTY/site acceptance, engine throughput or peak
  memory measurement. The real PTY/public-site gate remains denied and unverified.

- `terminal-focused-2026-09-02.json`: 70 passing tests across four files, including
  17 terminal view/attachment cases, CLI parsing and shared command-host checks.
  The separate API/server suite passes 19 cases, including external client abort.
  Strict package/changed-test compilation and Biome's 157-file check pass.
  The actual PTY/site probe was denied before execution; there is no passing
  real-terminal report. See `TERMINAL.md` for the permission and cleanup boundary.

- `unit-node-2026-09-02-cooperation-verified.json`: 1128 browser passes/65 files;
  `cooperation-events-focused-2026-09-02.json`: 70 event/script passes. Strict
  builds and Biome's 152-file check pass. The earlier cooperation unit report
  has 1126 passes and predates the native event-ownership fix.
- `safejs-cooperation-verified-focused-2026-09-02.json`: 73 focused passes.
  `safejs-cooperation-final-verified-2026-09-02.json`: 8104 passes, 30 failed
  assertions, 54 failed files, six skips. `safejs-cooperation-baseline-comparison-2026-09-02.json`
  confirms exact failure identity parity with the Date checkpoint. Intermediate
  focused/full reports with 72/8103 passes predate the final Promise-job regression.
- `cooperation-initial-process-sites-2026-09-02.json`: 42 initial checks, including
  successful public navigation with timed-out scripts. `cooperation-process-sites-2026-09-02.json`
  preserves a later failed native-link recovery probe. The verified replacement
  `cooperation-verified-process-sites-2026-09-02.json` passes all 46 checks: 42 local,
  two public reporting and two public static-text readability checks. Books/Quotes
  navigate in 1551/1479 ms, but both scripts time out. Not dynamic-site acceptance.
- `cooperation-verified-timers-2026-09-02.json` and
  `cooperation-verified-cli-2026-09-02.json`: 17/22 passing checks. Commands finish;
  no visual playground validation is inferred from the API/CLI checks.
- `safejs-cooperation-retention-cost-2026-09-02.json`: 0/10/30 host objects take
  16/35/59 ms, 652 steps, zero getters; host timers progress in every evaluation.
  `site-script-errors-cooperation-initial-2026-09-02.json` records now-effective
  default source timeouts, not resolution of the earlier intrinsic gaps.

The following Date and retention reports are earlier checkpoints:

- `unit-node-2026-09-02-date.json`: 1126 browser passes across 65 files. Strict
  package/core/new-test builds and the 152-file Biome check pass.
- `safejs-date-focused-2026-09-02.json`: 22 new Date cases plus 28 random-replay
  and 21 JSON cases pass (71 total). `safejs-date-boundaries-2026-09-02.json`
  passes 22 Date plus 34 regex/legacy-checkpoint cases (56 total).
- `safejs-date-final-verified-2026-09-02.json`: 8089 passes, 30 failed assertions,
  six skips, 54 failed files. `safejs-date-verified-baseline-comparison-2026-09-02.json`
  confirms exact failure identity parity with the preceding 8067-pass candidate.
  No green upstream SDK release is claimed.
- `safejs-date-final-2026-09-02.json` and `safejs-date-baseline-comparison-2026-09-02.json`
  preserve the intermediate 8088-pass result with one additional failure: the
  legacy checkpoint expected globals before Date existed. The final expectation
  adds only Date's default binding; source hashes and graph comparisons remain.
  The still earlier obsolete suite encountered a now-fixed snapshot rejection;
  its log is `/tmp/safejs-date-initial-full.log`, not a final JSON result. Its
  termination request was denied; it is not claimed stopped.
- `date-process-sites-2026-09-02.json`: forty local fixture checks pass, including
  automatic Date clock/calendar/JSON use and a native click that updates a retained
  date and the semantic document. Both public navigations fail the unchanged
  heartbeat at 2010/2011 ms. There are no passing public compatibility checks.
- `site-script-errors-date-2026-09-02.json`: separate bounded diagnostics reach
  String.replace argument coercion at Books offset 35950 (3301 ms) and missing
  Object.defineProperty at Quotes offset 30470 (8531 ms). Date is no longer their
  immediate script error. Exact unchanged source hashes are retained. Initial
  Date diagnostic/process reports preserve earlier attempts separately.
- `date-timers-2026-09-02.json` and `date-cli-2026-09-02.json`: 17 timer and 22
  CLI/paired-API checks pass; controlled public-document evaluations are not
  automatic-site acceptance. Owned probe actors/services close. No upstream
  performance report or alternate publication is made.

- `unit-node-2026-09-02-retention.json`: 1126 browser passes across 65 files;
  strict package build and configured 152-file Biome check also pass.
- `safejs-retention-focused-2026-09-02.json`: 25 passes, comprising 17 new
  retained-shape/capture regressions and eight compile-handoff cases (two new).
  Targeted strict core/test compilation passes.
- `safejs-retention-escape-final-2026-09-02.json`: 8067 SDK passes, 30 failed
  assertions, six skips and 54 failed files. The retention baseline-comparison
  report verifies identical failure identities to the previous 8048-pass run.
  `safejs-retention-final-2026-09-02.json` is the intermediate 8065-pass candidate,
  before the two compile-escape-scan regressions; it is not the final artifact.
- `site-script-errors-retained-shapes-2026-09-02.json`,
  `site-script-errors-retention-final-2026-09-02.json` and
  `site-script-errors-retention-escape-2026-09-02.json`: intermediate/final bounded
  diagnostic runs reach the same Date blockers. Books evaluation takes
  5936/3424/4048 ms respectively, compared with the previous 8926 ms. Single-run
  variability does not establish throughput superiority between the candidates.
- `retention-escape-process-sites-2026-09-02.json`: 38 local fixture checks and
  one public reporting check pass. Books still fails the unchanged production
  heartbeat at 2009 ms. Quotes navigation succeeds but automatic scripts fail.
  Earlier `retained-shapes-process-sites` and `retention-process-sites` reports
  preserve the intermediate failed navigation attempts.
- `safejs-retention-escape-cost-2026-09-02.json`: final no-DOM benchmark takes
  15/30/63 ms with 0/10/30 unused host objects; answers are correct, steps remain
  652, getters never run and timers do not progress during evaluation. The
  `safejs-retention-shapes-cost` and `safejs-retention-fixed-shapes-cost` reports
  retain intermediate measurements. No accounting checks are disabled.
- `retention-timers-2026-09-02.json`: 15 local automatic timer fixture checks pass.
  `retention-timers-sites-2026-09-02.json` adds two controlled public-document
  timer checks, for 17 passes; these are not unmodified-site script acceptance.
  `retention-cli-2026-09-02.json`: 22 executable CLI/paired-API checks pass,
  including controlled public-document evaluations, not automatic-site acceptance.
  The detailed performance evidence remains local pending publication approval.

- `unit-node-2026-09-02-attributes.json`: 1126 browser tests pass across 65 files,
  including four new document-attribute and seven script-map tests. Strict
  package/new-test compilation passes. The configured final Biome check covers
  152 source/script files, including the new retention diagnostic.
- `safejs-named-host-focused-2026-09-02.json`: nineteen named-capability and
  seventeen indexed-capability tests pass, including rejected async key promises
  without unhandled host rejection, hostile key arrays, liveness and revocation.
- `safejs-named-host-final-2026-09-02.json`: native-config full SDK result,
  8048 passes, 30 failed assertions, six skips and 54 failed files.
  `safejs-named-host-baseline-comparison-2026-09-02.json` verifies identical failed
  assertions/files to the prior 8029-pass result. No green SDK release is claimed.
- `attributes-process-sites-2026-09-02.json`: 38 local automatic-script fixture
  checks plus one Quotes reporting check pass. Books navigation repeatedly fails
  the unchanged heartbeat, measured at 2009 ms in the final classified probe.
  `attributes-process-sites-initial-2026-09-02.json` preserves the initial timeout.
  These results are not forty passing checks or successful Books navigation.
- `attributes-timers-2026-09-02.json` and `attributes-cli-2026-09-02.json`: 17 timer
  and 22 executable CLI/paired-API checks pass; probe actors/services close.
  Controlled public-document evaluations are not automatic-site or visual UI gates.
- `site-script-errors-attributes-2026-09-02.json`: separate bounded diagnostics
  reach Date at offsets 35484 (Books, +new Date) and 3900 (Quotes, Date.now).
  Per-source timing shows 8926 ms for Books' jQuery and 97 ms for Quotes in this
  run. This process is not the permission-restricted production actor.
- `site-script-errors-attributes-profile-2026-09-02.json` and
  `safejs-retention-profile-summary-2026-09-02.json`: public diagnostic CPU-profile
  evidence, with 6181/9165 self-samples in retained-data traversal. The complete
  profile remains a local temporary artifact, not an upstream issue attachment.
- `safejs-retention-cost-2026-09-02.json`: identical correct arithmetic with
  0/10/30 unused host objects takes 14/58/113 ms at the same 652 reported guest
  steps and zero getter calls. Timings are observations, not unit-test thresholds.
  The initial report is retained separately: its harness incorrectly expected a
  multi-statement program return; the final probe reads total in a second eval.
  Detailed public issue publication was denied, and the report stays local.

- `unit-node-2026-09-02-inline-styles.json`: 1115 browser tests pass across
  63 files, including 28 new inline-style tests. Strict package/new-test
  compilation and the configured 148-file Biome check pass separately.
- `cssom-native-oracle-2026-09-02.json` and
  `cssom-native-cases-2026-09-02.json`: actual reference-browser snapshot and
  thirteen extracted declaration cases used as exact test anchors. The native
  browser is only a reference, not the new engine. The ephemeral session and
  owned fixture server closed; the session list confirmed cleanup.
- `inline-styles-process-sites-2026-09-02.json`: 35 automatic owned-process
  fixture assertions plus two public reporting checks pass. Real scripts use
  style identity, reflection, priorities, shorthand/index access and iteration;
  native click updates the real attribute/cascade and reveals semantic content.
  Both public sites remain partial/failed automatic JavaScript acceptance.
- `inline-styles-timers-2026-09-02.json` and
  `inline-styles-cli-2026-09-02.json`: 17 timer and 22 executable CLI/paired-API
  regression assertions. Controlled injected evaluations on public documents
  are not unmodified dynamic-site compatibility. No new visual UI check is
  claimed; probe-owned actors and the isolated foreground CLI service close.
- `site-script-errors-inline-styles-2026-09-02.json`: Books passes the prior
  style.cssText failure and now needs DOM attribute objects at offset 12095.
  Quotes still fails at Date.now, offset 3900. Bounded contexts/source hashes
  are retained without complete public page bodies or credentials. The SafeJS
  candidate is unchanged from the preceding indexed-host checkpoint.

- `unit-node-2026-09-02-collections.json`: 1087 browser tests pass across 62 files,
  including 12 new collection cases. Strict package/new-test compilation and the
  configured 145-file Biome check pass separately.
- `collections-process-sites-2026-09-02.json`: 32 automatic owned-process fixture
  checks plus two public reporting checks pass. Saved tag/class/children collections
  refresh after DOM mutation, preserve native node identity through iteration and
  Array.from, and react to a real native button action. Both public sites still
  fail automatic JavaScript compatibility.
- `collections-timers-2026-09-02.json` and `collections-cli-2026-09-02.json`:
  final rebuilt public-core regressions pass 17 timer and 22 executable CLI/paired
  API checks. Controlled public-document mutations are not unmodified dynamic-site
  acceptance. Probe-owned actors and the isolated CLI service close.
- `site-script-errors-collections-2026-09-02.json`: Books advances past collection
  querying to missing element.style.cssText; Quotes still needs Date.now. Source
  hashes and bounded failure contexts are retained, not complete public page bodies.
- `safejs-indexed-host-focused-2026-09-02.json`: 561 passes across five files,
  including 17 new indexed-capability tests and existing host/object/interpreter
  regressions. New tests cover virtual keys, identity, mutations during iteration
  and spread, declaration limits, async rejection, copying and revocation.
- `safejs-indexed-host-final-2026-09-02.json`: final native-config SDK run,
  8029 passes, 30 failures, six skips and 54 failed files.
  `safejs-indexed-host-baseline-comparison-2026-09-02.json` verifies identical failed
  assertions/file paths versus the 8012-pass candidate: 17 additional passes, not
  a green upstream release gate. Changed source/new tests compile strictly.
- `safejs-indexed-host-full-2026-09-02.json`: earlier 8028-pass native-config run,
  before the additional mutation-during-spread regression and fix. It is retained
  but superseded by the final run.

- `unit-node-2026-09-02-object-prototype.json`: 1075 browser tests pass across
  61 files. Strict package compilation and the configured 143-file Biome check
  pass separately; no visual UI change or new screenshot is claimed.
- `object-prototype-process-sites-2026-09-02.json`: 28 automatic owned-process
  fixture checks plus two public reporting checks pass. Cached type inspection,
  ordinary/null prototype reflection and native actions use the rebuilt public
  SafeJS core. Both public sites still fail automatic script compatibility.
- `object-prototype-timers-2026-09-02.json` and
  `object-prototype-cli-2026-09-02.json`: final compiled-core regressions pass
  17 timer and 22 executable CLI/paired API checks. Controlled public-document
  evaluation is not unmodified dynamic-site acceptance. Owned actors and the
  isolated CLI service close.
- `site-script-errors-object-prototype-2026-09-02.json`: unmodified Books jQuery
  advances to missing DOM getElementsByTagName; Quotes still fails at Date.now.
  Source hashes and bounded failure locations are retained, not whole page bodies.
- `safejs-object-prototype-focused-2026-09-02.json`: 248 tests pass in seven files,
  including 33 new Object cases, 14 native tag comparisons, constructor source
  replay and historical regex checkpoint compatibility. Object's diagnostic dump
  binding intentionally changes from namespace to constructor; other checkpoint
  graph/hash assertions are retained.
- `safejs-object-prototype-final-2026-09-02.json`: final native-config SDK run,
  8012 passes, 30 failures, six skips and 54 failed files.
  `safejs-object-prototype-baseline-comparison-2026-09-02.json` verifies identical
  failing assertions and file paths versus the 7979-pass checkpoint. Thirty-three
  additional passes do not make the upstream release gate green. Changed production
  paths and the new dedicated test file also compile strictly with existing tools.
- `safejs-object-prototype-initial-2026-09-02.json` and
  `safejs-object-prototype-full-2026-09-02.json`: intermediate failures are retained.
  They caught missing private-field hiding/literal prototype support, old internal
  Object namespace adapters, the intentional dump-binding change and an overly
  broad dump guard. The final guard rejects unsupported Object intrinsic state
  without blocking existing constructor source replay. Neither is final acceptance.

- `unit-node-2026-09-02-function-objects.json`: 1075 browser tests across 61 files
  pass against the function-object checkpoint; strict package compilation and
  the 143-file Biome check also pass.
- `function-objects-process-sites-2026-09-02.json`: 27 automatic owned-process
  fixture checks plus two public reporting checks pass. New fixtures exercise
  guest function statics, constructor inheritance, instanceof and a native click
  invoking an inherited guest method. Both public sites still fail compatibility.
- `function-objects-timers-2026-09-02.json` and
  `function-objects-cli-2026-09-02.json`: the final rebuilt public core passes
  17 timer and 22 executable CLI/paired API checks. Controlled public-document
  mutations are not unmodified dynamic-site acceptance. Owned processes close.
- `site-script-errors-function-objects-2026-09-02.json`: refreshed real-script
  diagnostics locate missing Object prototype inspection in Books and missing
  Date in Quotes. `safejs-intrinsic-reproductions-2026-09-02.json` records minimal
  public-core failures used for upstream issues #543/#544.
- `safejs-function-objects-focused-2026-09-02.json`: 538 tests pass in five files,
  including 21 new function-object tests. A separate restoration run passes 69
  tests, including one new restored-constructor regression.
- `safejs-function-objects-full-2026-09-02.json`: native SDK configuration,
  7979 passes, 30 failures, six skips and 54 failed files.
  `safejs-function-objects-baseline-comparison-2026-09-02.json` verifies identical
  failing assertions/files versus the prior 7957-pass run: 22 additional passes.
  This is not a green upstream release gate.
- `safejs-function-restore-type-baseline-2026-09-02.json`: original and modified
  legacy restoration-test sources produce the same 29 strict diagnostics using
  an in-memory source override. Changed production paths and the new dedicated
  function-object suite compile strictly; full legacy-test typing is not green.
- `safejs-function-objects-initial-2026-09-02.json`: retained initial run catches
  an obsolete assertion that guest constructors have no prototype support. The
  assertion is updated to verify the new behavior before the final full run.

- `unit-node-2026-09-02-timers.json`: 1075 browser tests pass across 61 files,
  including timer bounds, prefix ordering, cancellation and argument cleanup.
  Strict package/changed-test compilation and the 143-file Biome check pass.
- `timers-process-sites-2026-09-02.json`: 15 actual owned-process automatic timer
  fixture checks and two controlled public-document timer checks pass. Identity,
  DOM mutation, async intervals and explicit resource-limit diagnostics are tested.
  Books' full text is truncated; its appended marker is verified by a scoped
  semantic snapshot, not by increasing or ignoring output bounds.
- `timers-cli-sites-2026-09-02.json`: 22 executable CLI/paired-API checks pass,
  including awaited timer mutation and subsequent separate CLI inspection on
  Example Domain and Books to Scrape. Owned service/process cleanup completes.
- `timers-website-regression-2026-09-02.json`: 25 automatic fixture checks plus two
  public reporting checks pass. Books and Quotes still fail automatic JavaScript
  compatibility. The reporting assertions are not passing dynamic-site acceptance.
- `safejs-guest-references-focused-2026-09-02.json`: 66 reference/realm/host-object/
  callback tests pass across four files, including 11 new reference tests.
- `safejs-guest-references-native-config-2026-09-02.json`: native-config full SDK
  run passes 7957 tests, with 30 fixture/type failures, six skips and 54 failed files.
  `safejs-guest-reference-regression-comparison-2026-09-02.json` proves that the
  failed assertion/file sets match the preceding candidate exactly. Not green.
- `safejs-guest-references-full-2026-09-02.json` and
  `safejs-guest-references-package-2026-09-02.json` retain intermediate runs using
  the browser test configuration; their scope/aliases differ from the SDK's native
  configuration. The first also caught an outdated public-export assertion, fixed
  before the final full run. Do not substitute either for upstream acceptance.
- `timers-process-sites-initial-2026-09-02.json`,
  `timers-process-sites-fulltext-2026-09-02.json` and
  `timers-process-sites-scope-initial-2026-09-02.json` retain failed initial probes:
  unsupported DOM helper/timeout, bounded whole-document text expectation, and an
  invalid target argument to `text`. The final probe uses supported DOM operations
  and scoped `snapshot --observe`, retaining the real identity/mutation assertions.
- `unit-node-2026-09-02-timers-sandbox.json` records the denied loopback/process
  run; `unit-node-2026-09-02-timers-fixture-contract.json` records lifecycle fixtures
  missing the newly required public exports. Corrected fixtures and the real SDK
  probes both pass afterward. No synthetic fixture is counted as real JavaScript.

- `unit-node-2026-09-02-console.json`: 1059 browser tests pass across 60 files,
  including console bounds, lifecycle, failure diagnostics and filtering.
  Strict package/test compilation and the configured 140-file Biome check pass.
- `console-cli-sites-2026-09-02.json`: 20 actual executable CLI/paired-API checks
  pass, including console retrieval after controlled evaluation on public pages.
- `console-process-sites-2026-09-02.json`: 25 owned-process fixture checks plus
  two public reporting checks pass. Both public sites still fail automatic
  JavaScript compatibility; reporting assertions are not dynamic-site acceptance.
- `console-playground-ui-2026-09-02.json`: 21 actual observer UI checks pass,
  including HTML inspection, shared console messages, filters and inert markup.
  The screenshot was visually inspected; owned session/service cleanup completed.
  Actual HTML download transfer remains unverified because the observer service
  prohibits downloads. No policy bypass or PNG/PDF support is claimed.
- `console-playground-ui-initial-2026-09-02.json`: retained failed HTML assertion
  expected an attribute-free root tag. The corrected probe accepts root attributes
  while still checking the HTML pane, root/closing tags and actual page content.

- `unit-node-2026-09-02-innerhtml.json`: 1046 browser tests pass across 59 files,
  including contextual fragments, aggregate replacement budgets, escaped-output
  limits, the actual CLI HTML command, BOM/comments and colgroup whitespace.
- `innerhtml-process-sites-2026-09-02.json`: 21 owned-process fixture checks and
  two public reporting checks pass. Actual page scripts create controls through
  innerHTML; native actions mutate them, and HTML extraction reads that live tree.
  Inserted scripts stay inert. Both public sites still fail automatic JavaScript
  compatibility, not reclassified as passing sites.
- `innerhtml-cli-sites-2026-09-02.json`: 18 actual executable CLI/paired-API checks
  pass, including HTML extraction after controlled local DOM edits on Example
  Domain and Books to Scrape. It also retains process isolation, timeout and
  cleanup checks. Manual evaluation is not automatic website compatibility.

- `unit-node-2026-09-01-fragments.json`: 1004 browser tests pass across 57 files,
  including fragment transfer, clone isolation/budgets, hierarchy and detached
  control regressions. The 150,000-child trusted-model stress test is not a
  default browser limit or a browser-performance measurement.
- `fragments-process-sites-2026-09-01.json`: eighteen owned-process fixture and
  two public reporting checks pass. Real page scripts create/query/clone/insert
  fragments; native CLI clicks verify separate listeners on original and cloned
  controls. Both public sites still fail dynamic-script compatibility. See
  `DOM-FRAGMENTS.md` for incomplete cloning semantics and HTML fragment parsing.

- `unit-node-2026-09-01-document-write.json`: 983 browser tests pass across 56
  files after parser-integrated writes and prepared written-script ordering fixes.
- `document-write-process-sites-2026-09-01.json`: fourteen owned-process fixture
  checks and two public reporting checks pass; the latter are not dynamic-site
  acceptance. Nested inline and post-parse refusal are exercised explicitly.
- `site-script-errors-document-write-2026-09-01.json`: Books now executes its
  inline fallback and loads the real written jQuery resource; it then stops at
  the same guest function-property/prototype limitation as Quotes. Neither site
  passes dynamic-script compatibility. See `DOCUMENT-WRITE.md` for boundaries.

- `safejs-regex-assertions-2026-09-01.json`: all 190 regex-directory tests pass,
  including 31 backreference and 35 lookahead cases. Two formerly unsupported
  feature assertions were replaced; this is 64 net new source-suite tests.
- `safejs-regex-assertions-full-2026-09-01.json`: 7946 pass, 30 fail, six skip;
  the same 54 failed file paths as the preceding source-suite checkpoint.
- `safejs-backreferences-focused-2026-09-01.json`: earlier partial focused run,
  161 tests pass and one suite cannot load because yaml is unavailable. Not green.
- `site-script-errors-backreferences-2026-09-01.json`: unmodified real jQuery
  advances from unsupported backreferences to unsupported lookahead.
- `site-script-errors-lookahead-2026-09-01.json`: jQuery now parses and fails at
  guest function-property/prototype assignment. Books still lacks document.write.
- `safejs-upstream-reproductions-2026-09-01.json`: three minimal public run API
  function-property/prototype/instanceof failures, used in Poe Code issue #541.
  The v13.0.10-based local candidate was executed; newer main was inspected only.
- `website-scripts-sites-2026-09-01-regex-regression.json`: eleven actual
  owned-process HTTP-fixture and two public reporting assertions pass; neither
  public site passes dynamic-script compatibility.

- `unit-node-2026-09-01-site-parser-regression.json`: all 962 browser tests pass
  across 54 files after both SDK parser fixes and the diagnostic probe addition.

- `safejs-parser-site-regressions-2026-09-01.json`: 589 parser tests pass, one
  opt-in skip; includes 17 constructor and 20 statement-terminator regressions.
- `safejs-new-expression-2026-09-01.json`: 167 focused constructor/parser/public
  API tests pass before the statement-terminator fix.
- `safejs-site-parser-full-2026-09-01.json`: 7882 pass, 30 fail, six skip; the 54
  failed file paths are identical to the previous broad SDK run (including 52
  missing-dependency load failures). Not a green upstream release gate.
- `site-script-errors-initial-2026-09-01.json` and
  `site-script-errors-context-2026-09-01.json`: bounded genuine-site diagnostics;
  Books lacks document.write, Quotes' jQuery initially fails on `new Date`.
- `site-script-errors-new-expression-2026-09-01.json`: the same unmodified jQuery
  source advances to an unbraced do/while terminator error after the first fix.
- `site-script-errors-statement-terminators-2026-09-01.json`: after both parser
  fixes, jQuery now fails on unsupported numeric regex backreferences. Both sites
  remain failed compatibility cases. These disposable diagnostic processes are
  not production permission-restricted actors; short public source excerpts are
  intentionally retained, not full page bodies, credentials or native stacks.
- `website-scripts-sites-2026-09-01-parser-regression.json`: the production owned
  process path retains eleven fixture and two public reporting checks after the
  SDK fixes. Neither public website passes dynamic-script compatibility.

- `unit-node-2026-09-01-website-scripts.json`: latest browser regression suite
  after automatic classic-script integration and final lifecycle/URL fixes;
  962 tests pass across 54 files.
- `website-scripts-sites-2026-09-01.json`: eleven actual compiled-SDK HTTP-fixture
  assertions pass, plus two checks that real public-site script outcomes are
  reported. Both public sites remain failed script-compatibility cases, with zero
  successful script executions. These are not passing dynamic-site assertions.
- `process-cli-sites-2026-09-01-script-loading-regression.json`: sixteen actual
  manual-evaluation CLI/paired-API checks still pass with automatic scripts off.
- `unit-node-2026-09-01-process-cli.json`: latest browser suite, final router revision;
  52 files and 942 tests pass, including thirteen router lifecycle cases.
- `process-cli-focused-2026-09-01.json`: 43 CLI/process/server/router checks pass
  before the three final router ownership/barrier regressions were added.
- `process-cli-sites-2026-09-01.json`: sixteen actual-SDK checks pass through
  separate CLI invocations and the paired playground API on two public sites.
  `PROCESS-CLI.md` records shared DOM state, cancellation, isolated failure and
  complete owned-service cleanup. This is not a visual UI test.
- `cli-sites-node-2026-09-01-process-cli.json`: nineteen default-mode public CLI
  checks pass after process routing was added.
- `unit-node-2026-09-01-session-process.json`: latest browser suite at 22:23 UTC;
  51 files and 925 tests pass, including page ownership and process supervision.
- `session-process-focused-2026-09-01.json`: eight owned-session and nine existing
  script-process tests pass, including idle starvation and confirmed termination.
- `session-process-sites-2026-09-01.json`: eighteen actual compiled-SDK checks
  pass in real owned processes against two public sites, including shared live
  DOM/native actions and external termination of a deliberate guest loop.
  `PAGE-PROCESS.md` explains the retained initial probe failure and limitations.
- `safejs-page-core-focused-2026-09-01.json`: 58 focused interpreter tests pass,
  including two added lightweight-core result-copying checks.
- `safejs-page-core-full-2026-09-01.json`: 7845 pass, 30 fail and six skip;
  54 failed files including 52 missing-dependency load failures. This unchanged
  failure-file set is not a green upstream release gate.
- `unit-node-2026-09-01-native-actions.json`: browser Node suite at 22:00 UTC;
  49 files, 908 passed, including native controlled-action and stopped-history tests.
- `safejs-native-actions-fixture-2026-09-01.json`: nine actual compiled-core checks
  pass through native controls, focus, forms, keyboard, selection and label actions.
- `safejs-native-actions-sites-2026-09-01.json`: seventeen checks pass, including
  real parsed anchor clicks canceled or redirected to local fragments by guest code.
  No forms are sent and no website-authored scripts execute. The initial failing
  report is retained; `NATIVE-SCRIPT-ACTIONS.md` describes the history recovery fix.
- `cli-sites-node-2026-09-01-native-actions.json`: nineteen checks pass using actual
  CLI processes and a temporary owned service after the action migration.
- `unit-node-2026-09-01-script-events.json`: earlier browser Node suite at 21:45 UTC;
  48 files, 885 passed, including fifteen guest-event adapter tests.
- `safejs-dom-events-fixture-2026-09-01.json`: eighteen actual compiled-core checks
  pass, including guest add/removeEventListener and ordinary/async/fatal errors.
- `safejs-dom-events-sites-2026-09-01.json`: forty fixture/real-site checks pass;
  guest listeners mutate only local trees after two read-only public downloads.
  This is not website-authored script execution or a native default-action pipeline.
- `safejs-dom-events-fixture-initial-2026-09-01.json`: retained 50-second timeout
  with a large budget in a deliberate-loop fixture, not a passing check.
- `safejs-dom-events-budget-2026-09-01.json`: separate bounded synthetic callback
  budget/deadline measurements. `SCRIPT-EVENTS.md` records limits and interpretation.
- `unit-node-2026-09-01-callback-phases.json`: earlier browser Node suite at 21:28 UTC;
  47 files, 870 passed, including ten controlled async-dispatch tests.
- `safejs-callback-focused-2026-09-01.json`: 56 focused source tests pass.
- `safejs-callback-source-2026-09-01.json`: 7843 pass, 30 fail, six skip; 54 failed
  files, unchanged from the preceding broad run. Not a green upstream release.
- `safejs-script-callback-sites-2026-09-01.json`: 25 compiled-core checks pass,
  including callback phases on two read-only public downloads. Registration is a
  host fixture, not DOM addEventListener or website script loading. `CALLBACKS.md`
  records exact scope and remaining default-action/microtask/process gates.
- `unit-node-2026-09-01-script-dom.json`: earlier browser Node suite at 21:06 UTC;
  46 files, 860 passed. Includes new live-document binding and quota checks.
- `safejs-script-dom-2026-09-01.json`: seven actual compiled-SDK DOM checks pass.
- `safejs-script-dom-sites-2026-09-01.json`: thirteen checks pass, including six
  on real Example Domain and Books to Scrape loads. Explicit test scripts change
  only local DOM trees, not servers. Website-authored scripts are not executed.
  The initial sandbox network-error report is retained. See `SCRIPT-DOM.md`.
- `safejs-host-object-source-2026-09-01.json`: broad source-extension validation,
  including live capabilities and the ordinary `then` accessor regression. Known
  upstream test-tooling failures remain visible: 7828 tests pass, 30 fail, six skip,
  and 52 suites fail to load. The initial report is preserved. The separate
  `safejs-host-object-focused-2026-09-01.json` passes all 41 focused checks.
- `unit-node-2026-09-01-script-process.json`: earlier browser Node suite at 20:41
  UTC; 45 files, 853 passed. Adds actual owned-child and bounded-protocol checks.
- `safejs-process-2026-09-01.json`: six installed-SDK child-process assertions pass;
  the initial sandbox failure is retained separately. See `SCRIPT-PROCESS.md`.
- `safejs-realm-public-core-2026-09-01.json`: six checks pass against the compiled
  public core in the isolated, locally extended SafeJS source checkout. This is
  not the installed SDK and does not enable website scripts.
- `safejs-realm-source-2026-09-01.json`: full extended-source suite attempt; not
  green with the available shared tooling: 7809 pass, 30 fail, six skip, plus
  52 suite-loading failures. All 21 realm tests pass. `SAFEJS-EXTENSIONS.md` explains the
  retained failures and the focused realm tests. The earlier `source-initial`
  and `focused` reports preserve failed attempts rather than hiding them.
- `unit-node-2026-09-01-safejs.json`: earlier Node suite at 20:21 UTC; 43 files,
  840 passed. Includes 20 adapter/loader unit checks without requiring an installed
  SDK for the normal regression suite.
- `safejs-sdk-2026-09-01.json`: 22 real public-SDK checks pass on the already
  installed Poe Code 13.0.10 runtime at 20:21 UTC. Covers supported execution,
  missing ambient host capabilities, exact budget categories, non-suppressible
  interrupts, pending-await cancellation and post-run capability revocation.
  `JS-RUNTIME.md` records the integration boundary. No website script or DOM runs
  here; the 96.4 MB process sample is not a peak/browser benchmark.
- `safejs-sdk-initial-2026-09-01.json`: preserved initial loader failure from our
  CommonJS resolution of an import-only export. No guest program ran in that
  failed attempt. The corrected loader uses the public Node import declaration;
  no package installation, private path guessing or runtime patch was needed.
- `unit-node-2026-09-01-css.json`: earlier Node suite at 20:05 UTC; 41 files,
  820 passed. Adds bounded style cascade, specificity/media/viewport, CSS-aware
  actions/focus/snapshots and isolated HTTP stylesheet/security/cancellation tests.
- `unit-node-2026-09-01-css-initial.json`: retained initial 813-pass/one-failure
  result. CSS action checking displaced an existing HTML error message. The fix
  restores HTML-check precedence; the assertion remains unchanged. Six further
  tests were added before the final successful suite.
- `css-core-bun-2026-09-01.json`: 243 portable core checks pass at 20:05 UTC.
  No Bun networking is used or enabled.
- `css-cli-sites-2026-09-01.json`: 19 public separate-process CLI checks pass at
  20:04 UTC. The real catalog's three sheets produce a computed block thumbnail,
  with source/work counts and unsupported CSS diagnostics retained. `CSS.md`
  explains why this is not evidence of complete layout or visual equivalence.
- `css-html-form-node-2026-09-01.json`: the parsed public demo form still passes
  type/fill/check/Enter and all seven echoed field assertions after CSS integration
  at 20:04 UTC. Only synthetic values are posted. The 74.2 MB whole-process RSS
  sample is not peak memory or a complete browser-engine benchmark.
- `unit-node-2026-09-01-html.json`: earlier Node suite; 39 files, 772 passed.
  Adds actual HTML parsing/decoding, native parsed-page navigation/form POSTs,
  inert script/resources, conservative failure preservation and capability checks.
- `html-core-bun-2026-09-01.json`: 76 parser/decoder/form cases pass on Bun at
  19:36 UTC. This does not enable its unverified network backend.
- `html-cli-sites-2026-09-01.json`: all 17 public separate-process CLI checks pass.
  In addition to JSON/RFC workflows, the engine parses Example Domain
  and Hacker News, follows a real Books to Scrape product link by ref, and traverses
  back to its parsed listing. The news snapshot is explicitly truncated. HTML is
  partial and website JS is disabled; no general browser conformance is claimed.
- `html-form-node-2026-09-01.json`: the actual public httpbingo HTML form is parsed
  and submitted through command-host type/fill/check/Enter at 19:31 UTC. All seven
  fields match. No inserted controls, attribute rewrites, validation bypass, host
  event listeners or alternate engine are used. Only synthetic demo data is posted;
  optional email/time fields remain empty. The 74.4 MB RSS is one whole-process
  sample, not peak or browser-engine memory. No raw body/headers/credentials persist.
- `html-ui-2026-09-01.json` and `html-ui-mobile-2026-09-01.json`: all 17 assertions
  pass at desktop and 390×844, at 19:33 and 19:34 UTC. Real HTML and partial-parser/
  JS-off notices appear in the shared UI; unsupported XML preserves that document.
  The existing browser is only a test tool. Private images inspected:
  `/tmp/agent-browser-html-desktop-final-20260901.png` and
  `/tmp/agent-browser-html-mobile-20260901.png` (both mode 0600). The initial desktop
  capture was taken before pairing had polled successfully and was not used as
  proof; the final capture followed an explicit connected/HTML visibility check.
  The task's watchable session is closed/verified absent; the isolated service
  exited zero and its private connection file was removed.
- `unit-node-2026-09-01-keyboard.json`: earlier Node suite at 19:14 UTC; 36 files,
  714 passed. Covers focus/caret/typing, cancelable keys, implicit submission and
  actual CLI processes preserving focus and executing Enter/fill --submit.
- `keyboard-core-bun-2026-09-01.json`: 65 focused core/session cases pass on Bun.
  Networking remains Node-only; earlier negative diagnostics are unchanged.
- `keyboard-form-echo-node-2026-09-01.json`: both existing public label/reset/form
  regression probes pass at 19:16 UTC, including multipart file echo. Expected
  event ordering now includes committing edited text when label activation moves
  focus. Both report zero listener errors; these remain constructed controls.
- `keyboard-navigation-node-2026-09-01.json`: two public POST checks pass at
  19:14 UTC through the actual command host, after real JSON loading. Constructed
  controls, selection replacement, Unicode deletion, focus snapshots and Enter
  produce the expected URL-encoded/multipart echoes and submitter. This is not
  parsed HTML or website JS. Whole-process RSS samples of 71.6–73.6 MB are not peaks
  or a general browser benchmark. No raw bodies, headers or credentials are kept.
- `unit-node-2026-09-01-navigation-history.json`: earlier Node suite at 18:56 UTC,
  34 files, 665 passed. Adds bounded archive restoration, combined traversal,
  branching/reload preservation, abort/supersession/revision guards and real HTTP
  state/cookie preservation. There is no BFCache or page JS implementation.
- `navigation-history-core-bun-2026-09-01.json`: 46 focused document/archive/session
  history tests pass on Bun at 18:56 UTC. Networking remains Node-only.
- `navigation-history-cli-sites-2026-09-01.json`: all 13 public CLI assertions pass,
  including separate-process JSON/RFC back/forward and service/private-file cleanup.
- `navigation-history-cli-sites-2026-09-01-first.json`: all individual assertions
  passed, but the aggregate still expected the earlier 11 rather than 13 checks.
  This initial failed report is preserved; the corrected full probe was rerun.
- `navigation-history-ui-2026-09-01.json` and
  `navigation-history-ui-mobile-2026-09-01.json`: all 16 UI assertions pass at
  desktop and 390×844 widths, including actual semantic-view back/forward content.
  The existing browser is a test tool only. The watchable task session was closed
  and verified absent; both isolated service instances were stopped. Private visual
  captures include `/tmp/agent-browser-history-desktop-20260901.png` and
  `/tmp/agent-browser-history-mobile-final-20260901.png`. The latter verifies a
  corrected minimum tab-picker width. No production stack restart occurred.
- `unit-node-2026-09-01-form-navigation.json`: earlier Node suite at 18:36 UTC,
  32 files, 638 passed. Adds native submission/validation/events, session GET/POST,
  POST-reload guards, cancellation/newer navigation and real HTTP integration.
- `form-navigation-core-bun-2026-09-01.json`: 40 focused form-submission and session
  cases pass on Bun at 18:38 UTC. No Bun networking is enabled; earlier negative
  TLS/native-multipart findings remain preserved and applicable.
- `form-navigation-node-2026-09-01.json`: two public POST assertions pass at
  18:35 UTC, each preceded by loading real JSON. URL-encoded submit-click and
  multipart requestSubmit exercise current post-event values, explicit file bytes,
  JSON response document replacement, old-tree closure and replay refusal.
  The controls are constructed fixtures and callbacks are trusted host code, not
  parsed website HTML or isolated page JS. The 68.7–69.8 MB RSS samples are whole
  process snapshots, not peaks or a general browser memory benchmark. No body,
  credential or echoed client metadata is retained.
- `unit-node-2026-09-01-playground.json`: earlier Node suite, 29 files, 590 passed.
  Adds window pairing/expiry/quotas/revocation, CLI-only approval/shutdown scope,
  fixed asset/CSP responses, frontend tokenization/URL validation and non-consuming
  observer snapshots. The actual CLI subprocess test now approves a real UI pair.
- `playground-ui-2026-09-01.json`: all 14 end-to-end UI assertions pass at 18:25 UTC.
  The existing watchable browser tests our UI only, never executes documents on
  behalf of the new engine. Actual JSON/RFC loading, CLI/UI storage sharing, external
  CLI navigation, HTML failure preservation, inspectors, tab controls and disconnect
  behavior pass. No credentials, page bodies or raw snapshots are retained.
- `playground-ui-mobile-2026-09-01.json`: the same 14 assertions pass at 18:27 UTC
  with a 390×844 viewport after correcting a narrow-screen sidebar layout issue.
- `playground-ui-2026-09-01-first.json`: preserved initial probe failure. The empty
  tab correctly existed, but the assertion searched for a text-view label while
  Activity was selected. It now checks the visible status and selected tab. This
  is not silently discarded or reported as a successful first attempt.
- Desktop (1280×800) and narrow (390×844) screenshots were visually inspected.
  Private local captures include `/tmp/agent-browser-playground-20260901-overview.png`
  and `/tmp/agent-browser-playground-20260901-mobile-final.png`; these are UI test
  artifacts, not proof of engine screenshot export. The task-owned watchable
  session was closed and verified absent. Both isolated service instances exited;
  the final private connection file was verified removed. No production service
  or unrelated browser session was stopped.
- `unit-node-2026-09-01-cli.json`: earlier Node suite at 18:05 UTC, 27 files,
  564 passed, zero failed/pending. Adds shared command dispatch, strict unsupported
  semantics, local API security/limits, private metadata and actual CLI subprocesses.
- `command-core-bun-2026-09-01.json`: 46 dispatcher/parser checks pass on Bun,
  without enabling its unsupported networking adapter.
- `cli-sites-node-2026-09-01.json`: all 11 public CLI assertions pass at 18:04 UTC.
  Separate processes use a package-owned foreground service for JSON/RFC text,
  local storage/session isolation, reloads and expected HTML rejection. The service
  exits and its private connection file is removed. No token/body/raw output is kept.
- `unit-node-2026-09-01-session.json`: earlier Node suite at 17:46 UTC, 23 files,
  519 passed, zero failed/pending. Adds owned-session navigation, cancellation,
  stale/late documents, native text loading and local HTTP session integration.
- `session-core-bun-2026-09-01.json`: 59 focused session/history/text-loader checks
  pass; no unsupported Bun networking is enabled.
- `session-sites-node-2026-09-01.json`: four public requests starting 17:45 UTC.
  RFC plain text and JSON load into real documents, JSON reload replaces the old
  tree, and expected HTML rejection preserves the current page. One Domain cookie
  is rejected. The 78–79 MiB RSS samples are instantaneous whole-process values,
  not peaks or a general HTML/JavaScript browser measurement. No bodies are stored.
- `unit-node-2026-09-01-cookies.json`: earlier Node suite at 17:32 UTC, 20 files,
  477 passed, zero failed/pending. Adds cookie scope/expiry/security/lifecycle,
  local HTTP integration and populated-cookie-jar negative TLS coverage.
- `cookies-bun-2026-09-01.json`: all 55 portable cookie unit checks pass on Bun.
  This does not supersede the existing Bun TLS/networking failures.
- `cookie-session-node-2026-09-01.json`: four public-service assertions pass
  starting 17:31 UTC, using six GET requests including two redirects. Verifies
  synthetic cookie setting, later persistence, separate-jar isolation and deletion.
  No credential values, response bodies or echoed client metadata are retained.
- `unit-node-2026-09-01-form-actions.json`: earlier Node suite at 17:20 UTC, 18 files,
  409 passed, zero failed/pending. Includes 26 new label/reset regression tests.
- `form-actions-bun-2026-09-01.json`: 73 focused form-action/document/control/snapshot
  checks pass on Bun. This does not enable Bun networking or supersede its failures.
- `form-actions-node-2026-09-01.json`: two public synthetic POSTs at 17:20 UTC pass
  label forwarding, reset/default state, event order, refilled values and file-content
  checks. Host fixtures only; file bytes are supplied explicitly after reset, not
  stored in or cleared from an intrinsic FileList. No website script executes.
- `unit-node-2026-09-01-history.json`: earlier Node suite at 17:05 UTC, 16 files,
  383 passed, zero failed/pending. Adds same-document history, Window and URL
  policy tests; the retained real-site probes are still foundation-only.
- `history-core-bun-2026-09-01.json`: history, URL, event and query suites pass
  all 172 checks on Bun. Separate TLS/networking and multipart-reader failures
  remain recorded and are not invalidated by this focused portable-core run.
- `unit-node-2026-09-01-queries.json`: earlier Node suite at 16:46 UTC, 14 files,
  335 passed, zero failed/pending; includes 104 selector cases.
- `queries-bun-2026-09-01.json`: the same 104 selector cases pass separately on
  Bun. This is not a complete Bun suite or approval to enable its network host.
- `query-resources-node-2026-09-01.json`: local constructed 100/2,000/10,000-element
  fixtures, measured query work/timing, deliberate work-budget denial and cleanup.
  Cold versus cached index costs and non-peak process RSS are distinguished.
  No parsing, page JavaScript, rendering or network request occurs in this probe.
- `unit-node-2026-09-01-events.json`: final Node suite at 16:34 UTC, 13 files,
  231 passed, zero failed/pending. Covers constructed document/control/event
  fixtures and local HTTP/TLS peers, not parsed-site browser acceptance.
- `network-sites-node-2026-09-01.json`: supported Node host; four read-only HTTPS
  probes with status/content checks, response hashes, body sizes and timings.
- `network-sites-bun-2026-09-01.json`: historical experiment, **not approval to
  use Bun networking**. These downloads succeeded before negative TLS tests
  exposed an unsafe validation order. The current adapter rejects Bun.
- `bun-tls-ordering-2026-09-01.json`: local negative TLS diagnostic. The required
  result is rejection before any HTTP request arrives. `passed: false` records
  a real incompatibility, not a skipped test or a production fallback.
- `form-echo-node-2026-09-01.json`: two successful public demo POSTs to
  `https://httpbingo.org/post`, using fixed non-sensitive fixture values.
  URL-encoded and multipart fields match the service's independent parser;
  multipart file content matches. Our documents are constructed fixtures,
  not parsed site HTML. No page scripts or submit events run. Client IP and
  echoed request headers are not retained. Transport cleanup is recorded.
- `form-events-node-2026-09-01.json`: two further successful demo POSTs at
  16:31 UTC, populated through event-driven fill/check/select operations.
  Each verifies expected event order, zero listener errors and a hidden field
  updated by an input handler. The service confirms that mutation and other
  values, including multipart file content. Callbacks are trusted host fixtures,
  not page scripts; submission remains explicit serialization/transport, not a
  browser submit pipeline. The current `check:form-echo` script runs this probe.
- `portable-core-bun-2026-09-01.json`: 162 checks, 161 passed and one failed.
  This earlier checkpoint predates event/interaction tests. Bun's native
  multipart reader did not retain the expected uploaded filename.
  The assertion remains enabled. Exact encoded-byte tests, Node's independent
  reader, local Node HTTP peers and the public echo service validate the payload;
  this is not a reason to weaken payload assertions or enable Bun networking.

RSS values in transport reports are process samples, not peak usage or an
estimate for a browser with page scripts/layout. HTTP response bodies and
credential-bearing headers are not retained. The JavaScript example records
only its initial HTML shell; no JavaScript was executed.
