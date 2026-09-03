# Native calendar fill actions

September 3, 2026. Native synchronous/asynchronous fill now supports date, month,
ISO week, time and local-datetime inputs through the interaction and command
action-wait paths. This connects the earlier calendar value and constraint work
to an agent action without introducing a runtime dependency or alternate engine.

## Action semantics

Calendar fill validates syntax before focus, trims surrounding whitespace and
normalizes accepted local datetime values through the existing sanitizer. Empty
input clears the control. Invalid nonempty syntax fails explicitly rather than
silently clearing a previously valid value. Values outside min/max/step remain
fillable and are subsequently reported by normal native constraint validation.

Calendar controls use a direct commit: focus, write the normalized value, then
bubbling noncancelable input and change events. Input is composed; change is not.
These are generic events, not text InputEvents, and there is no beforeinput or
invented character-selection behavior. The write is marked as a native user edit.
Text/number fill keeps its existing beforeinput cancellation and blur-time change.

The action rechecks connection, visibility, enabled/editable state, focus and
input type after focus listeners, including controlled asynchronous prefixes.
If focus-time callbacks make the target unusable or change its type, the action
does not perform its value write. Listener-owned mutations are not rolled back.
Document text-quota rejection leaves value and edit-origin metadata unchanged;
focus may already have occurred. Input-listener rewrites are preserved and are
visible to change listeners.

The focus owner records the calendar commit before input listeners run. This
prevents a duplicate blur change from earlier text edits when the same element
changes type. A new text edit initiated by an input listener remains dirty and
still commits on blur; completion does not overwrite that newer edit history.

## Shared entry points

The command action-wait gate uses the same fillability and preparation helpers as
the interaction action, including waiting for readonly/disabled/hidden controls
to become actionable. Existing text-control and placeholder predicates remain
unchanged. Character-by-character calendar keyboard editing stays unsupported.
The command grammar and socket protocol do not change.

## Native evidence

All six initial regressions fail before implementation. The dedicated suite has
51 cases covering all five types, clearing, normalization, malformed values,
event shape/order, focus mutation/redirection, async prefixes, input rewrites,
commit bookkeeping, quotas, snapshots, validation and an injected command host.
The command-host fixture uses a synthetic transport/document adapter, not a live
network, socket, browser engine or SafeJS instance.

Focused validation passes 261 tests across seven explicit native files. Build,
strict new-test types and five-source lint/format checks pass.

An initial isolated run caught a test-only import of a pre-existing uncommitted
placeholder helper. That unrelated assertion was removed rather than including
the helper in this change. The text-control classification and unsupported
character-edit assertions remain; the isolated new-test types also pass.

The final full explicit native run passes 7,148 tests across 210 files. The
isolated HEAD snapshot with only the owned patch typechecks and passes 4,388
tests across its 149 available allowlisted files. Runs use Node v22.22.0 and
Vitest v4.1.10 on Linux x86_64. Pre-existing source changes remain uncommitted.

## Limits and acceptance gates

This is an agent fill action, not a locale-aware picker or native UI keyboard
implementation. Range/color fill, contenteditable fill, calendar valueAsNumber/
valueAsDate, stepping methods, complete WebIDL and reporting UI remain open.
The normalization policy deliberately accepts equivalent local-datetime syntax;
it is not a claim of exact Playwright error/normalization equivalence. Live-site,
socket, actual TTY/PTY and released SafeJS acceptance remain separately gated.
No such probe is authorized or run here.

Primary reference reviewed September 3, 2026 (source review only):

- Playwright's separate direct-value fill path and input/change sequence:
  https://github.com/microsoft/playwright/blob/main/packages/injected/src/injectedScript.ts
- Calendar value normalization and control states:
  https://html.spec.whatwg.org/multipage/input.html
