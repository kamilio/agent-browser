# Native input integration checkpoint

September 4, 2026. This checkpoint connects the existing native input owners to
the committed layout, hit-testing, scrolling, event and command stack. It does
not replace the independent browser acceptance gates or complete the seven-day
continuation.

## Integrated behavior

The document-owned mouse supplies movement and boundary events, button state,
focus and primary activation, wheel scrolling, and bounded coordinate targeting.
Click and hover resolve painted targets through the shared hit owner. Targeted
clicks recheck actionability after event delivery rather than replaying input
after a listener changes the target. Hover permits disabled controls without
focusing or activating them. Session actions follow supported navigation/form
intents and close old input owners when navigation replaces the document.

Held keyboard state supplies modifiers shared with mouse events, repeat, chords,
targeted press and bounded root keyboard scrolling. Space activation remains
armed until release, while supported Enter defaults run on keydown. Document
pointer/keyboard state drives the bounded `:hover` and `:active` selector profile;
state-only changes can reuse query indexes. `:placeholder-shown` tracks native
control values, including dependent computed styles after editing.

Mouse activation exposes pointer ID 1 and type `mouse`; non-pointing activation
uses ID -1 and an empty type. Readonly event adapters preserve these fields and
revoke access on closure. The native programmatic-click owner supports activation
without coordinate targeting or focus changes, including hidden controls and
root-scoped detached label associations. This checkpoint does not add or claim
a guest `HTMLElement.click()` binding.

Commands now route hover, raw mouse input, held keys and targeted press through
the session. Wheel guards reject stale viewport/document identities before input.
Capability output describes these partial implementations; it still declines
full pointer-event dispatch, capture, trusted/OS input, touch/pen, drag-and-drop,
double-click, clipboard, IME and platform shortcuts. Root scroll metadata reports
both command-step delivery and coalesced programmatic host-task delivery.

## Cancellation correction

Raw native asynchronous movement, down, up and wheel previously ignored abort
signals. Session checks before and after the operation could not interrupt a
pending controlled listener prefix. All four native methods now reject an
already-aborted signal before starting their generators and pass a live signal
to asynchronous event dispatch. Their session adapters forward the same signal.

Cancellation releases dispatch/busy ownership without inventing rollback of input
already observable by listeners. In particular, aborting a pending raw mousedown
leaves its button held; a later release or owner closure clears it. Aborting raw
mouseup does not activate the checkbox, and aborting a wheel prefix prevents its
not-yet-applied scroll default. Pre-aborted actions preserve all mouse metrics.

## Research and evidence boundary

The official Pointer Events draft, including activation attributes and mouse
event ordering, and the UI Events keyboard draft were inspected on September 4,
2026 at `https://www.w3.org/TR/pointerevents/` and
`https://w3c.github.io/uievents/`. Draft review informs the bounded profile; it is
not a browser-conformance result.

The new 23-case `src/input-core.test.ts` uses native owners and an injected
in-memory command/session transport. It covers coordinate activation order,
disabled hover, mutation rechecks, canceled checkedness, shared modifiers,
Space release, targeted editing, native programmatic activation, navigation
cleanup, stale wheel guards, selector-cache reuse and abort handling.

Prior HEAD plus the four original pending helper modules fails all 23 cases.
With the input integration but without the new signal correction, exactly 12
cases fail: four pre-aborted native calls and eight pending-prefix native/session
calls. All 23 pass after the correction. The prefix fixtures release their
controlled work during cleanup; they do not execute SafeJS or contact a website.

## Validation and preserved scope

Twenty existing pending suites are promoted unchanged. Eight tracked suites
receive input-specific changes, including four held-key command regressions.
The native-only label suite is explicitly added to `native-tests.json` rather
than counted from a file filter that silently excludes it. Command fixtures now
use a body and painted link text, with controls under that body; assertions are
not weakened to bypass coordinate actionability. The initial full isolated run
reproduced two failures in those old fixtures, including a rejected waiting
action, before their existing input-specific updates were integrated.

Focused runs pass 940 tests across 29 working-tree files and 937 across 29
isolated files. Both trees pass build, typecheck, strict checking of all 29
affected test files and 47-file lint. The working-tree full native run passes
9,424 tests across 260 files; the final isolated-commit run passes 8,073 across
232 files without the earlier fixture failures or unhandled rejection.

The isolated source patch excludes pending tracing, tab guards, adjacent DOM
methods and unrelated capability/import-order changes. Original pending source
and test bytes remain intact in the worktree except the mouse/session abort
correction and root-scroll capability wording. No dependency is added.

## Outstanding work

Next audit held-key/type cancellation across pending event prefixes and guest
programmatic activation exposure. Keep unrelated adjacent DOM insertion,
tracing, tab identity, playground/terminal and broad capability changes separate.
Complete pointer dispatch/capture, nested scrolling/clipping, full layout and
event-loop behavior remain open. Historical reports retain their original paths
and measurements. No live-site, socket, real TTY/PTY or SafeJS probe ran for this
checkpoint; the previously denied SafeJS probe remains unrun. Native validation
does not close those gates, and the full browser goal remains active.
