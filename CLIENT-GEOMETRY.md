# Native client rectangles for scripts and agents

Later `ELEMENT-SIZES.md` adds readonly client/offset dimensions and a `sizes`
field to `geometry`. Integer size rounding and all-fragment offset unions are
separate from the fractional client-rectangle rules below.

September 2, 2026. The supported normal-flow layout now exposes actual element
rectangles, rather than zero-valued geometry stubs. No dependency, browser engine,
remote rendering service, or default-script-runtime change is involved.

## Interfaces

```sh
agent-browser geometry '#content'
agent-browser eval 'document.querySelector("#content").getBoundingClientRect().width'
```

`geometry` accepts the existing strict target syntax, including stable references.
It returns `reference`, document `revision`, `viewport`, actual zero scroll offset,
`bounds`, and `rects`, together with `partial: true` and the
`normal-flow-client-rects` profile. The command rejects more than 4,096 rectangles
before framing. The maximum accepted fixture fits the existing frame limit.

```ts
const geometry = documentGeometry(tree);
const fragments = geometry.getClientRects(elementId);
const bounds = geometry.getBoundingClientRect(elementId);
```

Native rectangles and arrays are immutable snapshots. Repeated native reads can
reuse their identities. Their eight fields are `x`, `y`, `width`, `height`, `top`,
`right`, `bottom`, and `left` in CSS pixels. No scrolling is implemented, so the
current viewport-coordinate origin is also the document-coordinate origin.

Page elements expose `getClientRects()` and `getBoundingClientRect()` through live
SafeJS host capabilities. Every invocation creates fresh guest snapshots:

- Lists have readonly `length`, indexed entries, and `item(index)`. An in-range
  indexed read and `item` return the same rectangle; missing indices yield
  `undefined`, while `item` yields `null`. Required-argument and unsigned-long
  index conversion are tested.
- Rectangle `x`, `y`, `width`, and `height` are independently writable numbers.
  Readonly edges track those values, including negative sizes and unrestricted
  numeric values. Mutating a returned rectangle does not mutate layout.
- `toJSON()` returns an independent eight-field record. Saved lists and
  rectangles do not change when the page reflows.
- Closing the script document revokes its capabilities. Closing the native tree
  also releases the geometry cache; previously returned native values remain
  independent snapshots.

These are partial DOMRect-like capabilities, not complete DOMRect/DOMRectList
constructors, prototypes, or `instanceof` support.

## Layout and bounds

Block rectangles use resolved border-box positions/sizes, excluding margins.
Inline rectangles use each inline's own em-height box at the shared line baseline,
including supported padding. `INLINE-BOXES.md` adds horizontal first/last edges
and signed margin advances while excluding own margins from rectangles. Wrapping yields separate fragments in line
order. Nested typography, alignment, BRs, preserved newlines, visibility-hidden
elements, and empty zero-width inlines retain geometry. An otherwise empty inline
with zero edges has a geometry anchor without adding a phantom line to normal flow.
An empty inline with nonzero margins/padding participates in line layout.

Detached elements, `display:none`, and `display:contents` have no own rectangles.
Empty lists produce zero bounds; all-degenerate lists preserve the first rectangle.
Other unions follow the CSSOM View bounding-box algorithm, including non-point
degenerate rectangles when the list also has nondegenerate content.

The primary contract reference is the CSSOM View Element extensions:
`https://drafts.csswg.org/cssom-view/#extensions-to-the-element-interface`.
The tests exercise this engine's supported profile; they are not a claim of full
web-platform conformance or cross-browser pixel equivalence.

Text layout now retains bounded, source-referenced inline fragments in addition
to glyphs/lines. Document layout positions those fragments in document coordinates.
The geometry cache retains only rectangles and unions, not an additional full
formatting/layout tree. DOM, style, stylesheet, and viewport changes invalidate
the cache through the document revision. Bounding unions are computed once per
revision, not rescanned on every guest read.

## Bounds and limitations

- Text layout allows at most 250,000 fragments, with a lowerable test limit and
  the existing two-million-work limit. Ancestor traversal is charged.
- Native geometry allows at most 250,000 retained rectangles and two million
  extraction/union work units, in addition to the existing layout-stage limits.
- Guest lists allow at most 4,096 rectangles. A script document may create at most
  16,384 geometry objects cumulatively, including lists, their members, bounding
  rectangles, and `toJSON` records. Exhaustion throws instead of silently dropping
  fragments or relying on garbage collection.
- Unsupported CSS remains fail-closed. Client geometry for block-in-inline splits
  explicitly throws until anonymous-fragment ownership is modeled. Layout/paint
  support for those splits does not imply client-rectangle completeness.
- No transforms, tables, flex/grid, replaced elements, web fonts, Range rectangles,
  scrolling, hit testing, coordinate input, dynamic Window viewport globals, or
  complete DOMRect intrinsic graph is added here. `INLINE-CAPTURES.md` subsequently
  connects supported inline bounds to screenshots. No anti-bot or real-framework compatibility claim
  follows from these APIs.

## Evidence

`client-geometry-focused-2026-09-02.json` records 2,058 passing tests across 90
explicitly selected safe files. There are 48 new native/guest/command cases.
The guest unit factory was corrected after the actual SDK rejected a duplicate
`length` property on an indexed capability; the implementation now uses the SDK's
indexed length mechanism, not a workaround.

`client-geometry-safejs-2026-09-02.json` records 13 passing checks with the existing
explicit experimental SafeJS core: actual indexed reads, mutable derived edges,
JSON records, DOM/style/viewport invalidation, empty/detached nodes, and repeated
cache reads. It does not accept a newly released SDK or run external websites.

Three fresh-process native resource fixtures each pass six checks:

| Wrapped inline fragments | Initial build | 10,000 cached bounds reads | Peak RSS |
| ---: | ---: | ---: | ---: |
| 200 | 6.15 ms | 3.53 ms | 56.5 MiB |
| 2,000 | 17.36 ms | 3.64 ms | 62.7 MiB |
| 10,000 | 48.11 ms | 4.27 ms | 78.4 MiB |

Reports are `client-geometry-native-{small,medium,large}-2026-09-02.json`.
These are single local Node samples, not statistical comparisons or Worker
acceptance. The fixture retains its old snapshots through mutation/close and
does not force garbage collection. No network or guest SDK is involved in these
resource measurements.

The capture-export regression passes nine actual experimental-core checks; its
PNG remains byte-identical to the prior compressed fixture, SHA-256
`64de16beea7e2ef16ddea64a010cf42ddd361892a889526bf69b87533032b88e`.
The 5,000-paragraph paint-resource regression passes all eight checks with the
new fragment extraction enabled. Build, strict changed-test typechecking, focused
lint/formatting, and diff checks pass. These are fixture regressions, not new
website or live-server tests.

Reproduce after the package build:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/absolute/compiled/safe-js \
  node packages/browser-agent/dist/scripts/check-client-geometry.js
node packages/browser-agent/dist/scripts/check-geometry-resources.js large
```

The full browser goal remains active. Real-site scripts, released-SDK integration,
general layout/rendering, the complete reference feature sets, and live terminal/
playground acceptance remain separate gates.
