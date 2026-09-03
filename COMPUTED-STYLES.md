# Live computed style declarations

September 2, 2026. Page JavaScript can call both `getComputedStyle(element)`
and `window.getComputedStyle(element)`. They read the independent engine's real
cascade and supported layout, not a guessed style object or remote browser.
No dependency, SafeJS source patch or browser engine was added.

```sh
agent-browser eval 'getComputedStyle(document.querySelector("#content")).width'
```

## Contract

- Every call returns a fresh live declaration capability. Saved declarations
  follow stylesheet, inline-style, DOM and viewport revisions. They become
  empty when their element is detached and repopulate after reattachment.
- The 31 implemented longhands are indexed in sorted order. Camel-case and
  hyphenated getters work; `getPropertyValue()` accepts ASCII-insensitive CSS
  names, not camel-case aliases. `margin` and `padding` shorthand getters
  serialize their four resolved sides without redundant trailing values.
  `BACKGROUNDS.md` adds seven neutral background components and the solid-background
  shorthand getter; non-default image/layer/component behavior is not implemented.
- `length`, numeric indices and `item()` reflect the current declaration list.
  Missing indexed entries are undefined; out-of-range `item()` returns an empty
  string. `item()` uses unsigned-long conversion for supported primitive inputs.
- Computed `cssText` is empty, `parentRule` is null, and priorities are empty
  even when the winning authored declaration was important. Supported property
  setters, `cssText`, `setProperty()` and `removeProperty()` reject writes with
  `NoModificationAllowedError`; they never mutate `element.style`.
- Targets must be real element capabilities from the owning script document.
  Forged, foreign-document and non-element targets cannot acquire style access.
  Closing the owner revokes saved getters, indexed access and methods.

The native `resolvedStyleValue(tree, id, cssName)` reader is also exported for
trusted callers. Its property name is canonical CSS spelling; guest coercion,
aliasing and argument bounds belong to the capability layer.

## Computed versus used values

The existing visibility, box, typography and paint cascades supply values.
Color reads serialize resolved RGBA8 colors, including inherited foreground and
`currentcolor` backgrounds. Unitless line-height resolves against font size;
`normal` stays `normal`. Unsupported properties return an empty string.

Supported normal-flow blocks report actual used width, height, margins and
padding. Width and height follow `box-sizing`, including automatic layout and
min/max constraints. Percentage edges and automatic horizontal margins are not
returned as their authored tokens. Ordinary non-replaced inline width/height
remain computed values because those dimensions do not apply; supported inline
vertical padding resolves against its containing width. Inline vertical margins
remain computed. The later `INLINE-BOXES.md` checkpoint adds actual horizontal
margin/padding resolution, replacing this checkpoint's original zero-edge limit.

Hidden-by-visibility boxes still have used sizes. Display-none subtrees and
display-contents elements return computed dimensions/edges without constructing
layout. Detached elements have no declarations at all.

Client geometry and resolved layout values share one per-revision native layout
snapshot. Extraction retains bounded numeric records, not the full glyph layout.
Color, display, typography and other non-layout queries do not force a layout
build. A layout-dependent query can fail on an unsupported formatting profile;
it does not disguise unsupported flex/grid/replaced content as valid pixel sizes.
The current implementation also goes through layout for ordinary inline box
queries before selecting the applicable resolved values.

Painting's independent rectangle extractor does not request these additional
numeric records. The prior single-vector capture allocation and PNG digest checks
remain unchanged. Geometry metrics now report retained `usedStyles` separately
from rectangles and release both on close.

## Bounds and limitations

- At most 4,096 fresh computed declaration objects per script document; the
  count is cumulative for that owner's lifetime, not reset by garbage collection.
  Native construction can select a smaller positive limit. Readers do not spend
  additional object slots. Argument strings are limited to 1,024 UTF-16 units.
- Existing tree, cascade, layout, rectangle and work bounds remain enforced.
  `capabilities.computedStyles` advertises the partial profile and limits.
- Pseudo-element requests beginning with a colon fail explicitly. They never
  silently read the base element. Null, empty and non-colon arguments select the
  base element. Pseudo generation/parsing and its CSSOM edge cases remain open.
- Custom properties, complete CSSStyleProperties prototypes/constructors,
  cross-document access, arbitrary guest object coercion, other CSS longhands,
  general layout, scrolling and visited-link privacy behavior are not implemented.
- Supported primitive coercion and readonly errors do not imply complete WebIDL
  conversion-order conformance. This API does not establish real-site scripting,
  low-memory Worker, bot-detection or full reference-browser compatibility.

The primary design reference is CSSOM's Window/getComputedStyle, declaration
block and resolved-value sections, inspected September 2, 2026:
`https://drafts.csswg.org/cssom/`. This document describes the implemented subset,
not certification against the entire specification or its web-platform tests.

## Evidence

- `computed-styles-focused-2026-09-02.json`: 2,109 passes across 93 safe files,
  including 18 new
  native/capability cases and a new production binding-registration case.
  Package build, strict changed-test type checks, focused lint/format and diff
  whitespace checks also pass.
- `computed-styles-core-2026-09-02.json` and
  `computed-styles-core-final-2026-09-02.json`: 13 checks each through production
  PageScripts/PageBindings and the explicitly selected existing experimental
  SafeJS core. Indexed access, fresh objects, live sizes, actual interpreted
  writes, readonly exception names, detach/reattach and rejection boundaries pass.
  These are not released-SDK acceptance or website tests.
- `computed-styles-geometry-regression-2026-09-02.json`: the existing 13 actual
  experimental-core rectangle checks, without substituting mock guest execution.
- `computed-styles-capture-allocations-2026-09-02.json`: six existing structural
  allocation/capture checks for the 5,000-row fixture, preserving PNG bytes.
- `computed-styles-resource-{medium,large}-2026-09-02.json`: six checks each on
  native in-memory 1,000/5,000-row pages. Twenty thousand property reads use one
  layout build, and close releases both caches. The larger run retains 10,003
  resolved-style records for 20,007 owned nodes; initial resolution takes about
  269 ms, subsequent reads about 9.6 ms, and peak process RSS about 162.1 MiB.
  These are individual local samples with no forced GC, network, SDK or Worker.
  The earlier layout-memory benchmark uses different content, so its numbers
  must not be presented as a before/after comparison for these measurements.
