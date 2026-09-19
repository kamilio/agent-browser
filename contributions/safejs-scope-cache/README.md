# SafeJS retained-scope cache bookkeeping

This contribution removes repeated ancestry bookkeeping allocations on a valid
`Scope.retainedDataRoots()` cache hit. It does not cache measured descendant
totals, skip accounting or change allocation/depth limits. The cache remains
weak; returned arrays remain independent copies.

The original implementation builds a fresh ancestry array and a scope/revision
record for every ancestor before discovering that the existing snapshot is
valid. The patch allocates this bookkeeping lazily on a miss, preserving the
single metadata-validation traversal and its read order.

## Evidence

Private candidate: `/tmp/agent-browser-sdk-scope-cache-O6GHPg/candidate`.
Baseline: `/tmp/agent-browser-sdk-callback-prefix-zspAIs/candidate`.
Only `packages/safe-js/src/interp/scope.ts` and the new
`packages/safe-js/src/interp/scope-cache-hit-allocation.test.ts` differ.

- Deterministic regression: 104 ancestry-record appends become zero.
- Unchanged-source red: seven pass, one fails; patched focused suite: eight pass.
- Related scope/accounting regression: 167 pass across 15 selected files.
- Strict types and a fresh core/node dependency-closure build pass.
- Parent verifies all 4,587 input hashes in each of the five execution lanes.
  All processes/groups close without timeouts or input/alias mismatches.

Tests cover revision invalidation, earlier snapshots, returned-array mutation,
shared descendants, equal primitive bindings, metadata addition/mutation,
metadata read order and ancestry changes. The existing mutable-capture,
transient-growth and depth checks remain in force.

## Integration boundary

`scope-cache.patch` applies to the exact baseline above. No change is applied to
the moving SDK repository or the browser's default runtime dependency.
The fresh build is under the candidate task's `build01/dist` directory.

The isolated Zoom vendor profile places retained-scope lookup on the hot
accounting path, but this contribution alone is not an end-to-end performance
measurement. Actual browser integration, live Zoom execution, admission, audio
and notetaking remain separate acceptance gates.
