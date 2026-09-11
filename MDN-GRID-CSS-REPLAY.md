# MDN Grid CSS replay — frozen round01

## Scope and result

**Passed, CSS acceptance only.** On September 11, 2026, one candidate-only offline
native `BrowserSession` navigation accepted the captured MDN body tracks, nested
named tracks/areas, and item placements. The single formatting-tree build still
deferred the Grid body. No link geometry, width resolution, click, baseline,
second navigation, or live request was attempted.

This report covers only the immutable
`node_modules/.cache/native-validation/native-grid-css-september11-round01/snapshot01`
build. Its completed validation was independently checked from receipts:
build/strict/format/native exits all zero; **7,203 passed, 0 failed, 1 existing
exclusion**, 117 selected files, 116 strict roots, and 1,009 source files.
`src/snapshot.test.ts` is the strict-root omission; the existing skipped case is
“exposes the separate total host-object ceiling without claiming full-pool runtime
capacity.” Validation finished at `2026-09-11T12:33:58.567Z`.

Parent subsequently reported foundation commit `c482961` and a separate
Grid-name-as-font-unit false-positive fix under round02 validation. **Neither
round02 nor latest HEAD was replayed here.** This result does not validate that
separate fix, general Grid-name handling, or all Grid/CSSOM behavior.

## Observed native styles

All five selectors matched exactly one node. Values below came from native
`DocumentStyles.get/grid`, not a CSS-text-only inference. Every observed node
reported visible/displayed; that is not an actionability or geometry result.

| Selector / observed reference | Display | Computed Grid result |
| --- | --- | --- |
| `.page-layout` / body `e72` | `grid` | Columns `minmax(0px, 1fr)`; rows `min-content min-content 1fr min-content`; areas `none`. |
| `.layout__2-sidebars-inline.reference-layout` / `e1436` | `grid` | Named columns below; rows `min-content 1fr`; both named-area rows below. |
| `.layout__header` / `e1440` | `block` | All four row/column start/end longhands are `header`. |
| `.layout__body` / `e1580` | `block` | All four row/column start/end longhands are `body`. |
| `main#content` / `e1438` | `contents` | Template longhands `none`; all four placement longhands `auto`. |

Nested `grid-template-columns` (line-wrapped for readability):

```css
[full-start left-sidebar-start] minmax(240px, 1fr)
[left-sidebar-end] 32px [content-start] minmax(0px, 768px)
[content-end] 32px [right-sidebar-start] minmax(240px, 1fr)
[full-end right-sidebar-end]
```

Nested `grid-template-areas`:

```css
"left-sidebar . header . right-sidebar" "left-sidebar . body . right-sidebar"
```

All five nodes retained auto tracks `auto` and auto-flow `row`. Header/body
template longhands remained `none`; both Grid containers' placements remained
`auto`. The captured custom-property substitution and font-relative track
conversion therefore reached computed styles, preserving these lowercase line
and area names. `1fr` and `minmax(...)` remain computed syntax, not used track
widths. This does not establish item blockification or `display: contents`
formatting independently of the deferred ancestor.

The unchanged captured declarations are in
`node_modules/.cache/native-validation/native-mdn-logical-availability-live-september11/response-12.body:1`
(body), `node_modules/.cache/native-validation/native-mdn-logical-availability-live-september11/response-3.body:1`
(nested Grid/areas/placements), and
`node_modules/.cache/native-validation/native-mdn-logical-availability-live-september11/response-2.body:1`
(custom track variables). No stylesheet was substituted or edited.

## Cascade and remaining blockers

At the unchanged 1,280 × 720 viewport, 18 external sheets produced 591 rules,
1,446 declarations, 84,329 CSS code units and **2,894,159 / 5,000,000 cascade
work**, with one cascade build. Observation and formatting did not rebuild the
cascade or change document revision `2750`. No CSS or image admission/resource
limit was reported. These are round01 measurements, not a new baseline comparison.

CSS remains partial: 261 `unimplemented-css-property`, 14
`unimplemented-css-at-rule`, 25 `unimplemented-or-invalid-css-value`, 29
`unimplemented-or-invalid-css-selector`, and 24
`unimplemented-or-invalid-media-query` issues. Non-Grid property/value,
selector and responsive-media coverage therefore remains unresolved; these
aggregate diagnostics do not identify every rejected declaration or prove that
every issue is non-Grid.

The one formatting build returned `display-decomposition`, partial, with five
boxes, work 43, and one deferred subtree. Body `e72` is a block-level deferred
`display: grid` box, reason `display-layout-not-supported`, with no children.
The nested Grid, header, body item and `main` consequently have no formatting
boxes. Actual Grid track sizing/placement, downstream link boxes, and native
click acceptance remain blocked/unvalidated; no substitute block layout was used.
The candidate's capability descriptor also explicitly leaves layout, numeric
functions, auto-repeat, nested repeat, subgrid, masonry, escapes and canonical
shorthand serialization unsupported; this replay is not a conformance test of
those exclusions.

## Isolation and receipts

Evidence lives only in
`node_modules/.cache/native-validation/native-mdn-grid-css-september11/`:
`PREFLIGHT.json`, `RESULT.json`, `formatting.json`, `EXECUTION.json`,
`INTEGRITY.json`, `VERIFICATION.json`, and `RECEIPTS.sha256` record the gate,
observations, cleanup, file-only verification and artifact hashes.

- Exactly 19 original responses (one HTML, 18 CSS), 270,288 decoded bytes;
  ordered request URLs, response URLs/status/headers/body hashes matched capture.
  Transport totals are correctly **19 requests / 19 mocked requests**, not zero
  total requests. Wire requests, encoded bytes, redirects and guard attempts are
  zero. Original compression headers were retained alongside the original
  transport-decoded bodies; this was not a new encoded-wire capture.
- Original origin/credential/script policy and stylesheet/request/cascade/query/
  document admission limits were retained. Linux seccomp plus JavaScript
  network/subprocess/worker guards, clean environment, non-TTY execution,
  30-second deadline + 5-second kill grace, and 6 MiB output/per-file caps applied.
  The only native child exited zero in 393 ms, without timeout or cap breach;
  its process group disappeared.
- Session, transport and owned document closed; zero pending loads, active
  transport work, retained document nodes, storage events or cleanup errors.
  The single post-event-loop settlement sample completed in 0.329 ms rounded
  up, within its 100 ms window. Native method descriptors were never overridden
  and remained identical; child-local denial guards ended with the process.
  Private home/tmp were empty and removed.
- All 1,009 source and 1,792 compiled snapshot files matched before/after.
  Source ledger SHA-256:
  `d449b54cd96931ceee9c9b026fe2470497e5359b8e904cc701375414787acaf6`;
  compiled ledger SHA-256:
  `1a39ab44406879d34d7744b7156e12d3f957bba6f886b8aab44595864595c359`.
  All 45 original capture receipts and 41 prior compound-pair receipts remained
  valid. Original capture ledger SHA-256:
  `ed77967316f8cbc26b5b1a3def9613ebd23ee817f00dbfd6806c579bd4c55c49`.

No production source, tests, manifests, prior reports/evidence, or `TASKS.md`
were written by this lane; no commit was made.
