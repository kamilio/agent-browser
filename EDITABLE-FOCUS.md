# Editable-region state and native focus

September 4, 2026. Continuation of `FOCUS-VISIBLE.md` and the active seven-day
browser plan. This is focus/state groundwork, not a content-editing engine or
released-runtime acceptance.

## Shared behavior

`src/content-editability.ts` resolves the `contenteditable` attribute's true,
false, plaintext-only and inherited states. Empty attributes mean true; missing
and invalid values inherit; matching is case-insensitive without whitespace
trimming. False islands stop inheritance. The same parser now serves native
focus eligibility, focus indication, keyboard scroll protection and page-facing
editability properties. Reads follow the current tree, so attribute changes and
reparenting do not leave stale cached editability.

An explicitly editable element whose parent is not editable is a native focus
stop without a `tabindex` attribute. Nested editable descendants do not gain extra
default stops; explicit tabindex still applies. A new editable region inside a
false island can receive focus. Existing disabled, disconnected, hidden, inert,
closed-details and style-visibility exclusions remain in the focus path. The
reflected `tabIndex` default remains -1 for a div: reflection and native focus
eligibility are intentionally different.

Native synchronous/asynchronous focus, sequential movement, direct root clicks
and coordinate mouse actions share this eligibility. Writable-region indication
also applies to pointer focus. Losing editability invalidates focus matching,
including cached relational selectors, and native active-focus resolution.

`ScriptDom` now exposes `contentEditable` and read-only `isContentEditable` on
its element wrappers. Setters canonicalize true/false/plaintext-only, remove the
attribute for inherit, and throw `SyntaxError` for other primitive strings without
mutating the document. Existing bounded DOM-string conversion is reused through
an explicit converter parameter, avoiding a new runtime dependency/circular
import. Objects/functions/symbols remain unsupported conversions. Retained
properties enforce binding lifetime before reading or writing.

## Research boundary

Primary references read September 4, 2026:

- HTML editing attributes and property algorithms:
  `https://html.spec.whatwg.org/multipage/interaction.html#contenteditable`
- HTML focus method options and scrolling:
  `https://html.spec.whatwg.org/multipage/interaction.html#dom-focus`
- WebKit's `HTMLElement::supportsFocus` implementation provides a primary-source
  example of editable-root focus eligibility; no engine or code dependency was
  imported:
  `https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/HTMLElement.cpp`

These are source research, not cross-engine execution results. Native ancestor
rules do not implement CSS user-modify, designMode, shadow trees or platform
editing behavior. The independent TypeScript/SafeJS architecture is unchanged.

## Native evidence

All 53 new tests fail against isolated prior HEAD `d3a3440`. Matching focused runs
pass 308 tests / seven files in both isolated and working trees. Types/builds,
strict checking of the new test and seven-file scoped lint pass in both trees.
Authorized full explicit native runs pass 9,637 tests / 275 isolated files.
The working run reports 10,782 passes and one unchanged pending Window-onload
assertion failure / 297 files (`src/page-bindings.test.ts:161`). That test matches
its preexisting backup byte-for-byte; its unrelated pending work is not included.

The isolated validation snapshot is
`node_modules/.cache/native-validation/editable-focus-isolated.yBWcNa`.
Local logs use the `editable-focus-` prefix in that cache directory, including
`red-final.log`, `focused-working.log`, `focused-isolated.log`,
`native-working.log` and `native-isolated.log`.

`node_modules/.cache/native-validation/editable-focus-capture.mjs` uses the
isolated build with in-memory transport and native open/resize/press/click/styles/
geometry/screenshot/artifact-read commands. A native ScriptDom host-object fixture
then sets contentEditable to false; this is not guest-runtime execution.
Its JSON and all four 270 by 190 PNGs were inspected. The editor remains `e9` at
`(32,62,200,68)`. Initial and no-longer-editable captures have no outline and are
4,960 bytes; keyboard and pointer captures both show the same separated 3px blue
outline and are 5,379 bytes. Indicated references are respectively empty, `[e9]`,
`[e9]`, empty. Focus does not alter geometry or text.

## Open gates

Actual contenteditable text insertion/deletion, selection/caret, composition,
clipboard, undo, rich formatting, editing events and accessibility are not
implemented by this checkpoint. Printable native editing still reports the
existing unsupported error; navigation keys do not scroll the root viewport.
Do not interpret isContentEditable or focusability as editing-engine support.

Active-page `.focus()`/`.blur()` publishing, synchronous guest callback semantics,
focus options (`preventScroll`/`focusVisible`), focus scrolling, platform
preferences and direct-click descendant parity remain follow-up work. Inert
document stubs are not active-page implementation evidence. Broader browser,
real-site, socket, TTY/PTY and released SafeJS gates remain open. No gated probe
ran; the previously denied SafeJS probe remains unrun. Historical reports and
unrelated pending work are preserved. The seven-day goal remains active.
