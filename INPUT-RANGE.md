# Native range value ownership

September 3, 2026. Range inputs now sanitize their current value, participate in
native constraint validation and accept page value assignments. The shared value
owner also handles min/max/step changes instead of recomputing an unrelated new
default on every read.

## Value behavior

Range defaults use the midpoint of the effective bounds (0 and 100 when absent
or invalid). Invalid or empty value strings use that default. Values clamp to
the minimum and to a non-reversed maximum, then align to the permitted step when
a point exists. Equal-distance step choices go toward the larger value. Any
disables alignment; invalid, zero and negative steps use one. A valid min defines
the step base, otherwise a numeric value attribute does, otherwise zero does.

The existing strict finite numeric-value grammar and permissive numeric-attribute
parser remain shared with number inputs. Unchanged valid numeric spellings are
preserved; adjusted values use native number serialization. Canonical-decimal
BigInt arithmetic aligns steps without binary subtraction artifacts or converting
long raw numeric literals wholesale to BigInt. Intermediate width depends on the
finite numbers' bounded decimal exponents, not input literal length. Midpoint
calculation avoids overflow when the two finite bounds span an enormous interval.

Reversed bounds do not silently become a normal interval. Overflow can remain
true, and a range containing no allowed step point can retain stepMismatch. This
is the native canonical-decimal policy, not evidence of exact desktop-browser
rounding tolerance or all extreme-precision behavior.

## Mutation ownership

Min/max/step edits sanitize the old current value under the new attributes. This
prevents an expanded maximum from replacing an unedited 50 with a fresh midpoint,
and prevents removing a bound from resurrecting a previously clamped value.
Clean current-value overrides preserve the separate dirty flag: later default
edits still apply to clean controls, while dirty controls keep their current value.
A changed default attribute can nevertheless move a dirty range's step base and
force realignment. Type transitions, reset, clone/import and attached Attr writes
reuse the same owner.

Combined attribute/current-value quota checks remain atomic. Same-attribute writes
now also preflight any newly materialized current value before changing text
accounting or edit-origin state. A regression covers a native empty override that
would otherwise expand to a midpoint without passing the quota check.

Page value setters route range values through the same sanitizer. Input min, max
and step properties now reflect their string attributes through the existing
page attribute adapter. Held validity objects and submission see the shared
current value. Inapplicable required/pattern/length constraints do not make a
range fail, while custom validity and candidacy retain their existing behavior.

## Native evidence

All three initial regressions fail before implementation. The dedicated suite has
60 cases, including an independent finite step-grid oracle, exact ties, fractional
steps, reversed bounds, empty allowed grids, extreme finite values, 100,000-digit
literals, dirty/default transitions, page setters, attached Attr paths, clone/
import, reset/submission and atomic quota failures. A further page test reproduced
the old range-setter rejection before that guard was updated.

Focused validation passes 437 tests across seven explicit native files. Build,
strict new-test types and nine-source lint/format checks pass.

The full explicit native suite passes 7,207 tests across 211 files. An isolated
HEAD snapshot plus only this owned patch passes production/new-test type checks
and 4,447 tests across its 150 available allowlisted files. The previous
unsupported-range submission case is replaced by supported-state coverage.
Runs use Node v22.22.0 and Vitest v4.1.10 on Linux x86_64.

## Remaining gates

Native range fill, pointer dragging, keyboard slider adjustment, valueAsNumber,
stepUp/stepDown and full slider presentation/accessibility remain open. Color
and pattern profiles, broader page validation APIs and complete numeric precision
parity are not completed by this patch. Live-site, socket, real TTY/PTY and SafeJS
acceptance still require separate authorization; none runs here.

Primary reference reviewed September 3, 2026:

- Range-state normalization, bounds, step rules and input value ownership:
  https://html.spec.whatwg.org/multipage/input.html
