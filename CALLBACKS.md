# SafeJS callback phases and controlled event dispatch

September 1, 2026, 21:32 UTC checkpoint. This is an experimental integration
foundation, not automatic website JavaScript support. It introduces no dependency
or installed SDK changes. `SAFEJS-EXTENSIONS.md` identifies the separate source
checkout and contribution patch.

The later guest-node integration is documented in `SCRIPT-EVENTS.md`. The evidence
below is retained as the earlier phase-API checkpoint; its host-registration
fixture has since been replaced by actual guest add/removeEventListener probes.

## Interpreter boundary

The extended SafeJS public core exports
`startCallback(callback, args, { thisValue })`. Only callbacks previously exported
from a persistent realm are accepted. It returns two independently observable
promises:

- `synchronous`: completion of the synchronous guest body, or its first async
  suspension. A non-async function returning a pending promise has completed its
  synchronous body without waiting for that promise to settle.
- `result`: eventual callback completion or failure, including asynchronous work.

The explicit receiver and arguments cross the existing live-capability boundary.
Stable callback identity survives separately executed registration calls. Captured
values held only by host callbacks participate in retained-data accounting.
Callbacks and source evaluations share the realm job queue, rather than allowing
interpreter steps from separate continuations to interleave. An external source
may run while a callback awaits, but overlapping synchronous phases are rejected.

Close revokes calls, interrupts pending interpreted work and waits for it to
unwind. Cancellation cleanup releases leases so the same host Budget can be reused
after close. SafeJS still accounts suspended awaits in call depth; the callback
extension does not silently exempt them. Fatal budget exhaustion closes the realm.
Noncooperative native host functions still require the process watchdog.

This is not a complete browser event-loop or microtask-checkpoint implementation.
In particular, distinguishing native input from guest-initiated synchronous DOM
dispatch and handling already-settled promises require additional integration
tests before standards-fidelity claims.

## Browser dispatcher

`controlledEventListener(invoke)` creates an explicitly branded host listener.
Its callback returns the controlled synchronous-phase promise. The new
`DocumentEvents.dispatchEventAsync` waits for that phase before continuing
propagation and returning the cancellation decision. It does not await arbitrary
promises returned by ordinary host listeners.

The existing capture/bubble, once/passive, listener-removal, error reporting and
resource-limit rules remain shared with synchronous dispatch. Closing the document
interrupts a never-settling controlled phase and restores event state. A nested
dispatch budget failure remains fatal to the dispatch turn even if a listener
catches it. Synchronous dispatch rejects pre-existing controlled listeners before
running listeners rather than silently discarding their promises. If a listener
dynamically adds a controlled listener mid-dispatch, rejection occurs when that
listener is encountered; earlier effects are not rolled back.

The later native click, keyboard, focus and form integration is documented in
`NATIVE-SCRIPT-ACTIONS.md`; their async paths now use controlled dispatch.
`SCRIPT-EVENTS.md` adds guest function-listener bindings, specialized event fields
and fail-closed dispatcher ownership based on trusted realm state. Guest listener
objects, AbortSignals, event constructors and process-owned page lifecycle still
need integration; the standalone dispatcher itself is not a realm.

## Evidence

- `reports/unit-node-2026-09-01-callback-phases.json`: 870 browser tests pass in
  47 files, including ten new async-dispatch cases. Existing real process tests
  run outside the stdio-restricted sandbox rather than being mocked or skipped.
- `reports/safejs-callback-focused-2026-09-01.json`: 56 focused interpreter tests
  pass: fifteen callback, 21 realm, nineteen host-object and one core-export check.
  Strict TypeScript checks pass for the public core and extension tests.
- `reports/safejs-callback-source-2026-09-01.json`: 7843 pass, 30 fail, six skip;
  200 passing files, 54 failing files and one skipped file. No new failed files
  compared with the preceding host-object report. Missing upstream test tools and
  filesystem Node-typing fixtures remain failures, not compatibility successes.
- `reports/safejs-script-callback-sites-2026-09-01.json`: 25 compiled-public-core
  checks pass at 21:30:12 UTC. Seven prior fixture DOM checks, six prior site DOM
  checks, and twelve callback checks across the fixture, Example Domain and Books
  to Scrape. Callbacks cancel before an unresolved await, bubbling sees the prefix,
  another source executes while waiting, and resumed work changes the snapshot.

The real-site probe downloads public HTML and injects explicit trusted test source;
it executes no website-authored JavaScript and modifies no server data. Listener
registration is a host fixture, not guest `addEventListener`. The 126504960-byte
RSS measurement is one whole-process sample, not peak memory or a complete browser
benchmark. No raw responses or credentials are retained. Reproduce using the
explicit source-build command in `SCRIPT-DOM.md`.
