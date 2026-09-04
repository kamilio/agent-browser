# Native editable-region fill

September 4, 2026. Continuation of `EDITABLE-FOCUS.md`, now under the accelerated
schedule in `FIVE-HOUR-SPRINT.md`. This adds usable agent text replacement, not a
claim of complete contenteditable editing or guest-runtime compatibility.

## Behavior and ownership

Native `fill` and its command readiness path now accept editable containers,
including inherited editable descendants and independent regions inside false
islands. The requested element's entire contents are replaced by literal text;
an empty value removes its children. Ancestor/sibling content outside the target
is preserved. Markup-looking strings are never parsed. The operation focuses the
owning editable root and sends input events there, retaining the requested target
reference in the action result.

Text insertion uses cancelable `beforeinput` followed by noncancelable `input`,
both with `inputType: insertText` and the supplied data. Empty replacement uses
`deleteContentBackward` with null data. Cancellation leaves the old DOM intact
and skips input. No form-control `change`, current-value state or user-edited
validity flag is fabricated for editable DOM content.

Root and descendant resolution reuse contenteditable's case-insensitive states
and false boundaries. Readonly on a generic editing div is not treated as a form
control restriction. Existing text/calendar/range control handling remains in
its original path. Nonfillable controls and void containers are not treated as
editable text containers merely because the attribute exists.

Focus-time callbacks finish before the replacement contents are captured.
Before applying an allowed default, the action rechecks actionability, active
root, current editing owner and immutable subtree identities. Changes to target
contents, attributes or parentage during beforeinput conservatively reject the
stale write rather than discarding a listener's work. Unrelated sibling changes
do not reject it. Nested successful fills therefore survive the outer stale fill.

Replacement uses the existing document mutation path, preserving retained old
children and publishing one combined child-list record. Document node/text/depth
budgets remain authoritative. Oversized individual strings fail before focus;
allocation failures do not discard old children. Async fill accepts an AbortSignal,
and the command host now forwards its signal for all fill types. Abort before
the default prevents the write; abort after input does not roll back committed DOM.

## Specification research

Primary sources read September 4, 2026:

- `https://www.w3.org/TR/input-events-2/` — May 1, 2026 Working Draft, including
  editing-host dispatch, data and input-type distinctions. The initial reuse of
  form-control insertReplacementText was corrected: contenteditable replacement
  under that type has DataTransfer semantics, unlike this plain-text operation.
- `https://www.w3.org/TR/webdriver/#element-clear` — editing-container clearing
  provides useful context, not a claim that this native fill is WebDriver clear.
- `https://raw.githubusercontent.com/microsoft/playwright/main/packages/injected/src/injectedScript.ts`
  — a primary reference for contenteditable fill admission and selection/focus
  preparation. No Playwright runtime or other browser dependency was imported.

The operation does not yet implement DOM Range/Selection, target ranges,
DataTransfer, caret movement, rich-text insertion defaults, composition, undo,
clipboard or keyboard editing in arbitrary editable regions. Newlines are literal
DOM text and obey authored whitespace rules; no fake paragraph structure is added.

## Native validation

All 49 final new tests fail on isolated prior HEAD `c4cf3d9`. Three tests also
reproduced the incorrect contenteditable input-type/data semantics before that
implementation fix. Focused runs pass 303 / eight files in both trees. Types,
builds, strict checking of the new test and six-file scoped lint pass in both.

Authorized full explicit native suites pass **9,686 / 276 isolated files**.
The working tree reports **10,831 passes and one unchanged pending Window-onload
assertion failure / 298 files**, at `src/page-bindings.test.ts:161`. That pending
test still matches its earlier backup; unrelated work is not included.

Snapshot: `node_modules/.cache/native-validation/editable-fill-isolated.cl9B6u`.
Logs in the parent cache use the `editable-fill-` prefix: `red-final.log`,
`event-types-red.log`, `focused-working.log`, `focused-isolated.log`,
`native-working.log` and `native-isolated.log`. The earlier `red.log` retains its
initial test-harness timeout/unhandled-rejection failures; final regression proof
uses the corrected, fully observed 49-case run, not that initial log.

## Inspected command captures

`node_modules/.cache/native-validation/editable-fill-capture.mjs` drives the
isolated build via in-memory transport and native open/resize/fill/geometry/
screenshot/artifact-read commands. All four 320 by 240 PNGs and their JSON record
were inspected. The editor remains `e9` at `(32,52,240,110)` throughout.

- Original rich children: 4,996 bytes, no focus or input event.
- Filled literal markup-looking text plus newline: 7,416 bytes, one text child,
  focused root and two input events.
- Canceled replacement: identical 7,416-byte capture and text, one additional
  beforeinput but no input.
- Cleared: 4,265 bytes, no children, focus retained and two deletion events.

An initial capture using white-space:pre-wrap was rejected by the existing native
formatting profile. The successful capture explicitly uses supported pre-line;
it is not pre-wrap evidence. That concrete gap is queued for the accelerated
sprint. No live browser, website, socket, real TTY/PTY or SafeJS probe ran. The
previously denied SafeJS probe remains unrun, all original acceptance gates remain
open, and historical evidence is unchanged.
