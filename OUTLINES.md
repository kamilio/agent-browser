# Authored outline styles and native painting

September 4, 2026. Continuation of the seven-day browser plan and
`GENERATED-STYLES.md`. The browser goal remains active.

## Native behavior

Author styles can now produce outlines on ordinary blocks, wrapped inline
fragments and native replaced controls. Existing focus selectors can change the
outline without changing layout geometry or hit targets. Generated fallback focus
feedback remains separate: host outlines are not copied onto internal headers.

The native CSS pipeline supports `outline`, `outline-width`, `outline-style`,
`outline-color` and `outline-offset`, including stylesheet and inline declaration
parsing, CSS-wide values, explicit inheritance, `all`, variables, `@supports`,
computed-style reads and ordinary command style inspection. The shorthand resets
width/style/color but deliberately leaves offset independent. Explicit current
color inheritance uses the parent's computed value rather than the child's color.

Supported patterns are none, solid, dashed, dotted, double and auto. Auto uses a
native two-pixel outline independently of specified width; auto color uses the
native blue accent when the style is auto and current color otherwise. Solid and
patterned widths reuse existing border length normalization and snapping; offsets
support negative lengths and existing font/viewport/absolute units and math.
Percentages, hidden outline style and unimplemented groove/ridge/inset/outset
patterns are rejected atomically rather than silently substituted.

`src/css-outline.ts` owns parsing and immutable computed records; `src/styles.ts`
owns document-scoped invalidation and lifetime. `src/outline-raster.ts` paints
clipped pixel-center samples, charges shared raster work and blends each corner
once. Large negative offsets retain minimum dimensions independently on both
axes. New `outlinePixels` metrics count actual painted samples.

Outlines use the existing native paint ordering. Block/inline outlines paint with
their decoration phase, before descendant/text content; replaced-control outlines
paint after their own content. Later stacking content may cover them. Each inline
fragment gets a closed rectangular outline; this is not contour-union, rounded
corner, transformed or full browser outline-shape support. Outlines do not expand
scroll geometry or element-capture bounds, so outside ink can be clipped by an
element crop. No new page-runtime dependency or foreign rendering engine is used.

## Standards reviewed

Primary sources reviewed September 4, 2026:

- CSS Basic User Interface Level 4, outline shorthand, widths, patterns, colors,
  offsets and implementation-defined outline stacking:
  `https://drafts.csswg.org/css-ui/#outline`
- CSS 2.2 Appendix E, background context for the existing native stacking path:
  `https://www.w3.org/TR/CSS22/zindex.html`

The CSS UI outline-stacking guidance supersedes the older Appendix E outline
ordering. Native paint-order choices and incomplete shape/pattern support above
are explicit, not a claim of platform or full browser rendering parity.

## Validation

All 62 new tests fail on isolated prior HEAD. With the patch they cover shorthand
permutations, auto ambiguity, offsets, atomic rejection, priority/serialization,
variables and supports, non-inheritance/explicit inheritance, font and viewport
math, immutable caches, focus/style invalidation, independent geometry/hits,
clipping, alpha corners, negative offsets, patterns, replaced/inline rendering,
stacking and capture/style lifetime. Two existing computed-style enumeration
assertions update from 68 to 72 supported longhands.

Focused native validation passes 260 tests / eight isolated files and 261 / eight
working files; the extra working test is pre-existing pending coverage. Typecheck,
build, strict checking of both affected test files and ten-file Biome checks pass
in both trees. Authorized full native runs pass 9,515 tests / 273 isolated files.
The working run reports 10,660 passes and the unchanged pending
`src/page-bindings.test.ts:161` Window-onload assertion failure / 295 files, not
an all-green working tree. Both suites use the explicit `native-tests.json` list.
Local logs are preserved under `node_modules/.cache/native-validation/` as
`outline-red.log`, `outline-focused-working.log`, `outline-native-isolated.log`
and `outline-native-working.log`.

## Inspected native captures

`node_modules/.cache/native-validation/outline-capture.mjs` uses actual open,
resize, Tab, styles, geometry, screenshot and artifact-read commands over an
in-memory native fixture. Its `outline-capture.json`, `outline-before.png` and
`outline-focused.png` remain beside the script. Both 260 by 270 PNGs were visually
inspected: distinct dashed, dotted, double and auto patterns are present; Tab adds
a blue solid outline with a gap around the first item. Before/after PNG sizes are
8,709 and 8,910 bytes. Reference `e7` and geometry `(26,14,184,28)` are unchanged;
the focused style reports width 3px, solid blue and offset 3px. This is fresh native
capture evidence, not real-browser UI, TTY/PTY, socket or live-site validation.

## Open gates

Next: focus-visible matching and keyboard/pointer modality, plus further authored
focus behavior. Remaining outline work includes 3D patterns and richer shapes;
full UA/shadow/platform accessibility and original browser/runtime acceptance
remain open. No live website, socket, real TTY/PTY or SafeJS probe ran; the denied
SafeJS probe remains unrun. Preserve historical evidence and unrelated pending
work, including the known Window-onload assertion disagreement.
