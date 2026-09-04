# Coordinate inertness integration

September 4, 2026 native checkpoint in the standalone TypeScript browser.

## Changes

The committed core now exposes `isInertSubtree` alongside `isInertRoot`. It
checks a candidate and its native ancestors using the same explicit-attribute
and first-select-button rule as reference actions. Optional work charging covers
ancestor visits and cold first-element scans. A work-limit exception cannot
publish a partially scanned first-element cache; native mutations continue to
invalidate that cache through immutable parent views.

Two previously pending coordinate adapters are corrected in the working tree:

- `src/hit-testing.ts` uses the shared subtree predicate when admitting native
  paint regions, with its existing work budget and revision-scoped result cache.
- `src/mouse.ts` uses the shared root predicate along its bounded target path,
  rather than checking only the explicit attribute. This also rejects an inert
  target returned by the hit-test fallback or injected native hit-test service.

The select owner remains eligible. Disabled state and author pointer-events
rules remain distinct from inertness. CSSOM root fallback behavior is unchanged.
First-child insertion/removal invalidates eligibility; a release after a target
becomes inert clears the held button without activating the target.

The HTML inert-subtree and select-button rules were reviewed on September 4:
`https://html.spec.whatwg.org/multipage/interaction.html#inert-subtrees` and
`https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element`.
This is the existing native tree profile, not modal-dialog or shadow-flat-tree
inertness support.

## Evidence boundaries

Current software select rendering treats the select as a control surface; it
does not render custom select-button descendants. Tests must not present that
omission as proof that descendant hit filtering works. Six added hit-test cases
therefore inject native layout boxes with descendant ownership. Five added mouse
cases inject native hit targets. These exercise the real filtering, revision
invalidation, event routing and release paths, but not custom-select rendering
or physical pointer input. Eight of these cases fail with the pre-change
coordinate adapters and pass with the corrected adapters.

The separate allowlisted `src/coordinate-inert.test.ts` contains 21 core tests
for ancestor semantics, text/comment prefixes, first-child mutations, owner
moves, detached subtrees, text nodes, bounded scans and closed owners. These
tests run in both the working tree and isolated committed-core tree.

## Commit boundary and next integration work

Only the owned core predicate, its new suite, the allowlist entry and checkpoint
documents are committed here. The four existing pending files
`src/hit-testing.ts`, `src/hit-testing.test.ts`, `src/mouse.ts` and
`src/mouse.test.ts` retain the focused corrections and new adapter tests in the
working tree. Their pre-existing implementation is not silently bundled into
this commit. Original historical reports remain unchanged.

A read-only import audit finds 29 untracked source modules in the coordinate
import closure, including these two adapters. The closure crosses pending CSS
variables/math/flow/borders/flex, intrinsic and inline-atomic layout, control
rendering, paint ordering, relative positioning/stacking, scrolling, click target
validation and held-key state. Promoting just the coordinate files would not
produce a self-contained committed implementation.

Next review and promote the pending rendering/style prerequisites in bounded,
independently validated slices, then promote hit testing and mouse routing with
their full dependency closure. Preserve the new failing-before adapter tests.
After that, implement custom-select descendant presentation and rerun the same
eligibility checks against real native layout, followed by separately authorized
live/physical evidence. The present committed-core pass does not close the
coordinate integration or custom-picker acceptance gates.

## Validation

- The three directly targeted files pass 109 tests.
- Expanded working-tree regressions pass 262 tests across nine allowlisted files.
- Isolated core/implicit-inert regressions pass 66 tests across two files.
- Working-tree production typecheck/build, strict checks of all three changed
  test files and six-file lint pass.
- Isolated production typecheck/build, strict new-test typecheck and two-file
  lint pass.
- Full native validation passes 9,052 tests across 249 allowlisted files.
- The isolated core patch passes 6,281 tests across 188 available files; the
  pending coordinate/layout modules and their suites are absent from that tree.

No live website, socket, real TTY/PTY or SafeJS probe ran. The previously denied
SafeJS probe remains unrun. No page-runtime dependency was added, nothing is
pushed, and the full seven-day browser goal remains active.
