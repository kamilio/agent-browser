# Generated disclosure inspection, crops and focus feedback

September 4, 2026. This native checkpoint extends `GENERATED-AGENT.md` without
changing the DOM identity boundary or the original browser acceptance scope.

## Contract

`DocumentGeometry.getGeneratedDocumentRects()` and
`getGeneratedBoundingClientRect()` expose header-only document rectangles and
viewport-relative bounds. They use the existing revision cache, immutable
rectangles, geometry budgets and canonical generated registry. Scroll translation
does not change document coordinates. Available but boxless targets return an
empty list and zero bounds; unavailable, foreign and closed-owner refs reject.

The `geometry` command accepts generated references and unique role locators.
Its generated response uses `generated-control-client-rects`, includes the real
host reference as ownership metadata, and reports `sizes: null`: a generated
header has no DOM `clientWidth`, `offsetHeight` or other element-size object.
Ordinary element inspection keeps its existing profile and size semantics.

Native `rasterizeDocument`, prepared raster captures and command `screenshot`
accept a generated target. Crops use the same layout's header bounds, rounded
outward in document coordinates; they never expand to the details body. Registry
availability, prepared-layout revisions, visibility, positive painted area,
option exclusivity, pixel/work budgets and artifact ownership remain enforced.
Full-page screenshots retain the same shared rendering path.

A focused generated header paints an inset black/white focus indicator with its
box, before its glyphs. It changes neither DOM state nor layout geometry, stays
within the header/crop, follows existing stacking order, and charges the shared
raster work budget. Later covering content can obscure it. Blur, ordinary host
focus and unavailable generated focus remove it. Native Tab, pointer and direct
activation all show feedback; there is deliberately no modality heuristic yet.
This is not CSS `outline`, `:focus-visible` support, platform theming or a general
focus-ring implementation for authored elements.

## Native evidence

The 37 new cases produce 30 failures and seven passes on isolated prior HEAD.
Matching focused runs pass 144 tests / eight files in both trees; the working
tree additionally passes its 63 pre-existing stacking cases. Both trees pass
types/builds, strict checking of both new test files and five-file Biome checks.
Both tests are explicitly registered in `native-tests.json`. Authorized full
native runs pass 9,407 tests / 270 isolated files. The working run reports
10,552 passes and the one unchanged pending Window-onload assertion failure /
292 files; no additional failures remain. The isolated snapshot contains only
this checkpoint on prior HEAD. The pending onload assertion and unrelated
command-host changes remain separate.

An in-memory native command sequence performed Tab focus, targeted Enter,
generated `geometry`, and full/cropped `screenshot` artifact reads. Inspected
280-by-160 full images show the focus border appearing before activation and
remaining around the header after the green body opens. The 240-by-20 crop stays
header-only in all three states; geometry remains `(8, 36, 240, 20)` with null
DOM sizes. Before/focused/open crop files are 934 / 992 / 1,023 bytes; full files
are 3,416 / 3,622 / 5,079 bytes. These are native observations, not a live run.

Artifacts use the prefix
`node_modules/.cache/native-validation/generated-inspection-capture`:
`-before-full.png`, `-before-crop.png`, `-focused-full.png`,
`-focused-crop.png`, `-open-full.png`, `-open-crop.png`, `.json` and `.mjs`.
Logs use that directory's `generated-inspection-` prefix. Historical artifacts
and their measurements are unchanged.

## Research and open gates

Reviewed the current HTML focus guidance and CSSOM View geometry model on
September 4, 2026:

- `https://html.spec.whatwg.org/multipage/interaction.html#focus-management-apis`
- `https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect`

Generated geometry is a native inspection API, not a new page DOM element.
Generated style inspection, full outline/focus-visible behavior, localization,
UA shadow/accessibility and scoped tab ordering remain open. Terminal/playground
integration needs its own generated-target coverage; real TTY/PTY, socket,
website, SafeJS and complete browser/runtime gates remain unproven. No such probe
ran, and the denied SafeJS probe remains unrun. Keep the original scope and the
active seven-day continuation in `TASKS.md`.
