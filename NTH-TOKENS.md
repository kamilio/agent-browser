# Token-aware native nth selectors

September 4, 2026. The shared selector compiler now reads An+B tokens instead of
extracting a substring and applying a whitespace-tolerant regular expression.
This continues the selector feature-query work in `SELECTOR-SUPPORTS.md` and
the application-compatibility work in `SEVEN-DAY-PLAN.md`.

## Behavior

The four child/of-type nth variants share the same bounded parser. It distinguishes
integer coefficients, dimension units, identifiers, signs and intervening trivia.
Existing identifier escape handling decodes `n`, `odd`, `even`, unit suffixes and
the filtered-child `of` keyword. Comments may separate tokens but cannot fuse an
integer with a following identifier or split an integer into two accepted pieces.
Parentheses and apparent keywords inside comments do not terminate the formula.

Leading `+` followed by an `n` identifier permits intervening comments, not actual
whitespace. Offset signs and signless integers remain distinct; doubled signs are
invalid. Non-CSS whitespace such as NBSP is no longer accidentally accepted by
JavaScript `trim()` or `\s`. Decimal and exponent number forms remain invalid.
The former unsupported-comment case `1/**/2` now reports invalid syntax: comments
are supported, but this pair of integer tokens is not an An+B formula.

Filtered child selectors accept a real `of` identifier, including escaped forms
and comment boundaries, rather than searching for a raw space-delimited substring.
The filter retains existing specificity, reverse indexing and mutation invalidation.
Of-type selectors still reject filters. Relational nesting continues to use the
same compiler and sibling machinery.

DOM queries, `matches`, `closest`, stylesheet matching and `selector()` feature
queries share these decisions. Native geometry and raster checks compare a guarded,
tokenized rule with an equivalent unguarded ID-based rule. This is shared-state
native evidence, not a reference-browser pixel comparison.

## Bounds and validation

No runtime dependency or document-state cache is added. Syntax still uses the
existing source/component/nesting limits. An+B coefficient and offset magnitudes
remain capped at 1,000,000,000; escaped units and comment-separated offsets cannot
bypass the cap. Feature-query Boolean operations propagate resource failures.
The existing match-work budget still applies to filtered sibling evaluation.

The new test file contains 79 cases. Isolated prior HEAD fails 63 and passes 16;
the implementation passes all 79. Focused native runs pass 416 tests / six files
in both working and isolated trees. Both trees pass types/builds, strict checking
of two test files and three-file lint. Authorized full native runs pass 10,008
tests / 276 working files and 8,862 / 254 isolated files. `TASKS.md` and
`SEVEN-DAY-PLAN.md` also record these results.

Read-only research on September 4 used the CSS Syntax editor's draft dated July
30, 2026, section 6.2, at `https://drafts.csswg.org/css-syntax/`, and reviewed the
upstream parsing cases at
`https://raw.githubusercontent.com/web-platform-tests/wpt/master/css/css-syntax/anb-parsing.html`.
The upstream file was read for grammar review, not executed. Native tests here
exercise matching and rendering, not upstream CSSOM selector serialization.

## Outstanding gates

Full selector tokenization/recovery, forgiving lists, pseudo-elements, namespaces,
language/direction/state gaps and the broader browser requirements remain open.
No website, reference browser, socket, real TTY/PTY or SafeJS probe ran. The denied
SafeJS probe remains unrun. Historical reports and unrelated pending work are
preserved; the complete seven-day objective remains active.
