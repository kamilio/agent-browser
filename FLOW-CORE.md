# Native flow cascade and CSSOM core

September 4, 2026 checkpoint in the seven-day standalone browser plan.

## Integration and ownership

This promotes the pending flow parser/computation helper and focused adapters for
the committed stylesheet cascade, inline declarations, computed declarations and
formatting diagnostics. Position, float, clear, both physical overflow axes and
z-index are now recognized winners rather than unknown properties. Overflow
expands into two axes, and the existing cssFloat inline alias is paired with a
live read-only computed alias. The standalone core enumerates 49 static computed
longhands, plus custom properties.

Default declarations now render without unimplemented-property errors. Unsupported
winning flow values still prevent geometry and capture rather than silently
painting the wrong layout. Replacing them with supported defaults recovers through
the same document/style/geometry owners. Overridden declarations, unmatched rules
and display-none subtrees do not poison the supported rendering path.

The original source worktree bytes remain unchanged. This is a focused promotion,
not a rewrite of pending relative/flex/scroll/control work. The isolated formatting
adapter rejects non-static positioning; the committed capability export reports
relative positioning and stacking as false until those dependent implementations
are promoted and validated. The broader working tree retains its existing relative
and stacking capabilities. Its pending feature flags are not used as evidence for
the smaller committed core. Original `FLOW-STYLES.md`, `RELATIVE-POSITIONING.md`
and historical reports retain their contents and measurements.

## Semantics and limits

- Cascade specificity and importance operate per longhand. Complete shorthand
  serialization requires compatible priorities and values; mixed priorities do
  not produce a misleading shorthand.
- Flow properties do not implicitly inherit. Explicit inheritance, CSS-wide/all
  resets, reparenting and parent mutations feed the existing revision machinery.
- Custom-property substitution, invalid computed winners and complete pending
  shorthand removal reuse the committed variable and inline owners. Existing raw
  pending-shorthand partial-edit/serialization limitations remain open.
- Overflow overlay canonicalizes to auto. The native profile preserves clip when
  the other axis is scrollable, and changes visible to auto in that case. This
  follows the August 13, 2026 editor draft inspected on September 4 at
  `https://drafts.csswg.org/css-overflow-3/`, section 3.1. The published October 7,
  2025 working draft at `https://www.w3.org/TR/css-overflow-3/` instead describes
  clip-to-hidden conversion. This is an explicit draft-profile choice, not an
  assertion of released-browser interoperability.
- Z-index uses safe integers; invalid writes leave existing declarations intact.
  Static normal-flow z-index values do not establish stacking in this checkpoint.
- Flow records are charged during cascade reconstruction, published with the
  successful rebuild and cleared with other style state. Resource failure,
  repair, detach/reattach and owner close are covered by native tests.

## Validation

The new 48-case suite is explicitly allowlisted in `native-tests.json`. All 48
cases fail in pre-integration HEAD with only the helper present, and pass in both
the integrated isolated core and broader working tree. Two existing isolated
computed-enumeration assertions are updated from 43 to 49 for the six new
longhands. Production types/builds and strict changed-test checks pass in both
trees; changed-file lint covers nine files.

- Full native validation passes 9,248 tests across 253 allowlisted working-tree
  files and 6,478 across 192 available isolated-core files.
- Focused validation passes 277 tests across six working-tree files and 179
  across five isolated-core files. The pending broad flow suite is absent from
  the isolated tree because it depends on unpromoted inline-block/capability work.
- Final nine-file lint passes in both trees. The isolated commit snapshot is
  checked against staged bytes; unrelated pending source changes remain separate.

Host-object factories and software pixels are native evidence, not released
SafeJS execution or a live browser oracle. No live website, socket, real TTY/PTY
or SafeJS acceptance probe ran; the previously denied probe remains unrun. No
runtime dependency is added and nothing is pushed.

Next integrate remaining inline/flex and intrinsic sizing prerequisites together
with the shared paint-order/relative-positioning paths, then scrolling and the
corrected coordinate adapters. Full positioning, clipping, float/clear layout,
custom select/pickers, pending CSSOM slots and independent runtime/site/UI gates
remain open. The full browser scope and seven-day continuation stay active.
