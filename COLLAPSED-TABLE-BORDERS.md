# Native collapsed table borders

Collapsed borders now have native conflict resolution, sizing and shared
painting within the existing automatic-table profile. The implementation does
not strip the original CSS, pretend the table uses separate borders, or remove
the table's deferred layout shell. The full document table coordinator consumes
that shell after the border conflicts are resolved.

## Behavior

- Sparse grid-edge arbitration supports the existing `none`, `hidden` and
  `solid` border styles. Hidden suppresses a shared edge, none loses to a visible
  border, and width and participant precedence select a winner. Same-role ties
  use spatial precedence. The pure resolver includes directional tie tests;
  this does not introduce a general RTL document-layout implementation.
- Cell spans suppress internal unit edges. Cells, rows, row groups and the table
  contribute borders. Column and column-group participants exist in the pure
  resolver for future integration; native column-box layout remains guarded.
- Used formatting boxes receive half the maximum winning width along each cell
  side and outer table perimeter. Intrinsic measurement and final row/column
  sizing use those widths. Original DOM attributes, stylesheet declarations and
  source computed-style ownership remain intact. Table padding, border spacing
  and `empty-cells` do not alter this collapsed model.
- Shared edges are projected relative to the table content origin. Translation,
  nested tables, root clipping and relative/absolute/fixed ancestors retain that
  local coordinate system. Separate-border nested tables keep their own model.
- Table/row/group/cell backgrounds precede the shared border layer. Descendant
  content follows it. Ordinary per-box borders are suppressed for collapsed
  participants, preventing duplicate cell-border painting.
- Junction rectangles use a deterministic weak-to-strong native priority.
  Sparse pixel ownership blends each final border pixel once, including
  semitransparent colors. A transparent or invisible winning border does not
  reveal a weaker border at the same pixel.
- Paint-only border items do not invent hit targets. Existing physical cell and
  table border boxes retain hit ownership on either side of a shared edge.
  Border mutation and collapse-mode changes invalidate geometry, paint and hit
  snapshots; previously returned immutable snapshots remain unchanged.

This is a native physical solid-border profile, not a claim of complete CSS
Tables Level 3 harmonization or cross-engine pixel parity. In particular,
maximum-half-edge metrics and junction priority are explicit native policies.
The existing automatic column/row algorithms retain their documented scope.

## Bounds and failures

The pure resolver retains limits of 4,096 rows, columns and cells; 16,384
participants; 262,144 occupied slots and unit edges; and 4,000,000 work units.
It does not allocate an unbounded rows-by-columns matrix. Formatting and layout
also retain their existing tighter aggregate budgets. Raster accumulation is
sparse and clipped; it does not allocate a second full-canvas buffer.

Malformed input, overlapping cells, unsupported styles and exhausted limits
remain errors. Direct measurement/layout consumers must supply resolved border
metadata; they cannot quietly interpret an unresolved collapsed table as a
separate-border table.

Existing guards remain for fixed table layout, column boxes, captions,
positioned table roles, unsupported percentage sizing and other table profiles.
A zero-border empty grid works; nonzero borders on an empty grid still require
additional geometry support and remain guarded. Float/table reflow coordination
also remains unsupported. Positioning an ancestor or a supported relative
descendant is not evidence that positioned table cells or descendant floats work.

## Isolated evidence

The one-case clean baseline fails at the original formatting-profile width
guard. Exactly the same fixture bytes pass with the implementation, checking
actual shared cell geometry, single-alpha raster output and physical hit
ownership. Its text-bearing fixture was not replaced with a favorable page.

Five new manifest suites contain 186 tests: 104 pure conflict cases, 42 sparse
raster cases, 20 formatting/consumer cases, 19 document integration cases and the
unchanged regression. They cover spans, row/group/table precedence, hidden and
transparent winners, nested models, clipping, ancestor translation, relative
overlays, immutable snapshots, resource failures and a genuine native link click
with mousedown/mouseup/click events and mocked destination navigation. The final
20-suite focused run passes 847 checks with no failures or exclusions.

Earlier evidence is retained under
`node_modules/.cache/native-validation/collapsed-table-work-september12/`:

- `fixed01` preparation stops before tests because a manifest-listed stacking
  suite is pre-existing untracked work, absent from the clean snapshot. It is not
  copied or committed. Tracked float-paint-order and positioned-root-stacking
  suites supply relevant existing coverage.
- `fixed04` retains 842 passes and two failures. One hidden-border sample hit a
  real B glyph after the border correctly reserved zero space; the four
  color/background-only cases now use empty cells. Other cases retain real text.
  The other failure confirms the existing float/table reflow guard. It remains
  a guard test, alongside a separate successful relative-descendant overlay.
- The first two broad gates stop at build: first a typed side-map conversion
  error, then a widened return-type error. Neither attempt reaches broad native
  tests. Explicit typed side construction and a checked return type replace the
  unsafe conversion and inference.

These tests use the existing native runner with private HOME/TMP directories,
kernel socket denial and in-memory mock transports. They are not a live website,
real SafeJS, provider, passkey device, real TTY or CAPTCHA-bypass acceptance run.

## Sealed release gate

`native-collapsed-table-september12-round03` runs from **03:48:37.833 to
03:51:04.277 UTC on September 12, 2026**. Build, strict checking of 212 selected
test roots, scoped formatting and 213 selected native suites pass:
**11,784 passing tests, zero failures and two unchanged exclusions**.

The clean explicit manifest contains 607 entries; this is not a claim that all
607 suites ran or that every historical manifest target is tracked. The two
existing exclusions remain the host-object pressure ceiling and media-fallback
unsupported-display cases. Separate legacy grid failures remain outside this
established gate. The increase of 185 passes comprises 186 new cases minus one
obsolete unconditional collapsed-border rejection case, now covered positively.

The audit verifies 1,103 immutable source files, 1,944 compiled files and 1,082
unchanged tracked inputs outside the 20 owned source/test files and manifest.
`AUDIT.json`, `RECEIPTS.sha256`, `compiled.sha256` and `results/SUMMARY.json`
retain exact hashes, timings and outcomes in the private gate directory.

## Source reference and website gates

Primary-rule reference review used W3C CSS 2.2 section 17.6.2, including conflict
resolution: `https://www.w3.org/TR/CSS22/tables.html#collapsing-borders`.
This reference lookup is not a new native-browser source capture. No historical
source report or live website measurement is rewritten by the implementation.

Lua's existing live contents-page run and Man7's existing captures contained
collapsed-border diagnostics alongside independent CSS, table and fieldset
guards. Their prior failed clicks remain failed historical evidence. A fresh
bounded live flow or separately identified captured-page replay is required
before claiming a changed website outcome. Neither a removed border diagnostic
nor the isolated link fixture proves whole-site compatibility.
