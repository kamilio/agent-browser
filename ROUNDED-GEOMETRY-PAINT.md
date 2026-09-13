# Shared rounded geometry and native raster clipping

This is a foundation for native rounded corners, **not page-level CSS
`border-radius` support**. CSS parsing/cascade, curved border rings, generated and
fragmented boxes, canvas propagation and native pointer-region integration remain
outstanding. Their existing unsupported diagnostics are not removed by this change.

## Geometry

`src/rounded-box.ts` provides immutable used geometry:

- `createRoundedBox`: four physical ellipse pairs in top-left, top-right,
  bottom-right, bottom-left order; one overlap factor scales all eight components.
- `insetRoundedBox`: derives padding/content curves by subtracting corresponding
  insets and clamping exhausted axes. It does not normalize inner radii again:
  thick opposite insets can leave less than a quadrant of an ellipse visible.
- `roundedBoxSpan` and `roundedBoxContains`: use the same half-open coverage
  convention. Either zero ellipse axis gives a square corner; empty boxes have
  no coverage. Fractional coordinates and negative origins remain supported.
- `validateRoundedBox`: rejects malformed, negative, nonfinite and over-limit
  geometry using the existing native layout-length limits. Factories copy and
  freeze radius pairs rather than retaining mutable caller arrays.

Inputs are already-used numeric radii. The module does not parse CSS lengths or
resolve percentage/font-relative units; that future work must use actual final
border-box dimensions and computed styles. The deterministic native boundary and
pixel-center policy is not a cross-browser conformance claim.

## Raster clipping

Existing `paintRasterRect` and `paintRasterImage` accept an optional final
`RoundedBox` clip. Per-row spans intersect the existing pixel bounds. Image
sampling still refers to the original destination rectangle, never a narrowed
clipped span. Existing alpha blending and aliased-buffer copying are retained;
no full-size temporary mask or replacement alpha compositor is added.

`src/rounded-raster.ts` adds `paintRoundedRect` and `paintRoundedImage`. They count
geometric pixel coverage and charge work before any destination mutation, including
both row passes, coverage and any source-buffer alias copy. A transparent rectangle
returns zero; image coverage includes geometrically covered transparent samples.
Empty/off-raster coverage avoids unnecessary copies. Charges are bounded native
accounting units, not CPU instruction counts or a performance benchmark.

## Validation

On September 13, 2026, the isolated geometry check at
22:33:34.200–22:33:46.205UTC passes **108 tests**:45new geometry cases and63existing
math cases. The combined 13-file check at22:36:03.606–22:36:17.894UTC passes
**462 tests**:71new cases (45geometry/26raster) and391unchanged existing cases.
Both have zero failures/skips; build, strict checking, scoped formatting and input
integrity pass. Existing regression test sources and results match the prior gate.
These are separate focused selections, not baseline-versus-fixed comparisons.

Coverage includes all-corner normalization, asymmetric and exhausted insets,
partial inner arcs, circle/ellipse masks, fractional clipping, source scaling,
alpha, aliased buffers, invalid input rejection, work-limit mutation atomicity and
square-path identity. Read-only independent geometry review found no concrete
high-confidence gap; it did not run tests or establish live acceptance.

Evidence: `node_modules/.cache/native-validation/rounded-foundation-work-september13/FOCUSED-VERIFICATION.json`.

The full selected native gate at22:37:11.585–22:42:08.259UTC passes
**21,333 tests, zero failures and two unchanged skips**,416selected files and
415strict roots out of770manifest entries;354entries remain unselected. Build,
strict checking, scoped formatting and source checks pass. The audit records
1315source files,2140compiled files and1309unchanged tracked inputs.

The two skips remain the host-object ceiling and advisory-media cases. No new
exclusion hides a feature failure. This native gate does not establish separate
live, credential/provider/device, SafeJS, socket or real TTY/PTY acceptance.

Full evidence under `node_modules/.cache/native-validation/`:

- `native-rounded-foundation-september13-round00/AUDIT.json`, SHA-256
  `7810ba47b2ca07bffca1c8d59e5483b7acd2b81d6c9cfeeea1af1de12a57431a`.
- Its20-entry `RECEIPTS.sha256`, SHA-256
  `7f4142966fbfb2eb8524096fca8c9e5a3cce8cb20ac23180ffdab24030b97f50`.

Source requirements come from the retained native W3C Backgrounds and Borders
Level3 read, whose returned document is the March11,2024 CRD, not a latest-version
claim. See `WIKIPEDIA-CSS-ATTRIBUTION-SEPTEMBER-13.md`. Existing website failures
remain failures; this primitive work is not a Python, Wikipedia or kernel.org pass.
