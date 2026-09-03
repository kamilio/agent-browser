# Native numeric input properties

September 3, 2026 continuation of `SEVEN-DAY-PLAN.md`.

## Implemented profile

Page input capabilities expose a live `valueAsNumber` getter/setter for number,
range, date, month, week, time and datetime-local. Numeric values share the current
value owner with `.value`, submission, constraints, cloning and reset. Script
writes mark the value dirty, clear user-edit provenance even on same-value writes,
preserve defaults and do not dispatch beforeinput/input/change. Readonly and
disabled attributes do not block script assignment. Quota failure is atomic.

Number inputs retain finite doubles; range inputs reuse the existing clamping,
step alignment and NaN/default sanitizer. Calendar coordinates reuse the existing
calendar parser. Dates and local datetimes use epoch milliseconds, months use
offsets from January 1970, weeks use their Monday epoch and times use milliseconds
since midnight. Formatting uses only UTC native Date operations, not local timezone
conversion or date-string parsing. Time assignment wraps across days.

NaN clears applicable controls before sanitization. Infinity throws TypeError
before testing type applicability; unsupported input types read as NaN and reject
finite/NaN setters with InvalidStateError. Null, undefined, booleans and strings
use primitive numeric coercion. BigInt, Symbol, functions and objects are rejected;
object conversion hooks are deliberately not executed. Closed document guards
run before either getter or setter conversion.

## Explicit limits

- Numeric calendar conversion supports positive years within the native Date
  epoch interval: year 0001 through September 13, 275760 inclusive. Local datetime
  stops at midnight on that final date; month stops at September 275760. Week
  getters use the Monday's timestamp. Out-of-profile getters yield NaN without
  changing the string; finite out-of-profile setters clear the value.
- The broader arbitrary-length calendar **string and constraint** profile remains
  unchanged. Numeric conversion rejects oversized years before constructing a
  year-sized BigInt; it does not claim arbitrary-precision numeric dates.
- Calendar numeric setters round to integer milliseconds/months, with half ties
  away from zero. This is an explicit native policy, not verified fractional
  behavior across current desktop engines.
- Object-to-number WebIDL coercion, `valueAsDate`, `stepUp`/`stepDown`, full widget
  presentation and platform event parity remain open.
- Tests use native fake page capabilities, not a released SafeJS runtime. No
  website, socket, TTY/PTY or SafeJS acceptance probe was run for this checkpoint.

## Research boundary

Reviewed the WHATWG input APIs and type-specific numeric algorithms on September
3, 2026: `https://html.spec.whatwg.org/multipage/input.html#dom-input-valueasnumber`.
Reviewed WPT source at
`https://github.com/web-platform-tests/wpt/blob/master/html/semantics/forms/the-input-element/input-valueasnumber.html`,
including large time wrapping versus out-of-range local datetime conversion.
These were source reviews, not executions of WPT in an external browser.
Historical conversion policy was also inspected at
`https://chromium.googlesource.com/chromium/blink/+/master/Source/platform/DateComponents.cpp`;
it is not current-engine validation or an imported engine dependency.

## Native evidence

Seven initial page getter regressions failed because the property was absent.
The explicit allowlist now includes 98 new cases, covering all applicable types,
primitive conversion, exception ordering, time wrapping, calendar boundaries,
large years, origin/default/clone/reset ownership, live validity, no edit events,
quota atomicity and closure. A deterministic Gregorian-cycle check covers 4,800
date/local-time/week samples; these are assertions within one test, not 4,800
separately counted tests. Focused validation passes 541 tests across eight files.
Production and new-test type checks pass in the working tree.

Working-tree full native validation passes 7,399 tests across 214 allowlisted
files. An isolated HEAD snapshot plus only this owned source/allowlist patch
passes production/new-test type checks and 4,639 tests across its 153 available
allowlisted files. The difference is pre-existing pending work, not excluded
failing cases. Node v22.22.0 was used; native suites ran with normal file ownership.
Working build and four-source Biome checks also pass. Historical measurements and
reports are unchanged.
