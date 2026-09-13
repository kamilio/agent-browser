# Website test inventory — September 13, twenty-eighth update

**Native CSS nesting is implemented and regression-tested. Python's actual
Tutorial click still fails, with one fewer applicable CSS value error.** This
continues the twenty-seventh inventory without rewriting historical evidence.
There are no new live website requests or newly tested domains in this update.

## Website-derived checks

| Site / page | New check | Result and boundary |
| --- | --- | --- |
| Python documentation homepage | One native BrowserSession replay of the same eight September 11/13 captures, one discovered Tutorial click | Applicable CSS values 3 → 2; actual click still fails; zero HTTP and no destination fallback |
| W3C CSS Nesting Level 1 | One native reader replay of the same captured January 22, 2026 draft, selecting the previously missed Syntax section | One complete section / 3,369 text units; source-contract coverage only, not layout or action acceptance |
| Effective Go | No new run | Previous native reader/full-DOM content check remains valid within its original scope; no broader Go behavior claim |

Python remains 853 DOM nodes / revision 860, 669 formatting boxes, 576 visited
nodes, 4,074 text units and 8,294 formatting-work units. Its same discovered
`e375` Tutorial link still fails before requesting the destination. Applicable
property errors remain nine; inline alignment two, positioning one and overflow
one remain. Raw float/display/clear coordinator markers are also retained.

The expanded parser now charges 584 rules / 1,075 declarations, versus 579 /
1,071 earlier; cascade work is 93,132 versus 93,131. All parsed property/value
diagnostics change from 54/9 to 57/7, while applicable diagnostics change from
9/3 to 9/2. Additional nonapplicable diagnostics are not hidden. No speedup is
claimed from these single bounded observations.

## Implementation and tests

Native nesting uses immutable parent contexts and shared selector ASTs, not
source rewriting or selector-list expansion. It preserves cascade specificity,
declaration order, conditional context, custom-property data and pseudo ownership.
The new suites include real dimensions and raster pixels for the Python-style
border rules, not merely fewer diagnostics.

Three suites add **157 cases**: 41 parser, 64 selector, 52 layout. Initial
baseline coverage reproduces 124 failures. Independent review then identifies
three further defects: unsupported selectors escaping an absent parent,
namespace syntax misclassification and unsafe specificity arithmetic. A fresh
19-failure reproduction becomes **951 focused passes / zero failures** after
the fixes. All earlier attempts and the first superseded full run remain saved.

Final full native gate: **19,960 passes / 0 failures / 2 unchanged skips**,
`16:19:09.545–16:23:44.357 UTC`. Build, strict compilation and formatting pass.
387 selected suites / 386 strict roots / 752 explicit manifest entries; 365
manifest entries remain unselected. No native pass closes a live-site, real
socket, TTY/PTY, SafeJS, credential or passkey-device acceptance gate.

Authoritative runtime is
`node_modules/.cache/native-validation/native-css-nesting-september13-round02/snapshot01/dist`.
Audit SHA-256 `ec2fe9bbf153498b17a1953ed434349a363bd683b9be619d7e667a5eefa10866`.
Source/compiled ledgers:
`71c2f59fa78432d95c4c2b72eea3f022dc8de68054be9faa5b8a540f72d286f7` /
`5d76d645410761cf11c9047bc093eae96260f47282c8de91efe4aee75c62e86c`.

## Evidence and remaining work

- `CSS-NESTING.md`: implementation, 157 cases, exact native gate, known limits.
- `CSS-NESTING-SYNTAX-CHECK-SEPTEMBER-13.md`: the additional native source section.
- `PYTHON-CSS-NESTING-REPLAY-SEPTEMBER-13.md`: exact fixtures, actual failed action,
  unchanged owners/inventories, 28 sealed receipts and comparison hashes.
- `PYTHON-CSS-ATTRIBUTION-SEPTEMBER-13.md`: prior declaration attribution, retained
  without relabeling its old 9/3 result as a new run.

Next compatibility work remains Python justification, decoration shorthand,
hyphenation/cursor/radii/underline offset, inline vertical alignment, sticky
positioning and overflow. Full navigation/action success and repeatable
performance measurements are still open. Native skips and unselected tests
remain explicit; CSS Syntax/CSSOM, unknown selector functions, `@layer`, `@scope`
and `@container` are not fully implemented by this change.

The original hardware/benchmark research and historical Astra sample are not
refreshed here; verified Reddit/Poe opinions remain an open research gap.
Do not infer new research completion, access-restriction bypass, fingerprint
spoofing or challenge solving. All work is local; no push occurs. Goal remains
**ACTIVE**, with pre-existing uncommitted changes preserved.
