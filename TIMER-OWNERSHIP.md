# Timer callback ownership and shutdown

September 3, 2026. `PageTimers` now reserves each invocation before entering the
callback runtime, keeps it pending until both its synchronous prefix and eventual
result settle, and revokes native ownership immediately on closure.

## Failure and correction

Seven new native reproductions failed before the correction:

- Callback startup observed zero pending invocations instead of its own slot.
- An early resolved or rejected result removed ownership while its prefix ran.
- Closing from inside startup allowed an in-flight record to be added afterward.
- Closing with unresolved phases retained pending records and a running flag;
  both eventual result outcomes were tested.
- An alarm firing after external runtime closure left registrations and another
  native alarm behind instead of shutting down the timer owner.

Admission now precedes runtime entry. Each invocation has two completion phases,
counted independently of Promise identity. Intervals still rearm after their
prefix rather than waiting for an asynchronous result. Canceled registrations
retain their argument handles until every already-started invocation settles.
Closure releases those handles, clears pending records and running state, and
makes late completion inert. An alarm that observes a closed runtime cancels
the remaining owner rather than leaving unused alarms behind.

Additional tests cover shared results across overlapping interval calls,
cancellation while only a prefix remains, exactly-once argument release, startup
failure and late settlement after closure. Lifetime callback/registration quotas,
timer delay conversion and nested-delay policy are unchanged.

## Validation boundary

The timer test file was absent from `native-tests.json`. Its complete imports and
fixtures were reviewed: it uses the native timer owner, mocked callbacks and
Vitest fake timers, not SafeJS, sockets, websites or real TTY/PTY. It is now
explicitly included. Thirteen pre-existing cases and twelve new cases run; this
does not retroactively change previous native-suite counts or imply that those
earlier runs covered timer ownership.

Focused scheduler/page-owner validation passes 112 tests across five explicit
native files. The full working tree passes 5,968 tests across 184 files with no
unhandled errors. Production build, strict timer-test typechecking and two-source
lint/format checks pass.
An isolated HEAD snapshot with only this timer/allowlist change also typechecks
and passes 3,208 tests across 123 available allowlisted files, excluding the
pre-existing unfinished feature work.

These tests establish native scheduler bookkeeping and handle cleanup, not
garbage collection of a released guest runtime, real-time scheduling accuracy,
public-site behavior or released-SafeJS compatibility. The separate socket and
runtime acceptance gates remain open, and the denied state-transport probe has
not been rerun.
