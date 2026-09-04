# Bounded native paragraph editing

Lifetime continuation: EDITABLE-RANGE-LIFETIME.md now scopes the private native
caret Range used during paragraph splitting, including exceptional cleanup.
Original paragraph behavior, selected Range identity and checkpoint measurements
below remain unchanged; full editing and external/runtime gates stay open.

September 4, 2026 integration on `9376ba5`. This extends `EDITABLE-KEYBOARD.md`
without changing the native engine or adding a page-runtime dependency.

## Implemented subset

- Plaintext-only Enter and Shift+Enter insert LF through shared Range replacement.
- Rich Shift+Enter inserts an actual br and places the shared caret after it.
- Rich Enter wraps a simple inline div editing root in two div paragraphs, or
  splits one direct p/div child at the selection. Left-side node identity survives;
  right-side inline ancestors are cloned without id/name/contenteditable.
- Actual native host fill/press/type routing uses cancelable beforeinput, input,
  key events and the existing mutation, focus, selection, reentrancy and abort
  guards. Canceled defaults leave DOM and selection unchanged.
- Node, depth, text and mutation-metadata preflight limits remain bounded. A
  shared-budget failure after detached clone allocation can retain an unused
  detached node; this is not a general transactional DOM facility.

## Current integration evidence

Both working and isolated focused runs pass **204 tests across seven files**.
Source type checks/builds, strict checks for four affected test files and scoped
Biome checks pass. Authorized explicit `native-tests.json` runs pass **10,451
tests across 306 isolated files**. The working tree reports **11,582 passes and
the same fifteen pending assertion failures across 328 files**: fourteen old
positioning/capability assertions and the preexisting onload-object assertion.
Those pending files and the twenty-two additional working test files are not
silently bundled into this commit or excluded from the working validation.

Fresh actual native command-host captures use injected transport, no page
runtime, and a 320x220 viewport. The fixed editor remains at (24,52,268,138) with
root scroll (0,100) through fill, Enter/type, Shift+Enter/type and canceled Enter.
All four PNGs were inspected: 7,287, 8,340, 9,249 and 9,249 bytes respectively.
The last two are byte-identical. Original left text identity and live caret
ownership are asserted; this is not evidence of painted caret/highlights.

Logs, capture script, JSON and PNGs use the `editable-paragraphs-integration`
prefix in `node_modules/.cache/native-validation`. The original worker patch and
`/tmp/editable-paragraphs-integration.md` retain their own baseline and results.

## Remaining gates

`EDITABLE-CARET-BREAKS.md` supplies the bounded same-source terminal plaintext
Enter caret. Empty rich paragraphs and broader affinity remain unsupported; this
does not reclassify the original paragraph captures as painted-caret evidence.

`EDITABLE-CARET.md` adds shared glyph-edge painting after fill/type and rich
paragraph edits. Its new native evidence does not convert these older text-only
captures into painted-caret validation. Empty paragraphs and terminal break-only
caret mapping remain separate gates.

`EDITABLE-BLOCK-MERGE.md` now supplies bounded adjacent paragraph merging and fresh
integration evidence. Lists, tables, arbitrary
nested block splitting, multi-block replacements, IME/composition, clipboard,
undo, grapheme/bidi movement and complete browser editing heuristics remain open.
Empty paragraphs do not receive synthetic placeholder br elements; terminal
line breaks do not emulate browser-specific double-br placeholders. Root
boundaries among existing blocks and unsupported structures reject explicitly.
Native fixtures and PNGs do not close released-SafeJS, live-site, socket,
real TTY/PTY or full playground acceptance. No such probe ran.
