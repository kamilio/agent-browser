# Native inline SVG scene construction

`documentSvgScene(tree, id, charge)` constructs detached, deeply frozen scene
data for an SVG-namespace `svg` whose immediate parent is an HTML element.
It does not perform browser layout, viewport mapping, rasterization, hit testing,
anchor activation, resource loading or page-script execution. A scene test pass
is not evidence for those integration or live-browser acceptance gates.

## Supported scene data

- `viewBox` accepts four finite numeric coordinates, nonnegative dimensions and
  comma/whitespace separators. A zero dimension sets `disabled`; validation is
  not bypassed. An absent viewBox is `null`.
- `preserveAspectRatio` defaults to `xMidYMid meet`; all nine alignments support
  `meet` and `slice`. `none` disables aspect preservation; an optional meet/slice
  token after `none` has no effect. Unsupported `defer` and malformed values fail.
- Containers are `g`; shapes are `path`, `rect`, `circle`, `ellipse`, `polygon`,
  `polyline` and `line`. Geometry uses the existing immutable SVG path segments;
  circles, ellipses and rounded rectangles contain arcs, not polygonal substitutes.
  Zero/missing dimensions retain shape identity with empty paths.
- Native affine helpers compose group and shape transforms in document order.
  Paths remain in local coordinates. A nonempty root transform is unsupported.
- Shape numeric IDs, native refs and outer-to-inner group ancestor refs survive
  construction. The root is not included in group ancestors.
- Native document styles supply display, inherited visibility, pointer events,
  current color and computed rectangle width/height. Display-none subtrees are
  skipped; hidden geometry remains, and a visible child can override hidden
  inheritance. This layer preserves pointer-event state but performs no hits.

## Presentation and boundaries

Presentation attributes support inherited fill (black by default), `none`, native
CSS color syntax, `currentColor`, `fill-rule` and `fill-opacity`. Current color is
resolved independently at each shape, even when inherited from a group. Shape
opacity multiplies that shape's fill alpha; nonunit root/group opacity fails
because group compositing cannot be represented by multiplying child alphas.
Alpha is rounded to the native 8-bit RGBA representation. Stroke must be `none`
or inherit the supported none state. Active stroke paint, filters, masks,
clip paths and vector effects fail closed.

Marker-start/mid/end presentation attributes are limited to absent/none and
inherit/unset/initial of the supported none state, including on root/group
containers; active marker references fail even without stroke or fill. With a
nonempty local transform, an explicit transform-origin is limited to two zero
coordinates (unitless, px or percent, with left/top equivalents). Other forms,
including CSS-wide keywords, fail conservatively rather than guessing an origin.
An origin without a local transform is inactive and is not implicitly inherited;
explicit inheritance into a transformed child remains unsupported. Metadata and
display-none subtrees remain inactive; visibility:hidden is not an admission
bypass. These admission corrections do not implement markers or origin-aware
transforms, and the historical validation results below do not validate them.

Zero-alpha fill remains a non-null painted fill; only `fill:none` becomes null.
Pointer-event eligibility is retained independently for the parent's filled-contour
hit integration. A visibility-hidden root does not suppress descendant scene
construction, so explicit child visibility overrides remain available.

Author CSS fill/stroke and other unsupported properties retain the existing
native parser diagnostics. This module does not reparse author CSS or implement
their cascade. Attribute paint is not evidence of CSS SVG paint support. Native
styles own their existing document-wide budgets and cache lifecycle; this module
adds no document-retaining cross-call cache.

Rectangle width/height come from computed box styles, not a second attribute
cascade. Parent integration supplies low-priority dimension presentation hints.
The isolated baseline tests set equivalent CSS width/height explicitly; they do
not overlay concurrent styles changes. Missing/auto dimensions are zero. Geometry
attributes use finite unitless/px/scientific scalars with magnitude at most 1e9;
negative dimensions, percentages and unsupported units fail rather than guessing
a viewport. Path and point-list grammars remain unitless. Unresolved computed
percentage rectangle dimensions also fail.

`title`, `desc`, `defs` and `style` are nonrendering metadata. Visible unsupported
elements, including text, use, image, foreignObject, nested SVG and SVG anchors,
fail; unsupported graphics are not silently replaced or omitted. Non-whitespace
text outside metadata and graphics nested inside shapes fail too. An unsupported
element within a display-none subtree is inactive and is not interpreted.

## Resource and ownership contract

Every call preflights the entire root subtree before invoking native styles.
The conservative preflight includes ignored metadata and display-none descendants:

| Ceiling | Maximum |
| --- | ---: |
| Visited subtree nodes, including root | 4096 |
| Shapes, including empty paths | 512 |
| Aggregate parsed/generated path segments | 16384 |
| Aggregate source code units | 262144 |
| Descendant depth, root at zero | 64 |
| Individually interpreted scalar/style/transform fields | 4096 |

`sourceCodeUnits` counts each preflight node's tag name, character data, attribute
names and attribute values once, including whitespace and ignored metadata. It is
not a byte count or serialization length. Path and points fields may use the full
remaining aggregate source budget. Computed style fields are separately bounded
and charged, not misreported as original document source. No generated path text
is used for primitive shapes.

Traversal, text scans, parsing and scene allocations charge the supplied owner
callback before the associated work. Existing native document views/styles keep
their own allocation limits. Parsed paths receive the remaining scene segment
allowance, so per-path limits cannot reset the aggregate ceiling. Parser syntax
failures become `unsupported`; parser range failures become `resource-limit`.
Owner exceptions, including owner-thrown SyntaxError/RangeError, propagate unchanged.
No partial scene is returned on failure. Returned scenes contain only immutable
values and remain unchanged after DOM mutation or document closure.

## Isolated validation

The private lane is
`node_modules/.cache/native-validation/svg-scene-worker-september11/`.
Its snapshot starts at `17c0e99a5d324c49185663167012a64f4001a2e9` and overlays only
the new scene module/tests and parent scene-types/affine helpers. Only the new
scene test is added to that snapshot's explicit native manifest. The shared
manifest and all concurrent parent files remain untouched.

The lane runs targeted strict TypeScript checking, existing Biome formatting and
six explicitly selected native suites: scene, path, flatten, fill raster, styles
and document. Runs use a scrubbed environment, seccomp socket denial, a native
network guard and a resolver guard against browser/page-runtime dependencies.
Per-round JSON summaries, test reports and before/after SHA-256 inventories record
the exact inputs and results. No network, socket, SafeJS or real TTY/PTY probe is
authorized or performed by this validation.

Final September 11, 2026 evidence is pinned in `round04/SUMMARY.json`,
`round04/native.stdout` and `FINAL-RECEIPT.json` beneath that lane: strict checking,
format checking and native tests each exit 0; all 336 tests in six suites pass,
including 105 scene tests. Snapshot SHA-256 inventories are unchanged across the
run. The final audit verifies every baseline file against its Git blob, with only
the four declared source additions and the one snapshot-manifest addition.
