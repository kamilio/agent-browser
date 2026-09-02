# Native pre-action waiting

The shared command host waits before `click`, `fill`, `select`, `check` and
`uncheck`. This applies to refs, CSS and the supported literal role/test-ID
locators. It is a partial native implementation, not Playwright actionability
parity or a substitute for browser layout.

## Contract

- Polls target readiness every 25 ms, at most 2,048 polls. Unchanged document
  revisions reuse the previous not-ready result instead of repeating queries.
- Waits for target attachment and the engine's existing visibility, inertness
  and HTML disabled checks. Fill also waits for native readonly removal; select
  waits for requested options to exist and become enabled.
- Waits for an existing native document-event dispatch to settle before starting
  another action. It does not prove that every guest callback/task has settled.
- CSS/locator targets re-resolve against the current document in the captured
  tab. Removed saved refs fail as stale rather than silently rebinding.
- Ambiguity, unsupported syntax, resource exhaustion and detected permanent
  control/value errors fail instead of selecting a first match or retrying.
- Readiness checks do not focus controls, dispatch events or change form state.
  Once the action callback starts, it is never replayed, even if its failure
  happens to have a normally retryable error code.

Waiting consumes the existing command deadline: 30 seconds by default, or the
command's `--timeout` value. Queue time counts toward that deadline. A timeout or
session closure cancels pre-action waiting and removes its timer/listener.
It cannot roll back an action already dispatched; existing native interaction
and navigation cancellation rules apply after dispatch. A missing initial
document is still an immediate error rather than a wait for first navigation.

The internal `runWhenActionable` helper requires a caller-owned deadline signal.
Its poll count is an additional bound, not a substitute for that deadline while
waiting for event dispatch to settle. Direct `DocumentInteractions` calls remain
immediate. Read-only commands, `type` and `press` do not gain implicit waiting.

## Limits

There is no layout box, animation-frame stability, viewport intersection,
occlusion/hit-testing or full ARIA enabled/editable-state implementation.
The existing native style/HTML rules determine readiness. Locators and accessible
names remain the subset described in `TARGET-LOCATORS.md`. Host capabilities
advertise this as partial and explicitly report no stable-layout or hit-testing
support. No command-expression evaluation or dependency was added.

## Evidence

`reports/action-wait-focused-2026-09-02.json` records 1,051 passing tests across
48 files. Thirteen dedicated waiter cases cover attachment, readonly/disabled
transitions, option insertion, revision caching, stale refs, ambiguity, aborts,
poll bounds, event-idle waits and no action replay. Three additional shared-host
tests cover default waiting, deadline/queue cleanup and closing a waiting session.

The eight passing actual experimental-core checks in `scripts/check-action-wait.ts` use an
in-memory transport and the real command host, native DOM and interpreted timers
and handlers. It checks delayed click/fill/select/check, immediate uncheck, late
role-target attachment, timeout non-replay and session-close cleanup. Its select
fixture originally used `setAttribute("value", ...)` and native selected-state
inspection because guest option/select value properties were missing. That
historical result is in `reports/action-wait-safejs-fixture-2026-09-02.json`.
The updated probe now uses interpreted option.value assignment and select.value
reads; its passing regression is recorded separately in
`reports/script-select-action-wait-regression-2026-09-02.json`. See
`SCRIPT-SELECT.md` for the new property coverage and remaining limits.

These are not public-site, live terminal, visual playground, separate CLI/IPC,
released-SDK or full Playwright acceptance results. Those gates remain open.
