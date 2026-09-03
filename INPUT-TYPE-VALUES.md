# Native input value-mode transitions

September 3, 2026. Changing an input's type now transfers or resets its value
through a native value-state owner, with dirtiness separate from the presence of
a current-value override. Previously, changing type could expose a stale edited
value or resurrect text that an intermediate numeric/URL state had sanitized.

## Implemented behavior

- Entering a reflected default/default-on mode from value mode copies a nonempty
  current value into the value attribute. An empty current value does not erase
  an existing default. The obsolete current override is released.
- Entering value mode from a reflected or filename mode starts from the current
  value attribute and resets value dirtiness. Moving between value modes keeps
  current state and applies the supported sanitizer, without resurrecting the
  previous raw default when switching back.
- Clean sanitized overrides remain separate from dirty edits. Later default
  changes, including setting an unchanged value attribute, update clean state
  without replacing dirty state. Reset and clone/import preserve this distinction.
- Type state lookup uses ASCII-insensitive matching with the text fallback.
  Changing spelling without changing the effective state does not resanitize it.
- Entering file mode releases the previous current value. Native file-mode reads
  return empty because no selected FileList is represented; value attributes are
  not interpreted as selected files. Page value setters permit clearing and
  reject nonempty strings with InvalidStateError.

The shared sanitizer retains the existing text/search/tel/password, URL, email
and number profile. Calendar/date/time, range and color sanitizers are not
completed here. Unsupported page value modes remain explicit rather than gaining
an apparent setter that claims full support.

## Mutation and resource integration

Direct attributes, attached Attr values, Attr replacement/removal and page type
setters share the same plan. The plan preflights combined text costs before the
type, copied default or current state changes, including materialized value Attr
records. It preserves their identity and keeps native retained-text accounting
exact. Failed quota checks do not partially change attributes, dirtiness or
checkedness. Existing Attr allocation admission rules still apply.

Value transfer is applied before radio-group reconciliation. Submission, reset,
serialization and page value/defaultValue observe the shared native state.
Dirty metadata is bounded by input nodes and released on tree closure. Unrelated
attributes do not perform a value-state node lookup. No dependency, browser
engine, guest runtime execution or filesystem file selection is introduced.

## Evidence and limitations

All thirteen initial regressions failed. Thirty-six new native cases cover value
mode transfer, irreversible sanitization, clean/dirty defaults, all type attribute
mutation paths, ASCII state lookup, copy/import, Attr identity, exact text
accounting, quota failure, reset/submission, radio grouping, page properties,
file clearing, non-input isolation and closure.

Focused validation passes 181 tests across seven explicit native files.
Full native validation passes 6,566 tests across 201 explicit files. An isolated
HEAD snapshot with only this owner/helper/adapter/test patch typechecks and passes
3,806 tests across 140 available allowlisted files. Production build, strict
new-test typechecking and six-source lint/format checks pass, preserving existing
import order in pre-existing dirty files.

The primary specification reviewed on September 3, 2026 is
`https://html.spec.whatwg.org/multipage/input.html`, covering type-change steps,
value modes and dirty/default state. This review and native test evidence do not
establish actual SafeJS, framework/site, socket, real TTY/PTY or UI acceptance.
No unapproved acceptance probe ran. Native FileList selection, cursor/selection
updates, complete value sanitizers, sanitization triggered by non-type constraint
attributes, full WebIDL behavior and application compatibility remain open.
Existing external form-upload arguments are separate from native file selection.
