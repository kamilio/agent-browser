# Bounded nested overflow and scrolling

September 14, 2026. This extends the earlier visible-only element metrics and
root-only scrolling checkpoints with a partial native nested-scrollport model.
It does not establish complete CSS Overflow/CSSOM View conformance or live-site
acceptance. Chromium, Firefox, remote browsers and new runtime dependencies are
not involved.

## Layout and state

Supported ordinary block, inline-block, flex, grid and list-item boxes retain
used overflow metadata. Computed scrollable overflow also establishes the
supported independent formatting context and zero automatic flex/grid minimum;
explicit minima and other intrinsic contributions remain intact. Root/HTML-body
overflow donation changes viewport policy without making body a root alias.
The existing clip-preserving computation profile is retained. Only viewport
donation maps visible to auto and clip to hidden.

Pure normal-layout extent measurement follows containing-block ownership,
limits propagation on clipped axes, excludes fixed descendants from root extent
inflation and measures their own local scrollports. Padding, borders, text
advances and supported flex/grid margin contributions participate. Inline image
metrics and explicit control-metric guards remain independent of whether another
element establishes overflow.

Document-owned offsets use stable element references and positive physical-LTR
bounds. Movement invalidates presentation, not normal-flow layout; positions
clamp after relevant changes. Hidden, auto and scroll allow programmatic
movement. Clip and visible do not. Wheel/keyboard defaults use auto/scroll, not
hidden. Separate documents do not share positions.

## Geometry and interaction

- Shared projection moves descendants without moving a port's own border,
  resets fixed descendants and respects absolute containing blocks.
- Sticky descendants use their nearest supported scrollport and retain their
  containing-block constraints. Grid areas follow the grid's content offset.
- CSSOM element and range rectangles remain unclipped. Padding-edge clip chains
  constrain raster writes, point hit testing and click-point candidates instead.
  SVG descendant/group references inherit their root's content clip chain.
- Raster clipping uses shared-buffer destination views, not extra canvases.
  Rounded-corner admission and existing SVG clip-path hit semantics remain.
- Guest element scroll/scrollTo/scrollBy and writable offsets route through the
  injected host queue. Internal multi-port plans are not public Window options.
  Element notifications are non-bubbling and coalesced per target; root events
  retain the previous document behavior. No-op writes do not synthesize events.
- Scroll-into-view plans inner-to-outer movement before applying changes.
  Nearest stops at the nearest applicable port even when movement is unnecessary.
  Wheel defaults chain unused per-axis pixel deltas; focused keyboard defaults
  use local dimensions/bounds. Cancellation and editable/modifier exclusions stay.

## Limits and exclusions

This is an instant, positive-origin, physical-LTR, no-gutter native policy.
Reverse/RTL geometry, smooth scrolling, scrollbar painting/gutters, scroll snap,
scroll margins/padding, scrollend and automatic clamp events are not established.
Own nonvisible overflow on unsupported tables, controls, replaced/deferred
elements and generated-content cases retains a diagnostic guard. This does not
prevent supported descendants of an ordinary clipped box from rendering.

Existing limits remain: 2M extent work, 50K element/formatting entries, 16,384
element queries, bounded projection work, 1,024-level ancestor/clip chains and
4,096 page requests/events. Multi-port plans account for their targeted
operations. Exhaustion throws rather than bypassing guards or inventing geometry.

The retained W3C Overflow document is the October 7, 2025 working draft, not a
claim to the latest standard. The stopped CSSOM acquisition is not reopened;
its edition and exact metric/event/reveal algorithms remain unverified. Rounded
corners for mixed clip/scrollable axes in the clip-preserving profile are native
policy, not verified cross-browser equivalence. Click candidate rectangles use
axis intersections; the final hit test checks rounded clips. Raster paint counters
are not redefined as exact ancestor-clipped pixel coverage.

## Validation

The sealed focused06 run passed **3,726 tests, zero failures and zero skips**
across 95 selected test files. It includes **272 new cases**, plus five added
cases in existing files. Build, strict checking, scoped formatting, exact selected-set
checking and source-inventory stability pass. Evidence is retained under
`node_modules/.cache/native-validation/overflow-integration-work-september14/`.

Review found and reproduced three integration defects before release:
- Inline image/control tests: pre-fix **3 pass/6 fail**; corrected **9/0**.
- SVG clipping/grid constraints: pre-fix **2 pass/9 fail**; all 11 corrected cases
  pass in focused06, without weakening their assertions.

Earlier type-inference, circular-module initialization and negative-zero draft
expectation failures remain recorded. Obsolete blanket overflow rejection tests
are replaced with concrete supported-behavior checks; unrelated special-case
guards remain. An unloaded suite is never counted as executed.

The first broader run is retained as **22,037 pass/15 fail/0 skip**. Ten failures
were further obsolete overflow expectations. The copied harness also mistakenly
omitted the baseline's two exact exclusions and 30-second per-test timeout,
exposing two previously excluded cases and three receipt-test timeouts. Restoring
those original settings is not a new exclusion or an engine-budget increase.
Build, strict checking, formatting and input stability passed in that failed run.
The repeat allows ten minutes for the entire larger native-test process instead
of five; individual tests retain the original 30-second ceiling. This harness
deadline is not a browser performance acceptance threshold.

The expanded focused07 check passes **4,142 tests, zero failures and two
unchanged exclusions** across 105 selected test files. This includes the remaining
guard replacements, the original receipt tests under their original timeout,
all 272 new cases and the five additions in existing files. The dirty computed
style test's unrelated 29 lines are excluded from the isolated candidate and
preserved in the working tree.

The final selected round01 gate passes **22,050 tests, zero failures and
two unchanged exclusions**: 436 selected test files, 435 strict roots,
788 manifest entries and 352 unselected entries. It runs from
2026-09-14T03:20:37.553Z to 2026-09-14T03:25:46.417Z. Build, strict checking,
scoped formatting, exact test-set checking and inventory audit pass.
1,341 source files and 2,172 compiled files are inventoried.
Evidence: `node_modules/.cache/native-validation/native-overflow-september14-round01/`.

- Audit SHA256: `506555392747a5aed81c85a869db6f5251ed48cd92f0fdf4bebf88bf07b3c075`
- Receipt-ledger SHA256: `48283ae5f371898de51ea8ae2f160228404aa93aa7a11aed6e61dcfa20bd3f1c`
- Source-inventory SHA256: `29d7fa74b73c7fd9aa0de5a0c5fa7654cb9c8d5b5247847288563474015a9a58`
- Compiled-inventory SHA256: `fb69731c2a918887678b00b0a8fb1b7802288c4061fee3a25dc845eb8c7e8002`

Independent verification passes, including complete inventories, exact test
selection, the preserved failed gate and the eight scoped dirty-work residuals.
Report: `node_modules/.cache/native-validation/overflow-integration-work-september14/gate-verification/GATE-VERIFICATION.json`.
SHA256: `42ed4e97ff74e3acfa0a9ac48f28436b8a765a25261189a0705a87fd36366b4e`.

No new live website request, saved-page replay, credential/passkey/device,
SafeJS, socket, TTY or challenge acceptance is claimed by this document.
