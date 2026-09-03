# Native form control defaults

September 3, 2026. Input elements now expose `defaultValue` and `defaultChecked`;
textarea elements expose `defaultValue`. These properties share the existing
attribute/text and current-control owners rather than keeping a second copy of
defaults. No runtime dependency or SafeJS change is introduced.

## Implemented behavior

- Input `defaultValue` reflects the value attribute without sanitizing its stored
  text. Current values still use the existing input-type sanitization.
- Input `defaultChecked` reflects checked-attribute presence with boolean
  conversion. Checkbox defaults affect clean checkedness, not dirty checkedness.
- Textarea defaults concatenate direct text children only, excluding comments and
  nested element text. Setting the default replaces children with literal text.
  Clean textarea values now use this same direct-child rule instead of descendant
  text, with newline normalization applied only to the current value.
- Editing a current value, including writing its existing value, keeps it separate
  from later default edits. Reset clears the current override and uses the latest
  default. Input value modes that reflect attributes continue to do so.
- Default string setters stringify null as `"null"`, unlike current `value`
  setters' null-to-empty behavior. Existing object/Symbol string-conversion
  restrictions remain explicit; no untrusted coercion callback is executed.
- Default changes feed native serialization, submission and selector state.
  Cloning retains default/current separation. Closure and allocation/text limits
  use the existing owners; failed default updates do not partially replace data.

Primary specifications reviewed September 3, 2026:
`https://html.spec.whatwg.org/multipage/input.html` and
`https://html.spec.whatwg.org/multipage/form-elements.html#the-textarea-element`.
The input reflection declarations and textarea child-text/default setter rules
are the basis for these native fixtures, not live browser execution evidence.

## Validation

Seven of eight initial cases fail on the previous implementation; all eight pass
with the bindings and shared textarea correction. Forty-four cases now cover
defaults, dirty state, reset, conversion, checked presence, supported input value
modes, sanitization, direct text, clones, serialization, submission, selectors,
quotas and closure. Two expanded tests initially expected the wrong wording for
an existing conversion error; only their message expectations were corrected.

An instrumented textarea default read with 100 nested text descendants performs
four native node reads: binding validation, the textarea, its direct text child
and its direct element child. It does not traverse the nested descendants. This
is an operation-count fixture, not a runtime performance benchmark.

Focused validation passes 112 tests across six explicit native files. Production
build, strict new-test typechecking and targeted lint/formatting pass.
The first isolated run exposed one test's reliance on pre-existing uncommitted
placeholder selector support. That test now checks checked/default-attribute
selector separation using the committed selector implementation; no production
selector behavior was changed or bundled into this patch.
The corrected isolated patch typechecks and passes 3,710 tests across 137
available allowlisted files, without the unrelated unfinished browser changes.
The final full working-tree native run passes 6,470 tests across 198 explicit
files, with no unhandled errors.

## Open follow-up and acceptance gates

A separate native reproduction confirms a pre-existing radio-owner limitation:
with two same-name radios and the later one initially checked, adding `checked`
to the clean earlier radio leaves the later one selected. The expected selection
is the earlier radio. `defaultChecked` reflects the same attribute owner and
therefore inherits this limitation. Correct radio checkedness mutation order and
clean/dirty peer transitions are the next form-state task; this checkpoint does
not claim full radio conformance. The reproduction used only native objects,
not a guest runtime or website, and was not counted as a passing acceptance test.

Output defaults, unsupported input value modes, object conversion, full prototype
and WebIDL fidelity, actual SafeJS execution and real application compatibility
remain open. No live website, socket, TTY/PTY or SafeJS acceptance probe ran. The
existing historical reports retain their original paths and measurements.
