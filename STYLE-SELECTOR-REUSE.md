# Bounded selector reuse during a cascade

`DocumentStyles` now reuses exact, non-nested selector matches within one cascade
calculation. Repeated stylesheet rules no longer repeat the same document query.
The cache is local to that calculation, not shared between documents, mutations,
interaction states or later style recalculations. Nested selectors bypass it.

The stored result retains element, `::before` and `::after` specificity maps.
Each rule still applies its own declarations in source order and resolves its
own diagnostics. Cache hits therefore do not combine rules or suppress warnings.

## Bounds and accounting

- At most 1,024 entries and 65,536 retained selector UTF-16 code units.
- At most 32,768 retained units, counting one per entry plus all three maps' sizes.
- Lookup charges selector length plus one; insertion attempts charge one.
- Original query work is charged once per miss, and declaration application
  remains charged separately for every applicable rule and matching node.
- Rules with no supported declarations finish diagnostic attribution, then skip
  match-map application entirely. They cannot repeatedly walk cached maps while
  paying zero declaration work.

Reaching a cache bound stops admission, not styling; uncached rules continue
through the existing bounded query path. The CSS work limit is not increased.
No new runtime dependency or network request is introduced.

## Validation boundaries

Native tests cover cache bounds/work accounting, specificity and order, pseudo
elements, diagnostic attribution, recalculation and nesting bypass. Tests with
64 diagnostic-only rules and 128 elements inspect actual map iteration, both
with and without a following declaration-bearing rule.

The September 18 qualification also replays previously captured Grokipedia HTML
and three stylesheets, without fetching them again or executing page scripts.
That comparison checks ordered article text and Markdown paragraph structure;
it is not a fresh website visit or a general rendering/JavaScript claim.
See `reports/selector-reuse-2026-09-18.md` for the measured outcomes and limits.
