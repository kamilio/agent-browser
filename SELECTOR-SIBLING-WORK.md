# Bounded general-sibling selector work

The native selector matcher now memoizes whether a matching selector prefix
exists at or before a preceding element sibling. Repeated `A ~ B` candidates
reuse these inclusive-prefix answers instead of rescanning the same sibling
chain. Backward traversal and backfilling are iterative, not recursive in the
number of siblings.

## Correctness and bounds

Each operation owns fresh memo tables keyed by selector identity, prefix
position, scope, generated-pseudo context and parent. Tables never survive a
query, cross documents or bypass mutation/state refresh. Element-only sibling
links, query order, specificity merging and adjacent/ancestor combinators keep
their existing semantics.

The default **5,000,000 work** and **100,000 memo-entry** limits are unchanged.
Construction, traversal, lookups, pending entries and backfilling are bounded
and charged. A previously cached prefix is consulted first. An immediately
matching predecessor returns without allocating or retaining a new memo entry;
cheap positive branches therefore do not fill the memo merely by succeeding.
After a failed recursive predecessor probe, the matcher refreshes its table
references so it preserves any lower-prefix entries initialized by recursion.
Exceptions discard operation-local state and leave owner cleanup intact.

This is not a general linear-time claim for arbitrary CSS. Different scopes,
selector prefixes and relational anchors need distinct answers. In particular,
many `:has(~ ...)` anchors can still require substantial candidate scanning and
hit the existing limits. The implementation does not raise caps or suppress
resource-limit failures.

## Synthetic differential evidence

The final focused candidate passes **565 tests, zero failures and zero
skips**, including **16 new cases**. Build, strict checking, scoped formatting
and stable source inventories pass. Fixtures cover 2,048-item sibling chains,
leading/middle/trailing markers, doubling work bounds, chained prefixes,
separate parents and non-elements, scoped/relational/nth/nesting selectors,
pseudo specificity, mutation and interaction state, and limit/cleanup behavior.

The exact final 16-case file against old selector source has **11 passes and
five failures**. Four large-work cases exceed the old work cap. The fifth
expects the newly introduced memo contract; it is not a fifth pre-existing bug.

Independent review also found an actual regression in the first candidate:
50 cheap positive selector branches over 2,048 items unnecessarily exhausted
the memo cap. That case passes old source, fails the uncorrected candidate,
and passes the final correction. The failed run remains recorded; immediate
successes no longer retain unnecessary entries. No test or limit is weakened.

A second review catches a recursive initialization defect: the outer matcher
could replace a table just created by a lower-prefix probe, losing reusable
answers while retaining their charges. A four-item negative chained selector
with a ten-entry memo cap reproduces it. Refreshing the table references fixes
the failure. The new case passes original source and the final implementation;
the intermediate failure is preserved separately. Neither candidate regression
is described as a pre-existing unmemoized-selector bug.

Evidence beneath `node_modules/.cache/native-validation/overflow-work-september14/`:

| Lane | Result | Meaning |
| --- | --- | --- |
| `sibling00` | 563/0/0 | Initial candidate, 14 new cases |
| `sibling01` | 9/5/0 | Exact initial tests on old source |
| `sibling02` | 563/1/0 | Positive-list regression added and reproduced |
| `sibling03` | 10/5/0 | Exact final tests on old source; positive-list case passes |
| `sibling04` | 564/0/0 | Positive-list correction; 15 new cases pass |
| `sibling05` | Formatting stop | Build/strict pass; no native execution |
| `sibling06` | 564/1/0 | Recursive table replacement reproduced |
| `sibling07` | 11/5/0 | Exact final 16-case file on old source |
| `sibling08` | 565/0/0 | Final correction; all 16 new cases pass |

The final selected native gate passes **21,773 tests, zero failures and two
unchanged skips**, September 14, 2026, 02:06:48.357–02:11:51.622 UTC. Build,
strict checking, scoped formatting and inventory audit pass. It selects 426
files and 425 strict roots from 778 manifest entries, leaving 352 unselected;
its snapshot contains 1,327 source and 2,156 compiled files. Evidence is retained
in `node_modules/.cache/native-validation/native-sibling-work-september14-round01/`.

Intermediate full round00 remains recorded as 21,772/0/2. It predates the final
recursive-cache regression and is not relabeled as the final gate. The original
selected test bytes, two exclusions and prior raster feature remain unchanged;
there is no additional skip or guard waiver.

## Website boundary

The stopped W3C CSSOM View source navigation is **not rerun or proven fixed**.
Read-only inspection identified an eager stylesheet-cascade metrics call during
navigation and this independent expensive sibling shape, but the failed source
record has no offending selector or stack. Its missing edition and CSSOM
algorithm extraction remain gaps. These work-count fixtures are not elapsed-time
benchmarks, fresh live website coverage or proof of complete overflow support.
See `WEBSITE-TEST-INVENTORY-SEPTEMBER-14-THIRD-UPDATE.md` for the actual source
observations and `TASKS.md` for the still-active broader browser goal.
