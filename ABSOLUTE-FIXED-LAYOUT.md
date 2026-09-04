# Native absolute and fixed layout

September 4, 2026. Native document layout now coordinates absolute/fixed boxes
with normal flow, painting, hit testing, root scrolling and element offsets.
This is an LTR physical-inset subset, not complete positioned CSS layout.

## Supported behavior

Absolute and fixed descendants are blockified and excluded from normal-flow
space. Absolute containing blocks use supported positioned block padding edges,
or the initial containing block; fixed boxes use the viewport. Physical insets,
auto/stretch sizing, min/max constraints, auto margins and bounded shrink-to-fit
are coordinated with existing block/flex/text/image/control layout. Both-auto
axes use bounded hypothetical source-order flow or sole-flex-item positioning.

Shared geometry, raster and hit-test consumers project fixed descendants across
root scrolling. Absolute overflow contributes to root extents; viewport-fixed
overflow does not. Element offsets report positioned padding-edge coordinates
and a null fixed offsetParent within their existing first-box partial profile.

Parent integration additionally prevents scrollIntoView and default focus from
moving the root viewport for a fixed target or its descendant, even when the
target lies outside the viewport. A boxless display:contents ancestor is not a
fixed containing box. Switching a real fixed ancestor to absolute restores root
scroll behavior. Existing unsupported nested-overflow gates remain intact.

## Integration evidence

Nine parent tests include seven regressions that failed before the fixed-target
scroll correction, plus display:contents and pre-wrap/editing integration cases.
Both focused suites pass 385 tests across nine files. Source types/builds, strict
new-test checking, scoped formatting and new-file Biome checks pass.

The full isolated HEAD-plus-change native suite passes 10,036 tests / 291 files.
The working-tree suite reports 11,167 passes and 15 failures / 313 files. Fourteen
failures are newly obsolete expectations in preserved preexisting pending work:
13 absolute/fixed-rejection assertions across six untracked layout test files,
and one pending element-offset capability assertion in command-host.test.ts.
The fifteenth is the previously recorded pending Window.onload assertion. None
of those pending assertions is silently rewritten, excluded or bundled into this
commit. The isolated archive lacks the same 22 preexisting uncommitted test files;
its green result is not a claim that the complete working tree passes.

Fresh native command-path captures combine absolute positioning, pre-wrap,
editable fill/type, root scrolling and default fixed-button focus. Both PNGs
were visually inspected at 340 by 260. The editor moves from (42,104,194,94) to
(42,44,194,94) after 60 pixels of root scroll. The fixed button remains at
(260,16,64,24), and focusing it retains root scroll (0,60). PNG sizes are 9,018
and 7,355 bytes. Evidence uses positioning-integration-* in the native-validation
cache; these are native host commands, not a page-runtime or live-site run.

The original worker v1/v2 patches, handoffs and captures retain their original
paths, narrower measurements and now-superseded integration caveats. Existing
tracked rejection fixtures now use still-unsupported sticky rather than deleting
their assertions. Standalone width/intrinsic coordination negatives remain.

## Limits and next work

Hypothetical static-position reflow can be quadratic across many bare positioned
siblings. Worker v2 measured 1,658 work units for ten and 52,148 for one hundred;
one thousand exceeds the default budget. `POSITIONING-PERFORMANCE.md` records
the later integrated reuse optimization for equivalent sibling runs, without
increasing budgets or omitting accounting. Distinct flow slots retain the bounded
fallback. The v2 numbers above remain historical native work counts, not
elapsed-time claims or the follow-up's different-fixture measurements.

Block-in-inline static splits, flex baseline static alignment, positioned inline
containing blocks, transformed containing blocks, RTL/logical insets, sticky,
tables/grid positioning and element-overflow scrolling remain unsupported.
Fixed repetition in paged/PDF output is not established. Offset geometry remains
first-box, untransformed and unzoomed. No new runtime dependency, live-site,
socket, real TTY/PTY or SafeJS probe was used; original acceptance gates stay open.
