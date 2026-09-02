# SafeJS extension candidate

September 1, 2026. The user explicitly permits extending SafeJS, with a possible
upstream contribution later. The user subsequently authorized upstream issues;
`poe-platform/poe-code#540` and `#541` request the extension API and guest function
semantics respectively. No PR, commit, push or package publication is made.
September 2 adds #542 for opaque retained guest arguments; the local candidate
implements that primitive without claiming an upstream implementation or a
finished extension framework (`SAFEJS-GUEST-REFERENCES.md`).
The later September 2 candidate adds guest function properties and bounded
constructor inheritance for #541 (`SAFEJS-FUNCTION-OBJECTS.md`). That checkpoint's
real-site failures identified Date and Object prototype gaps, filed as #543/#544.
The next candidate adds realm-owned ordinary Object intrinsics for #544
(`SAFEJS-OBJECT-PROTOTYPE.md`). Full intrinsic graphs and extension lifecycle
remain unfinished. That checkpoint reached a browser DOM collection-method gap.
The subsequent #545 candidate adds bounded indexed host capabilities for live
collections (`SAFEJS-INDEXED-HOST-OBJECTS.md`). Browser DOM querying stays outside
the interpreter. That checkpoint reached missing element.style.cssText.
The next #546 candidate adds bounded named host properties for browser-owned
attribute maps (`SAFEJS-NAMED-HOST-OBJECTS.md`). Direct diagnostics now reach Date
on both sites; Books also hits the production heartbeat because retained-graph
reconciliation is expensive (`SAFEJS-RETENTION-PERFORMANCE.md`). Date and efficient
bounded accounting remain unfinished. A detailed performance issue was not posted
because approval review denied publication; the evidence remains local.
The subsequent local retention candidate reuses immutable shallow shapes and
descriptors, merges same-scope capture enumeration within each measurement and
avoids escape scans without live included compile charges. Mutable descendants
and primary budget checks remain live. It reduces measured cost but Books still
fails the unchanged production heartbeat; this is not a resolved performance gate.
The Date candidate adds guest timestamp slots and realm-owned prototypes,
calendar/JSON operations and explicit clocks. Run current-time reads use the
existing host-call journal. `SAFEJS-DATE.md` records the primitive-only host
calendar boundary and unsupported locale/copy/snapshot behavior. Both scripts
advance past Date in diagnostics; both production navigations at that checkpoint
hit the unchanged watchdog on newly reachable work. The extension lifecycle stays open.
The cooperation candidate adds cancellable AST scheduling checkpoints without
releasing the active guest job or weakening limits, plus Date initialization
cleanup. Both public documents now remain readable while their scripts time out;
native navigation recovers after guest shutdown (`SAFEJS-COOPERATION.md`).
No dependency is installed or added to a manifest. The globally installed SDK is
not edited. Automatic website JavaScript is disabled by default; the browser's
explicit classic-script mode remains partial (`SCRIPT-LOADING.md`).

## Source and separation

Current combined candidate: `contributions/safejs-browser-capabilities.patch`.
It includes realm, live-host-object, callback-phase, lightweight result-copy
exports, identity-preserving guest-reference arguments, guest function objects
and bounded prototype inheritance, realm-owned ordinary Object intrinsics,
bounded indexed and named live host capabilities, exact retained-graph scan
optimizations with deterministic regression tests, sandbox-owned Date values
and journaled current-time reads, cooperative realm checkpoints and failed-init
Date ownership cleanup,
two real-site parser fixes
and metered regex backreferences/lookahead
against the same base. The proposed extension contract is a separate upstream
request, not an implemented API in this candidate.
The older realm-only patch below is historical evidence; do not apply both patches
to the same checkout.
The combined patch passes `git apply --check` against the exact upstream base.
SHA-256: `ac174ad048c364a515a1ebf651fea7b653a7a4bf351787077e04a8777b8eb1cb`.

The isolated source checkout is `/tmp/agent-browser-safejs-13.0.10`, based on
Poe Code tag `v13.0.10`, commit `7fbbd81fd99c46928bcf314ad89410b946d203cc`.
`contributions/safejs-persistent-realms.patch` preserves the local changes against
that exact base; it contains no browser DOM, CLI, network policy or playground.
The checkout's `docs/plans/browser-realms.md` records the extension plan.
The patch passes `git apply --check` against files extracted from the exact base.
Its SHA-256 is
`668c4f54c5ef21fd4a2a3ca7908ce0c9c3d683fffdacb71a23c632e7fdf6001b`.

Only existing test/compiler tools are reused through a test-only node_modules
link. This does not upgrade the workspace's older Poe Code or install the fork.
The retained single-evaluation adapter uses the installed SDK's `run` API. The
page adapter explicitly selects this separately compiled extended public core.

## Implemented API

`createRealm(options)` is exported from SafeJS's normal and lightweight core
entrypoints. It returns `evaluate(source, options)`, `close()` and `closed`.

- Each evaluation parses a new program but shares one lexical environment and
  compilation owner. Variables, functions, object identity and regexes persist.
  Previous source is not replayed and previous host effects are not repeated.
- The host may grant explicit bindings and a console sink. No host global,
  ambient network, module import or guest dynamic evaluator is added.
- Default lifetime budgets are one million steps, call depth 64, string length
  262144, array length 16384 and data size 4194304 in SafeJS's accounting units.
  Hosts may explicitly supply an existing Budget with different limits.
- Cumulative submitted source is limited to 1048576 UTF-16 code units and charged
  as retained data. At most 128 evaluations are accepted by default. These limits
  can be explicitly configured; they must be positive safe integers.
- Promise-tracker records and settled values participate in retained-data
  accounting. Source and promises are conservatively retained/accounted for until
  close; this is not garbage-collection-equivalent memory accounting or an RSS cap.
- Only one evaluation may run at a time. Overlap is rejected without interrupting
  the existing job. A per-evaluation or lifetime abort permanently closes the
  realm. All evaluation failures close it; there is no rollback or error recovery.
- Granted resources survive successful evaluations and close once on disposal.
  Idle lifetime cancellation also triggers cleanup. Host-retained guest callbacks
  remain usable between jobs but cannot invoke host effects after close.
- Fatal budget failures remain uncatchable by guest catch/finally. Cleanup failure
  does not replace the primary evaluation failure; explicit close surfaces cleanup
  failure. Closing an active evaluation interrupts it and awaits its termination.

Evaluation returns a sandbox return value and interpreter statistics, not a realm
snapshot. As with the existing interpreter, a single expression returns its value;
a multi-statement program does not promise a last-expression completion value.
This is a trusted-host API, not guest `eval` or a desktop JavaScript engine.

## Explicit live host objects

`createHostObject({ properties, methods })` creates an opaque capability. Property
descriptors explicitly grant getters and optional synchronous, undefined-returning
setters; methods explicitly grant callable operations. Declarations reject
accessors, proxies, symbols and prototype-capability names. Ordinary host objects
are not inspected to discover these capabilities.

Within a realm, repeated capabilities produce the same guest object. Identity
survives cyclic lookups, nested method arguments, callbacks and asynchronous method
results. Guest arguments map back to their original capabilities. Another realm
gets separate guest wrappers and expando properties. Wrappers and hidden callables
participate in retained-data budgets.

Granted properties are nonconfigurable; methods are nonenumerable and read-only.
Methods require their owning wrapper as receiver. Guest expando properties are
allowed. Key enumeration does not invoke getters. Ordinary host accessors remain
rejected, including `then`: an adversarial test exposed native promise assimilation
of that accessor. The bridge now checks data descriptors without invoking it.
Native promises and data-method thenables retain the existing conversion path.

Close revokes granted reads/writes/calls. Deep-copy, structured clone and snapshot
serialization reject live capabilities rather than producing stale records or
invoking getters. Existing `run` rejects them explicitly; they require a realm.
The extension adds no DOM implementation to SafeJS.

Nineteen live-object tests and 21 realm tests pass. The first broad attempt has
7827 passes, 30 existing fixture failures, six opt-in skips and 52 suite-loading
failures. `reports/safejs-host-object-source-2026-09-01.json` records the later run
including the `then` accessor regression; the initial report is preserved.
That final broad run has 7828 passing tests, 30 filesystem type-fixture failures,
six opt-in skips and 52 suite-loading failures. The separate focused run passes
all 41 realm/live-object/export checks, and strict TypeScript checks pass for those
new tests and the compiled core. This still does not make the upstream suite green.
`SCRIPT-DOM.md` describes browser-specific integration and real-site probes.

## Validation

The latest regex checkpoint adds 31 backreference and 35 lookahead tests, replacing
two previous unsupported-feature assertions. All 190 regex-directory tests pass
(`reports/safejs-regex-assertions-2026-09-01.json`). Capture behavior, atomic
lookahead, case folding, forward references, repeated captures, ownership-size
measurement, public realm/string replacement, compilation depth and fatal work
limits are covered. Native RegExp is only a test oracle, not an execution fallback.
The broad run has 7946 passes, 30 existing fixture failures and six skips
(`reports/safejs-regex-assertions-full-2026-09-01.json`). Its 54 failed file paths
are unchanged from the preceding 7882-pass checkpoint. The earlier focused
backreference run retains one missing-yaml suite-load failure alongside 161 passes;
it is not represented as a green suite.

At that earlier regex checkpoint, unmodified Quotes to Scrape jQuery passed parsing, then failed at guest
function-property/prototype assignment. Books to Scrape still required
`document.write`; neither passed dynamic-site acceptance. The upstream source
inspected then retained the same explicit function restrictions. Three minimal public
`run` reproductions are retained in
`reports/safejs-upstream-reproductions-2026-09-01.json` and included in issue #541.
`SAFEJS-EXTENSIBILITY.md` records the architectural handoff and its pending gates.

The latest real-site parser checkpoint adds 37 TDD regression cases. The full
parser directory passes 589 tests with one opt-in skip
(`reports/safejs-parser-site-regressions-2026-09-01.json`). Constructors may omit
their argument list; single-statement terminators belong to their statement,
including unbraced do/while and nested if/else bodies. This is not complete ASI
or classic-script grammar conformance. No interpreter budget is relaxed.
`reports/safejs-site-parser-full-2026-09-01.json` has 7882 passing tests, the same
30 filesystem type-fixture failures and six skips. All 54 failed file paths are
unchanged, including the 52 missing-dependency load failures. This is still not a
green upstream release gate.

The unmodified public jQuery source advances past both parser errors and now
fails on unsupported numeric regex backreferences. Books to Scrape separately
requires `document.write`. Neither is a passing dynamic website. Bounded own-data
diagnostics, source hashes and short public source excerpts are recorded in
`reports/site-script-errors-statement-terminators-2026-09-01.json`; the guarded
browser process probe remains separate. See `SCRIPT-LOADING.md` for reproduction.

The earlier page-process checkpoint passes 58 focused source tests and 18 actual
compiled-core checks inside owned browser-session processes on two public sites.
The broad source run (`reports/safejs-page-core-full-2026-09-01.json`) has 7845
passing tests, 30 existing filesystem type-fixture failures and six skips. Its 54
failed files include 52 missing-dependency load failures; the failure file set is
unchanged from the previous checkpoint. This is still not a green upstream release
gate. `PAGE-PROCESS.md` documents the browser integration and explicit limitations.

The callback-phase checkpoint passes 56 focused tests and strict TypeScript
checks, plus 25 compiled-core browser probes on fixtures and two read-only real
sites. The broad source run has 7843 passing tests, 30 fixture failures, six skips
and 52 suite-load failures. Its 54 failed files are unchanged from the previous
host-object run. `CALLBACKS.md` records the APIs, exact evidence and remaining
microtask/default-action/process integration boundaries. Earlier results below
are historical, not the latest totals. The later browser guest-listener bindings
pass forty actual compiled-core checks (`SCRIPT-EVENTS.md`), including spoofed
fatal error codes, asynchronous listener failure and actual budget exhaustion.
No further SafeJS source change was required for that browser adapter. Bounded
callback-cost measurements are also recorded there; large step limits alone do
not establish responsive page execution.

TDD began with eleven public-core tests failing because the API was absent. Further
negative tests exposed and fixed abort-error identity, idle cancellation cleanup
and promise retention that was missing from the realm's data budget.

- Twenty-one realm tests pass using the actual modified interpreter.
- Strict TypeScript compilation of the public core and its dependency graph passes.
- `reports/safejs-realm-public-core-2026-09-01.json` records six passing checks from
  a separate Node consumer importing the compiled `@poe-code/safe-js/core` export.
- `reports/safejs-realm-source-initial-2026-09-01.json` preserves the first broad
  run, including the then-failing idle cleanup/export tests. Those defects were
  corrected rather than skipped. The later full attempt is recorded separately
  in `reports/safejs-realm-source-2026-09-01.json`.
- Full-suite validation is not green in this checkout. Existing upstream suites
  require unavailable `jose`, `yaml`, `memfs` and `esbuild`, and filesystem type
  fixtures cannot resolve Node typings with this shared tooling layout. These
  failures are not replaced with mocks, suppressed or represented as passes.
  The final September 1 run at 20:50 UTC has 7809 passing tests, 30 failures and
  six pre-existing opt-in skips: 198 passing files, 52 load failures, two failing
  filesystem type-fixture files and one skipped file. All 21 realm tests and the
  lightweight export-contract test pass. This is not a green upstream release gate.

## Persistent callback phases

`startCallback(callback, args, { thisValue })` is exported from both public
entrypoints. It accepts only registered persistent-realm callbacks and separates
the interpreted synchronous phase from eventual asynchronous completion. Stable
callback identity and explicit live-capability receivers are preserved. Retained
captures remain budgeted; callback continuations share the source-evaluation job
queue, and close waits for cancellation cleanup before releasing owned state.

Fifteen new tests cover phase ordering, overlap, retained data, stable identity,
receiver conversion, pending work, fatal budgets and post-close revocation. A
pre-aborted host-promise path now observes the owned promise's rejection before
throwing, preventing orphan unhandled rejections during cancellation. These are
generic interpreter changes, not a browser DOM implementation inside SafeJS.

## Still required

The initial realm needs broader adversarial and lifecycle review before enabling
untrusted page execution. Promise/event scheduling, callbacks pending outside an
evaluation, retained-source allocation accounting and long-lived realm performance
have focused coverage but need broader stress and browser-checkpoint validation.
Cooperative cancellation cannot stop noncooperative
native host code; the separately tested process supervisor remains necessary.

The initial host objects need wider compatibility and adversarial review. Do not
relax rejection of arbitrary host accessors/prototypes to simulate DOM bindings.
Full DOM operations, events/default actions, page loading,
navigation cancellation and real dynamic-site acceptance remain browser work.
Realm snapshots, script-error recovery, module loading and Worker portability
are not implemented by this patch. Full Kitesurf/browser parity is still open.
