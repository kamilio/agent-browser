# Native slider keyboard actions

September 3, 2026. Focused native range inputs now respond to directional arrows,
Home/End and PageUp/PageDown. Keyboard commands, current values and constraint
validation share the range state's bounds, step base and decimal arithmetic.

## Keyboard profile

- Right/Up increase and Left/Down decrease by one permitted step. Home/End select
  the first/last allowed point, which need not equal an unaligned bound.
- PageUp/PageDown move ten steps and stop at the allowed endpoint.
- With step=any, arrows move one percent of the effective range relative to the
  current value and page keys move ten percent. Home/End use the actual bounds.
  This is an explicit native UI policy, not a claim of identical platform defaults.
- Control, Meta and Alt chords are left alone. Printable typing remains distinct
  from slider adjustment. Readonly is inapplicable, while disabled, disconnected,
  hidden or unfocused controls do not receive value writes.
- Equal/reversed bounds, ranges containing no permitted point, unrepresentable
  changes and already-reached endpoints do not create a false adjustment.

The `rangeKeyboard` command capability and exported `rangeKeyboardCapabilities`
describe this partial profile, including its direction, page amount, any-step
fraction and per-command notification policy. The profile does not reverse arrows
for CSS writing direction/orientation or implement custom ARIA slider widgets.

## Numeric and event ownership

Bound, base and step settings are shared with range sanitization. The keyboard
helper scales canonical decimals to bounded integers before moving or clamping,
so enormous spans and page increments cannot overflow into a midpoint fallback.
Subnormal steps are handled without allocating integers from arbitrary raw values.
The result must remain finite and accepted by the existing range validator; a
number that cannot represent the intended grid point does not produce an edit.

Cancelable keydown and controlled asynchronous callbacks precede the adjustment.
The action reads current bounds and value after those callbacks, and rechecks
focus and enabled state. An accepted change writes native user-edit state and
commits the focus baseline before generic input/change events, followed by the
existing keyup flow. There is no beforeinput text-edit event or invented caret.
No-op adjustments emit no input/change events and do not mark an untouched value
as user-edited. Listener rewrites survive, and blur does not duplicate the commit.
Document text-quota rejection leaves the value and origin unchanged.

## Native evidence

All three initial slider-key regressions fail before implementation. The 52 new
cases cover every key, fractional/base-dependent steps, repeated decimal changes,
an independent integer-grid oracle, any-step policy, extreme/subnormal values,
boundary no-ops, event shape/order, cancellation, callback mutations, focus loss,
readonly/disabled behavior, quota rejection and injected command execution.
Focused validation passes 224 tests across six explicit native files. Build,
strict new-test types and six-source lint/format checks pass.

The pre-existing working-tree keyboard has additional uncommitted functionality.
The owned integration is also applied to the committed HEAD keyboard baseline for
isolated validation; unrelated held-key, scrolling and selection work is not added
to this commit. Native commands and injected events are not a real TTY/PTY probe.

Initial isolated type checks exposed the older parser's missing Alt field and
slider navigation admission. The owned patch adds those only for focused ranges,
retaining the committed parser's existing restrictions for other controls. Its
focused slider plus existing-keyboard run passes 78 tests across two files.

The full explicit native suite passes 7,301 tests across 213 files. The isolated
owned patch passes production/new-test type checks and 4,541 tests across its
152 available allowlisted files. Runs use Node v22.22.0 and Vitest v4.1.10 on
Linux x86_64. No separately gated acceptance probe ran.

## Remaining gates

Pointer dragging, native slider presentation, orientation/RTL fidelity, complete
accessibility behavior, platform-specific event timing and decimal-tolerance
parity remain open. This does not add numeric page methods or a picker. Actual
SafeJS, live-site, socket and TTY/PTY acceptance still require separate authorization;
none runs here.

Primary references reviewed September 3, 2026:

- WAI slider keyboard pattern and optional larger page increments:
  https://www.w3.org/WAI/ARIA/apg/patterns/slider/
- Native range bounds, step base and value alignment:
  https://html.spec.whatwg.org/multipage/input.html
