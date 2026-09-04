# Native button Auto semantics

September 4, 2026 checkpoint in the standalone TypeScript browser.

## Problem and reference

Modern select parsing now preserves button descendants. Constraint validation
already distinguished Auto buttons with command attributes or a direct select
parent, but activation, form submitter resolution, implicit submission and the
native host type getter still treated them as ordinary submit buttons.

The WHATWG HTML button definition and type getter were reviewed on September 4:
`https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element`.
Missing and invalid type values use Auto. Auto is a submit button only when
neither command attribute is present and its direct parent is not select.
Explicit submit/reset/button keywords remain distinct. The type getter returns
submit for a submit button and button for a remaining Auto button.

## Implementation

- `src/button-type.ts` provides the shared computed button type and submit-button
  predicate. Keyword matching folds ASCII case without trimming. Attribute
  presence, not command validity or target lookup, controls the Auto exception.
- `src/forms.ts` uses the predicate for submitter validation and successful button
  entries. Input submit/image handling remains separate from button Auto rules.
- `src/form-validation.ts` reuses the predicate without changing its disabled,
  datalist, readonly or other control eligibility checks.
- `src/interactions.ts` computes the default intent from current state after click
  listeners. Explicit submit and reset still take precedence over command attrs.
- `src/keyboard.ts` discovers the actual default submit button before applying
  existing disabled-button and implicit-submission blocking rules.
- `src/script-form.ts` computes the native host type getter from current tree
  state while retaining the raw attribute setter and owner-liveness checks.

Each button check reads only its attributes and, for Auto, its direct parent.
There is no new descendant scan, persistent cache, runtime dependency or browser
engine integration. Moves, clones, detachment and attribute changes therefore
do not need new invalidation bookkeeping. Form ownership remains independent
of the direct-parent condition.

## Validation boundary

The three initial regressions fail before integration: select-child type
reflection, command-button activation and implicit default-button discovery.
The native regression file also covers case/invalid keywords, command presence,
explicit overrides, direct versus deeper select ancestry, mutation, raw setters,
cloning, disabled/inert classification, successful entries, input controls,
implicit-submission blocking, listener-time changes and closed host access.

Native host-object factories exercise the existing binding implementation, not
SafeJS or another page runtime. Form tests prepare requests without making
network requests. Tests use the explicit `native-tests.json` allowlist.

- 48 new native tests pass; the focused nine-file run passes 277 checks.
- Full worktree native validation passes 8,845 tests across 244 files.
- An archived-HEAD tree with only the owned patch passes 6,085 tests across
  183 available allowlisted files. Pre-existing untracked suites are absent.
- Production typechecks, builds, the new test's strict typecheck and seven-file
  lint pass in both trees.
- Pending interaction and keyboard work is not included in the checkpoint.
  The keyboard change is adjusted to HEAD's indentation; reversing the new
  helper import and predicate replacement reconstructs both original files
  byte for byte. The pre-existing task ledger additions remain separate.

## Outstanding gates

This checkpoint does not implement select-button implicit inertness, inherited
inert targeting, selectedcontent cloning, picker behavior, command dispatch,
popover/dialog actions, rendering parity or full HTML conformance. A computed
button type is not a replacement for disabled state or user-input actionability.
In particular, explicit submit remains a submit button even when inert; this
does not establish that an inert button can receive user input.

No live website, socket, real TTY/PTY or SafeJS probe ran for this checkpoint.
The previously denied SafeJS probe remains unrun. Native results do not close
those independent acceptance gates. `TASKS.md` and `SEVEN-DAY-PLAN.md` retain the
overall browser scope, next work and active seven-day goal.
