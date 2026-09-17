# Host-owned isolated gate supervision

`scripts/run-safejs-gate.ts` exports `runSafeJsGate`. It is a dependency-injected
lifecycle supervisor, not an executable SDK launcher or a new browser runtime.
Importing it does not start a process, load SafeJS or grant network access.

## Host contract

The host supplies explicit prerequisite, before/after guard and pin checks,
synchronous process registration, acceptance validation, terminal writing and
deadline scheduling. Checks must return literal `true`; there are no permissive
defaults. The launcher must register each owned process synchronously, before
another fallible operation can lose its handle. Exactly one unique process is
accepted; erroneously registered additional handles are still cleaned up.

Every registered handle receives group termination, reaping and group-absence
verification attempts, including after normal exit, launch failure, interruption
and timeout. Those cleanup operations do not inherit the caller's cancellation.
Deadline failures still trigger best-effort cleanup, but unverified outcomes
cannot pass. Error formatting and process-not-found classification do not invoke
error accessors or arbitrary string coercion; messages are capped at 1,024 units.

Timeouts bound individual asynchronous operations, not arbitrary synchronous
host code or the complete workflow. A concrete host adapter must supply actual
owned-group operations, honor their abort signals, observe late outcomes, and
enforce its outer deadline. A successful callback is an adapter acknowledgement,
not independent proof of OS process absence.

## Terminal evidence

The result separates primary, cleanup and evidence failures. Its final `report`
is authoritative for the supervisor outcome. `persistedReport` records the exact
snapshot whose write was acknowledged; `terminalWritten` means acknowledgement,
not an independent filesystem inspection.

Cancellation during publication or timer-teardown errors can make the final
report fail even if an earlier passing snapshot was written. Both outcomes remain
explicit; the supervisor does not silently overwrite historical evidence.
Conversely, a write timeout can leave an uncertain external write even when
`terminalWritten` is false. The caller must reconcile that state, not blindly
retry the write or the SDK operation.

## Remaining actual-SDK work

The historical Python launcher and its failed SDK artifacts are unchanged. The
new supervisor still needs a concrete, reviewed guarded-process adapter and
verified dependency staging before a separately scoped SDK attempt. Native
fake-process tests are not a real process-group, kernel guard or SDK gate.

An immutable local source observation at SafeJS checkout commit
`8356115f1e56460f83cabc546633beadfafe8371` (September 17, 2026, 13:08:23 UTC)
still shows the public external-evaluation overlap restriction. Nested evaluation
returns no source result and does not preserve the browser's per-source options;
it is not a drop-in replacement. This observation is not a latest-release check.
See `SAFEJS-CALLBACK-ADMISSION.md` and `SAFEJS-SCHEDULER-CANDIDATE.md`.

Keep the nineteen core expectations, ten page-extension checks and later live
scripted-site gates separate and unweakened. No credential, device, TTY, page
script, default SDK activation or general browser-compatibility acceptance is
introduced by this supervisor.
