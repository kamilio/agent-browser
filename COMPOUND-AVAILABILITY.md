# Same-element positive selector availability

September 11, 2026: stylesheet availability checks now distinguish individually
present keys from a possible same-element compound. For each compound, the
engine collects its direct positive ID/class/type predicates and selects the
smallest available complete candidate index. If none of those candidates passes
every direct predicate, the whole complex selector branch is impossible.

The check reuses the normal direct-predicate matcher and its charged string/type
comparisons. Each candidate examination is charged too. Lists are bounded by the
existing selector and index limits; there are no new caches, dependencies, DOM
copies or raised budgets. Finding a possible compound is only a necessary
condition: normal matching still checks all relationships and other predicates.
The extra proof can add work on some selectors; no universal speedup is claimed.

One complete index is enough even when another required index is capped: direct
tests inspect its candidates, rather than treating an incomplete index as empty.
If all required indexes are unavailable, the branch stays possible. Different
compounds are never intersected. The existing conservative recursion through
positive logical alternatives remains; negative/nth operands are not mined as
direct positive keys. Original nested alternatives and specificity are unchanged.
HTML type folding, exact foreign names, duplicate IDs and mutation invalidation
use the existing index/matcher semantics. Ordinary DOM queries do not acquire this
stylesheet-only preflight.

## Evidence and validation

`MDN-SELECTOR-TEST-ORDER.md` records a 958911-work, zero-match logical ancestor
selector whose individual class keys exist but whose required same-element
intersections are empty. The new regression retains every key on separate native
elements and proves the selector empty within a 20000-unit stylesheet budget.
Another regression uses a complete type index after the class index is capped.

Twenty-one new cases cover work bounds/recovery, nonempty intersections,
specificity, separate compounds, negation/OR/nth operands, sibling relational
matching, mutations/reparenting, duplicate IDs, HTML/foreign type names and both
partial/all-unavailable index fallbacks. The unchanged `afe8732` source with the
new tests in
`node_modules/.cache/native-validation/native-compound-availability-baseline-september11/`
passes 170 cases and fails those two work-bound regressions. The improved focused
run passes all 172 selector-candidate cases.

The clean `afe8732` snapshot in
`node_modules/.cache/native-validation/native-compound-availability-september11-round01/`
overlays only `src/selectors.ts` and `src/selector-candidates.test.ts`. From
11:23:17.583 to 11:24:55.352 UTC, build, strict checking, formatting and 112
selected manifest-listed native files pass: **6786 passed, zero failed, one
existing assertion excluded**. All 1006 source files remain unchanged during
validation; the 549-entry manifest is untouched. Strict checking keeps the
documented snapshot typing exception (111 roots), while that file still runs.
The excluded focus-provisioning-pressure assertion remains a known baseline
failure, not a pass. Formatting-only differences were fixed before validation.

Tests deny networking. Separate MDN/Wikipedia captured-page comparisons are not
inferred from native unit results. Grid layout, native MDN click success, live
website compatibility, credentials, SafeJS and TTY acceptance remain separate.
