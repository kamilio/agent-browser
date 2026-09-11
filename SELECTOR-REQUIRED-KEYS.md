# Required positive selector keys

Status: isolated regression validation passes. A captured Wikipedia article
replay confirms removal of a major zero-match cost, but the article still exceeds
its unchanged CSS/query budget later. This is not completed live-site acceptance.

## Conservative branch pruning

Before stylesheet matching, complete bounded candidate indexes may prove that a
direct positive id/class/type test in a selector compound has no possible element
anywhere in the document. Such a top-level selector branch cannot match and is
excluded before candidate enumeration and specificity comparison.

- Checks cover required ancestor and sibling compounds, not only the subject.
- Keys inside logical/negative/relational/nth operands are not treated as required.
- Unavailable or capped indexes mean unknown, not absent; complete matching stays
  authoritative. Foreign tag-case handling remains conservative.
- Remaining branches retain document order and the specificity of actual matches.
- Construction/lookups consume existing work limits. Mutations invalidate the
  existing structural index; no resource limit or dependency is increased.

## Isolated validation

`node_modules/.cache/native-validation/native-selector-required-keys-september11-round01/`
records September 11, 2026, 08:30:58.900–08:32:32.461 UTC:

- 6363 passing tests, zero failures and one previously reproduced baseline
  assertion excluded across 109 explicitly selected native files.
- All 40 selector-candidate tests pass, including nine new required-key cases.
- Production build, strict checking of 108 test roots and formatting pass. The
  unchanged snapshot.test.ts typing exception remains outside strict roots.
- 1006 source/fixture files remain unchanged; 1788 compiled files are pinned in
  `native-selector-required-keys-compiled-september11` with ledger SHA-256
  `3dac3fa5a5dce3cb20f9a2d2dd700482d68529ce0185f9470d3dab95afcda224`.

## Captured article evidence

The original guarded article profile is retained under
`node_modules/.cache/native-validation/native-wikipedia-article-css-diagnostic-september11/`.
Its largest completed zero-match selector,
`.client-js body.skin-minerva .mw-parser-output .ambox a`, consumes 2708379 work
units. Candidate storage is not capped: 20234 entries cover 17768 indexed nodes
and 8806 elements. The old failure occurs at call 69, in night-theme selectors.

The first new replay wrapper incorrectly compares the changed build's ledgers
to the original capture's build and stops before launching the browser. That
preflight failure remains in `native-wikipedia-required-keys-replay-september11/`.
The sibling `native-wikipedia-required-keys-replay-september11-followup/` separately
verifies each build against its own pinned ledgers and retains the old identities.

At 08:33:48.888–08:33:49.527 UTC, one zero-network native replay serves the captured
article and both captured stylesheets. The same zero-match hotspot now takes
11 work units. Loading advances to call 180, then fails on
`.mw-editsection a,.mw-editsection-like a` with 2316938 units remaining and a
throwing work total of 2317144. The largest completed remaining selector is
`.catlinks li`: 1382249 work units for 24 matches.

Source, compiled, parent and input pins remain unchanged; document/query/transport
cleanup and guards pass. The replay receipt SHA-256 is
`c3da633a451f2a9b720229cafc0fa71e1df8b0fc96afa649812c9f5b34030f83`.
Stylesheet binding still reconstructs native link/request order plus retained
origin/path because original query strings were redacted. This does not prove
the exact original wire queries. No fresh website request follows this replay.

## Next optimization

Keep candidate eligibility per selector branch rather than matching every branch
against a global candidate union. Conservatively restrict broad subjects to
required ancestor subtrees where combinators guarantee containment, then retain
full matching and maximum specificity. Validate sibling boundaries, namespace
case, grouped ordering, mutation invalidation and budgets before replaying both
Wikipedia and Python.org. Their full flows, rendering, research and challenge
effectiveness remain incomplete.
