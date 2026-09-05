# Native cooperative idle callbacks

Continuation after `cc56c04`, September 5, 2026. This adds bounded native
`requestIdleCallback` and `cancelIdleCallback` capabilities using existing page
callback ownership. It is a conservative software scheduling profile, not a
measurement of compositor, operating-system or full browser-event-loop idleness.
All 89 new cases pass in both final integration trees; the pre-existing pending
working-tree onload failure remains explicit below.

## References and bounded behavior

```text
https://www.w3.org/TR/2025/WD-requestidlecallback-20250521/
https://webidl.spec.whatwg.org/#invoke-a-callback-function
```

The reviewed Working Draft defines FIFO requests, deferred reposting, cancellation,
a single idle/timeout winner, positive-timeout fallback, and a clamped deadline.
Default WebIDL invocation supplies an undefined callback receiver; this differs
from the existing animation-frame owner's explicit Window receiver. These sources
were inspected, not executed as WPT or external-browser acceptance tests.

The native profile admits at most one normal callback per one-millisecond host
opportunity. A normal deadline offers at most one millisecond, using the shared
coarsened page clock. `timeRemaining()` never increases for that deadline, never
becomes negative and has 0.1-millisecond precision. This deliberately small budget
does not promise idle time until the next frame or another task. There is no
burst loop, platform priority integration or hidden-page throttling.

Requests retain FIFO order; a callback's repost follows already pending work and
waits for another opportunity. Positive timeouts compete with normal admission,
ordered by expiry and then request ID. A timeout winner receives `didTimeout:true`
and zero remaining time. Zero/absent timeout has no fallback timer, following the
reviewed draft's positive-timeout condition. Canceled or already delivered handles
cannot deliver again. A single host timer serves the bounded owner queue, with
long waits split at the native timer limit instead of overflowing into immediate
delivery.

## Runtime cooperation and limitations

Normal idle work waits while the existing page lifecycle reports busy. With no
positive timeout it arms no polling timer. PageScripts wakes the owner at its
existing evaluation-completion and callback-prefix-completion boundaries.
Positive timeouts can enter the existing serialized callback runtime while another
evaluation is active; they do not bypass that runtime's own admission policy.

The current lifecycle treats an entire active evaluation as busy, not just its
CPU-executing portion. Consequently an evaluation that awaits its own idle request
without a positive timeout can remain pending until that evaluation's budget
expires. This profile does not infer suspension from Promise identity or use
private SafeJS state. Finer main-evaluation idle opportunities remain a runtime
integration gate. Ordinary callbacks posted by an evaluation can run once it
finishes; timeout fallback and callback-tail progress are separate cases.

Only one idle callback synchronous prefix runs at a time. An unresolved async
result does not stop later prefixes, but its record stays charged until both
completion phases settle, in either order. Both rejection paths are observed.
Guest callback errors remain the existing runtime's reporting responsibility;
healthy owner scheduling can continue. Dispatch-time runtime admission,
deadline-factory, clock and resource failures stop the owner and report through
the page lifecycle. Invalid request arguments or pre-admission clock readings
reject that request before charging its identifier.

Close clears pending/in-flight callback fields, cancels the host timer and revokes
saved deadline/method capabilities. A generation guard rejects stale timer
deliveries. Deadline-factory reentrancy cannot overlap prefixes or publish a
callback after close. These ownership invariants are not measurements of released
SafeJS heap graphs, garbage collection or retained-RSS behavior.

Native host-factory selection is not yet runtime startup: the selected record
remains cancelable while its deadline host object is being constructed. The
owner rechecks membership before invoking the runtime, releases canceled
pre-start ownership and wakes later work without charging a fired callback.
Cancellation after runtime startup cannot abort an already-running callback.
This stronger embedding-reentrancy boundary is a native safety policy, not a
claim that the specification exposes host-object construction to page code.

## API and limits

`PageIdleCallbacks` supplies the two methods, `wake`, `close` and immutable metrics.
PageBindings exposes identical methods through Window and installed globals,
declares both names for runtime setup, accepts `idleCallbackLimits`, and closes
the owner before its shared clock. PageScripts adds `idleCallbacks` evaluation
metrics. Existing timer and animation-frame handles, budgets and owners remain
independent. The library index exports the owner, limit type and policy constants.
The fired counter records attempts that reach runtime startup, not proof that a
guest callback body or its asynchronous result completed successfully.

Defaults are 128 active requests, 4,096 lifetime requests, 1,024 callback admissions
and 128 pending two-phase completions. Known positive safe-integer overrides are
limited to sixteen times each default. Request quota rejection leaves existing
work intact; exhausted dispatch quotas fail closed rather than silently dropping
an arbitrary callback. Handles are not reused during an owner's lifetime.

Callbacks must be functions. Options accept undefined/null or own-data plain/null-
prototype dictionaries. Inherited option prototypes and timeout accessors are
unsupported, without invoking the timeout getter. Unknown own fields are ignored.
Timeout and cancel handles use bounded primitive unsigned-long conversion;
object/function/symbol/bigint coercion is rejected, and strings longer than 1,024
code units exceed the argument budget. Missing cancellation arguments throw.
This is not unrestricted WebIDL object coercion.

Every admission supplies a fresh read-only host deadline with `didTimeout` and
`timeRemaining`. No public IdleDeadline constructor, shared prototype or forged-
receiver brand emulation is introduced. Broader interface and browser parity
remain explicit limitations rather than implications of the method names.

## Validation evidence

The first five working-tree scheduling files have 96 passes and one pre-existing
pending onload failure: assigning an object expects null but retains that object.
A before-idle copy, with this feature's production changes reversed and its new
owner excluded, independently reproduces 19 passes / the same one failure in the
unchanged page-bindings file. Source bytes match the saved pre-edit backups.
`idle-callback-first.json` and `idle-onload-before.json` retain those actual runs
under `node_modules/.cache/native-validation`; the before tree is recorded in
`/tmp/idle-onload-baseline-path`. The unrelated onload implementation and tests
are not changed, hidden or claimed green.

The independent new binding/runtime suite has 22 real behavioral failures on
exact `cc56c04`, then 22 passes against actual production v2. It imports existing
APIs only, so baseline failures are not missing-module collection errors. The
same final tests verify declared/installed aliases, injected runtime setup,
shared native DOM mutations, clocks, metrics, busy wakeup, timeout fallback,
quota failures, independent timer/frame state and lifecycle cleanup. Strict
types, scoped Biome and the replay build pass. Its report and original/final
baseline evidence remain in
`node_modules/.cache/native-validation/parallel-idle-bindings-cc56c04/report.md`.

The first actual owner replay collects 67 cases, with 66 passes and one assertion
about canceling a factory-selected callback before startup. The parent chose the
stronger native cancellation boundary described above and changed the pending
record admission point rather than weakening the assertion. The first result,
contract discussion and corrected fixture-table representation remain in the
owner worker's `delivery/ISSUES.md`. A fixture-table correction is replayed on v2
with the same 66 passes / one failure before the production fix. Final v3 passes
all 67 cases, including stronger no-fired-charge and successful-next-callback
assertions at a one-callback quota. Strict types, scoped Biome and exact patch
application pass. The final owner report is
`node_modules/.cache/native-validation/parallel-idle-callback-owner-cc56c04/delivery/README.md`.
A missing new-module import is not used as baseline proof for this new owner.

The final parent run covers ten explicitly listed files. All 263 isolated tests
pass; the working tree has 268 passes and the same one pending onload failure
(269 total, real native exit 1). All 89 new tests pass in both trees. The six
additional working cases are pre-existing and excluded from this commit. The
working gate is not described as fully green. Both project typechecks/builds,
strict compilation of the two new tests, scoped owner/test Biome and formatting
of all four production files pass.

The helper `/tmp/idle-callback-validation.mjs` verifies the pre-idle baseline
bytes and exact failed assertion before recognizing only that working exception.
Any additional failure, skipped/new failing case, child error or missing summary
is fatal. Real logs and populated JSON use `idle-callback-integration-final-*`
under the native-validation cache. Both manifests contain 396 unique entries;
all exist in the working tree, while the same 22 pending-only files remain absent
from the clean archive. This is not execution of the full manifest.

Two existing organizeImports diagnostics in page-bindings and page-scripts are
reproduced on exact `cc56c04` source under `idle-callback-biome-baseline`. Their
logs and current-tree equivalents remain separate from passing scoped checks.
Pending base64/onload work, including related index and binding changes, is not
sorted, repaired, overwritten or included in this feature's atomic patch.

This evidence uses fake timers and injected factories/callbacks, not released
SafeJS execution. No full manifest, live site, socket, real TTY/PTY, external
browser, timing/RSS benchmark or portability gate is run or inferred. Overall
browser scope and outstanding acceptance remain in `TASKS.md`.
