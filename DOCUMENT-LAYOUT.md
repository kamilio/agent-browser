# Normal-flow document geometry and native text paint

The subsequent `CSS-PAINT.md` checkpoint adds foreground colors, solid block/inline
backgrounds and canvas propagation. Measurements and evidence below describe the
original document-layout workload unless stated otherwise.

`CLIENT-GEOMETRY.md` subsequently exposes restricted native/client rectangles
and revision-cached bounding unions to SafeJS and the agent `geometry` command.
It does not add coordinate actions, scrolling or complete CSSOM geometry.

`LAYOUT-MEMORY.md` subsequently makes nonempty absolute glyph vectors lazy while
preserving their complete immutable array interface. Painting reads relative
vectors directly; the memory figures below remain the original eager baseline.

September 2, 2026. The engine now connects parsed DOM, its supported cascade,
formatting tree, horizontal sizing and measured lines to **document-positioned
blocks and glyphs**. A bounded raster stage paints that restricted text profile.
The new artifact is laid out from HTML/CSS, not assembled in demonstration panels.
No browser engine, canvas package or new dependency is involved.

## Geometry API

```ts
const geometry = layoutDocument(page.document);
const capture = rasterizeDocument(page.document);
const png = encodePng(capture.image);
```

These synchronous native functions are exported from the package. They borrow
the current document/styles without changing its revision, snapshot baseline,
scroll state or default script runtime. They do not enable a page geometry API,
coordinate-action API by themselves. `CAPTURE-EXPORT.md` now connects restricted
native PNG capture to the CLI; PDF remains open.

`layoutDocument` returns `stage: "normal-flow-document-layout"`, `partial: true`,
the source text-layout result, immutable box records, positioned text contexts,
flow height and work counts. Formatting IDs remain ephemeral; source refs remain
the actual native refs. Anonymous blocks have no invented element reference.

- `borderY` and `contentY` are document coordinates, paired with the existing
  horizontal positions. Content height, padding and border-box height are reported
  separately. Borders are still outside the supported cascade and therefore zero
  in this profile, not silently approximated from unknown declarations.
- Positioned context line tops/baselines and glyph Y are absolute document
  coordinates. The nested `text` result retains its original block-relative
  coordinates; consumers must not add the origin twice. Real source refs and
  UTF-16 offsets are preserved through positioning.
- Natural content height is derived from measured lines or in-flow block children.
  Specified heights can leave space or allow visible overflow. Min/max constraints
  apply with minimum winning conflicts; border-box inputs subtract vertical edges
  and floor content size at zero without shrinking padding.
- Definite containing content heights propagate top-down, including explicit
  heights clamped by min/max. Percentages resolve against those heights. Under
  an auto-height containing block, unresolved height/min/max percentages act as
  auto/zero/none instead of introducing a sizing cycle. Auto height does not become
  a definite percentage basis merely because min-height makes its used height large.
  Root percentage height uses the logical viewport's height.
- Vertical percentage padding/margins use containing **width**, not height. Auto
  vertical margins become zero. Supported negative margins retain signed positions.

`flowHeight` is the nonnegative end of the root normal-flow sequence, including
its participating margins. It is **not scrollHeight or a union of ink/overflow
bounds**: a fixed-height block's text can extend below it without enlarging flow.
No scroll metrics are fabricated from this number.

## Margin collapse

Each measured block carries a leading and trailing margin strut: the greatest
positive and most-negative participating values, whose sum is the collapsed
distance. Keeping both extrema prevents incorrect repeated pairwise collapse.
The local numeric margin inputs remain separately available.

- Adjoining siblings collapse; parent/first-child and last-child/auto-parent
  margins collapse where the supported rules allow them.
- Padding, root and flow-root boundaries prevent collapse with children. A
  flow-root's outer margins can still adjoin siblings; its own top/bottom margins
  do not collapse through its empty content.
- Empty ordinary blocks can collapse through when height is auto/zero, minimum
  height is zero, no padding separates the margins and there are no real lines or
  separating descendants. Collapsed whitespace-only anonymous blocks remain
  distinct from zero-height lines containing real text or forced breaks.
- Leading through boxes whose margins join the parent's top edge share its border
  position. Other through-box border positions use the hypothetical nonzero-bottom-
  border rule; they do not inflate surrounding flow merely because their border
  coordinate lies outside the parent's auto content height.
- The nonzero-min-height exception prevents a child's bottom margin from also
  joining the parent's bottom when it is already connected through to parent top.
  Ordinary non-through last-child bottom margins can still adjoin an auto parent's
  bottom. Height clamping does not rewrite the original collapse category.

This handles the supported normal-flow profile, not clearance, floats, positioned
boxes, table/flex/grid layout or intrinsic/replaced sizing. Existing formatting and
CSS diagnostics reject unsupported input before geometry is published. The later
`INLINE-BOXES.md` checkpoint supports horizontal inline margins/padding, not borders
or the other unsupported layout modes; there is no bypass flag.

## Raster API

`rasterizeDocument` returns `stage: "normal-flow-text-raster"`, `partial: true`,
the geometry, a frozen clip descriptor, a caller-owned RGBA image and work counts.
By default it captures the logical viewport at document origin zero.

```ts
const crop = rasterizeDocument(page.document, {
  clip: { x: 0, y: 300, width: 640, height: 240 },
});
```

The clip is in document coordinates; it **does not change viewport size or reflow
the page**. The painter starts with an opaque white surface and uses Agent
Mono glyph masks at their actual layout coordinates. The paint extension supplies
foreground colors and solid backgrounds; the original fixture uses black text. It
preserves visible overflow, skips hidden/blank/zero-sized glyphs and culls using
ink bounds rather than only line height. Fractional coordinates use the existing
pixel-center sampling. Fallback characters remain visibly marked by the replacement
mask and the source layout's unsupported-glyph counter.

This is deliberately **restricted native text painting**, not full CSS painting.
The later `CSS-PAINT.md` profile accepts foreground and solid background colors.
Other unsupported declarations still block captures. Images, borders, decorations, complex
fonts, bidi, stacking, transforms, scrolling and general layout modes remain open.
The full UA typography/box sheet is also incomplete. A capture of this engine's
supported fixture is not evidence of visual equivalence to Firefox/Chromium.

Raster metadata is frozen, but its pixel buffer belongs to the caller and can be
mutated independently of other captures. Closing the source revokes new layout
and paint calls; previously returned geometry/pixels/PNGs remain readable.

## Bounds and resources

Document positioning has a lowerable two-million-unit work budget in addition to
the existing independent CSS/formatting/text limits. Numeric coordinates, heights
and positioned text extents use the existing bounded layout-number checks.
The raster stage has a lowerable 32-million-unit budget, charging framebuffer
initialization, traversal and a conservative clipped-ink pixel/bitmap-row work estimate
before drawing. Submitted intersecting glyphs are counted as painted even if an
extremely small fractional mask does not cover a pixel center.

Raster dimensions remain bounded to 4,096 each and 4,194,304 pixels total. A larger
logical viewport can require an explicit smaller crop. PNG encoding now uses the
bounded compressor from `PNG-COMPRESSION.md` (with stored fallback) and has separate
transient buffers. No constant-memory streaming or Worker deployment claim follows
from this API.

The native resource probe lays out 100, 1,000 and 5,000 mixed-size paragraphs with
collapsing margins, paints a 640 × 480 viewport and encodes it. Single fresh-process
observations from the recorded environment:

| Paragraphs | Parse ms | Cascade/layout/paint ms | PNG ms | Peak process RSS MiB |
| --- | --- | --- | --- | --- |
| 100 | 6.3 | 26.7 | 7.2 | 71.9 |
| 1,000 | 31.8 | 109.3 | 8.8 | 115.1 |
| 5,000 | 102.3 | 343.8 | 7.5 | 197.4 |

The large case retains 158,890 source-mapped glyphs, positions 5,003 boxes and
computes 95,002 pixels of flow height. The viewport submits 617 glyphs, culls
133,273 offscreen glyphs and skips 25,000 blanks. All three captures have the same
PNG digest because their visible prefixes match. Relative and positioned records,
pixels and PNG are deliberately retained; this is not a leak/forced-GC experiment.
These are synthetic native measurements, not controlled speed comparisons or
real-site JavaScript costs, and are not directly comparable to earlier text-only
profiles with different workloads/output retention.

## Verification

- `reports/document-layout-focused-2026-09-02.json`: 1,800 passes across 77 files,
  including 42 new vertical-layout cases and 19 raster cases. A hundred generated
  flat chains compare signed/through margin positions with an independent oracle.
  Nested collapse, barriers, percentage sizing, constraints, overflow, anonymous
  flow, resize, source lifetime, exact pixels/crops and resource failures are covered.
  A narrow-clip/large-font case checks row-work charging beyond visible pixel area.
- `reports/document-layout-safejs-fixture-2026-09-02.json`: eleven actual existing-
  experimental-core checks, including a native click that runs interpreted height
  mutation, shifts following blocks and changes actual pixels. Crop equivalence,
  logical resize, unsupported positioning, paint failure recovery and close are
  also verified. This is not released-SDK or real-site acceptance.
- `reports/document-layout-{text,formatting}-regression-2026-09-02.json`: another
  27 actual experimental-core checks. The text regression's temporary panel output
  is the earlier panel fixture, not evidence of this document renderer.
- `reports/document-layout-native-render-2026-09-02.png`: actual 640 × 600 output
  from the post-click HTML document, visually inspected. All positions come from
  the engine; no manual panel placement is used. The probe records its digest and
  1,536,783-byte size.
- `reports/document-layout-native-{small,medium,large}-2026-09-02.json`: three native
  resource profiles, eight passing assertions each.

From the repository root after building:

```sh
node packages/browser-agent/dist/scripts/check-document-resources.js large
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/absolute/approved/compiled/safe-js \
  node packages/browser-agent/dist/scripts/check-document-layout.js /tmp/document.png
```

Both probes use synthetic documents; the interpreted probe uses an in-memory
transport and an explicitly selected already-available experimental core. Neither
opens a socket, starts a service or fetches a website. Public-site, released-SDK,
full Kitesurf and Playwright-CLI-superset gates remain open in `COMPATIBILITY.md`.
