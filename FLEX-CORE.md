# Flex styles and measured main-axis core

September 4, 2026 checkpoint in the seven-day standalone browser plan.

## Scope and provenance

This promotes the pending flex style helper and measured main-axis solver with
focused stylesheet, inline-CSSOM, computed-style and inherited-value adapters.
The existing solver and its 161-case native suite are preserved unchanged. The
new integration suite has 33 cases. Original source worktree bytes, broad pending
flex/inline/relative/rendering implementations and historical `FLEX-STYLES.md`,
`FLEX-LAYOUT.md` and related reports are preserved.

The committed core exposes twelve flex longhands and the flex, flex-flow and gap
shorthands. Its computed enumeration grows from 49 to 61 static longhands, plus
custom properties. Matching enumeration count and first-name assertions are
updated only in the isolated commit snapshot; broader pending assertions remain
in the worktree. Flex-item display computation follows the nearest generated
parent box through display:contents without blockifying ordinary grandchildren.

## Behavior

- Importance and specificity select individual shorthand components. Incompatible
  priorities serialize to an empty shorthand rather than concealing differences.
- Explicit inheritance and CSS-wide/all resets reuse the shared style owner.
  Font-relative, viewport-relative and supported math basis/gap values use existing
  font and box computation. Percentage-bearing results remain unresolved lengths
  until a consuming layout owner supplies the appropriate basis.
- Custom-property substitution and complete pending-shorthand replacement/removal
  use the existing bounded variable and inline owners. Invalid computed winners
  do not resurrect earlier declarations. Complete standard pending-substitution
  slots and canonical flex shorthand serialization remain open.
- Reparenting, media changes, font changes and detach/reattach invalidate saved
  declarations correctly. Failed declaration rebuilds recover after repair;
  owner close revokes retained native host objects.
- The main-axis solver accepts already measured bases, constraints, margins,
  factors and gaps. It performs stable order-modified line collection, iterative
  min/max freezing, proportional growth/scaled shrinkage, auto-margin allocation
  and supported justification. It preserves fixed border/padding contributions,
  fractional factors and very small shrink weights under explicit resource limits.
- Input data records, dense arrays, factors, coordinate magnitudes and work are
  bounded. Existing exact-work, immutable-output and deterministic reference-solver
  checks remain part of the promoted suite.

## Corrected research finding

An initial suspicion that align-self:safe normal was invalid was incorrect. The
May 8, 2026 editor draft inspected at `https://drafts.csswg.org/css-align/`,
section 6.2 and its property index, explicitly allows an overflow-position before
normal for align-self. The tentative rejection was withdrawn; the original parser
is preserved. Tests now cover accepted safe/unsafe normal through grammar,
authored cascade, CSSOM and substitution, while rejecting safe/unsafe stretch.
The initial full worktree run also caught two existing draft-normal regressions;
neither existing test was weakened to accommodate the incorrect change.

The main-axis algorithm was reviewed against
`https://drafts.csswg.org/css-flexbox-1/`, sections 9.3 and 9.7. These are native
algorithm/style checks, not a complete CSS implementation or live interoperability
result. Omitted flex shorthand bases retain the existing explicit 0% profile.

## Validation and remaining integration

With the final corrected tests, pre-integration HEAD plus the two helpers fails
31 of the 33 new cases. The two direct grammar checks already pass there. All
33 pass in both integrated trees. Expanded native checks pass 390 tests across
six working-tree files and 282 across five isolated files. The latter includes
the unchanged 161-case solver suite; the broader CSS-flex suite still depends on
unpromoted intrinsic and formatting/command integration.

- Final full native validation passes 9,281 tests across 254 allowlisted
  working-tree files and 6,672 across 194 available isolated-core files.
- Production typechecks/builds, strict checks of the three new/promoted/updated
  test files and ten-file lint pass in both trees.
- The final commit snapshot is compared byte-for-byte with the validated isolated
  tree. Remaining pending changes are audited separately and preserved.

The committed capability profile leaves page flex layout, nested/column/wrapped
column and inline-flex layout false. Numeric main-axis resolution is not page
flexbox: the isolated core still rejects unresolved flex formatting. The broader
pending worktree keeps its existing larger feature flags. Next integrate intrinsic
measurement, atomic-inline sizing and the flex reflow/placement owners with shared
paint ordering, then relative positioning, scrolling and coordinate routing.

No live website, socket, real TTY/PTY or SafeJS acceptance probe ran. Native host
factories are not released SafeJS evidence; the previously denied probe remains
unrun. No dependency is added and nothing is pushed. Custom select presentation,
picker breadth, full layout compatibility and independent runtime/site/UI gates
remain open. The full browser goal and seven-day window stay active.
