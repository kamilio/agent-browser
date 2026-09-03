# Inline element captures and scoped playground PNGs

September 2, 2026. `screenshot` now accepts supported normal-flow inline targets,
including wrapped text, instead of requiring a single block box. The playground
also accepts an optional capture selector/reference. No dependency or external
browser engine was added.

`LAYOUT-MEMORY.md` subsequently removes eager duplicate glyph records from this
capture path. The resource figures below remain this checkpoint's baseline;
the later document records the optimized measurements and unchanged PNGs.

## Use

With a built package and an existing command service/session:

```sh
node packages/browser-agent/dist/src/cli.js screenshot '#article-link' --filename=link.png
node packages/browser-agent/dist/src/cli.js geometry '#article-link'
```

The existing strict locator/reference resolution, session ownership, bounded
artifact transfer, private atomic local-file writer, and scale-one behavior stay
unchanged. Agent inspection, page `getBoundingClientRect()`, and screenshot bounds
now share the same layout-snapshot geometry extractor.

In the playground's Render pane, enter an optional selector or reference. Render,
Enter in that field, and the footer PNG download all use that target. A blank
field captures the viewport. The caption identifies the actual element reference
or viewport, revision, dimensions, and snapshot status. Editing the target clears
the old preview; changing documents or disconnecting clears both scope and preview.
Missing targets fail visibly rather than silently downloading the viewport.

## Capture semantics

- Wrapped inlines use the union of their actual line-fragment border boxes.
  Fractional edges round outward to integer raster pixels. The viewport is not
  resized, so capture does not rewrap the page.
- The result is a crop of the painted page, not an isolated rendering of the
  target's descendants. Intervening page backgrounds and overlapping unrelated
  content remain visible. Descendant ink outside the target's own bounds is clipped.
- Mixed font sizes, supported vertical padding, negative coordinates, and targets
  below/outside the viewport use actual document-space positions. Positive-area
  whitespace may legitimately produce a blank image.
- Empty/zero-area targets, invisible elements, `display:contents`, unsupported
  layouts, and oversized raster dimensions fail without placeholder images.
  The existing 4,096-pixel dimension and four-megapixel image limits remain.
- Block-in-inline client ownership is still explicitly unsupported. Full CSS,
  transforms, scrolling/actionability parity, general replaced elements, high-DPI
  output, and PDF remain separate work. Offscreen document cropping is not an
  implementation of browser scrolling.

The page-crop model follows the reference API described at
`https://playwright.dev/docs/api/class-elementhandle#element-handle-screenshot`.
This does not claim its complete scrolling, waiting, frame, or rendering semantics.

`LayoutGeometry` extracts rectangles and bounding unions from an already computed
layout. The revision-owned `DocumentGeometry` cache uses that same implementation;
the rasterizer borrows its fresh layout directly. A test verifies that a targeted
capture performs one document-layout pass, not a second pass through page geometry.
Native cache ownership and guest snapshot budgets are unchanged.

## Evidence

- `inline-capture-focused-2026-09-02.json`: 2,081 passing tests across 91 explicitly
  selected safe files, including 23 new capture/playground cases. Coverage includes
  exact viewport-crop pixels, wrapped/fractional/mixed-size/offscreen bounds,
  unrelated overlapping content, whitespace, failures, snapshot ownership,
  single-pass layout, PNG downloads, keyboard submission, preview revocation,
  missing targets, and document changes.
- `inline-capture-safejs-2026-09-02.json`: 11 checks against the existing experimental
  SafeJS core. Interpreted geometry, framed agent commands, native PNG encoding,
  independent Node inflate, exact viewport-crop comparison, private CLI file output,
  and an interpreted event changing both text bounds and background color pass.
- `inline-capture-native-2026-09-02.png`: the actual 132 × 36, 1,589-byte capture,
  visually inspected. SHA-256:
  `9b8f0d47c8fe7f11a93e999a37e6664b628f0140150a770cfe2ba84a801f301f`.
  An interpreted click changes the target to 72 × 16 and its PNG to 536 bytes.
  The old private file remains unchanged. Maximum observed protocol frame: 2,343 bytes.
- `inline-capture-final-regression-2026-09-02.json`: a second 11-check run of that
  actual-core fixture. `inline-capture-geometry-regression-2026-09-02.json` preserves
  all 13 guest geometry checks after sharing snapshot extraction.
- `inline-capture-block-regression-2026-09-02.json`: all nine prior actual-core
  capture-export checks still pass; the larger viewport PNG remains byte-identical
  to the earlier compressed fixture.

The playground tests execute its actual UI handlers against a real command host
with mocked DOM/fetch boundaries. These are not live-browser/playground or new
website tests. The SDK remains the explicitly selected experimental core, not
new released-SDK acceptance.

## Resource measurements

Each fresh-process fixture lays out a complete document and captures the final
row's offscreen inline word. Every output is the same real 24 × 8, 179-byte PNG.
Only four glyphs are painted, while unrelated ink is culled. Seven assertions
pass per profile, 21 total.

| Paragraphs | Layout and crop | Peak RSS | Target Y |
| ---: | ---: | ---: | ---: |
| 100 | 19.14 ms | 63.8 MiB | 1,389 |
| 1,000 | 103.96 ms | 106.0 MiB | 13,989 |
| 5,000 | 339.83 ms | 199.4 MiB | 69,989 |

Reports: `inline-capture-native-{small,medium,large}-2026-09-02.json`.
These are single local Node samples, not statistical comparisons or Worker
acceptance. Parsing is separately recorded; encoding takes under one millisecond
in these samples. The returned full layout remains retained during measurement;
no forced garbage collection or external browser is used. A small crop still
requires substantial full-document layout memory, so low-memory optimization
remains necessary rather than being hidden by the small PNG size.

Reproduce after building the package:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/absolute/compiled/safe-js \
  node packages/browser-agent/dist/scripts/check-inline-capture.js /tmp/new-inline.png
node packages/browser-agent/dist/scripts/check-inline-capture-resources.js large
```

Build, strict changed-test typechecking, focused lint/formatting and diff checks
pass. The complete browser goal remains active, including real-site scripts,
released-SDK integration, full reference coverage, and live frontend acceptance.
