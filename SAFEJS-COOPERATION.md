# Cooperative execution and native navigation recovery

September 2, 2026, approximately 03:53 UTC. This is a local contribution
candidate, not an upstream release or general JavaScript compatibility claim.

## Execution boundary

Persistent realms now share a lifetime-scoped checkpoint across evaluations and
callbacks. Every 256 AST entries it yields through a cancellable host timer;
ordinary entries check cancellation without allocating a timer. Completion and
cancellation remove the abort listener, and cancellation clears the pending
timer. The interpreter retains ownership of the active guest job throughout the
pause: it does not call `suspendJob` or `onSuspend`. Host timers can progress, but
guest promise/timer callbacks cannot interleave synchronous guest execution.
Legacy `run()` cancellation/replay semantics are unchanged.

This is not hard preemption of parsing, native operations or an individual
retained-graph scan. The independent two-second process heartbeat remains
necessary. The production 100,000-step and 1,000 ms source limits are unchanged;
the source timeout can now fire during CPU-only interpreted work. Retained-memory
checks remain active. This change fixes responsiveness, not interpreter throughput.

Failed realm initialization also releases Date ownership roots. A regression
reuses a Budget after rejected bindings and confirms newly retained Date state
still participates in the data limit.

## Document ownership

The first CPU-timeout recovery probe exposed a separate browser bug: closing the
script adapter also closed its borrowed native event dispatcher. Script shutdown
now removes only guest listeners and interrupts pending controlled dispatches.
The native document owner still closes the dispatcher on document disposal.
Subsequent native link actions can navigate to a fresh script realm in the same
owned actor. A race where the runtime closes before returning a pending callback
prefix is covered too. This does not restart guest scripts in the old document.

## Verified evidence

- SDK: 73 focused tests pass, including 14 cooperative-execution tests and the
  new Date initialization cleanup case. The full run passes 8104 tests, with the
  same 30 failed assertions, 54 failed files and six skips as the prior Date
  checkpoint. Failure identities match exactly; the SDK release gate is not green.
- Browser: 1128 tests pass across 65 files; 70 focused event/script tests pass.
  Strict core, changed-test and package compilation pass; Biome checks 152 files.
- Owned-process automatic-script probe: 46 checks pass: 42 local fixture checks,
  two public-site reporting checks and two public static-text readability checks.
  The CPU fixture preserves text before/after its timed-out script; a native link
  recovers the same actor and verifies a fresh realm's executed page script.
- Books to Scrape and JavaScript Quotes navigation return in 1551/1479 ms.
  Both documents remain readable, but automatic JavaScript reports
  `execution-timeout` and a halted realm. Quotes' dynamic content is not accepted.
  The earlier String.replace/Object.defineProperty gaps remain unresolved;
  the now-effective timeout stops these runs before reaching them.
- Separate timer and CLI probes pass 17 and 22 checks. Their commands finish and
  close their owned actors and temporary services. No visual UI acceptance is
  inferred from the CLI/playground API probe.
- Retention diagnostic at 0/10/30 host objects takes 16/35/59 ms, with 652 steps,
  zero getter reads and correct results in each case. A host timer fires during
  all three evaluations. These small measurements are not a throughput claim.

Reports are indexed in `reports/README.md`. The initial failed native-link probe
is retained as `reports/cooperation-process-sites-2026-09-02.json`; the passing
replacement is `reports/cooperation-verified-process-sites-2026-09-02.json`.
An unrelated obsolete first Date test run remains separately tracked after its
termination request was denied; it is not used as final verification or claimed
cleaned up. Detailed performance publication remains paused. No dependencies,
installed SDK, daemon, commits, pushes or upstream publication were changed.

## References checked September 2, 2026

- Node timer scheduling/cancellation: `https://nodejs.org/api/timers.html`.
  Timer execution depends on event-loop work, not an exact wall-clock guarantee.
- ECMAScript job execution: `https://tc39.es/ecma262/2024/multipage/executable-code-and-execution-contexts.html`.
  Host scheduling pauses must not introduce concurrent guest jobs.
