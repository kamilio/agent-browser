# Native outside markers with block content

September 11, 2026. Bounded synthetic native implementation and validation;
not a real-site result or CSS/browser-interoperability conformance claim.

## Source boundary

The captured CSS Lists Working Draft, November 17, 2020, is described with its
original receipts in `LIST-MARKER-SOURCE.md`. Its section 3.5 associates an outside
marker with the principal list-item box, outside its inline-start border, and
fixes it relative to that border rather than scrolling it with the contents.
Precise placement, painting order, baseline selection, and effects on principal
height/line creation are explicitly underdefined. No new source fetch, alternate
browser, or interoperability comparison was performed for this implementation.

`MDN-POSITIONING-REPLAY.md` remains the historical offline captured-page failure: formatting
threw before geometry or failing-node identity was measured. This change addresses
that class of native formatting failure; it does not establish that MDN now
renders, clicks, or passes the previously masked positioning gate.

## Supported native policy

Outside symbolic markers now have explicit owner-attached formatting metadata
and separately coordinated layout boxes. They are neither normal-flow children
nor CSS absolute/fixed children. No DOM nodes are reparented, no principal box is
forced to `position:relative`, and no zero-height flow shim is inserted.

1. **Ownership and flow.** An ordinary supported `display:list-item` or primary
   summary owns `FormattingNode.outsideMarker`. Its physical marker is represented
   by `DocumentLayout.outsideMarkers`, separate from principal boxes, inline
   fragments, and text contexts. Inside markers retain the previous inline path.
   Marker-free items and zero-font-size suppression retain their existing behavior.
2. **Gutter.** In the existing LTR profile, marker width is the principal computed
   font size. Its inline-end touches the principal left border: `x = borderX -
   width`. Padding and a descendant's indentation do not move the gutter. Marker
   height is the native bitmap-font ascent, currently `fontSize * 7 / 8`.
3. **First-line anchor.** Prefer the first actual line of the owner's text context;
   otherwise use the first in-flow descendant context with a line. Selection uses
   formatting-child order, including existing order-modified Grid/Flex children,
   not a minimum-coordinate search. Empty/no-line branches and absolute/fixed
   descendant branches do not supply an anchor. Marker bottom aligns with that
   baseline. Multiline content supplies only its first line.
4. **Principal fallback.** If there is no in-flow line, use the principal content
   top plus its native font ascent and half-leading. Equivalently, marker top is
   `contentY + (usedLineHeight - fontSize) / 2`. This does not create a line box.
   Empty summaries retain visible, hit-testable markers and native mouse toggling.
5. **Attachment.** Descendant relative offsets are removed from the selected
   baseline. The resulting vertical offset is retained relative to the principal
   border, so independently shifted block/inline descendants do not drag the
   marker. Principal/ancestor positioning does move it. Fixed viewport projection
   works by resolving against the projected principal box, without turning the
   marker into an independently positioned element or altering containing blocks.
6. **Principal invariants.** Outside markers do not contribute to intrinsic width,
   principal height, first-line creation, margin collapse, or client rectangles.
   Border/padding geometry, adjoining and through margins, and following content
   match the same fixture with `list-style-type:none`. Marker overflow can still
   extend root scroll bounds; fixed-marker overflow is excluded, like fixed boxes.
7. **Painting and input.** An explicit marker paint item uses the owner's visibility,
   color, reference, pointer-events/inert state, and stacking scope. In ordinary
   flow it follows the scope's normal backgrounds and precedes its owner's text
   group; positioned stacking uses the existing owner context ordering. It has no
   independent z-index or outline. Marker hits target the owner, not the first
   descendant line. Ordinary li/div owners gain no disclosure activation; primary
   summaries retain disclosure state and toggling.
8. **Bounds.** Each outside marker reserves one box under the existing formatting
   ceiling without adding a flow node. `metrics.boxes` includes these boxes and
   `metrics.outsideMarkers` records their count when nonzero. The coordinator uses
   charged iterative traversals and maps bounded by the formatting tree, rather
   than rescanning all descendants for every marker. Coordinate/font, layout,
   paint, scroll-extent, and hit-region ceilings remain enforced and unchanged.

These are native policy choices where the captured source is underdefined,
especially gutter distance, first-descendant order, half-leading fallback, zero
principal-size contribution, and painting order. They are not claims about other
browser engines.

## Retained limits

- Supported types remain `disc`, `circle`, `square`, `disclosure-open`,
  `disclosure-closed`, and `none`; no counters, decimal/custom/image markers, new
  shorthand, or marker-specific CSS grammar is introduced.
- Existing ordered-list/default-disc ambiguity, special/replaced-element list
  deferrals, bidi/direction, float, CSS diagnostics, and unrelated layout guards
  remain explicit. No captured CSS or diagnostics are suppressed.
- Element-content scrolling, marker-side/writing-mode extensions, and float-adjacent
  placement are not added. Root viewport scrolling and existing native positioning
  are the tested attachment profile.
- The coordinator is attached after the full document's native flow and positioning
  coordination. Low-level width/text/isolated layout stages do not independently
  publish final outside-marker coordinates.
- Parent owns network scheduling, source-index work, clean broader validation, and
  the unchanged MDN replay. None of those gates was run or claimed here.

## Changed paths

- `src/formatting-tree.ts`: owner metadata and bounded outside-box reservations.
- NEW `src/outside-markers.ts`: baseline/fallback coordination and owner-relative rectangles.
- `src/document-layout.ts`: separate outside-marker layout records.
- `src/flex-document.ts`: final coordinator integration after positioning.
- `src/layout-paint-order.ts`, `src/stacking-order.ts`: explicit owner-scoped marker paint items.
- `src/document-raster.ts`, `src/hit-testing.ts`: actual symbolic pixels and owner hit regions.
- `src/document-scroll.ts`: ordinary-marker overflow and fixed exclusion.
- `src/formatting-tree.test.ts`, `src/disclosure-markers.test.ts`: existing selected regressions.
- NEW `OUTSIDE-BLOCK-MARKERS.md` and private evidence directory
  `node_modules/.cache/native-validation/outside-block-markers-worker-september11/`.

`src/document-geometry.ts` did not need modification: separate marker boxes never
enter its principal-box or inline-fragment rectangle collections. No other shared
files, manifests, TASKS, dependencies, captures, or historical reports were edited.
No commits or pushes were made.

## Exact validation and evidence

The new private lane contains an archive of tracked sources from commit
`47e68e6422df37916cc375e18729967a1493b908`, overlaid only with the eleven owned
source/test files. It does not execute unrelated dirty worktree sources. The
installed compiler, Vitest runner, and Biome 1.9.4 formatter are reused without
installation. The two selected test files are checked against the archived native
manifest; no manifest is edited or broader selection run.

Final validation, September 11, 2026:

- **162 passed / 0 failed:** 81 `formatting-tree.test.ts` and 81
  `disclosure-markers.test.ts` cases. Run: **15:29:25.147–15:29:27.965 UTC**.
- Strict TypeScript, including both selected tests and their imports: exit 0,
  no diagnostics, **15:29:27.999–15:29:30.665 UTC**.
- Existing formatter: exit 0, **11 files checked, no fixes needed**,
  **15:29:30.700–15:29:30.738 UTC**.
- Assigned tracked-file `git diff --check`: exit 0.
- `AUDIT.json`: **894 non-owned tracked files** exactly match the archived commit;
  all **11 owned files** match the shared handoff; final test/strict/format runs
  use identical source inventories. Checked at **15:30:24.937 UTC**.

Coverage includes block-first/nested/contents/mixed/multiline/empty/no-line cases,
first-line and principal fallback equations, collapsed/through margins, intrinsic
and principal size invariants, pixels and hit regions, marker-owner identity,
ordinary versus summary activation, empty-summary native mouse toggling,
visibility/color/font size, independent descendant shifts, absolute/fixed owners,
root scrolling, stacking, nested lists, Grid/Flex nesting, pointer/inert filtering,
font/layout/raster/hit limits, and retained unsupported declarations.

Every compiler/formatter/test child uses the existing seccomp socket-denial
launcher, stripped environment, private HOME/TMP, closed stdin, 120-second timeout
plus five-second grace, 6 MiB combined stdout/stderr cap, and 6 MiB per-file limit.
Tests additionally use the existing native JavaScript network guard, one worker
thread, no retries, 30-second per-test limit, and disabled server/watcher interfaces.
All recorded children have stable snapshot inventories, absent process groups at
completion, and no timeout/output-cap/stream failure. Native mouse fixtures are
synthetic; no real TTY/PTY, hardware input, devices, sockets, live requests,
credentials, SafeJS, page guest execution, or alternative browsers were used.

Earlier failures remain under their original labels and are not overwritten:

| Label | Exact outcome |
| --- | --- |
| `baseline-red` | 109 passed, 6 failed: five pre-existing outside/block throws and the missing empty-item coordinated-marker record. |
| `implementation-first` | 96 passed, 19 failed: legacy outside-node/negative-margin representation and rejection assertions; all six new principal-invariant cases passed. |
| `regressions-first` | 150 passed, 0 failed. |
| `boundaries-second` | 162 passed, 0 failed. |
| `tests-final` | 162 passed, 0 failed after final formatting. |

Each run retains invocation/environment, source-before/source-after SHA-256 lists,
execution status, stdout/stderr, and test JSON where applicable. All strict and
formatter invocations are also retained. `AUDIT.json`, `source-final.sha256`, and
`source-final.patch` pin the final handoff. Passing synthetic tests do not replace
the parent's wider gate or turn the historical MDN failure into a live success.

## Parent integration and reference actions

The initial combined gate, `native-outside-markers-integration-september11-round01`,
passes 8,392 native cases with the existing single exclusion. Read-only review then
identifies an empty-summary regression: its real outside marker can receive mouse
coordinates, but reference-based click and hover only consider the zero-height
principal box. That gate is historical, not final reference-action acceptance.

The correction retains DOM client rectangles and principal dimensions unchanged.
Separate actionable rectangles include genuine owner-attached marker boxes, charge
existing geometry limits, and still require native hit-test ownership. Only native
click and hover use marker-aware scrolling; public/DOM scroll-into-view behavior
retains principal-box semantics. Occlusion, pointer exclusion, inert/disabled
ancestors, hidden/absent markers and fixed viewport projection remain enforced.

`native-outside-marker-actions-work-september11` records 46 passing and seven
failing baseline cases, then 53 passing and zero failing cases after correction.
The second clean combined gate is
`native-outside-markers-integration-september11-round02`: **8,529 passed, zero
failed, one existing exclusion**, 141 selected native files and 140 strict roots.
Build, strict type-checking and formatting also pass. It ran September 11, 2026,
15:48:47.429–15:50:38.274 UTC, against clean `6c11923` plus the sixteen scoped
implementation/test files. All 1,019 source/input hashes remain stable; the parent
also compares every scoped source byte against the tested snapshot. No live-site
flow, SafeJS, credentials, device or socket acceptance follows from this gate.

The follow-up review finds two additional cases: an empty principal rectangle can
dominate nearest scrolling with large line leading, and double-click still uses
principal-only preparation. Four new regressions reproduce those failures
(53 passed / 4 failed). Native action scrolling now unions only positive-area
receiving rectangles, and double-click uses the same marker-aware private path.
Public/DOM and generated-control scrolling retain their previous policies. All
57 focused cases pass; the closure review substantiates no additional issue.

The **final combined gate** is
`native-outside-markers-integration-september11-round03`: **8,643 passed, zero
failed, one existing exclusion**, 144 selected files and 143 strict roots. Build,
strict and format also pass; UTC 16:00:25.845–16:02:32.744 on September 11, 2026.
It uses clean `13c7d4f` plus the same sixteen owned paths, stable 1,019 source/input
hashes, a single Vitest thread, JavaScript network guard and socket-denying seccomp
on each tool child. Parent source/snapshot byte comparisons pass. Two earlier
preparation attempts executed zero tests (supervisor pipe setup and fork-pool IPC
under seccomp); their original results and explanations remain in the development
lane. No filter was relaxed to obtain the passing single-thread run.

`MDN-OUTSIDE-MARKERS-REPLAY.md` separately preserves the one offline replay on
the immutable **second** gate, not this final action-correction build. Formatting
now completes with 23 outside markers and enters positioned-layout coordination,
then stops at the unchanged unsupported formatting-profile gate. No geometry or
destination completes. The two later action corrections are not site-tested by
that replay, and its original 8,529-pass build identity remains unchanged.
