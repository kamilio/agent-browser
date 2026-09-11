# Positive logical stylesheet availability

September 11, 2026: stylesheet matching now extends its existing global
required-positive-key check through `:is()`, `:where()` and `:has()` alternatives.
A positive logical test is impossible only when every alternative has a provably
missing required ID, class or type key. An impossible test excludes its entire
complex branch before document-candidate/ancestor matching.

This is a necessary-condition filter, not full logical candidate selection.
Keys present somewhere in the document do not prove a compound matches. Any
alternative whose possibility is unknown retains the branch for normal matching.
Negative `:not()` operands, nth filters and attribute/state predicates remain
conservative. Incomplete/capped indexes cannot prove absence.

The parser's original nested alternatives remain untouched, including absent
high-specificity branches. Full matching still decides results and specificity;
relative/sibling semantics, HTML case folding, exact foreign type names and
mutation invalidation remain intact. Every recursive test/index lookup is charged
under the existing work limit. Syntax is fully parsed before filtering, with the
same nesting/component/text bounds. No new cache, dependency or larger budget is
introduced. Ordinary DOM query matching is not changed by this stylesheet filter.

## Evidence

`MDN-FULL-CSS-PROFILE.md` records 958878 units for the zero-match selector
`:is(.baseline-indicator.discouraged,.baseline-indicator.removing) *`. Earlier
nine-response profiles already exposed the same cost. A regression fixture with
100 nested wrappers and 200 spans now prunes that pattern within 20000 work
units and still rejects an insufficient one-unit call, then recovers normally.

The unchanged implementation with the new tests in
`node_modules/.cache/native-validation/native-logical-availability-baseline-september11/`
passes 122 cases and fails that one work-bound regression. The improved
implementation passes all 123 selector-candidate cases. Twenty new cases cover
OR alternatives, nested positive/negative tests, specificity, sibling `:has`,
capped-index fallback, mutations, foreign names and syntax errors.

The clean `c22ac98` snapshot in
`node_modules/.cache/native-validation/native-logical-availability-september11-round01/`
overlays only `src/selectors.ts` and `src/selector-candidates.test.ts`. Build,
strict checking, formatting and 112 explicit native files pass from
10:42:10.483 to 10:43:48.608 UTC: **6737 passed, zero failed, one existing
baseline assertion excluded**. The 1006 source files stay unchanged and the
549-entry native manifest is untouched.

Strict checking retains the documented snapshot typing exception (111 roots),
while that file still runs at runtime. The excluded focus-provisioning-pressure
assertion remains an acknowledged baseline failure. Tests deny networking and
do not establish live website, rendering, credential, SafeJS or TTY/PTY success.
Full MDN replay is independently scoped; the earlier live failure remains failed.
