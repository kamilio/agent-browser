# Native calendar constraint validation

September 3, 2026. Date, month, ISO week, time and local-datetime inputs now share
range and step flags with native form submission and live page validity. This
extends the value sanitizers recorded in `INPUT-CALENDAR.md`; it does not rewrite
that earlier checkpoint or claim picker/runtime acceptance.

## Supported behavior

- Valid calendar min/max attributes define inclusive bounds; malformed bounds
  are ignored. Empty values retain the existing required/optional behavior.
  Inapplicable pattern and length attributes do not disable calendar validation.
- A time range can span midnight. Values in its excluded middle have both range
  flags; its valid endpoints and midnight-side values have neither. Nonperiodic
  date/month/week/local-datetime ranges do not wrap contradictory bounds.
- Step uses days, months, weeks or seconds according to the input state. Defaults
  are one date/month/week unit or sixty seconds for time/local datetime. The base
  comes from valid min, then the value content attribute, then the type's epoch;
  ISO weeks use the Monday of 1970-W01. Native current-value assignments do not
  accidentally become the step base. Case-insensitive `any` disables stepping.
- Time stepping uses a fixed millisecond coordinate and does not wrap its lattice
  at midnight. Local datetime arithmetic does not apply host timezone or daylight
  saving offsets. Fractions are counted in milliseconds.
- Independent range and step flags can coexist with custom errors. Submission
  still chooses the existing prioritized reason and dispatches one invalid event
  per failing control. Disabled/read-only candidacy remains separate from flags.

## Arithmetic and resource policy

The implementation reuses strict calendar sanitization and the existing numeric
attribute parser/canonical-decimal decomposition. It uses integer arithmetic for
calendar coordinates and decimal step congruences, avoiding floating-point epoch
rounding and overflow during step scaling. This is the native exact-decimal policy,
not a claim of identical desktop-engine tolerance or extreme-year limits.

Years are compared as normalized decimal strings. Step checks reduce nine-digit
chunks modulo a bounded step-derived period; Gregorian dates use the 400-year
cycle. No arbitrary-length input year is converted wholesale to BigInt in
production. Intermediate integer width depends on finite step precision, not on
the number of year digits. Year scanning and temporary strings remain linear in
the document-quota-bounded input size. No new cache, retained owner or dependency
is introduced.

## Native evidence

The initial five range regressions all fail before implementation. The new suite
has 101 cases, including independently computed UTC day/week oracles across
1600–2399, full-integer comparisons for 513-digit years, a 100,000-digit year,
leap/century boundaries, negative epoch offsets, reversed ranges, fractional and
extreme finite steps, base precedence, live page mutation and submission events.
UTC Date objects are used only in test oracles, not in production evaluation.

Focused validation passes 470 tests across seven explicit native files. Build,
strict focused-test types and five-source lint/format checks pass. The earlier
unsupported-date expectation is removed; five empty-calendar submission cases
now also verify valid nonempty values rather than expecting unsupported errors.

The complete explicit native suite passes 7,097 tests across 209 files. An isolated
HEAD snapshot plus only this owned source/test patch typechecks and passes 4,337
tests across its 148 available allowlisted files. Runs use Node v22.22.0 and
Vitest v4.1.10 on Linux x86_64. No separately authorized acceptance probe ran.

## Remaining acceptance gates

Calendar text fill/keyboard editing, locale-aware pickers, invalid UI edit buffers,
valueAsNumber/valueAsDate and stepUp/stepDown are not implemented by this patch.
Pattern/range/color constraint profiles, independently decidable flags inside
unsupported profiles, synchronous page checkValidity/reportValidity, complete
WebIDL and reporting UI remain open. Real SafeJS, live-site, socket and TTY/PTY
acceptance still require separate authorization; none runs here.

Primary specification reviewed September 3, 2026:

- Calendar states, type-specific conversion/scaling and step-base rules:
  https://html.spec.whatwg.org/multipage/input.html
- Periodic time ranges and simultaneous underflow/overflow:
  https://html.spec.whatwg.org/multipage/input.html#the-min-and-max-attributes
- Calendar string syntax:
  https://html.spec.whatwg.org/multipage/common-microsyntaxes.html
