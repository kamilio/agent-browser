# Bounded stylesheet selector lists

The stylesheet matching path, `DocumentQueries.matchingSpecificities`, applies the
existing component limit to each top-level complex selector rather than summing
independent branches of the rule. The default remains 256 components per branch.
This addresses the captured Python.org icon rule: 120 simple three-component
branches previously exhausted the aggregate query parser limit before matching.

## Boundaries

- Ordinary querySelector, querySelectorAll, matches, closest and standalone syntax
  and supports checks retain the aggregate component limit for the entire list.
- Nested logical, relational and nth/of selector lists consume their enclosing
  top-level branch's component allowance; their commas do not reset the counter.
- The complete stylesheet list still has the existing 8192-code-unit text cap and
  nesting cap. Work, result, indexed-node and memo limits apply to the full match,
  not independently per branch. No numeric limit or dependency changes.
- Parsing must finish before matching or caching. Invalid or unsupported suffixes
  invalidate the whole list; valid prefixes are not applied as partial rules.
- Compilation modes have distinct cache keys but share the existing entry ceiling.
  A stylesheet-compiled list cannot bypass ordinary-query admission through cache
  reuse. Non-string input is rejected before cache-key interpolation.
- The larger admitted lists can retain more compiled components than before; this
  payload is bounded by the unchanged whole-list text and shared cache ceilings.
  This is not a claim of unchanged memory consumption or a wall-clock benchmark.

Matching still uses branch-local candidates, conservative ancestor ranges, full
selector checks, document ordering and maximum actual-match specificity. The
implementation does not split raw selector strings, so quoted/escaped commas and
nested lists continue through the existing parser.

## Isolated validation

`node_modules/.cache/native-validation/native-stylesheet-selector-branches-september11-round01/`
records September 11, 2026, 09:02:30.318–09:04:06.816 UTC:

- 6406 native tests pass, zero fail and one previously reproduced baseline
  assertion is excluded across 109 explicitly selected files.
- All 80 selector-candidate tests and 41 styles tests pass, including 29 new cases.
  Coverage includes nested component accounting, invalid suffixes, ordinary-query
  isolation, shared cache/work/results/text/nesting limits and actual late-branch
  stylesheet application and mutation invalidation.
- Production compilation, strict checking of 108 test roots and formatting of
  all three changed TypeScript files pass. The unchanged snapshot.test.ts typing
  exception remains outside strict roots, not native runtime checks.
- Source inventories remain stable: 1006 source/fixture and 1788 compiled files.
  The `native-stylesheet-selector-branches-compiled-september11` ledger SHA-256 is
  `46362dd050f3f1eb6ffe00b1fc0d8e50bb97fe524001f97e8af6db301434648a`.

The separate `native-stylesheet-selector-branches-baseline-september11/` snapshot
uses unchanged HEAD ebac98a production source with the new tests. It records 93
passing and 28 failing cases across the two focused files, with pinned source
unchanged. Failures expose the former aggregate component admission and lack of
mode-separated cache entries; they are preserved, not relabeled as passing.
Read-only static review finds no actionable implementation issue, independently
of the runtime validation.

## Captured Python.org result

`node_modules/.cache/native-validation/native-python-stylesheet-branches-replay-september11/`
records one zero-network native replay at 09:04:28.662–09:04:28.890 UTC. The former
120-branch failure at selector call 523 is passed. At call 621, an 11869-character
selector prelude containing extensive leading CSS comments exceeds the unchanged
8192-character query text cap. The homepage still does not load: 4822305 cascade
work units remain before that parser failure, after 161643 successful selector
work units. Parser-failure work is recorded as null, not the preceding lastWork.

All four exact captured URLs/bodies are served through native fixture routes,
with zero encoded network bytes, no guard attempts, unchanged source/build/capture
pins and closed documents/queries/transport. Receipt SHA-256:
`9d2a698ec4df31d3a608ef9ffb5367778f452eab10c401159386859b577bafc0`.

This diagnostic exits zero for complete observation/cleanup, not website success.
No search is submitted. The prepared fresh Python.org flow is not launched while
its same-body homepage replay fails. Next separate leading stylesheet trivia from
selector text without loosening DOM-query limits or changing interior tokenization.
The historical component-limit failure in SELECTOR-ANCESTOR-RANGES.md remains
unchanged. Full rendering, research and challenge effectiveness are still open.
