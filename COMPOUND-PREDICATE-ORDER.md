# Direct compound predicates before nested matching

September 11, 2026: the native selector parser stably partitions each compound
so direct type, ID, class, attribute and simple pseudo predicates run before
logical and nth predicates. For example, an inactive `:hover` now rejects a node
before `:is(.footer__mozilla a)` walks its ancestors. The full captured MDN
profile previously spent 126872 work units on that zero-match compound.

The partition happens once during parsing, in the existing bounded selector
cache. It sorts the existing test array in place, preserving order within each
group and retaining every operand. There are no per-match planning arrays,
additional caches, dependencies or raised work limits. Direct predicates are not
claimed to have constant cost in every case; this is not a universal speedup.

Compounds remain conjunctions. Combinators, relative scopes, logical alternatives,
nth-of operands and specificity are unchanged. Parsing still visits all operands
and records native-state/control-value dependencies before matching can short
circuit. Unsupported syntax, parser limits and detached native-state admission
still reject even when a later direct predicate would be false. The same planning
applies to stylesheet specificity matching and ordinary DOM query APIs.

## Native validation

Twenty-eight new cases in `src/selector-candidates.test.ts` cover bounded MDN
hover/visited patterns, local class/attribute failures with globally present keys,
real matches, absent-ID specificity, nested negation/relational matching, nth-of,
relative scopes, cached interaction/control changes and error admission.

The unchanged `8e5f026` implementation with these tests in
`node_modules/.cache/native-validation/native-selector-test-order-baseline-september11/`
passes 147 cases and fails four work-bound regressions. The improved focused run
passes all 151. Each regression preserves a 30000-unit budget rather than asserting
an exact implementation-dependent work count. Initial formatting-only differences
in the new tests were corrected before the complete validation run.

The clean `8e5f026` snapshot in
`node_modules/.cache/native-validation/native-selector-test-order-september11-round01/`
overlays only the selector implementation and its candidate tests. From
11:00:19.815 to 11:01:57.618 UTC, build, strict checking, formatting and all 112
selected manifest-listed native files pass: **6765 passed, zero failed, one
existing assertion excluded**. All 1006 source files remain unchanged during
validation; the 549-entry manifest is untouched. Strict checking retains the
documented snapshot typing exception, with 111 roots and runtime coverage of
that file. The excluded focus-provisioning-pressure assertion remains a known
baseline failure, not a pass.

Native tests deny networking. Paired captured-page performance/result comparison
is separately scoped; no new live website, rendering, native click, credentials,
SafeJS or TTY acceptance is implied. The fresh MDN width-resolution failure in
`MDN-LOGICAL-AVAILABILITY-LIVE.md` remains failed.
