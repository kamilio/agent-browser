# Native range fill actions

September 3, 2026. Range controls now use the native direct-value fill path,
including the command action-wait gate. This connects the range value owner to
an agent action without treating a slider as a character-editing text field.

## Requested-value contract

Fill trims surrounding whitespace and requires a nonempty finite numeric value.
The shared range sanitizer must preserve the requested spelling after trimming;
if bounds or step alignment would alter it, fill fails before its value write
instead of silently substituting another value. This differs intentionally from
page value assignment, which keeps the range sanitizer's clamping/default policy.

Accepted numeric spellings, including exponent notation, are preserved. Fractional
steps and `any` use the same native rules as page values and validation. If an
author supplies an impossible constraint for which sanitization preserves a value,
fill does not invent valid flags: normal constraint validation still reports it.

## Action and event behavior

Range fill shares calendar fill's focus/revalidation/direct-commit path. It writes
native user-edit state, then emits generic bubbling input and change events;
input is composed and neither event is cancelable. No beforeinput, synthetic
character selection or blur-time duplicate change is added. Same-value fills
still produce the committed event pair. Input-listener rewrites are preserved.

The shared readonly predicate distinguishes text/calendar controls from ranges:
readonly remains effective for the former and is inapplicable to range fill.
Disabled, hidden and otherwise non-actionable states still block the action.
After synchronous or controlled asynchronous focus listeners, the action checks
the type and newly effective min/max/step before writing. Callback-owned bound
mutations are not rolled back if they cause the requested fill to be rejected.

The action-wait gate uses the same predicates and preparation, so it does not
poll forever solely because a range carries a readonly attribute. It still waits
for applicable blockers such as disabled state. Malformed or adjustment-requiring
requests on a ready control fail without entering the action callback. Quota
rejection preserves the previous value and edit-origin metadata, though focus
may already have occurred.

## Native evidence

All three initial regressions fail before implementation. The 42 new cases cover direct and
async entry points, exact requests, rejected clamping/rounding, readonly behavior,
focus-time constraints/type changes, impossible constraints, event shape/order,
listener rewrites, quota failure and an injected command host. Calendar/text fill
regressions remain in the explicit native validation scope.

Focused validation passes 189 tests across six explicit native files. Build,
strict new-test types and four-source lint/format checks pass.

The full explicit native suite passes 7,249 tests across 212 files. The isolated
HEAD snapshot plus only the owned patch passes production/new-test type checks
and 4,489 tests across its 151 available allowlisted files. Runs use Node v22.22.0
and Vitest v4.1.10 on Linux x86_64. No separately gated acceptance probe ran.

## Remaining gates

Pointer dragging, keyboard slider adjustment, range-specific presentation and
full accessibility behavior, numeric page methods and exact desktop-engine
numeric tolerance remain open. This does not add a range-specific implicit
submission behavior. Live-site, socket, actual TTY/PTY and SafeJS acceptance are
separately authorized gates; none runs here. The command fixture uses injected
transport/document adapters, not a real website or browser engine.

Primary references reviewed September 3, 2026 (source review only):

- Direct-value fill and rejection of changed requested values:
  https://github.com/microsoft/playwright/blob/main/packages/injected/src/injectedScript.ts
- Range state and readonly applicability:
  https://html.spec.whatwg.org/multipage/input.html
