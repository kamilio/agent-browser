# Native queued double-click command

September 4, 2026. The existing `dblclick <target> [left]` declaration now reaches
the real command host, session and native mouse coordinator. This is a primary-
button gesture with explicit default-action handling, not full browser selection,
dragging, trusted input or released-runtime acceptance.

## Gesture and ownership

The host uses its existing named-session queue, timeout/abort controller, locator
resolution and actionability wait. Waiting retries only before the action starts;
the gesture never resolves a replacement target or replays a completed phase.
The session captures page/tab/job ownership, performs root-scroll preparation,
chooses the original receiving point and reserves the mouse for the gesture.

Native phases are move, down/up/click with detail 1, down/up/click with detail 2,
then dblclick with detail 2. The final event does not cause a third activation.
Both real click defaults run through the shared session click-default helper,
including checkbox/reset/form/link behavior. Actionability, cancellation,
ownership and abort checks span event and default-action yields. Cleanup releases
only mouse state owned by this operation, preserving preexisting held buttons.

A successful own-default document navigation ends the gesture with
`completed: false`, `interrupted: "navigation"`, the completed click results and
navigation data, without a fabricated dblclick or replay on the replacement page.
Same-document/no-content defaults may continue only while original ownership and
target remain valid. Navigation started by a listener instead rejects ownership;
unsupported pending defaults fail rather than silently disappearing.

The lower-level coordinator can report a pending default when no handling hook
is supplied. That helper result is not the production command's completion
contract. Actual host capability/wait/hit-test lists now advertise the wired
double-click path while keeping selection/drag/trust limitations explicit.

## Integration evidence

The preserved worker delivery supplies 63 gesture/helper tests and 44 production/
CLI tests. The CLI fixture executes the actual entry, host and session with only
the authenticated connection boundary injected. Parent adds three cross-feature
cases: fixed geometry across root scrolling, both resets against owned files,
and one multipart submission before own-default navigation stops the gesture.
The file inputs in those two fixtures are explicitly display:none: visible file
input layout remains an active rendering follow-up, not an accepted gate here.

Both focused runs pass 135 tests / six files. Source types/builds, strict new-test
checking, nine-file formatting, five-new-file Biome checks and three-source-file
lint pass. Existing import-order/command-host formatting diagnostics are not
silently normalized into this change. Two capability-list expectation updates
retain all existing behavior assertions.

Authorized full native runs pass 10,216 tests / 298 isolated files. Working
validation reports 11,347 passes and the same fifteen pending positioning/
capability/onload assertion failures / 320 files. Those preexisting pending
expectations remain untouched; the same 22 uncommitted test files remain absent
from the HEAD archive, not excluded from the explicit native allowlist.

Two fresh actual-command PNGs were visually inspected at 340 by 200. With root
scroll already at (0,100), the button remains at (24,24,142,38). Status pixels
change from zero clicks/double-clicks to two clicks and one double-click. PNG sizes
are 4,960 and 4,862 bytes. Native event records retain click details [1,2] and the
final dblclick detail 2. Evidence uses double-click-integration-* in the native-
validation cache; callbacks in this fixture are native, not page JavaScript.
Original worker patches, paths, narrower test counts and handoffs are unchanged.

## Open gates

Double-click word selection, caret/highlight painting, drag-and-drop, non-primary
button variants, native file choosers, trusted hardware input and timing-derived
gesture recognition are not implemented by this command. The command deliberately
requests a double-click rather than simulating an OS timing threshold. Native
CLI/host fixtures and PNGs do not prove sockets, real TTY/PTY, live websites or
SafeJS/released-runtime behavior. No gated probe ran; overall browser acceptance
remains open in TASKS.md.
