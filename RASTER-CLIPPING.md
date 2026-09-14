# Bounded raster clipping views

`withRasterClips(image, clips, charge?)` in `src/raster.ts` creates a frozen
same-size destination view sharing the original pixel storage. It snapshots
the supplied rounded rectangles, intersects them with inherited clips, and
keeps clipping state private in a WeakMap. Caller mutations cannot change a
view's clipping geometry. Parent, child and sibling views do not mutate each
other's clipping state; writes still update their shared destination pixels.

Rectangle, scaled-image and bitmap-glyph painting all respect the inherited
intersection and their existing optional per-draw clip. Sampling uses pixel
centers and half-open edges, including fractional and off-canvas rectangles.
Alpha compositing and aliased-image source snapshots retain their existing
behavior. Using a clipped view as a source reads its stored pixels: clipping
is destination write state, not a persistent mask on the pixel buffer.

## Bounds and accounting

- `rasterClipLimits.maxClips` allows at most 1,024 accumulated clips per view;
  inherited clips count toward it. The existing `rasterLimits` object keeps
  its original two-field public shape.
- Existing raster limits remain 4,096 per dimension and 4,194,304 total pixels.
- Integer-row intersections are cached per view; at most its raster height
  can enter the cache. No additional full-size canvas or pixel-buffer copy is
  created by making a view.
- An optional callback charges construction, clip traversal, cache insertion,
  cache lookup and per-draw clip work. A child inherits it unless it supplies
  its own callback. This is an internal trusted API, not a security boundary
  preventing callers from painting directly into the original image.
- A budget exception stops subsequent writes. It does not roll back rows
  already painted before the exception. Invalid primitive inputs still fail
  even when a clip would exclude every pixel.

## Validation and boundary

The corrected isolated focused run on September 14, 2026 passes **858 tests,
zero failures and zero skips**, including **51 new clipping cases**. Build,
strict checking, scoped formatting and source-inventory stability pass. Evidence
is retained in
`node_modules/.cache/native-validation/overflow-work-september14/raster01/`.

The earlier 790-case focus passed, but full round00 caught a public-shape
regression: adding the clipping cap to `rasterLimits` failed an existing numeric
marker assertion. That failed gate remains recorded as 21,756 passes, one
failure and two skips. The correction exposes `rasterClipLimits` separately;
the old assertion and raster dimensions/pixel caps are unchanged. The expanded
focused run includes all 68 existing numeric-marker cases.

The corrected full selected gate passes **21,757 tests, zero failures and two
unchanged skips**, September 14, 01:47:18.445–01:52:20.365 UTC. It selects 425
files and 424 strict roots from 777 manifest entries, leaving 352 unselected.
Build, strict checking, scoped formatting and source/compiled inventory audit
pass. Its snapshot contains 1,326 source and 2,156 compiled files. The two old
skips remain the host-object ceiling and advisory-media/unsupported-display
cases; this is not a claim that every manifest test ran or every selected test
executed. Evidence:
`node_modules/.cache/native-validation/native-raster-clipping-september14-round01/`.

This is a raster primitive, **not complete CSS overflow support**. Formatting
metadata, padding-edge clip chains, containing-block escape, scrollable extents,
element scroll state, input routing and nearest-scrollport sticky composition
still need integration. The browser's overflow rejection remains in place;
Python's recorded Tutorial click remains blocked. No new website rendering,
navigation, performance, credentials, device, SafeJS, socket or real-TTY
acceptance follows from these synthetic pixel tests.
