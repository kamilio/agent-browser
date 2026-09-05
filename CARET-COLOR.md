# Native CSS caret color

Continuation after `d14819b`. The bounded native paint/CSSOM pipeline now accepts
`caret-color` for existing native control and contenteditable insertion carets.
This does not add caret geometry, blinking, shape, IME, selection styling or a
different browser engine.

## Primary references and profile

The implementation follows the inherited `auto | <color>` property and used-color
CSSOM behavior described by these primary sources:

```text
https://www.w3.org/TR/2026/WD-css-ui-4-20260120/#caret-color
https://www.w3.org/TR/css3-ui/#caret-color
https://drafts.csswg.org/cssom/#resolved-values
```

The first reference is a dated Working Draft, not a claim of complete CSS UI 4
conformance. `auto` uses the element's text color in this native profile, without
optional contrast heuristics. Inherited `currentcolor` remains a keyword until
use, so a child with different text color uses its own color. An inherited
explicit color retains that color instead. Computed CSSOM returns the used color
through the existing native `rgb`/`rgba` serializer rather than exposing `auto`
or `currentcolor` there.

Only the existing bounded named/hex/rgb/hsl/currentcolor/transparent color grammar
and its 8-bit sRGB/alpha representation are used. CSS-wide keywords, variables,
cascade/importance and `all` follow the existing supported declaration paths.
`caret`, `caret-shape` and `caret-animation` remain unsupported; other color spaces,
forced colors, animations and platform contrast policy are not introduced.

## Shared CSS state

`cssPaintProperties` and inline declarations include one `caret-color` longhand.
Existing native inline style accessors supply both `caretColor` and the literal
property name, along with methods, priorities, removal and serialization.
Computed styles expose one additional supported property (73 to 74), with live
used-color resolution and the same read-only/lifetime behavior.

Native `PaintStyle` stores an optional caret color. Absence represents initial
`auto`, preserving the old default paint-object shape. Explicit colors and the
`currentcolor` keyword are retained for inheritance; `initial`/`auto` return to
the implicit default. `paintCaret` performs final resolution using that style's
foreground. The parent-map sharing check includes this optional field, preventing
an explicit caret override from being lost through paint-object reuse.

## Native rendering

The control raster uses the resolved color only for an existing collapsed caret.
Text, placeholder/disabled foreground, selection background, focus border, values,
numeric selection, password masking, geometry and scrolling remain unchanged.
An alpha or transparent caret uses the existing raster blending path.

The editable caret uses the same helper for its three existing anchor paths:
ordinary source glyph edges, terminal preserved breaks and empty host/direct
paragraph struts. The same source formatting paint that previously provided text
color now supplies caret color. Transparent carets use the existing transparent
status without removing the selection or changing geometry. Qualified capability
metadata enables CSS caret color but leaves general geometry/selection/animation
limitations intact.

## Validation evidence

Initial source typechecking passes. The first working-tree run passes 93 existing
cases across CSS paint, computed styles, controls and editable carets; the only
old assertions changed are the two computed-property counts. Source formatting
and scoped control/editable checks pass. Three existing import-order diagnostics
in CSS paint/declarations/computed styles are reproduced on exact preceding
sources, not silently mixed into this feature.

Final twenty-nine-file integration runs pass **999 isolated and 1,000 working
tests**, including all 116 new cases. The extra working case is pre-existing and
is not imported into the focused commit. Both roots pass source typechecks and
builds to `dist`; strict checks for the two new tests, scoped Biome checks and
formatting of all five changed production files pass. Manifests match at 392
unique entries, with 22 existing pending-only files absent from the isolated
archive. Populated summaries/check logs use `caret-color-integration-final-*` in
the native-validation cache; baseline import diagnostics remain separately saved.

All **116 new cases** pass against supplied production: 49 CSS/CSSOM cases and
67 rendering cases. The CSS lane's identical final baseline records four new
passes and 45 assertion failures, with 120 existing cases passing; actual replay
passes all 169. Its sole fixture correction preserves the native setter's existing
indexed declaration slot instead of expecting replacement to append a new slot.

The identical final rendering baseline records nine default-lineage passes and
58 unsupported-CSS formatting failures. Actual replay passes all 67. These are
not 58 independently established old rendering defects. Initial fixtures needed
explicit block-level controls to locate their real content boxes; selection
assertions also needed the distinct existing control/editable highlight palettes.
All intermediate failures remain recorded; no production fix or weakened pixel
oracle follows from those fixture corrections.

The new cases cover supported grammar, inheritance, computed used colors, inline
and computed capabilities, variables/all/importance, removal, atomic invalid
setters and lifecycle. Rendering cases cover five native control kinds and four
existing editable anchors, exact alpha blending, transparent/absent-caret
equivalence, unchanged selection highlights, live updates/removal, root/control
scrolling, prepared-raster invalidation and surrogate password metadata.

Worker evidence remains in the native-validation HOME cache:

- `parallel-css-caret-color-d14819b/delivery/README.md`: matched baseline/replay,
  exact source/test hashes, checks and one-file CSS/CSSOM delivery.
- `parallel-caret-color-rendering-d14819b/report.md`: final 67-case summaries,
  retained baseline/fixture failures, full-image pixel oracle and checks.

## Native capture evidence

The final set contains **54 actual native captures**, eighteen per build. All
eighteen isolated/working PNG pairs are byte-identical. Seven baseline/new frames
remain identical; eleven explicit-color/transparent frames each change exactly
sixteen pixels, **176 total**, with zero changes outside actual collapsed-caret
rectangles. Text, values, source glyph mappings, geometry, focus borders and
selection endpoints remain unchanged. Dynamic removal restores the original PNG.

The exact `d14819b` baseline omits unsupported caret-color CSS; new fixtures
contain the real requested declarations. Original fixture/source strings are
retained and are not claimed identical. For otherwise-equal CSS comparison only,
the comparator removes the exact requested caret declaration and separately
checks its presence/absence. New isolated/working source compares byte-for-byte
without that removal. No baseline implementation or acceptance shim is added.

Computed paint permits only the named optional caret-color difference. Prepared
editable anchors retain geometry while their intended color changes. Transparent
editable output also changes the named existing caret work/count/status fields;
those differences are recorded explicitly, with unrelated metrics still checked.
No broad metric stripping, image tolerance or enlarged mask is used.

Every fixture's actual caret is one by sixteen pixels. Half-alpha green uses the
native alpha byte 128 and yields `[127,191,127,255]` over the fixture's white
background, not over the old opaque caret. Transparent reveals that background.
The parent inspected the red-input and transparent-password captures. All
artifacts are released and injected hosts/transports close.

Capture lineage, exact commands, per-frame data and hashes are retained in
`parallel-caret-color-capture-d14819b/FINAL.md` and `comparison.json`. Its first
fingerprint audit incorrectly demanded identical whole sources across the
intentionally different working and isolated trees. That failure is preserved;
the corrected audit verifies each capture against its own current source/build
and records pre-existing declaration/computed/command-host differences rather
than overwriting them. Parent verification also checks those per-root hashes.

## Acceptance boundary

No full-manifest execution, actual SafeJS/runtime, live website, socket, TTY/PTY
or GUI probe is implied by native results. Full CSS/UI, shaping, platform and
original browser acceptance gates remain open. New source/evidence archives use
HOME cache; pre-existing pending work and historical measurements are preserved.
