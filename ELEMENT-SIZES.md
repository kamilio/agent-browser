# Client and offset sizes

September 3, 2026. Page elements expose readonly `clientWidth`, `clientHeight`,
`clientTop`, `clientLeft`, `offsetWidth` and `offsetHeight` properties. These read
the independent engine's real layout; they are not fixed viewport values or
aliases for authored CSS. No dependency or runtime switch was added.

```sh
agent-browser eval 'document.querySelector("#content").clientWidth'
agent-browser geometry '#content'
```

The existing `geometry` command adds a `sizes` object beside fractional `bounds`
and `rects`. Selectors and stable references use the same document-owned cache as
page JavaScript. `capabilities.elementSizes` reports the profile and limits.

## Values

- Block client dimensions are the used padding-box size, not the content size
  or margin box. Content-box and border-box sizing are handled separately so
  padding is not added twice. Automatic layout and min/max constraints have
  already been applied by the shared layout engine.
- Ordinary inline client dimensions are zero, including padded and wrapped
  inline elements. Offset dimensions cover the union of their generated border
  fragments, including supported horizontal/vertical padding but not own margins.
- Offset union includes zero-width/zero-height fragments. It deliberately does
  not reuse `getBoundingClientRect()`'s all-degenerate-first-rectangle shortcut.
  For example, a zero-width inline spanning three em-height fragment positions
  can have offset height 28 while its client bounding rectangle has height 8.
- Fractional dimensions round to the nearest integer after combining the full
  size. Fractional client rectangles are unchanged. This is not truncation or
  separate rounding of individual padding edges.
- A root element with an associated block box reports viewport client dimensions
  in the current no-quirks engine profile. Its offset dimensions still describe
  its actual box. The body is not substituted for the root in this profile, and
  a root with no box returns zero rather than an invented viewport box.
- Detached elements, display-none subtrees and ordinary display-contents elements
  have zero sizes. Visibility-hidden boxes retain their measured sizes. Actual
  formatting-root blockification is used, not just the authored display string.
- `clientTop` and `clientLeft` are zero only after successfully validating the
  current border-free, scrollbar-free formatting profile. Unsupported authored
  borders, transforms, flex/grid/replaced layout and block-in-inline rectangle
  queries still fail; these errors are not converted to zero measurements.

Quirks/limited-quirks mode switching, borders, rendered scrollbars, scrolling-area
sizes, offset positions/parents, zoom/transforms, XML/SVG namespace behavior and
full CSSOM View conformance remain open. The current parser/renderer does not
implement quirks mode merely because input omits a doctype. These getters do not
turn that existing limitation into browser-mode equivalence.

## Ownership and bounds

`documentElementSizes(tree).get(id)` is the exported native reader. It returns an
immutable numeric record, cached lazily for that element and document revision.
Native saved records remain snapshots; guest getters read the current record.
DOM/style/viewport changes discard the old revision cache. Failed unsupported
measurements are not cached as zeros, so a supported revision can recover.

The size owner reuses `DocumentGeometry`'s layout snapshot and used-style records.
It retains only requested elements, not a second full layout. Repeated scalar
reads do not rescan fragments, allocate DOMRect capabilities or rebuild layout.
The normal geometry and computed-style APIs continue to share the same snapshot.

Default limits are 50,000 cached elements and 2,000,000 size-measurement work units
per revision; native construction can choose smaller positive limits. Existing
document, style, formatting, coordinate and layout bounds apply independently.
Measurements/work/retained-record counts appear in native and page DOM metrics.
Closing the document clears its cache. Closing a ScriptDom revokes its guest
getters even if trusted native consumers keep the document open; saved numeric
native records do not require a live document to remain readable.

## Evidence

- `element-sizes-focused-2026-09-03.json`: 2,151 passing tests across 95 safe
  files, with 23 new native/capability cases and extended geometry-command checks.
  Build, strict changed-test type checks, focused lint and formatting pass.
- `element-sizes-safejs-2026-09-03.json` and
  `element-sizes-safejs-final-2026-09-03.json`: 11 checks each through production
  PageScripts/PageBindings and the explicitly selected existing experimental
  SafeJS core. Rounding, root/inline distinctions, degenerate fragments, readonly
  values, real guest style mutations, viewport changes, detach/reattach and cleanup
  pass. Repeated getters do not increase native measurement work or the browser's
  DOMRect capability count.
- `element-sizes-computed-regression-2026-09-03.json` and
  `element-sizes-geometry-regression-2026-09-03.json`: 13 existing actual-core
  computed-style/client-rectangle checks each.
- `element-sizes-resource-{medium,large}-2026-09-03.json`: seven assertions each
  on in-memory 1,000/5,000-row documents. All requested row sizes use one native
  layout snapshot. Another 100,000 native cached reads do not increase scan work
  or record count, and close releases every record. The larger sample measures
  about 272 ms for layout plus all row reads, 2.9 ms for cached reads, and 167 MiB
  peak process RSS. These are individual local native samples, not guest execution
  timings, a statistical comparison, real-website tests or Worker acceptance.

The design references CSSOM View's client/offset algorithms and the upstream
web-platform subpixel-size expectations, inspected September 3, 2026:
`https://drafts.csswg.org/cssom-view/` and
`https://github.com/web-platform-tests/wpt/blob/master/css/cssom-view/subpixel-sizes-and-offsets.tentative.html`.
The full upstream test page was not executed: it also requires unsupported layout
and scrolling features. The local tests exercise the implemented subset only.

The SafeJS #550 upstream fix is now reported released, but the approved local
released-artifact gate remains unrun. `SAFEJS-UPSTREAM-MIGRATION.md` records the
read-only verification and unchanged runtime. No denied artifact acquisition or
live-site probe was retried to obtain these results.
