# Author-cascade box values

Later checkpoint: `BLOCK-WIDTH.md` adds a pure horizontal normal-flow solver
using these computed values and an explicitly supplied definite containing
width. It does not add a formatting tree, change this style API to used values,
or supply general client geometry.

`FORMATTING-TREE.md` subsequently connects this sizing layer to conservative
display decomposition and document-derived horizontal widths. The style API
still returns computed-subset inputs rather than resolved client rectangles.

September 2, 2026. This adds the sizing inputs needed for a native layout engine
to the existing stylesheet cascade. It does **not** implement layout, used box
sizes, client rectangles, scrolling, hit testing, painting or screenshots.
No geometry APIs or synthetic `getComputedStyle` results are installed in pages.

## API

```sh
agent-browser styles '#panel' --json
agent-browser resize 320 600
agent-browser styles '#panel' --json
```

Element style results retain the existing visibility fields and add `box`, a
frozen record of fifteen CSS longhand values. `layout: false` and `partial: true`
remain explicit. Programmatic callers use `page.styles.box(id)` or
`documentStyles(tree).box(id)`. `BoxStyle`, `CssBoxProperty` and
`cssBoxProperties` are exported from the package.

`styles` without a target keeps its visibility `properties` list and adds
`boxProperties` and `boxValues: "computed-subset-not-used-geometry"`.
Capabilities add `cssBox`; existing visibility capabilities do not pretend to
cover layout. The playground command box can use the same backend, but no
new layout panel or visual acceptance is claimed.

## Implemented values

| Properties | Supported values |
| --- | --- |
| width, height, min-width, min-height | Nonnegative supported lengths/percentages, auto |
| max-width, max-height | Nonnegative supported lengths/percentages, none |
| margin-top/right/bottom/left | Supported signed lengths/percentages, auto |
| padding-top/right/bottom/left | Nonnegative supported lengths/percentages |
| box-sizing | content-box, border-box |
| margin, padding | One-to-four-component physical-side shorthands |

Supported length units are px, cm, mm, q, in, pt, pc, vw, vh, vmin and vmax.
Absolute and viewport lengths compute to CSS-pixel strings. Viewport changes
invalidate values and re-evaluate existing supported media queries. Decimal and
finite exponent number syntax are accepted by the stylesheet parser; unitless
nonzero lengths are rejected. Nonfinite values and computed numeric overflow
do not produce infinite geometry inputs.

Percentages remain percentages, and `auto`/`none` remain keywords. For example,
`width:50%` is returned as `"50%"`, not an invented pixel width. Resolving these
depends on containing blocks, formatting contexts, intrinsic sizes and layout.
`box-sizing:border-box` is retained as an input, not applied to nonexistent boxes.

All fifteen longhands participate in embedded, linked and inline author styles
through the existing specificity/importance/source-order cascade. Margin/padding
expand atomically: invalid components reject the whole shorthand. Later
longhands and important priorities still determine individual side winners.
CSS-wide initial/inherit/unset/revert and `all` expand over the supported profile.
Only explicit inheritance copies parent computed box values; these properties
are not inherited by default.

## Explicit limitations

Initial defaults are auto dimensions/minimums, none maximums, zero margins and
padding, and content-box sizing. **There is no user-agent box stylesheet yet**:
the existing HTML tag defaults affect display, not body/heading margins or
control sizing. In this author-only box layer, revert returns property-initial
values. Do not compare these results to a complete browser's resolved style API.

Font-relative units, intrinsic sizing keywords, calc()/var(), logical dimensions,
borders, font measurement and the rest of CSS remain unsupported here. Unsupported
declarations produce the existing diagnostics and are ignored; this is not full
CSS computed-value-time invalidation or conformance. The inline declaration
store has its own previously documented accepted syntax: it can retain some
font-relative values the cascade cannot compute, and does not yet accept all
of the new stylesheet exponent forms.

No margin collapse, auto-margin distribution, percentage resolution, replaced
content sizing, min/max clamping, flex/grid/table layout or fragmentation occurs.
The terminal and semantic snapshots continue using the visibility projection.
They do not silently become a pixel/layout renderer because sizes are available.

## Ownership and budgets

Only nodes with winning box declarations retain specified records. Computed box
records are created lazily on explicit reads, following inheritance iteratively;
nodes with no box declarations share one frozen initial record. Existing
visibility/snapshot reads do not eagerly create fifteen-field box records per
node. Saved results are immutable point-in-time values.

Style/attribute/move/viewport changes clear the caches. Existing safe text-control
value-only invalidation preserves them. Detached reads fail, and owner close
clears specified/computed caches and rejects later access.

CSS source, statement, rule, node and cascade-work bounds continue to apply.
Expanded shorthand and `all` matches contribute to cascade work; statement
counts retain their existing meaning. A statement can now expand into seventeen
supported longhands, including visibility. This feature does not establish a
new full-browser memory budget or detached-node garbage collector.

## Evidence

The selected safe suite passes 1,507 tests across 68 files, including 32 box
cases. Package build, strict changed-test checking, focused formatting and diff
checks pass. Final actual experimental-core runs pass 70 checks: thirteen new
box cases and 57 locator, mutation, insertion and streaming-search regressions.

`css-box.test.ts` covers parsing, priorities, shorthand expansion, CSS-wide
keywords, units, unresolved percentages, viewport changes, linked-sheet
registration, mutation/inheritance, lazy caches, cleanup and limit failures.

`check-css-box.ts` passes thirteen actual experimental-SafeJS checks using the
native loader and an in-memory document/stylesheet transport. Interpreted style
writes and native click handlers affect the same cascade; resize changes
viewport units and media matches. The fixture also checks importance,
inheritance invalidation, unchanged visibility semantics, snapshot-diff state,
absence of fabricated geometry APIs, and document/runtime closure.

Build then run `check:css-box`, or:

```sh
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/approved/experimental/safe-js \
  node packages/browser-agent/dist/scripts/check-css-box.js --trace
```

This is existing experimental-core evidence, not a released SDK, live network,
reference-browser comparison, real website or screenshot acceptance result.

Three fresh-process native session regression profiles also pass 141 assertions
and close all 22 documents. Single observations on the existing Node v22.22.0 /
Linux x64 / AMD EPYC 9R45 environment are small: 54.4 ms, 62.0 MiB peak RSS;
large: 463.3 ms, 167.5 MiB; churn: 226.4 ms, 103.8 MiB. These are unchanged
synthetic session workloads from `SESSION-RESOURCES.md`, not a box-heavy stress
test, full-browser result or statistically controlled performance comparison.
Raw reports are `reports/css-box-native-*-2026-09-02.json`.

## Next layout work

1. Add explicit user-agent box/font defaults and a bounded formatting tree.
2. Resolve containing blocks, intrinsic text/control sizes and block/inline flow;
   retain fragmentation and unsupported-mode diagnostics rather than fake boxes.
3. Derive client rectangles, coordinate actions and scrolling from that geometry.
4. Paint the same geometry into terminal/playground views and valid exports.
5. Verify layout/captures on conformance fixtures and approved real websites.

These are pending milestones, not features delivered by this change.

## Primary references

Reviewed September 2, 2026; not claims of full spec implementation:

- https://www.w3.org/TR/css-box-3/
- https://www.w3.org/TR/css-sizing-3/
- https://www.w3.org/TR/css-values-4/#absolute-lengths
