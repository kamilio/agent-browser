# Bounded lazy SVG clip-reference lookup

SVG scenes resolve local clip fragments against the first matching ID in
document order, including definitions outside the painted SVG root. A small
scene previously indexed the entire document before resolving even an early ID.
Unrelated trailing content could therefore exhaust the clip-reference index's
4096-node or64-depth bound and reject otherwise usable geometry.

The index now advances only until the requested first ID is known. Subsequent
unknown references resume the same traversal; already indexed IDs reuse the
map. The depth-first generator retains O(depth) traversal state rather than
queueing all siblings. A new scene build starts a new index, so ID mutations or
document reordering are not hidden by a persistent cache.

## Preserved limits and semantics

- First-ID precedence, including wrong-kind/namespace shadowing, stays intact.
- Case-preserving fragment decoding and outside-root definitions are unchanged.
- The examined prefix keeps the4096-node/64-depth caps and source/caller-work
  charging. Unknown IDs do not restart that cumulative budget.
- A required ID beyond the cap still fails. A missing ID scans to exhaustion
  or the same cap; it is not silently treated as a complete bounded search.
- SVG/clip-geometry preflight and their separate source/shape/segment limits
  remain in force. No CSS, layout, network or document admission cap changes.

Unrelated trailing IDs/nodes/depth are no longer visited or charged by reference
indexing after the needed first IDs are resolved. Deferred lookup can also visit
an outside clip descendant after geometry preflight already charged its ID;
that ID then contributes source length once rather than twice. The requested
outside clip's own ID can still be charged by indexing and preflight. Tests
cover the exact source cap and one-unit overflow during this interleaving.
Accounting/admission and error timing are therefore not universally identical,
even when later lookup examines the same nodes. Geometry remains validated.

O(depth) describes the new traversal continuation, not total document memory:
existing native node-view caching can still copy a wide ancestor's child array.

## Evidence and remaining failure

On the same5345-node saved CNET homepage, successful construction rises from27
to29 of32 inline SVG scenes. The27 prior successful scene values are identical;
two header-logo scenes now construct with clipping. Three footer-logo scenes
still hit the reference-index cap, and the full-source native click still
fails. No fresh website recovery or rendered-logo result is claimed.

The final selected native suite passes456 tests in7 manifest files, including
21 new regression cases. The identical final test file over old production
gives94 passes and14 expected failures. Build, selected types and formatting
pass. Lint retains9 independently matched pre-existing diagnostics; it is not
reported as green. See `reports/svg-clip-prefix-2026-09-16.md` for evidence.

Remaining work includes efficient admission of legitimately later document
references, full-page layout support, explicit style budgets and complete
source-click workflows. Do not force a click, drop SVGs or relax a cap silently
to claim success. Original100-entry corpus verdicts remain unchanged.
