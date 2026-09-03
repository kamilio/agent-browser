# Native custom errors and validity checks

September 3, 2026. Controls now retain custom validation messages in the native
document rather than requiring page-only state disconnected from submission.
Page `setCustomValidity()`, `willValidate` and `validationMessage` share candidacy
and error evaluation with native submission and native check-validity actions.

## Implemented behavior

- The document owns messages by element ID. Setters normalize CRLF/CR to LF;
  nonempty whitespace remains an error. The page setter uses the existing
  primitive DOM-string conversion rules and requires a message argument.
- Normalized UTF-16 message length shares the document's retained-text quota.
  Failed admission leaves the prior message, revision and control state intact.
  Replacements and clearing release old costs; equivalent normalized messages
  do not emit extra changes. Change records contain IDs/kinds, not message text.
- Reset, type changes and detachment preserve the custom error. Cloning/import
  create new elements without copying it; HTML serialization does not expose it.
  Document closure clears all message ownership and revokes held page access.
- Shared candidacy covers disabled fields, first-legend exceptions, datalist
  ancestors, applicable readonly states and permanently barred controls. Submit
  and image inputs can carry custom errors. Button candidacy distinguishes
  explicit submit from reset/button and the auto state's command/select exclusions.
- Barred controls retain their custom error but expose an empty validationMessage
  and do not block validation. Eligible controls return their custom message before
  the supported built-in error message. Built-in messages are currently English.
- Native `DocumentForms.checkValidity()` and `checkValidityAsync()` accept a form
  or connected validation-control reference. They dispatch cancelable, nonbubbling
  invalid events without submitting or reporting UI. They ignore form novalidate;
  listener cancellation/repair does not turn the initial invalid result into true.

Form submission and check-validity reuse the same constraint evaluator. Custom
errors produce `custom-error` and block submission even when built-in validation
would otherwise pass. If a custom error is cleared on a control with unimplemented
constraints, the existing explicit unsupported result remains: unknown validity
does not become success. A form's invalid targets are captured before callbacks,
so repairing or detaching later controls does not discard their scheduled events.

## Native evidence

All six initial regressions fail. The new 53-case file covers custom errors on
input/textarea/select/button, candidacy states, detached fieldsets and datalists,
message conversion/newlines, exact shared quota accounting, failed mutation,
default/reset/type behavior, clone/import, serialization, closure, external form
ownership, synchronous and controlled asynchronous events, stale references and
document isolation. Native checks do not fire submit events or honor novalidate.

Focused validation passes 279 tests across six explicit native files. Production
build, strict new-test types and targeted six-source lint/formatting pass, retaining
pre-existing import order in the dirty document and page adapters.
The full native run passes 6,893 tests across 206 explicit files. An isolated HEAD
snapshot containing only the owned storage, evaluator, action, adapter and test
patch typechecks and passes 4,133 tests across 145 available allowlisted files.
Runs use Node v22.22.0 and Vitest v4.1.10 on Linux x86_64.

## Runtime and UI boundaries

The page checkValidity method is not exposed here. SafeJS callbacks use the
existing asynchronous prefix contract; pretending those callbacks synchronously
completed would break event semantics. Native synchronous checks reject controlled
listeners, while native asynchronous checks await them. The controlled callback
fixtures do not execute SafeJS or close its runtime acceptance gate.

Live multi-flag ValidityState, page checkValidity, reportValidity, localized/focused
error UI, complete WebIDL conversions, custom-element internals and remaining
pattern/length/calendar/range/color constraints remain open. Native check-validity
does not supply external upload options as a substitute for a selected FileList.
No website, framework, socket, TTY/PTY or runtime acceptance probe runs here.
Actual button command activation remains separate from its validation candidacy.

Primary specifications reviewed September 3, 2026:

- `https://html.spec.whatwg.org/multipage/form-control-infrastructure.html`
  Custom error ownership, newline normalization, candidacy, validation messages
  and static check-validity event behavior.
- `https://html.spec.whatwg.org/multipage/input.html`
  Barred input states and the input cloning steps.
- `https://html.spec.whatwg.org/multipage/form-elements.html`
  Button auto/submit candidacy and permanently barred control interfaces.
