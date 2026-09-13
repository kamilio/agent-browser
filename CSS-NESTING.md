# Native CSS nesting

The native stylesheet parser supports nested style rules through explicit,
bounded parent-selector contexts. It does not rewrite page CSS, expand selector
lists into a Cartesian product, or delegate matching to another browser engine.

## Supported behavior

- Implicit descendants, leading child/sibling combinators, explicit `&`,
  compounds such as `div&` and `&&`, and nesting in supported selector functions.
- Parent-list maximum specificity, rather than only the matching parent's
  branch specificity; shared compiled parent selectors avoid textual expansion.
- Ordered declaration runs before, between and after nested rules. Ordinary
  declarations retain their original parent selector, including pseudo targets.
- Nested `@media` and `@supports` retain the nearest style parent. Inactive
  parsed conditional bodies still consume the shared parsing budgets.
- Supported generated `::before`/`::after` targets, inherited custom properties,
  native state changes, selector-cache isolation and mutation invalidation.
- Custom-property component blocks, comments, quoted strings and escaped
  ampersands remain data rather than accidentally becoming nested selectors.

`CssRule.nesting` stores an immutable linked `SelectorNestingContext` containing
the parent selector and its optional parent context. Only context-aware style
matching and explicit syntax validation admit nesting. Ordinary DOM query and
selector-support APIs do not start accepting unscoped ampersands.

An ampersand represents parent elements, not parent pseudo-elements. In contrast,
trailing or conditional declaration runs still target the original parent's
pseudo-elements. These two cases must not be collapsed into one `&` wrapper.

## Limits and recovery

The native selector limits bound context depth to 16 and combined selector text
to 8,192 code units by default. Existing component, query-work, result, memo and
cache limits remain enforced. Cyclic/malformed contexts are rejected before
document indexing. CSS rule/declaration budgets are shared with nested bodies;
discarded invalid selectors do not provide an uncharged declaration bypass.
Specificity accumulation must remain an exact safe integer; unsafe repeated
nesting growth is rejected rather than permitting order-dependent rounding.

An invalid nested selector is discarded with its contents and reports
`discarded-invalid-nested-css-rule`, scoped to the parent. Its formatting issue
is advisory because the invalid rule has no styling effect. Valid but currently
unsupported nested selectors report `unimplemented-nested-css-selector` and
remain conservatively nonadvisory within their media context. The parent alone
cannot prove these selectors irrelevant: `:not(&)` can match outside an absent
parent. Unsupported nested at-rules use the same conservative media boundary.
Namespace attribute selectors remain unsupported, not advisory invalid rules.
There is no broad diagnostic suppression.

This is a bounded native subset, not full CSS Nesting/CSS Syntax/CSSOM
conformance. Unknown selector functions, forgiving selector-list behavior and
independently unsupported `@layer`, `@scope` and `@container` are not implemented.
No new runtime dependency, page script engine or external browser is introduced.

## Regression coverage

Three explicit native suites add **157 cases**: 41 parser, 64 selector and 52
black-box layout cases. The latter check real computed dimensions, raster
pixels, cascade order, state changes, pseudo ownership and the three motivating
Python-style nested `pre` borders, including unchanged outside elements.

The initial 127 corrected tests on the old runtime produce 797 passes / 124
failures; the first fixed focused run produces 921 passes / 0 failures.
All 794 pre-existing
focused cases pass in both runs. Baseline build/strict compilation and both
formatter checks pass. Three new tests already pass on the baseline; do not
claim that all 127 initial tests are newly fixed failures.

Initial focused evidence is under
`node_modules/.cache/native-validation/css-nesting-work-september13/`,
`baseline01/` and `fixed02/`. Initial baseline/fixed attempts are preserved:
the first fixed run has three test-fixture errors (glyph overlap in a pixel
sample, a mismatched diagnostic name, and a non-focusable focus target), not
three proved production failures. `fixed01` accidentally repeats that unchanged
run after a rejected patch; no evidence was overwritten.

A separate review finds three real edge cases beyond that initial coverage:
unsupported selectors escaping an absent parent through `:not(&)`, namespace
attribute syntax misclassified as advisory invalid CSS, and specificity growth
above exact integer precision. Thirty added cases plus a corrected conservative
diagnostic expectation reproduce **932 passes / 19 failures** on the initial
implementation (`review00`). The final focused candidate (`fixed03`) passes
**951 / 0**, including all 794 unchanged existing cases. Build, strict tests and
format checks pass in both review lanes. These are actual executed failures,
not merely speculative review findings.

The initial full native run passes 19,930 / 0 with two existing skips, but it
predates those review fixes and is not the final acceptance gate. Preserve its
`native-css-nesting-september13-round01/` source and receipts. A release-preparation
attempt also stopped before any build because equivalent import-diff alignment
changed; the original helper and scratch are preserved. Exact residual changes
are checked without treating that formatting alignment as lost user work.

Initial focused receipts: 80 entries, ledger
`7515a2321e117019b2507f7cb44b65e6ade043ae235d5b11f54dae4113764aee`.
Review receipts: 32 entries, ledger
`407622f2ccab28d76ca355ab69efc8cbdcafc1879a87f3a77144b0dc39636c1d`.
Both ledgers use absolute local evidence paths; no failed run is overwritten.

## Final native gate

The final isolated run, **September 13, 16:19:09.545–16:23:44.357 UTC**, passes
**19,960 tests / 0 failures / 2 unchanged skips**, with build, strict compilation
and formatting successful. It selects 387 suites and 386 strict roots from the
752-entry explicit manifest; 365 entries are not selected by this run. The
existing host-object-ceiling and unsupported-display exclusions remain open.

Runtime: `node_modules/.cache/native-validation/native-css-nesting-september13-round02/snapshot01/dist`.
Audit base: `6d53306e8f92d39ff798e103ccaec564d097d64e`.
There are 1,293 source/config inputs, 2,124 compiled files and 1,285 unchanged
tracked inputs. The parser/style pre-existing rearrangements are verified and
excluded from the candidate, not silently bundled into this feature.

- Audit: `ec2fe9bbf153498b17a1953ed434349a363bd683b9be619d7e667a5eefa10866`.
- Source ledger: `71c2f59fa78432d95c4c2b72eea3f022dc8de68054be9faa5b8a540f72d286f7`.
- Compiled ledger: `5d76d645410761cf11c9047bc093eae96260f47282c8de91efe4aee75c62e86c`.
- Native results: `2e118eff7ac953d6477a91fdb88afcc8d944ca210bff535dfd4681e2ebd8feb0`.

The unchanged eight-resource Python replay reduces applicable value errors from
three to two, but its real Tutorial click still fails. See
`PYTHON-CSS-NESTING-REPLAY-SEPTEMBER-13.md`; no fresh Python HTTP or complete
website-rendering acceptance is claimed.

Primary-source provenance and boundaries are in
`CSS-NESTING-PRIMARY-SOURCE-SEPTEMBER-13.md` and
`CSS-NESTING-SYNTAX-CHECK-SEPTEMBER-13.md`. Native unit success alone does not prove
that Python's actual Tutorial click or any other complete website flow works.
