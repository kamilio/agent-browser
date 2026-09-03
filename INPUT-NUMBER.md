# Native numeric form constraints

September 3, 2026. Native number inputs now participate in validated submission
with required, min/max and step checks instead of treating every nonempty value
as unsupported. Existing number-value sanitization and fill admission share one
finite-value syntax predicate; their stricter input syntax is preserved.

## Implemented behavior

- Numeric constraint attributes use HTML's floating-point prefix parser: leading
  ASCII whitespace, a leading plus sign, trailing data and incomplete exponents
  can yield a number. Empty/unparseable attributes and values rounding to infinity
  are ignored. This intentionally differs from the full-string value sanitizer.
- Inclusive min/max checks report `range-underflow` or `range-overflow`. They do
  not clamp current input or reject a syntactically valid fill. Reversed bounds
  remain constraints rather than being swapped or silently ignored.
- Missing, invalid, zero and negative steps use the default step of one. An
  ASCII-insensitive `any` disables step checking but not range checking. Step
  bases prefer a parseable minimum, then the content value attribute, then zero;
  a dirty current value is not substituted for that default attribute.
- Step checking uses bounded decimal integer arithmetic on canonical finite
  Number spellings. It avoids overflowing a subtraction and avoids misclassifying
  a tiny-step quotient merely because floating division rounded it to an integer.
  No epsilon is introduced to silently accept a nonzero decimal remainder.
- Parsed numbers are finite IEEE-754 values; precision already lost during their
  conversion is not reconstructed from author strings. Decimal coefficient sizes
  and exponent alignment are bounded by finite Number spellings, not by the length
  of an authored exponent. No arbitrary-precision parsing of unbounded input occurs.
- Number-inapplicable pattern/minlength/maxlength attributes do not block
  submission. Required empty values, disabled/read-only exclusions, invalid-event
  cancellation, submit dispatch and explicit validation bypass remain shared.

The existing result reports one reason per invalid control, with range underflow
before overflow before step mismatch. This preserves one invalid event per
control; it is not an implementation of a multi-flag page ValidityState object.
Changes to attributes and defaults are observed on the next validation without
mutating the current value. Page value/defaultValue, native fills and form reset
feed the same native submission checks.

## Native evidence

Seven initial submission regressions fail before the fix; two number-newline
admission guards already pass and remain passing. The expanded 110-case file covers
prefix parsing versus value syntax, finite extremes, defaults, step bases,
inapplicable attributes, dynamic Attr mutation, event ordering, page properties,
async submission and resource-sensitive input. One case checks 5,265 independent
integer-lattice combinations; another uses 100,000-digit inputs/exponents while
keeping arithmetic bounded. Two obsolete unsupported-number submit cases are
replaced with the new validation coverage, not converted into bypasses.

Focused validation passes 331 tests across seven explicit native files. Production
build, strict types for both changed test files and six-source lint/format checks
pass. Pre-existing import order in the dirty controls adapter is retained.
The full native run passes 6,840 tests across 205 explicit files. An isolated HEAD
snapshot with only the owned helper, adapters and tests typechecks and passes
4,080 tests across 144 available allowlisted files. Runs use Node v22.22.0 and
Vitest v4.1.10 on Linux x86_64.

## Remaining scope

This checkpoint is native host/form evidence, not actual SafeJS, browser-engine,
website, framework, socket, real TTY/PTY or UI acceptance. No separately gated
probe runs. Cross-engine behavior near floating-point rounding boundaries remains
unverified; the canonical-decimal policy is explicit rather than a claim of
identical engine tolerances. Upstream WPT cases informed fixtures, but the actual
upstream browser suite was not executed.

UI bad-input state, localized number editing, page validity/reporting APIs,
valueAsNumber, stepUp/stepDown, calendar constraints, range/color sanitizers and
the full browser acceptance gates remain open. These numeric checks do not turn
raw form-data serialization into automatic constraint validation.

Primary references reviewed September 3, 2026:

- `https://html.spec.whatwg.org/multipage/input.html`
  Number state, min/max, step defaults and base selection.
- `https://html.spec.whatwg.org/multipage/common-microsyntaxes.html`
  Floating-point value syntax, prefix parsing and finite conversion.
- `https://github.com/web-platform-tests/wpt/blob/master/html/semantics/forms/constraints/form-validation-validity-stepMismatch.html`
  Decimal and tiny-exponent step fixtures used as research, not live evidence.
