# Native positioned paint acceptance checks

September 4, 2026. This is a tests-only continuation of the mixed-selection
capture review. It adds independent paint, geometry and hit-target checks rather
than changing an already-correct renderer to match a mistaken visual impression.
No production stacking, parser, layout, raster or hit-testing code changes.

## Resolved observation

At 80px root scroll, flow text appeared to cross the fixed editor's lower edge
in both original mixed-selection host images. Independent inspection found that
all 278 opaque bottom-border pixels at y=187 and all 572 opaque outline pixels
at y=190–191 retain the exact expected colors. Visible flow ink is in the unfilled
outline-offset gap at y=188–189 and below the outline, not through opaque paint.
The parent independently checked all 850 opaque pixels in each original PNG.

Bare fixture markup and explicit html/head/body markup both parse to one html
element and one referenced html formatting-root child. Shared content order paints
the flow box/glyphs before the fixed editor. Hit testing agrees with that order;
the outline gap does not enlarge the editor's border-box hit region. No artificial
z-index, filled outline gap, fixture rewrite or parser workaround is introduced.

## Added regression coverage

Nineteen new tests cover canonical document structure, identical bare/explicit
pixels, opaque fixed borders and focus outlines, visible gap pixels, shared
paint order and hit targets, fixed-versus-later-flow painting before/after root
scroll, positive/negative sibling levels and nested-context containment.
The preexisting uncommitted stacking-order.test.ts is untouched and is not copied
into this commit. These checks protect the supported cases, not all CSS stacking
contexts, synthetic formatting forests, unsupported layout or browser conformance.

Both current-tree and isolated focused runs pass 182 tests / five files, including
all nineteen new cases. The strict new-test check and scoped Biome pass. This
tests-only checkpoint does not repeat or relabel a full native run: the preceding
mixed-selection source checkpoint remains 11,056 passes / 328 isolated files,
with 12,187 passes and fifteen pending failures / 350 working files. The new test
entry will participate in subsequent combined full validation. No production build
change is claimed because production source is unchanged.

## Evidence boundaries

Parent evidence uses positioned-paint-acceptance prefixes under
node_modules/.cache/native-validation; its archive is positioned-paint-integrated.orqCya.
The original worker's new/focused test results, initial fixture errors, unchanged
host replay, coordinate audit and source-hash comparisons remain at the paths in
/tmp/positioned-root-stacking-delivery-2026-09-04.json. Parent pixel checks use
mixed-selection-integration-opaque-pixel-audit.log. Original PNG paths, bytes and
historical measurements remain unchanged.

No browser engine substitution, dependency, budget increase, SafeJS execution,
live-site, socket, real TTY/PTY or service-process probe is involved. The full
browser/playground outcome and outstanding gates remain in TASKS.md.
