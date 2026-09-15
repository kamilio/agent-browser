# Split-inline pointer actions

Native `click` and `hover` can target an inline element containing normal-flow
block children, using those children's actual projected border boxes. This fixes
the source-reader RunRepeat link workflow without forcing a click, changing the
document's styles, bypassing hit testing, or substituting keyboard navigation.

## Ownership and geometry

When the formatting tree lifts a block out of an inline run, the block retains
frozen `splitInlineAncestors` references, ordered inner-to-outer. DOM parents are
not changed. Unrelated siblings and gaps are not attributed to the inline owner.
Copying ownership is charged against the existing formatting work bound.

`LayoutGeometry` stores the block's border rectangle in a separate actionable map
for each retained owner. `getActionableClientRects` includes these real rectangles
alongside the owner's inline fragments and supported outside markers. Border and
padding are included; margins are not. Existing work and rectangle limits apply.

The ordinary CSS geometry methods still reject split-inline ownership:
`getClientRects`, `getBoundingClientRect` and `getUsedStyle` do not pretend that a
descendant's box is the inline element's own CSS box. This change establishes a
native action contract, not full CSSOM or cross-browser rendering conformance.

## Action safeguards

The existing action path still selects coordinates, projects scroll positions,
checks overflow and viewport clipping, hit-tests the actual DOM subtree, and
dispatches native mouse events. Covered, hidden, inert, pointer-events-disabled
and ARIA-disabled targets do not gain an activation bypass. A successful click
can hit the block child and bubble through the requested inline owner normally.
The tested emitted events are `mousedown`, `mouseup` and `click`; this is not a
claim of new DOM `pointerdown`/`pointerup` support.

Ordinary inline elements keep their existing rectangle behavior. Geometry is
invalidated through normal document revision handling; moving a block does not
leave its old owner with live actionable rectangles. Old frozen snapshots remain
immutable values. Unsupported layout features remain unsupported.

## Evidence

`reports/split-inline-actions-2026-09-15.md` records:

- 534 passing selected native tests, including 16 new ownership/action cases and
  a reader-session regression changed from expected pointer rejection to success.
- Identical saved RunRepeat root/review bodies: baseline pointer rejects;
  candidate pointer dispatches mouse events and navigates. Baseline keyboard and
  candidate pointer destination Markdown are byte-identical.
- A fresh native root → source anchor → pointer click → review workflow with two
  HTTPS GETs and 27,423 Markdown bytes, with no keyboard fallback or direct fetch.

The suite is selected, not the full native manifest. Existing formatting-file
lint debt remains unchanged at 13 diagnostics. New tests cover root scrolling
and ancestor clipping; split-specific nested scrolling and mutation during mouse
dispatch remain additional coverage work. No SDK, page scripts, credentials,
CAPTCHA solver, external browser or new dependency is introduced.
