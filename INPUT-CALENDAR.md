# Native calendar input values

September 3, 2026. Native `date`, `month`, `week`, `time` and `datetime-local`
inputs now share strict value sanitization across defaults, page value setters,
type transitions, cloning, reset and form-data serialization. Invalid strings
become empty rather than appearing to be valid calendar values.

## Implemented behavior

- Date and month values require a positive year of at least four ASCII digits,
  two-digit months and, for dates, a valid Gregorian day. Leap centuries and
  arbitrarily long year strings use a bounded 400-year remainder, not floating
  point conversion of the entire year or host Date/timezone interpretation.
- Week values require uppercase `W` and two-digit weeks. Week 53 exists only
  when January 1 is Thursday, or Wednesday in a leap year.
- Time values require two-digit hours and minutes; optional seconds may have
  one to three fractional digits. Hour 24, leap seconds, zones, whitespace,
  Unicode digits and malformed separators are rejected.
- Valid date/month/week/time strings retain their spelling, including padded
  years and zero fractional seconds. Local datetimes accept `T` or one ASCII
  space, then normalize to `T` and the shortest equivalent time spelling.
  Local datetimes do not undergo UTC conversion or daylight-saving adjustment.
- Page setters use the shared sanitizer instead of indiscriminately deleting
  newlines. Invalid calendar and numeric values cannot become valid by joining
  text across line breaks. Existing text-like sanitizers retain their behavior.

The helper has no Date, locale, guest-runtime or dependency requirement. Calendar
syntax checks are linear in source length. Native retained-text quotas still
apply to accepted stored values, with failed admission leaving state unchanged.

## Native evidence

All 21 initial native regressions failed before implementation. The expanded
75-case file covers invalid syntax, valid spelling, canonicalization, page
setters, default/dirtiness integration, copying, reset, serialization, submission,
irreversible type transitions, newline handling and quota atomicity. One case
independently checks 24,000 month-end candidates and week boundaries throughout
400 years against UTC Date calculations; another exercises 100,000-digit year
prefixes. Date is used only in the independent test oracle, not production.

Focused validation passes 175 tests across four explicit native files. Production
build, strict new-test typechecking and targeted four-source lint/format checks
pass, preserving pre-existing import order in the dirty page adapter.
Full native validation passes 6,641 tests across 202 explicit files. An isolated
HEAD snapshot with only the owned calendar helper, adapter, sanitizer and tests
typechecks and passes 3,881 tests across 141 available allowlisted files.

## Scope and outstanding gates

These are native value-syntax and host-adapter checks, not actual SafeJS execution
or evidence from a browser engine, real website, socket, TTY/PTY or user interface.
No separately gated acceptance probe runs for this checkpoint. Form-data
serialization tests do not imply constraint-validation support: nonempty calendar
values still encounter the existing unsupported validated-submit path.

Calendar pickers, fill/type interactions, min/max/step constraints, stepping,
`valueAsDate`, `valueAsNumber`, cursor/selection, complete WebIDL behavior,
range/color sanitizers and native FileList selection remain open. This checkpoint
does not change the historical evidence in `INPUT-TYPE-VALUES.md`.

Primary WHATWG references reviewed September 3, 2026:

- `https://html.spec.whatwg.org/multipage/common-microsyntaxes.html`
  Date, month, week, time and normalized local-date-and-time syntax.
- `https://html.spec.whatwg.org/multipage/input.html`
  Calendar-state value sanitization algorithms.
