# Upstream SafeJS migration

Status: September 2, 2026. A public extension adapter is implemented and tested
against mock contracts; released-package verification and default activation are
pending. Production still uses the experimental adapter. `EXTENSION-RUNTIME.md`
describes the implementation, lifecycle and explicit unrun release gates.

September 2, 19:34 UTC upstream comment: #550's implementation is pushed as
`7984fa903602e6561b342a140f472978827094b7`. Pinned source confirms the console-only
`builtinOverrides` option, registered extension ownership and collision checks.
The maintainer reports passing upstream/installed-tarball tests and queued release
jobs while keeping the issue open for artifact/provenance verification. This is
not a completed local release gate. Reinspection still finds workspace poe-code
4.0.48, global poe-code 13.0.10 and no installed scoped SafeJS package. No denied
download or alternate artifact acquisition was retried.

September 2, 19:12 UTC: #549 is confirmed closed (17:47:48 UTC), with its final
maintainer comment recommending poe-code 14.0.17. The local test engine was not
changed. Read-only source inspection at
`c458b92d312580a2f9b32c9aa5e84b3aed77ea5e` identifies a distinct console ownership
requirement: an extension exporting console collides with the builtin before
setup; the builtin sink only supplies log/error, not shared Window identity or
the browser's full console methods. #540 explicitly requested this strict default
collision policy, so it is not being reopened or characterized as a regression.

New enhancement #550 requests an explicit, host-authorized builtin-console
replacement mechanism while preserving default collision and intrinsic checks.
The issue's creation, open state and exact body were verified. The published body
is `contributions/safejs-console-override-issue.md`. This is source-supported API
scope, not a claimed installed-release failure. No guest source rewrite, duplicated
console state or private-runtime workaround is used.

Later September 2 recheck: #550 remains open. The maintainer's 19:14:13 UTC
comment proposes a narrowly validated `builtinOverrides: { console:
"extension-name" }` realm authorization, requiring an owned host object and
retaining caller/extension/intrinsic collision protection. Implementation and
Node/Bun consumer/lifecycle tests are planned; this comment is not evidence that
the API is implemented, published, installed or accepted by this browser.

September 2, 18:55 UTC local gate: `scripts/check-nested-callbacks.ts` fails its
first synchronous host-method assertion against the existing experimental core.
The guest continues before the listener and receives a Promise rather than the
method's eventual primitive result. Observed order is
`before, sync:start, false, after, listener, sync:end`; expected listener-prefix
completion precedes the guest's result/after markers. The bounded probe closes
its realm and preserves both traces in
`reports/nested-callbacks-safejs-fixture-2026-09-02.json` (completed false, zero
passes). Later nested/async-tail assertions are not reached, not passed.

Do not expose guest dispatch/focus/reset methods as plain async host methods on
this legacy core: that changes synchronous browser semantics. No such wrapper,
native eval, fixed-microtask approximation or SDK patch was shipped. Migration
must use the declared upstream nested-operation contract and rerun the actual
consumer gates; this result does not report a failure against the released SDK
or reopen an already resolved upstream issue. Read-only local reinspection still
finds workspace poe-code 4.0.48, global poe-code 13.0.10 and no installed scoped
SafeJS artifact. No denied download was retried or substituted.

September 2, 17:37 UTC upstream update: the #549 implementation is pushed as
`c458b92d312580a2f9b32c9aa5e84b3aed77ea5e`. Its named contract adds optional
synchronous `set(name, value)` and `delete(name)` providers. The maintainer's
comment reports passing upstream tests and release jobs still running; this
observation does not establish a published version or local runtime acceptance.
The old experimental SDK remains the only locally available browser test core.

September 2, 17:04 UTC verification: #547 is now closed (closed at 16:19:22 UTC).
The maintainer reports `@poe-platform/safe-js@0.1.36`, commit
`fff9f787555f1b3e72dc88f7683bcbecffcc143e`, with installed Node/Bun consumer tests
for `realm.startCallback` and `context.startCallback`, each returning frozen
`synchronous`/`result` promises. Current source exposes the requested contract.
These are upstream release/source observations, not local released-SDK tests.
The previously denied package download has not been retried or substituted.

September 2, 17:05 UTC: #549 requests bounded writable named host-object properties
for Storage-style assignment/deletion. The exact filed body is
`contributions/safejs-named-mutations-issue.md`; creation and body were verified.
Current source at `521363bf16bdc9ae63f60f7ba47d57c03f2011fc` still has read-only
named providers and only fixed property setters. This is new enhancement scope,
not a claim that #546's explicitly read-only contract is broken. Browser storage
methods work; named assignment in the experimental core does not persist. No
Proxy, state-copy mirror or private-runtime import was introduced to mask it.

Earlier observations below are historical:

September 2, 15:35 UTC: poe-code #547 now requests an explicit public callback
phase contract. The issue is verified open and its body matches
`contributions/safejs-callback-phases-issue.md`. It is an API enhancement/guidance
request supported by source inspection and the local experimental-core probe,
not a claimed defect reproduced against the released package.

September 2, 15:42 UTC maintainer update: implementation of public `startCallback`
and separate prefix/result completion is in progress, with focused tests and full
consumer checks underway. The issue remained open at the subsequent check. This
is an upstream progress report, not a verified published release or completed
browser integration. No additional issue or local workaround is needed for this
same contract while that work proceeds.

## Inspected evidence

The authenticated GitHub API confirms that poe-code issues #540 through #546 are
closed. The #546 release comment reports `@poe-platform/safe-js@0.1.29`; its
published-consumer tests are upstream evidence, not tests performed here.

Public source inspected at `3192ef3c52ea16f7b31704a70e75497049516787`:

- `packages/safe-js/src/core.ts`
- `packages/safe-js/src/extensions.ts`
- `packages/safe-js/src/realm.ts`

The locally installed global poe-code is still 13.0.10. The workspace poe-code is
4.0.48. Neither is evidence of the newly released extension implementation. No
package was downloaded or installed for this inspection.

## Contract changes

| Boundary | Existing browser expectation | Inspected upstream API | Required change |
| --- | --- | --- | --- |
| Package loading | Experimental `@poe-code/safe-js` or `poe-code` exports | Released scoped SafeJS package and public core entrypoint | Verify the published manifest and public export before accepting it. |
| Host objects | Global `createHostObject` before realm creation | `context.createHostObject` during an owned extension lifecycle | Construct DOM, Window, timers and fetch bindings inside extension setup. |
| Extension setup | Preconstructed bindings | `defineExtension`, declared globals/capabilities and explicit grants | Declare the browser-owned globals and only the capabilities actually needed. |
| Guest argument retention | Global retention helpers | Setup-time `context.retainGuestArguments`, `guest:retain` grant and owner release | Register retained host operations during setup and release references on cancellation/close. |
| Evaluation result | Return value with thrown interpreter failures | Tagged `RealmResult`, including `ok: false` | Check failure before reading a value; preserve failure diagnostics and ownership cleanup. |
| Result conversion | Exported `deepCopyFromSandbox` | Realm exports the evaluated value | Keep the browser's bounded JSON-result validation; do not import interpreter internals. |
| Errors | Exported `SandboxError` constructor | Not exported by the inspected core | Use the public result/error contract rather than a private class identity. |
| Cancellation | Per-evaluation signal and `realm.closed` | Realm lifetime signal; no public `closed` field or evaluation signal | Track browser-owned closure and abort the lifetime for fatal timeout/cancellation. |
| Limits | Browser-specific realm source/evaluation options | Explicit supported realm options and resource collection limits | Keep source/run limits in the adapter; pass only upstream-supported options. |
| Callbacks | Global function with separate synchronous-prefix and final-result promises | Realm/context `startCallback` now returns both phases | Adapt the receiver and argument shape; verify dispatch ordering against the actual release. |

Indexed and named host-object declarations now exist upstream. Preserve live
identity, bounds, ownership and revocation tests when moving those declarations
into extension setup; closure of #545/#546 is not browser-integration evidence.

## Callback migration gate

`ScriptCallbackRuntime.startCallback` exposes both `synchronous` and `result`.
The event dispatcher needs to finish the listener's synchronous work before
deciding default actions, without waiting for an async listener's final result.

The earlier pre-#547 source exposed only final-result `invokeCallback`. That
contract gap is now resolved upstream: the public realm and extension context
both expose `startCallback(callback, { thisValue, args })` returning separate
`synchronous` and `result` promises. The browser has not yet runtime-validated
this released API; its legacy adapter still uses a global function with a
different argument shape.

Do not adapt the API by resolving the prefix immediately, by awaiting the final
result for both phases, or by assuming a fixed number of microtask turns. Those
approaches can change event ordering, cancellation or liveness.

Before choosing an adapter or claiming the released API fails our contract, run
a public consumer probe against the actual release that covers:

1. Synchronous `preventDefault()` before the listener's first suspension.
2. A listener that remains pending while later listeners and default actions run.
3. Late cancellation after an async suspension not retroactively changing an action.
4. Nested dispatch, listener ordering and synchronous listener failures.
5. Close/abort while a callback is pending, with no retained guest handles.

The explicit phase capability from #547 no longer requires another upstream
issue. Completed issues were not reopened; the host-constructor proposal remains
separate.

## Released-contract acceptance probe

`scripts/check-released-safejs.ts` prepares a separate, fail-closed public
extension consumer. It does not modify the browser runtime, load private SDK
modules, download packages, fall back to the experimental core, or use host
JavaScript evaluation for guest programs. Select an already available, approved
artifact and its exact version explicitly:

```bash
AGENT_BROWSER_SAFEJS_RELEASE_ROOT=/absolute/path/to/approved/package AGENT_BROWSER_SAFEJS_RELEASE_VERSION=0.1.XX node packages/browser-agent/dist/scripts/check-released-safejs.js --trace
```

Replace `0.1.XX` with the actual artifact version; the loader rejects this
placeholder. The probe requires post-#550 console authorization as well as named
mutation and callback phases. The root must declare `@poe-platform/safe-js` and a contained public
`./core` import. Manifest/export symlinks cannot escape the selected root. These
checks validate selection, not registry provenance or all transitive imports;
the artifact itself must be trusted. No dependency is installed by this command.

The prepared gates cover live indexed/named host capabilities, named mutation,
fixed-member precedence, nested operation ordering, both callback entry points,
retained guest arguments and revocation, callback cancellation, and one-time
cleanup. Each async wait is bounded; each realm also has step, data and deadline
budgets. Reports distinguish selected package identity, completed checks,
selection/contract failure, unverified publication provenance and unverified
browser integration. **These release gates have not yet run against a released
SDK.** Loader tests use deliberately inert export stubs and are not interpreter
or published-consumer conformance tests.

Source inspection also confirms that extension setup is lazy (first evaluation),
whereas the browser currently constructs capabilities before realm creation.
Reserved builtin globals conflict with extension exports. Do not equate a
passing standalone probe with resolution of those construction/global-binding
differences or migration of limits, errors, results and cancellation.

## Experimental-core contract probe

`scripts/check-callback-phases.ts` runs through the existing declared experimental
public core with in-memory host waits. The report
`reports/callback-phases-safejs-fixture-2026-09-02.json` contains eight passing
checks: prefix effects, a still-pending final result, progress of another callback,
ordered async settlement, synchronous failure, async-tail failure, cancellation
of suspended results, and terminal owner closure. Each wait and cleanup is bounded.

The probe establishes the behavior our adapter currently relies on; it does not
test the newer extension API, native DOM dispatch conformance, public websites
or a live terminal. No package download, SDK edit or dependency was involved.

After building the package, use an explicitly selected existing compiled candidate:

```bash
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/absolute/path/to/candidate/packages/safe-js node packages/browser-agent/dist/scripts/check-callback-phases.js --trace
```

## Implementation and acceptance order

### Capability construction boundary

`src/page-bindings.ts` now owns DOM, Window, Location, History, Storage, timers,
fetch and console capability construction. Its context needs only
`createHostObject`, `retainGuestArguments` and `releaseGuestReference`; it has no
Budget, realm, evaluator, result conversion or SDK error-constructor dependency.
Callback phases, fatal timer failure and console accounting are explicit
lifecycle hooks. The current `PageScripts` adapter supplies those operations from
the existing core and still owns evaluation limits, cancellation and results.

Setup registers timer retention before exposing either global or Window methods,
and uses the operation returned by registration rather than assuming the input
function was modified in place. Partial construction failure closes previously
created capabilities. Closing bindings cancels guest work and revokes their native
wrappers without closing the borrowed native document event dispatcher. The
document's console buffer remains readable for diagnostics until document close.

Twelve native boundary tests cover construction without realm APIs, timer wrapper
selection, argument release, callback receivers, console accounting, owner close,
partial failure and invalid/mismatched owners. Seven actual experimental-core
checks additionally verify retained guest identity across timeout/interval calls,
shared mutations, cancellation, pending-callback cleanup and native interaction
survival. The broader suite passes 954 tests across 43 files; existing interpreted
storage/event, navigation, fetch/CORS and class-list probes also pass.

This is a tested construction boundary, **not a released-SDK adapter**. Wiring it
into lazy extension setup, resolving the builtin `console` collision and adapting
the remaining error/result/lifecycle contracts still require release validation.

### Runtime lifecycle boundary

`src/page-runtime.ts` separates the page owner from SDK-specific realm creation,
budget construction, result conversion, error class identity and callback entry
points. The existing experimental implementation is isolated in
`legacyPageRuntime`; production still selects that implementation. Existing
`PageScriptCore`, `PageRealm` and `PageRealmOptions` imports remain compatible.

`PageScripts` also accepts a trusted `PageRuntimeFactory`. Its setup callback is
the only route to `PageBindings`, and may run eagerly or during first evaluation.
Unused lazy owners can close without constructing capabilities. Initialization
shares the source evaluation's timeout and cancellation; repeated setup, failed
setup and late setup after close are rejected and native wrappers are revoked.
Source/run/result limits and callback-prefix ordering stay in the browser owner.
The runtime returns tagged success/failure results; failed results are never
copied as successful values. Error codes/budget names still pass a bounded,
sanitized projection. Adapter closure clears callback bookkeeping even if its
close operation rejects.

For a lazy factory, capability getters are unavailable before setup constructs
bindings, and metrics omit DOM/timer sections until those owners exist.
The additive initialized metric records completed runtime initialization. The
existing eager adapter still exposes its capabilities immediately. This is a
trusted integration boundary, not guest plugin loading or a second JS engine.

Factory tests use mock runtimes to cover lazy setup, tagged/public diagnostics,
fatal closure, partial failure, timeout/cancel, source bounds, concurrency and
separate callback prefix/result phases. Actual experimental-core regressions
exercise the moved legacy adapter. Neither category proves a released extension
adapter: builtin console, actual release selection and public consumer gates
still need completion.

Checkpoint evidence: 1,240 tests across 58 files, including fourteen runtime-owner
contract cases, plus 81 actual experimental-core checks across bindings, terminal
search, classList, storage, action waiting and fetch/CORS. The package build,
changed-test strict type checks, focused lint/format and diff checks pass. Reports
are indexed under `reports/README.md`. No dependency or service was changed.

### Remaining release gates

- [ ] Obtain permission for the previously denied released-SDK download; inspect
  the exact package without dependency installation or lifecycle scripts.
- [ ] Verify actual package exports and runtime behavior with public consumer
  tests; do not substitute repository source for the published artifact.
- [ ] Resolve callback phases through the public API and the probes above.
- [ ] Invoke the extracted `PageBindings` construction from one owned extension
  setup, after validating initialization timing and builtin-global handling.
- [ ] Resolve #550's explicit builtin-console ownership through public APIs and
  verify console/window/self identity without rewriting guest declarations.
- [ ] Adapt results, limits, cancellation, guest retention and cleanup together.
- [ ] Test distinct documents/realms, stale and foreign capabilities, setup
  failure, repeated closure, budgets and interrupted evaluation.
- [ ] Re-run DOM/events/timers/fetch/CORS and owned-session integration tests.
- [ ] Re-run approved actual terminal and public-site gates; preserve failures.
- [ ] Remove dependence on the experimental core only after the release passes
  these gates, without weakening safety or narrowing the original browser goal.

The prior denial of package download and live terminal/site execution is not
overridden by upstream issue closure. No such action was retried for this audit.
