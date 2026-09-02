# Label activation and form reset

September 1, 2026. Internal TypeScript SDK behavior, not a functioning page DOM
or a browser-level compatibility claim. No dependencies were added.

The later `FORM-NAVIGATION.md` checkpoint connects submit activation to supported
validation, submit events, guarded GET/POST transport and session document loading.
This file documents the earlier label/reset layer; parsed HTML and website JS remain absent.

That absence describes this historical checkpoint. `HTML.md` adds parsed forms,
and `NATIVE-SCRIPT-ACTIONS.md` now drives label/reset/submit behavior with actual
SafeJS guest listeners. Automatic website script discovery/loading remains absent.

## Labels

`labelControl(tree, labelId)` resolves a connected native label. An explicit `for`
uses the first element with that ID only if it is labelable; it overrides nested
controls even when empty or unresolved. Otherwise, the first labelable descendant
is associated. Native labelable elements include non-hidden inputs, buttons,
selects, textareas, meters, outputs and progress elements. The revision-cached
index also supplies native label names to semantic snapshots.

`DocumentInteractions.click(labelRef)` dispatches the original click before
resolving the current association. If not canceled, it forwards one click to the
associated control. Clicking an interactive descendant does not forward another
activation. Disabled or inert controls are excluded. An explicitly hidden checkbox
can be activated through its visible label even though a direct action rejects it.
An input of type hidden is not labelable. Same-element recursive clicks are guarded.

`InteractionResult.label` records the original label reference, associated control
reference when present, forwarding decision and forwarded click cancellation.
The original click's `defaultPrevented` remains separate. Forwarded control state,
pending submission/picker intent or completed reset result is returned with the
original requested reference. Detached or removed labels are not activated.

This is a chosen click-forwarding policy, not all-platform label equivalence.
Focus transfer, full pointer/mouse sequences, computed CSS visibility, custom-element
labelability and the complete accessible-name algorithm remain unimplemented.

## Reset

`DocumentInteractions.forms.reset(formRef)` and reset-button activation use the
same `DocumentForms.reset` algorithm:

1. Require a live connected form and the matching active document event bus.
2. Guard recursive resets of that form; dispatch bubbling, cancelable `reset`.
3. On cancellation, retain listener mutations but do not apply native reset.
4. Re-resolve the form and collect its current associated controls after callbacks,
   including external owners. Reject unsupported output controls before partially
   resetting any control.
5. Collect a reset plan, then clear input value/checked dirty overrides, textarea
   value overrides and select-option selected overrides. Subsequent reads derive
   values from current default attributes/text and existing radio/select rules.

Disabled and readonly controls still reset. Indeterminate checkbox state is
preserved. Reset emits no input/change events. The result distinguishes completed,
canceled and recursively suppressed reset, with form reference, number of reset
controls and final revision. Canceling the reset event is distinct from canceling
the reset button's click. Listener mutations are not rolled back on cancellation
or errors, and the recursion guard is released on all exits.

`DocumentTree.clearControl` validates field names before mutation, releases value
text quota and updates revision only when an override existed. The reset plan is
collected before state changes so large select forms do not rebuild indexes once
per select. This is host SDK functionality, not a website-exposed unrestricted API.

Missing semantics are explicit: output/defaultValue reset, intrinsic FileList,
specialized input sanitization, user-validity state, custom-element reset callbacks
and detached-form DOM behavior. `prepareFormSubmission`'s caller-supplied file map
is an external payload override, not persistent input state; reset cannot clear it.
Submission, validation and implicit Enter actions still require implementation.

## Evidence

- `src/form-actions.test.ts`: 11 reset/event/state/ownership/quota tests, including
  a 300-select index-rebuild regression.
- `src/label-actions.test.ts`: 15 label/activation/snapshot regression cases.
- `reports/unit-node-2026-09-01-form-actions.json`: all 409 Node tests pass.
- `reports/form-actions-bun-2026-09-01.json`: 73 focused portable checks pass.
- `reports/form-actions-node-2026-09-01.json`: two real HTTP echo POSTs verify
  label activation, reset defaults, refilling, event ordering and serialized values.

The HTTP probes use constructed documents and trusted host callbacks, not parsed
websites or website JavaScript. File bytes are supplied explicitly after reset.
No parser/runtime, CLI-superset or Kitesurf parity gate is completed by this evidence.

Reference algorithms inspected (not vendored):
`https://html.spec.whatwg.org/multipage/forms.html#the-label-element`,
`https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#resetting-a-form`
and `https://html.spec.whatwg.org/multipage/input.html#the-input-element`.
