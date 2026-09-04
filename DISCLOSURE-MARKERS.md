# Native disclosure markers

September 4, 2026 continuation of `DETAILS-CORE.md`, `DETAILS-GROUPS.md` and
`SEVEN-DAY-PLAN.md`.

## Rendering and ownership

The primary authored summary now receives native list-item display and an inside
disclosure marker. Opening details changes the right-pointing marker to a
down-pointing marker without changing the label advance. Generated formatting
boxes use the summary's existing reference for hit testing and activation, but
do not create DOM nodes, text, child entries, semantic-name characters or extra
DOM client rectangles. Reordering summaries updates marker ownership.

`list-style-type` and `list-style-position` participate in declaration parsing,
inline CSSOM, computed values, inheritance, custom-property substitution,
important cascade and CSS-wide resets. Supported types are `none`, `disc`,
`circle`, `square`, `disclosure-open` and `disclosure-closed`. Author display
overrides can suppress marker generation. These longhands do not establish
general list-item/counter rendering.

Inside markers support the existing inline and rich block content paths.
Outside markers with inline content use zero label advance and do not expand
the summary's DOM geometry. Outside markers with block content explicitly raise
an unsupported error rather than silently claiming correct placement.

The marker raster follows native current color and font size, with transparent
surroundings. Its intrinsic height uses the existing bitmap font ascent to
avoid raising the normal line box. Visibility, clipping and document invalidation
use existing rendering paths. Formatting boxes, style work and raster work use
existing budgets; marker raster axes are limited to 512 pixels. Raster metrics
distinguish painted/clipped markers from controls and decoded images. No runtime
dependency, remote browser, or generated bitmap asset dependency is added.

## Native evidence

The 28-case new file produces 27 failures and one pass on isolated prior HEAD.
An initial font-scale fixture wrapped naturally at its narrow viewport; its
single-line positioning assertion now explicitly requests nowrap. Adding two
computed longhands also required updating two enumeration-count assertions from
66 to 68. Neither correction changes unrelated pending test extensions.

Matching focused runs pass 258 tests / eight working files and 257 / eight
isolated files. Both trees pass types, builds, strict checking of the new test
file and eleven-file Biome checking. `native-tests.json` explicitly includes the
new file. Authorized full native runs pass 10,286 tests / 282 working files and
9,140 / 260 isolated files. The isolated snapshot contains only this checkpoint
on prior HEAD, excluding unrelated pending work.

A native 360-by-320 PNG contact sheet was generated and visually inspected at
`node_modules/.cache/native-validation/disclosure-markers-contact.png`. It shows
closed/open, circle/square, suppressed and outside markers beside labels. The
raster reports five painted markers and no clipped markers. This ignored local
artifact is native rendering evidence, not a reference-browser screenshot or
a live-site validation run.

Read-only primary research on September 4 used:

- `https://html.spec.whatwg.org/multipage/rendering.html#the-details-and-summary-elements`
- `https://drafts.csswg.org/css-lists-3/`
- `https://drafts.csswg.org/css-counter-styles-3/`

## Remaining acceptance gates

Missing-summary fallback controls, general lists/counters, outside markers with
block content, `::marker` styling/content, list-style shorthand/images/custom
counter styles, RTL/vertical rendering and complete UA/shadow/accessibility
behavior remain open. Remaining event interfaces, task-source/trusted-event
semantics and released-runtime/browser parity are not established by these
native tests. No live-site, socket, real TTY/PTY or SafeJS probe ran; the denied
SafeJS probe remains unrun. Historical evidence and unrelated pending work stay
separate. The complete seven-day browser objective remains active.
