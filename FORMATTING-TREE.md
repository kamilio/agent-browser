# Display decomposition and document-derived widths

Later checkpoint: `TEXT-LAYOUT.md` consumes this structure and its derived widths
to build source-mapped, block-relative text lines. Formatting nodes now carry
shared computed typography; inline fragments also retain box inputs so unresolved
horizontal edges cannot silently disappear from line measurement. The decomposition
and width functions themselves still do not perform line/vertical layout or paint.

`DOCUMENT-LAYOUT.md` subsequently consumes the text stage to add restricted
normal-flow vertical geometry and native text captures. Those are separate APIs;
the decomposition and width snapshots retain their original stage semantics.

September 2, 2026. The native engine can now build a bounded intermediate
formatting tree and derive normal-flow horizontal widths from that tree, rather
than requiring a caller to supply every containing width manually. This is
still **not vertical layout, line layout, client rectangles or painting**.

## API and stages

```ts
const structure = buildFormattingTree(page.document);
const horizontal = resolveDocumentBlockWidths(page.document);
```

Both functions and their result/limit types are exported from the package.
They read the current native document and shared CSS cascade. They do not run
page code, create a browser service or add a dependency. No new CLI geometry
command, coordinate action or page `getBoundingClientRect` API is enabled yet.

`buildFormattingTree` returns `stage: "display-decomposition"`, `partial: true`,
document revision, viewport, immutable node records, diagnostics and work counts.
Each formatting ID is local to that result. A node's optional `ref` is the real
native document reference; it is distinct from its formatting ID. Anonymous
boxes have no element reference, and split inline fragments share one source ref.

`resolveDocumentBlockWidths` rebuilds the current structure and returns it with
`stage: "normal-flow-horizontal-only"` and immutable block-width results.
It derives containing widths through the formatting parentage, invokes the
existing solver, and accumulates horizontal border/content offsets. Ordinary
inline/text/break records do not receive fabricated used widths or positions.

## Structural behavior

- Supported block, inline and flow-root displays use the existing native cascade.
  Flow-root is marked as an independent context; its vertical/float rules are
  not implemented by this tree stage.
- Mixed inline/block children receive anonymous block containers. A block inside
  nested inline ancestors splits those ancestors into ordered fragments. Empty
  boundary fragments are retained for later inline/decorations processing.
- Ordinary display:contents elements contribute children without their own box.
  Style inheritance continues through DOM ancestry, not the flattened box tree.
- The supported root display transformations are applied to formatting only;
  the existing visibility-style API is not silently rewritten. A display:none
  root remains absent rather than becoming visible through blockification.
- display:none subtrees are omitted. Visibility-hidden boxes remain, and a
  visible descendant can override inherited visibility. ARIA-hidden/inert do
  not erase visual boxes; existing actionability/security checks still apply.
- Text records retain raw text and source identity; comments and empty text are
  omitted. Whitespace collapsing, line construction, glyph widths and bidi are
  pending. Ordinary br has a break record, not a guessed line height.

The explicit unusual-element contents profile omits replaced/control elements
whose contents display maps to none, while ordinary button/details/fieldset
contents can flatten. SVG/MathML, intrinsic controls and other special layout
are otherwise deferred. The parser still rejects unsupported SVG/MathML tree
construction; native-tag tests do not imply namespace/parser support.

Every returned node has one formatting parent (except the viewport root).
Original DOM parents, attributes, references and revisions are not modified by
decomposition. Snapshot-diff baselines are not consumed.

## Fail-closed horizontal profile

Flex, grid, table, list-item/marker layout, inline-block shrink-to-fit and special
element layout produce deferred records and explicit diagnostic counts. Their
subtrees are opaque here rather than being incorrectly normalized into flow
boxes. This is an incomplete mode boundary, not a fallback renderer.

Document width derivation refuses **any** reported issue. That includes deferred
modes, unsupported HTML direction/presentational hints, missing/multiple native
document elements, and all current CSS diagnostics. Unknown properties such as
positioning cannot silently yield normal-flow coordinates. This is deliberately
conservative: even an unsupported color declaration or a diagnostic concerning
hidden content blocks width derivation. There is no ignore-diagnostics switch.

This profile is LTR; standalone `resolveBlockWidth` still accepts an explicit
containing direction, but document direction/bidi cascade is not implemented.
Only the existing author sizing subset and property-initial box defaults are
used. There is still no full user-agent box/font sheet, presentational-hint
support, border cascade or standard control sizing. Reported offsets are our
restricted horizontal model, **not reference-browser client coordinates**.

Inline fragments and raw whitespace are intermediate records, not final line
boxes. No Y coordinates, heights, margin collapse, font metrics, scrolling,
transforms, hit testing, screenshots or PDFs follow merely from this result.

## Ownership, bounds and output

| Default bound | Maximum |
| --- | ---: |
| Owned native nodes, including detached nodes | 50,000 |
| Created formatting boxes, including split fragments | 50,000 |
| Traversed DOM depth | 256 |
| Retained raw text, UTF-16 code units | 1,000,000 |
| Decomposition work units | 2,000,000 |

Callers may lower these limits. Invalid/unknown overrides fail. Existing native
document/CSS budgets are independent additional bounds. Inline splitting can
multiply records, so box/work limits apply during construction rather than only
after producing a large result. Width calculations and accumulated offsets also
obey `layoutValueLimits`.

The builder installs no persistent observer or owner-retaining cache. It borrows
the document-owned style cache and returns frozen data. Fresh calls observe
mutations/resizes and reject closed owners. Saved immutable results can remain
readable after close; callers retaining them still consume memory.

Raw text is intentionally not terminal-escaped at this intermediate layer. A
future terminal painter must handle hostile control characters; do not print
these text fields directly to a TTY. This API does not itself emit terminal data.

## Evidence

The selected safe suite passes 1,609 tests across 70 files, including 43 new
formatting cases. Build, strict changed-test checking, focused formatting and
diff checks pass. Final experimental-core runs pass 54 checks: fifteen new
formatting checks and 39 existing width/CSS/locator regressions.

`formatting-tree.test.ts` checks normalization, inline splitting, contents/root
rules, visibility, deferred modes, strict diagnostics, containing widths,
mutation/resize, ownership and allocation/work limits. Sixty generated mixed-flow
documents verify forest ownership, ordered text preservation, child-mode
invariants and width conservation. These are not WPT/native-pixel comparisons.

`check-formatting-tree.ts` passes fifteen actual experimental-SafeJS checks:
interpreted handlers alter the same document/cascade; a formatting ref remains
an actionable native ref; contents/visibility/resize and insertion/removal rebuild
the structure; unsupported grid/positioning and budget failures fail safely;
diff state and owner cleanup are preserved.

Build then run `check:formatting-tree` with the existing approved experimental
core selected through `AGENT_BROWSER_SAFEJS_SOURCE_ROOT`. No new SDK release,
public network, live terminal, reference browser or paint acceptance is implied.

`check:formatting-resources` measures a synthetic mixed-flow workload in fresh
Node processes. Use `small`, `medium` or `large` for 100, 1,000 or 5,000 rows:

```sh
node packages/browser-agent/dist/scripts/check-formatting-resources.js small
node packages/browser-agent/dist/scripts/check-formatting-resources.js medium
node packages/browser-agent/dist/scripts/check-formatting-resources.js large
```

The resource fixture parses actual HTML, builds the shared cascade, splits inline
owners, derives widths and verifies cleanup. Memory includes Node, source, DOM,
styles, returned data and instrumentation; the caller retains the immutable
result after close. No forced GC or retained-heap/leak conclusion is made.

Observed September 2 on Node v22.22.0, Linux x64, AMD EPYC 9R45; one fresh
process per profile, with uncontrolled machine activity and caches:

| Rows | Owned nodes | Formatting records | Resolved blocks | Parse ms | Cascade/format/width ms | Peak process RSS MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 507 | 705 | 204 | 6.7 | 8.1 | 56.3 |
| 1,000 | 5,007 | 7,005 | 2,004 | 32.7 | 35.5 | 82.1 |
| 5,000 | 25,007 | 35,005 | 10,004 | 91.5 | 142.5 | 146.3 |

All 27 functional/cleanup assertions pass. These workloads differ from the
earlier native-session resource profiles and cannot be used as before/after
performance comparisons. They exclude page JavaScript, wire traffic, fonts,
vertical layout and paint, so they do not establish full-browser resource use.
Raw reports are `reports/formatting-tree-native-*-2026-09-02.json`.

## Remaining integration

General layout needs richer style/UA defaults and supported formatting modes,
text/control intrinsic measurement, whitespace/bidi/line processing, vertical
placement and fragmentation. Coordinate actions and terminal/playground painting
must consume that geometry before capture exports or client-rectangle APIs can
be accepted. Real website/framework and released-runtime gates remain open.

Primary references inspected September 2, 2026 (partial implementation only):

- https://www.w3.org/TR/css-display-3/
- https://www.w3.org/TR/CSS22/visuren.html
