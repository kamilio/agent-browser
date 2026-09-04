# Native CSS feature queries

September 4, 2026. `CSS.supports()` and stylesheet `@supports` now share native
declaration/value decisions. This continues `PAGE-CSS.md`; no page-runtime
dependency or alternate browser engine is added.

## Shared support profile

Both API overloads are implemented: a property/value pair, or a condition string.
The string overload also accepts an implicit declaration such as `width: 1px`;
stylesheet preludes still require condition grammar. Primitive arguments use the
existing DOMString boundary. Missing arguments and Symbols throw TypeError,
object/function coercion remains unsupported, and surplus arguments are ignored.

Declarations reuse the native CSS parser, including supported shorthands, custom
properties, CSS-wide values and syntactically valid variable references. A variable
reference is tested without resolving it against any element. Property/value
arguments cannot inject additional declarations or reinterpret an escaped property
name as a different API argument.

Accepting syntax alone is not sufficient for known missing rendering features.
Queries reject grid/table display, absolute/fixed/sticky positioning, floats,
clearance and non-visible overflow, even where existing style reflection accepts
such values. Other values must pass the existing native declaration parser; for
example, unsupported opacity, background images and font families remain false.
This is a partial native support profile, not a guarantee that every combination,
context or resulting document has complete layout/browser parity.

Conditions support parenthesized declarations and nested Boolean `not`, `and`
and `or`. Mixed ungrouped operators and malformed tails do not become true through
short-circuiting. Escaped names reuse the existing CSS identifier reader; quotes,
comments and balanced blocks retain their token boundaries. Unknown forward-
compatible functions/groups evaluate false and can be negated. Selector and font
feature functions are not implemented; command metadata explicitly reports
`selectorQueries: false` and the partial support profile.

## Stylesheet integration

Active support groups retain source order, declaration importance and nested
media conditions. Replacing stylesheet text reparses the decisions. Quoted comment
markers and escaped `@supports` names are recognized without corrupting preludes.
Inactive branches do not report unsupported-property diagnostics from deliberately
guarded alternatives, but their contents still consume the existing stylesheet
rule/declaration and nesting budgets. No branch initiates network requests.

The public CSS namespace keeps its existing per-document identity and revocation
rules. Detached `supports` methods reject calls after owner closure. Existing
escape tests now check the new method's presence, limits metadata and closure.
An old negative at-rule fixture now uses a genuinely unknown at-rule, rather than
continuing to label implemented `@supports` as unsupported. Historical reports
and measurements are unchanged.

## Bounds and evidence

Support queries are bounded to 65,536 source UTF-16 code units, 32 block nesting
levels and 1,024 evaluated condition terms. Lexical work is source-bounded; all
Boolean operands are parsed rather than using success/failure to skip validation
or quota checks. Resource exhaustion throws instead of returning a false support
answer. Existing parser-specific value limits remain in force. These are native
work/storage limits, not whole-process RSS or instruction measurements.

Read-only primary specification research on September 4:

- `https://drafts.csswg.org/css-conditional-3/#the-css-interface`
- `https://drafts.csswg.org/css-conditional-3/#at-supports`
- `https://raw.githubusercontent.com/w3c/csswg-drafts/main/css-conditional-3/Overview.bs`

The new file contains 74 native host-object cases; all fail on isolated prior HEAD.
Two additional prelude regressions failed after the initial implementation and
pass after quote-aware normalization and shared identifier decoding. Focused
validation passes 308 tests / five files in both working and isolated trees.
Types/builds, strict checking of three tests and nine-file lint pass in both.
Full authorized native runs pass 9,864 tests / 274 working files and 8,718 tests /
252 isolated files. Final results are also recorded in `TASKS.md` and
`SEVEN-DAY-PLAN.md`.

Initial validation was interrupted by a full scratch disk, not a passing or failing
behavioral result. With approval, 70 prior standalone browser snapshots were moved
to ignored repository cache storage, retaining all contents and original paths
through symlinks. After relocation, scratch storage showed about 9.3 GiB free.
The new isolated snapshot also uses the ignored cache, separate source/build
outputs and unchanged historical reports. No unrelated scratch data was changed.

No live website, reference browser, socket, real TTY/PTY or SafeJS probe ran.
Released-SDK execution, full condition/declaration grammar, selector/font feature
queries and the original browser compatibility gates remain open. The denied
SafeJS probe remains unrun; the full seven-day browser objective stays active.
