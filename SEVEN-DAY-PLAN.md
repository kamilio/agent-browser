# Seven-day continuation

Authorized September 3, 2026, approximately 17:42 UTC, through September 10, 2026,
approximately 17:42 UTC. Work in `~/project/agent-browser`; use focused atomic
commits without pushes. The original 72-hour window is superseded as a schedule,
not treated as proof of completion.

## Unchanged outcome

Build the native TypeScript terminal/agent browser requested in `TASKS.md`: fast,
portable and meaningfully better than curl, with page JavaScript, shared semantic
and visual document state, Kitesurf feature coverage, a comparable playground and
a Playwright-CLI-like API superset. SafeJS remains the only approved page-runtime
dependency. Browsh, Kitesurf and Blitz remain references, not alternative engines.

## Priorities and daily checkpoints

| Window, UTC | Priority | Evidence required |
| --- | --- | --- |
| Sep 3–4 | Durable session state and CLI completeness | Bounded cookie/storage round trips, atomic failure, isolation and private-file handling; no credential values in diagnostics. |
| Sep 4–5 | SafeJS compatibility and execution cost | Public SDK contract checks, retained-owner lifetime tests, honest timing/budget measurements; no private runtime workarounds. |
| Sep 5–6 | JavaScript application gaps | Prioritize missing APIs and scheduling behavior from reproducible failures; verify shared DOM/events/network behavior rather than parser acceptance alone. |
| Sep 6–7 | Layout, input and rendering | Shared layout/hit-test/snapshot/capture consistency; targeted layout fixtures and resource measurements. |
| Sep 7–8 | Terminal, playground and agent workflow | End-to-end session/action/observability flows, stale-target safety, useful errors and bounded output. |
| Sep 8–9 | Authorized real-site corpus and portability | Static/catalog/JS/framework/form evidence, cold startup, RSS, repeated teardown and transport limitations. |
| Sep 9–10 | Regression, hardening and release assessment | Re-run explicit gates, inspect failure/recovery paths, publish measured limitations and keep unfinished requirements open. |

Reorder tasks when measured blockers make that more useful. A daily checkpoint is
not a deadline to label a feature complete. Keep implementation, behavioral tests,
focused validation and documentation together in atomic commits. Preserve the
existing uncommitted feature work rather than sweeping it into unrelated commits.

## Starting evidence and first task

The standalone working tree builds and typechecks; 5,764 native tests across 178
explicit files pass after removal of the old workspace package. The migration-only
commit independently passes 3,004 tests across its 117 existing allowlisted files.
Those counts do not establish live website, SafeJS, terminal or deployment parity.

First task: add bounded cookie-state export/replacement with deterministic ordering,
expiry, host/path/security preservation and all-or-nothing validation. This is a
prerequisite for `state-save`/`state-load`, not a substitute for their private-file
and CLI acceptance gates. Integrate storage and client-side file operations next.

September 3 progress: `COOKIE-STATE.md` implements that cookie primitive with
39 new native cases. Cookie/storage regressions pass 104 tests across three files;
CLI file integration and the combined cookie/local-storage transaction remain next.

September 3 continuation: `BROWSER-STATE.md` adds the combined transaction and
hardens local-storage imports. Both owners validate before either changes; retained
session storage counts toward quotas. Private CLI file round trips remain next.

September 3 file-boundary continuation: `STATE-FILES.md` adds native Node private
file save/load with explicit atomic overwrite, bounded reads and guarded cleanup.
Library round trips pass; bounded command/process transfer and CLI wiring remain
next. This does not close the CLI or real-account acceptance gates.

September 3 CLI continuation: `STATE-TRANSFER.md` connects native `state-save` and
`state-load` to private files through bounded session-scoped chunks. CLI entry,
frame size and injected process-dispatch evidence are distinct from the still-open
real socket/process/runtime, upstream parity and authentication gates.

## Acceptance and safety

- Keep every requirement in `COMPATIBILITY.md`; do not turn missing behavior into
  a passing compatibility claim by returning `unsupported`.
- Run focused native tests first, then the explicit safe suite. Record failures,
  test scope and exact runtime/environment separately from intentions.
- Real website, socket, TTY/PTY and SafeJS probes retain their authorization gates.
  Do not rerun denied probes or install a different SDK through an indirect route.
- Never conceal blocks or timeouts by changing the sample. No purchases, messages,
  account changes or writes to real user data; synthetic demo interactions only.
- Do not claim bot-detection immunity or desktop-browser equivalence without
  matching evidence. A larger time budget does not remove architectural limits.

## Execution-control note

On September 3 the existing goal tracker still reported `blocked`; attempting to
register this seven-day continuation was rejected because that goal is unfinished.
It was not falsely marked complete. This document records the user's authorization
and work plan, not a claim that a seven-day background run was successfully started.
