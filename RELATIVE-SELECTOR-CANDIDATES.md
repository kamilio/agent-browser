# Bounded relative-selector candidates

September 11, 2026: `DocumentQueries` now plans each `:has()` relative branch
using the same positive rightmost ID/class/type candidate indexes as stylesheet
matching. Instead of testing every document element for every anchor, a leading
descendant or child branch binary-searches the first candidate after the anchor
and stops at the anchor's preorder subtree boundary. The complete relative
selector still decides each match with that anchor as `:scope`.

Leading adjacent/general-sibling branches are not restricted to the anchor's
subtree: their candidate elements may legitimately be outside it. Logical-only,
attribute-only, universal, and capped-index branches retain conservative candidate
fallback. Negative/logical operands are not mined for unsafe positive keys.
Multiple relative branches retain OR semantics, and ordinary matching and
stylesheet specificity still use their existing semantics.

Candidate lookup, binary-search comparisons, candidate iteration and final
matching remain charged to the query budget. Existing candidate index capacity,
mutation invalidation, HTML type folding, exact foreign names, duplicate IDs,
result limits, selector syntax limits and cache limits are unchanged. There is
no new retained cache or runtime dependency and no increased work budget.

## Reproduction and verification

The original captured MDN failure is documented in `MDN-NATIVE-PROFILE.md`.
Its selector is reproduced with 500 nonmatching list items, 800 outside details
elements, and one matching list item under the same logical ancestor pattern.
The new implementation finds the exact match with a 150000-work cap and recovers
after an intentionally insufficient 100-work call. This is a work-unit regression
test, not a hardware throughput benchmark or measured live speedup.

The isolated unchanged implementation plus the new tests in
`node_modules/.cache/native-validation/native-relative-has-baseline-september11/`
passes 102 cases and fails precisely the MDN-pattern resource-limit regression.
The improved implementation passes all 103 selector-candidate cases, including
23 added tests for relative branch semantics, mixed sibling/descendant paths,
multiple branches, outside/self exclusion, index-cap fallback, mutations,
namespace case handling, duplicate IDs and bounded-work recovery.

The clean `3f06c9e` snapshot overlaid only `src/selectors.ts` and
`src/selector-candidates.test.ts` in
`node_modules/.cache/native-validation/native-relative-has-september11-round01/`.
Build, strict checking, formatting and 111 explicit native files pass from
09:50:18.299 to 09:51:56.326 UTC: **6614 passed, zero failed, one existing
baseline assertion excluded**. The 1006 source files remain unchanged; the
manifest remains 549 entries. Strict checking uses 110 roots, retaining the
documented snapshot typing exception while testing that file at runtime. The
excluded focus-provisioning-pressure assertion remains an acknowledged baseline
failure, not a pass.

An initial focused command rejected an unsupported CLI `--cacheDir` option before
running tests; its logs are preserved. A separate config-based invocation passes.
Native validation denies network access and does not validate live navigation,
rendering, credentials, SafeJS, TTY/PTY or challenge avoidance. Captured MDN replay
and any fresh website attempt have separate evidence and outcomes.
