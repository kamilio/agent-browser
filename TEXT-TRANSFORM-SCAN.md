# Demand-driven text-transform scan — September 14, 2026

## Implemented Change

`layoutTextContexts` no longer scans every formatting node before knowing whether
text transformation is relevant. It evaluates the unchanged presence predicate
only when it reaches an inline context with children, then reuses either boolean
result within that invocation. Requests with no widths, block-only widths or
childless inline contexts avoid the scan entirely.

This is local lazy evaluation, not a persistent cache or new formatting-tree
metadata. A later call starts undecided again, including when caller-owned input
has changed. Existing float/atomic validation, work limits, empty-context
finalization, nonempty text planning and glyph mapping remain in place.
Nonempty contexts can still require a whole-node scan; this is not a claim that
all text-layout traversal or repeated-layout costs are eliminated.

## Deterministic Reproduction

The earlier CPU profile identified `layoutTextContexts` as a candidate, but mixed
production-style paths with deliberate unoptimized baselines. The new regression
uses native used/min/max text-layout entry points with synthetic documents and
observes the array predicate without replacing its result. It is not a sampled
CPU estimate or a `withoutReuse` benchmark.

| Repeated empty-context measurements | Before: predicate calls / visits | After |
| ---: | ---: | ---: |
| 100; 110 formatting nodes | 100 / 11,000 | 0 / 0 |
| 1,000; 1,010 formatting nodes | 1,000 / 1,010,000 | 0 / 0 |

These are the observed `formatting.nodes.some` calls and predicate visits,
not all node accesses, function invocations, charged layout work or elapsed
website time. Outputs and charged metrics remain equal to the unobserved
production input. The tests do not prove a normalized speedup or whole-page
memory reduction; no new CPU profile or website comparison is run for this fix.

## Validation

The final **27 new cases** cover no-demand contexts across used/min/max modes,
unrelated transforms, empty-to-nonempty transitions, both false and true decision
reuse, invalid float coordinators, small custom work limits, caller-owned mutation
between calls, and the two repeated-measurement fixtures.

- `before00`: fixture type checking fails; no tests run. The corrected fixture
  preserves the full public layout-input type instead of casting it away.
- `before01`, unchanged engine: **299 pass / 14 fail**, nine files. Failures
  are the intended unnecessary-scan assertions; the initial test file has24 cases.
- `focused00`: **313 pass / 0 fail**, before three additional false-result cases.
- Final `focused01`: **316 pass / 0 fail**, nine files and all27 new cases.
- Final selected native gate: **22,101 pass / 0 fail / 2 unchanged exclusions**,
  439 selected files, 438 strict roots, 791 manifest entries and352 unselected.

Build, strict checking, scoped formatting and inventory/case-set checks pass.
Every prior selected assertion name/status matches the preceding22,074-pass
gate. Source review finds no blocking issue in the scoped patch; it explicitly
does not promise preservation of getter side effects or deliberate mutation of
a readonly formatting tree during a single synchronous call.

The unchanged exclusions are the total host-object ceiling versus full-pool
capacity case and the unsupported-display/advisory-media case. The native gate
does not validate the352 unselected entries, live/captured websites, SafeJS,
credentials/devices, socket or real TTY gates.

## Provenance

The clean frozen nested-actionability release00 is the base; only the production
file, new regression file and clean manifest entry differ. Pre-existing working
changes, including three unrelated manifest entries, are not adopted. There are
no new dependencies or raised budgets. All historical failures remain intact.

Evidence under `node_modules/.cache/native-validation/text-transform-scan-work-september14/`:
- `release00/AUDIT.json`:
  `0e7381a58fc382875f439ee1f16cf264da4964982da88a9bd11f2c6f6cb38921`.
- `release00/RECEIPTS.sha256`:66 entries,
  `28878ce62cb36bb205e52e0e5287cbd402d6a40a96ea3c4b707bb236f62ad802`.
- `release00/SOURCE.sha256` and `release00/COMPILED.sha256`:1,344 source and
  2,172 compiled entries, checked against complete inventories.
- `before01/results/native.stdout`: original scan-count failures.
- `focused01/results/native.stdout`: final focused results.
- `review/REVIEW.md`: independent bounded source review and limitations.

The concurrent MDN diagnosis stays on the older ownership runtime and is not
evidence for this optimization's effect on that page. The overall browser goal,
broader functional coverage and repeatable performance measurements remain open.
