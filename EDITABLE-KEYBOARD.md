# Native editable keyboard and shared selection

September 4, 2026. Contenteditable typing, deletion and logical selection now use
the same live DOM Range/Selection owner published by document/Window bindings.
This extends editable fill and focus; it does not implement complete browser
editing, paragraph insertion, visual caret layout or released-runtime acceptance.

## Editing behavior

Printable type/press defaults, Backspace/Delete, ArrowLeft/Right, Home/End,
Shift extension and Ctrl/Meta+A work in supported editors. Existing input/textarea,
select/range, held-key and activation behavior remains separate. DOM editing
does not manufacture a form-control value, dirty state or change event.

The first operation initializes a genuinely absent selection at the editing
host's end. A foreign, detached, protected or invalid existing selection rejects
instead of being silently relocated. Fill places the shared caret at the actual
filled target's end before input dispatch; filling an editable child then typing
preserves its siblings rather than appending at the outer host's end.

Insertion uses interval-aware text replacement and collapses the selected Range
after inserted text. Expanded-range replacement preserves unaffected wrappers
and node identities through existing Range operations. Collapsed deletion steps
one Unicode code point; explicit br is a hard newline. Cross-block paragraph
merging remains unsupported. Home/End use hard newlines and HTML block boundaries,
not soft-wrapped visual lines. These are logical, not bidi/grapheme caret moves.

Keydown/keypress cancellation suppresses defaults. Editing-root beforeinput is
cancelable; successful input follows mutation and is not cancelable. Insertions
use insertText/data; deletions use the directional deletion inputType and null
data. Boundaries that cannot delete emit no fake mutation event. Selection changes
in key handlers are used; intervening beforeinput selection/content/focus changes
are revalidated before a default write. Listener-authored effects are not rolled
back. Abort and later focus round trips stop remaining characters and release
only keys owned by the current operation.

Native editable traversal is bounded to 4,096 nodes, depth 256 and 65,536 text
code units, in addition to existing document and typing budgets. Protected
controls/false islands, hidden/inert subtrees, detached/auxiliary documents and
boundaries splitting a local surrogate pair fail explicitly.

## Integration evidence

The worker supplies 66 tests. Parent adds three cross-feature regressions:
multi-character typing after an explicit false focusVisible override, and input/
keyup focus round trips which retain the first edit but stop later characters.
The old Space-must-throw fixture now asserts actual insertion while retaining its
unchanged viewport invariant. Both focused runs pass 484 / fifteen files.
Typecheck/build, strict changed-test checks, seven-file formatting and four-new-
file scoped Biome pass. Authorized full native runs pass 9,951 / 288 isolated
files. Working validation reports 11,096 passes and the unchanged pending Window-
onload assertion failure / 310 files; that source still matches its old backup.
The same 22 preexisting uncommitted test files remain absent from the HEAD archive,
not removed from the explicit allowlist for this checkpoint.

Four fresh isolated command-path PNGs were visually inspected. Fill creates
literal indented multiline content; Shift+Home plus type replaces the selected
hard line, canceled typing changes neither text nor PNG bytes, and Backspace
removes the final exclamation mark. All preserve text node identity 10, editor
bounds (32,72,240,110) and a 320-by-240 viewport. Collapsed DOM offsets are
27 / 30 / 30 / 29, and PNG sizes are 6,848 / 7,085 / 7,085 / 7,003 bytes.
These show text pixels and native selection state, not painted caret/highlights.
Evidence uses the editable-keyboard-integration prefix in the native-validation
cache. The worker's original patch and /tmp/editable-keyboard-integration.md
retain their original narrower results and obsolete-Space integration caveat.

## Remaining gates

`EDITABLE-CARET.md` now supplies bounded glyph-edge painting through the same
selected Range. Its new captures are separate from the original text-only ones.
Terminal/empty carets, highlights and full visual keyboard movement remain open.

Enter/Shift+Enter now supports the bounded subset in `EDITABLE-PARAGRAPHS.md`;
that document records fresh integration evidence without replacing these results.
Bounded paragraph merging is now covered by `EDITABLE-BLOCK-MERGE.md`.
Composition/IME, clipboard, undo, full editing heuristics,
grapheme/bidi/visual movement, selection events, target ranges, caret/highlight
painting and native control/DOM selection unification remain incomplete.
Native host-object and command fixtures are not real SafeJS, live-site, socket or
TTY/PTY evidence. No gated probe ran; original browser acceptance remains open.
