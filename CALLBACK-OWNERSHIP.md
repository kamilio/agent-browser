# Page callback ownership and admission

September 3, 2026. `PageScripts` now reserves one admission slot and one source
evaluation barrier for each callback invocation before entering the runtime.
This strengthens the shared owner used by both the legacy and public-extension
adapters; it does not switch SDKs or run a SafeJS probe.

## Reproduced defects

The native public-runtime fixture reproduced four failures:

- Two callbacks sharing a pending result Promise counted as one callback, allowing
  the pending-callback quota to be bypassed. Neither the browser's runtime interface
  nor its phase types require unique Promise identities.
- A fulfilled result Promise released admission while the separately reported
  synchronous phase was still pending.
- A runtime that synchronously reentered event dispatch could start a second
  callback before the first callback's admission slot was registered.
- A runtime that reentered `PageScripts.evaluate` during callback startup could
  run new source before the callback published its synchronous-phase Promise.

The initial reproduction had four failed assertions. Two pending fixture dispatches
also rejected during cleanup after their assertions failed; the test helper now
observes those cleanup rejections without changing the returned dispatch result.
These are native adapter-contract reproductions, not claims that a particular
released SafeJS artifact exhibits all four behaviors.

## Ownership rules

- Every invocation gets a unique internal slot, regardless of whether the runtime
  reuses either completion Promise. Reservation happens before runtime entry.
- Each invocation installs its own prefix barrier before runtime entry. That
  barrier releases only when the runtime's actual synchronous phase settles, or
  startup fails. There is no fixed-microtask approximation of guest completion.
- Admission releases only after both reported phases settle. New source waits for
  active prefixes, but not for a valid callback's still-pending asynchronous tail.
- Synchronous startup failure releases the reservation. A healthy runtime remains
  usable after an ordinary startup exception; malformed returned phase contracts
  revoke the page runtime and bindings rather than leaving partially tracked work.
- Both available phases are observed before shape rejection, including an already
  rejected result paired with an invalid prefix, avoiding an orphaned rejection.
- Closure clears owner bookkeeping. Late phase settlement cannot restore a slot,
  restart source evaluation or revive native capability wrappers. The native event
  dispatcher remains independent of script-runtime closure.

The existing pending-callback defaults and maximum, script budgets, deadlines and
retained-graph accounting are unchanged. The additional per-invocation bookkeeping
is bounded by callback admission. This is a correctness and lifetime improvement,
not a measured interpreter throughput improvement or an SDK accounting workaround.

## Evidence and remaining gates

Thirteen new cases cover shared resolved/rejected tails, early result completion,
reentrant admission/source startup, startup exceptions, malformed phase records,
shutdown and late settlement. A 1,000-callback native sequence repeatedly checks
that no admission slots accumulate. The focused selection passes **83 tests across
four explicit native files**.

On Node v22.22.0, the full working tree passes **5,943 tests across 183 explicit
native files**, with no failed/pending tests or unhandled errors. Results are
terminal output, not altered historical reports. The broad run uses approved
real Unix ownership for the existing private-file tests; it does not authorize
or execute the separate runtime/live acceptance probes.

The isolated change also passes production typechecking and **3,183 tests across
122 available allowlisted files**, without the pre-existing scrolling and other
unfinished feature work.

Production build and strict runtime-test typechecking pass. Formatting passes for
both touched sources; test-file lint passes. Whole-file import ordering in the
pre-existing `PageScripts` work still has an unrelated `PageClock` ordering warning;
that work is preserved, not bundled into this fix.

No released/experimental SafeJS code is imported or executed, no package is
installed, and no website, socket or real TTY/PTY probe is run for this work.
Approved released-SDK callback-prefix/async-tail behavior, process containment,
retained-graph throughput, real websites and the wider seven-day browser objective
remain open gates. `SAFEJS-RETENTION-PERFORMANCE.md` retains its original measurements.
