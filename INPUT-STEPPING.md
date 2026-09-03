# Native page input stepping

September 3, 2026 continuation of `SEVEN-DAY-PLAN.md` and
`INPUT-VALUE-NUMBER.md`.

## Implemented profile

Input page capabilities expose `stepUp(count)` and `stepDown(count)` for number,
range, date, month, week, time and datetime-local. Other input types expose the
methods but throw InvalidStateError, as do applicable inputs with `step=any`.
Non-input elements do not acquire these methods. The methods return undefined.

Stepping reads the live type, min/max/step and current value. Step base comes from
min, then the value attribute, then the type's default epoch; the current dirty
value does not become the base. Range defaults reuse `rangeSettings`. Calendar
units and formatting reuse the numeric value API. Invalid steps use the type's
default. An unparseable current value seeds stepping at zero.

The arithmetic uses bounded canonical-decimal BigInts for alignment and clamping,
including scaling seconds/days/weeks without first overflowing a floating-point
product. Counts are converted to signed 32-bit integers; omitted/undefined means
one, nonfinite means zero, and negative counts reverse direction. There is no
per-step loop, including for large counts. Objects/functions and BigInt/Symbol
counts throw TypeError without invoking guest coercion callbacks.

Misaligned values snap in the signed direction, consuming the first requested
increment. Remaining increments then apply before bound clamping. Contradictory
bounds or a bounded interval containing no step point leave the value untouched.
An already numeric value never moves in the opposite signed direction merely to
reach a bound. Empty values can initialize at a bound in either direction.
Zero-count writes do not snap an off-grid current value, but still apply bounds.

Successful writes use the existing dirty/current value owner, preserve defaults,
clear user-edit provenance and dispatch no beforeinput/input/change events.
Zero-count successful writes also clear provenance. Rejected operations and
unrepresentable targets do not mutate state. Quotas preflight allocation before
state changes. Readonly, disabled and detached inputs can be changed by scripts;
document closure revokes retained methods.

## Compatibility and open work

This is a native stepping profile, not a complete cross-engine compatibility
claim. In particular:

- The signed-count, consumed-snap and empty-bound rules are compatibility choices.
  The reviewed HTML algorithm's wording differs in these edge cases. Current
  source references informed the choices; no desktop engine was run.
- Decimal targets must round-trip through a finite double's canonical decimal
  spelling exactly. Overflow, or loss at the subnormal/large-integer boundary,
  produces an unchanged value rather than an approximate off-grid result.
- Calendar formatting inherits numeric conversion limits and rounding from
  `INPUT-VALUE-NUMBER.md`. Sub-day date steps can format back to the same date;
  fractional month/millisecond steps use that API's rounding. A finite calendar
  target beyond the supported numeric date range clears the value. Full calendar
  stepping parity, including fractional units and representable endpoints, is open.
- Time serialization wraps across midnight after numeric bound processing. For
  example, decrementing an empty time with only a positive max can yield a late
  evening value above max. Reversed min/max time intervals do not step. These
  behaviors are not a claim of uniform engine behavior or complete periodic-range
  support.
- Guest object coercion, `valueAsDate`, widget presentation and released-runtime
  fidelity remain open. No live website, socket, real TTY/PTY or SafeJS probe ran.

## Research and evidence

Reviewed the HTML stepping algorithm at
`https://html.spec.whatwg.org/multipage/input.html#dom-input-stepup`, WPT empty/min
cases at
`https://github.com/web-platform-tests/wpt/blob/master/html/semantics/forms/the-input-element/input-stepdown-02.html`,
and the source-level signed-count/snap/empty rules at
`https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/html/forms/input_type.cc`.
Time-wrap ambiguity is tracked at `https://github.com/whatwg/html/issues/10503`.
These are research references, not imported engine code or executed acceptance
tests. Our engine remains independent and adds no runtime dependency.

Seven baseline page-method tests fail before implementation. The explicit native
allowlist gains 100 tests covering all applicable types, conversion, exceptions,
alignment, bounds, empty initialization, decimal limits, calendar edges, ownership,
events, quotas and closure. A separate enumerated-grid oracle checks 225 signed
count/start combinations inside one test. Initial authored expectations were
corrected after independent epoch/grid arithmetic showed their off-grid starts
and the actual subnormal rounding loss; those were test corrections, not engine
results. Focused checks pass 537 tests across seven files.

Working-tree validation passes 7,499 tests across 215 explicitly allowlisted native
files, plus production/new-test type checks, build and four-source Biome checks.
Tests run under Node v22.22.0; the full suite uses normal file ownership. Existing
historical reports and measurements are unchanged.

An isolated HEAD snapshot plus only this owned source/allowlist patch passes
production/new-test type checks and 4,739 tests across its 154 available native
files. The smaller set reflects pre-existing pending work, not failing-case
exclusions. Only the owned import/method-wiring hunk from the pending ScriptDom
rewrite is part of this checkpoint.
