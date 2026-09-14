# Generated flex and grid items

September 14, 2026. Native layout progress; the overall browser goal remains
active. This change is motivated by the captured MDN diagnosis documented in
`MDN-FORMATTING-DIAGNOSIS-SEPTEMBER-14.md`, but is not a new MDN replay or a live
website validation result.

## Supported behavior

In-flow `::before` and `::after` block-like boxes now participate as flex/grid
items rather than being rejected unconditionally. They receive item sizing,
ordering/alignment, independent formatting context and eligible static z-index
metadata. Empty generated strings still create styled boxes; they are not
dropped to avoid errors. Float, clear and inline vertical alignment do not
incorrectly apply to these blockified items.

Computed generated display uses the effective container, including through
`display:contents` generating ancestry. Display inheritance still comes from
the generating element, not a substituted ancestor. The ancestor walk charges
the existing generated-style work limit and uses the existing invalidation and
per-target cache; it adds no persistent cache or increased budget.

Absolute/fixed boxes retain separate static-placement metadata and do not become
in-flow items. Generated hits map to the existing DOM owner, with no invented
DOM nodes, query references or control action targets.

Generated table items, nested generated flex/grid containers, generated
`contents` and other unsupported display forms retain explicit rejection paths.
Unsupported generated `contents` nodes do not acquire phantom item or static
stacking metadata. Other unsupported formatting guards remain in place. No
dependency, external browser engine or page runtime was added.

## Native evidence

Work directory:
`node_modules/.cache/native-validation/generated-items-work-september14/`.

- Unchanged production baseline, `before02`: **441 passed, 77 failed**, nine
  selected files. All failures are in the two new test files.
- Final focused round, `focused03`: **582 passed, zero failed**, nine selected
  files. Strict test checking and scoped formatting also pass.
- Final selected native gate, `release00`: **22,296 passed, zero failed, two
  unchanged exclusions** across 441 selected files. Build, strict checking of
  440 test roots and scoped formatting pass. The explicit manifest contains
  793 entries; 352 remain unselected, so this is not an all-manifest claim.

The final audit verifies unchanged prior cases except the two deliberately
replaced rejection expectations, all 195 additional cases, exact owned source
changes, stable execution inputs and the prior gate receipts. It retains 1,346
source files, 2,172 compiled files and 123 receipt entries. The clean snapshot
excludes pre-existing uncommitted changes, including unrelated `styles.ts`
reordering and three extra manifest entries.

Final audit SHA-256:
`95c62ee59a59f0f64c86b83416119985feecf771a3298302dc3abf3e8d42f2e1`.
Receipt ledger SHA-256:
`e908eab2687e5dca016e98c03b456601896643d8a3c85773190920649b721078`.

There are **195 additional cases** relative to the prior selected gate:
102 generated-style cases, 87 item-layout cases and six unsupported-boundary
cases. Two existing blanket-rejection cases now assert positive item integration.
Coverage includes ordinary-element geometry/pixel parity, empty boxes, item
growth/shrink/wrap/order, grid placement/span, transparent ownership, mutation,
work-limit boundaries, 32 overlapping stacking/hit cases, 16 positioned
transitions and eight relative-offset cases. Parameterized cases also contain
bounded tables; these are case counts, not distinct website counts.

Earlier attempts remain intact: `before00` failed configuration preparation
because a manifest-listed test was absent from the frozen snapshot; no test ran.
`before01` strict checking rejected the new five-argument helper calls against
the old four-argument API. `before02` therefore checks unchanged production with
`--noEmit`, then runs the new tests through native TypeScript transpilation;
it does not claim full test type-check success on the old API. Before and focus
rounds emit no production build.

`focused00` caught two omitted work-charge arguments. `focused01` passed 517
cases with one fixture failure caused by unsupported `justify-self`; that
unrelated CSS feature was not implemented. `focused02` passed 580 cases with two
fixture identity failures: another style owner's viewport setup legitimately
invalidates document presentation. The corrected tests require value recovery
across that invalidation and cache identity within a stable presentation.

## Limits and next work

Source review identified the unsupported-contents metadata risk and motivated
additional stacking/transition tests. Review alone is not acceptance evidence.
The captured MDN page has other unsupported categories, and its destination was
not captured. A new pinned diagnostic and then a separately scoped action replay
are still needed; old reports and their failed verifier remain unchanged.

No fresh HTTP request, captured-page execution, credentials, passkey device,
SafeJS, socket, real terminal or challenge check is included here. Research and
broader website/form flows remain open. Preserve unrelated work; do not push.
