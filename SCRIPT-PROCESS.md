# Owned script process boundary

Checkpoint: September 1, 2026. `SafeJsProcess` adds an externally supervised Node
process around the allowed SafeJS interpreter. This is a prerequisite for page
execution, not a persistent browser realm or proof of website JavaScript support.
No package was installed and no additional interpreter/browser engine is used.

## Operation

The trusted host explicitly selects an installed `poe-code` package root. The
parent starts our compiled child entrypoint using `process.execPath`, an empty
environment, a selected working directory and fixed arguments. It does not inherit
NODE_OPTIONS, parent execution flags, auth variables or arbitrary launch commands.
The child selects the SDK through its declared public Node import.

Each request is currently an independent `SafeJsRuntime` evaluation. The process
can be reused to avoid SDK reload costs, but script globals do not yet persist.
There are no guest filesystem, process, network, DOM or arbitrary host bindings.
The existing CLI/playground still report website JavaScript disabled.

The child uses Node's permission flag with read access restricted to its compiled
browser code, the browser package manifest, and the selected SDK package. It has
no filesystem-write, child-process, worker, addon or WASI grant. String-based host
code generation is disabled. Read roots cannot contain permission wildcards or
be the filesystem root. Native negative fixtures actually attempt file reading,
file writing, subprocess creation and string code generation and verify denial;
the parent environment is absent in the child.

**This is not an OS sandbox.** Node's permission system is defense in depth and
Node 22 does not supply a network permission here. SafeJS capability isolation
still prevents ambient guest network/host access; do not describe these flags as
complete protection against a compromised Node runtime or interpreter escape.

## Bounds and cleanup

- Interpreter limits remain in force. The parent separately enforces an evaluation
  deadline, defaulting to at least 2 seconds and beyond the cooperative timeout.
- Startup has a separate 5-second deadline. Configured deadlines are limited to
  20–60,000 ms. The V8 old-space setting defaults to 96 MiB, bounded to 32–256 MiB.
  This is not a whole-process RSS or native-allocation quota.
- Input/output uses versioned JSON lines with request IDs, a 2 MiB frame bound,
  strict streaming UTF-8 decoding, bounded bursts and result validation. Partial,
  malformed or unexpected responses terminate the owned child.
- Guest console data is discarded by the runtime adapter. Child stderr contents
  are not retained; more than 16 KiB terminates it. Results retain the adapter's
  output limit and cannot be used to inject another protocol message.
- Overlapping evaluations are rejected. Source/run limits are checked before
  sending another request. A pre-aborted request does not start work.
- Deadline, cancellation, protocol failure and close terminate only that instance's
  child. Promises settle after the child close event, not merely after sending a
  signal. There is no automatic restart or fallback to another engine.

The watchdog test uses a deliberately noncooperative **native SDK fixture**, not
a guest loop that would cooperate with SafeJS's step budget. The parent kills it
while another owned process remains usable. A separate installed-SDK probe verifies
real guest execution and genuine step-budget interruption.

## Evidence and remaining work

- Nine process tests plus four protocol tests pass. They cover actual native
  denials, empty environment, hard timeout, cancellation, overlap, source/run bounds,
  malformed and excessive output, safe roots and confirmed child exit.
- `reports/safejs-process-2026-09-01.json` has six passing assertions against the
  installed SafeJS 13.0.10 SDK. It verifies restricted startup, real evaluation,
  missing host globals, guest-loop interruption, a clean following evaluation,
  and process absence after close.
- The first execution inside the tooling sandbox returned `closed`; even a minimal
  child stdin/stdout echo produced no output there. The approved real-process run
  passes. This observation is not evidence of a SafeJS bug or permission bypass.
- The separate matching SafeJS source checkout is at
  `/tmp/agent-browser-safejs-13.0.10`, detached at tag `v13.0.10`. Its 28 scope tests
  pass with existing test tooling. No installed runtime files were changed.
  `docs/plans/browser-realms.md` there specifies the reusable, TDD-first realm and
  host-object work for a possible later contribution. No issue, PR, commit, push
  or publication has been made.

An initial persistent-realm extension now exists separately in SafeJS source;
`SAFEJS-EXTENSIONS.md` records its tests and local contribution patch. The process
adapter above still uses independent `run` calls and does not select that extension.

Production realm integration, identity-preserving live DOM property bindings, callbacks,
script scheduling, event/default-action ordering and real dynamic-site acceptance
remain required. Do not substitute repeated independent evaluation or copied DOM
records for those semantics.
