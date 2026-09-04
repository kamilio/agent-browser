# Bounded native paragraph merging

September 4, 2026 integration on `809b160`, extending `EDITABLE-PARAGRAPHS.md`.
Collapsed Backspace/Delete can now join immediately adjacent direct p/div siblings
within the same rich editing scope. This is not a complete browser editing model.

## Behavior and guards

The left block survives with its attributes and original inline children. Right
children move intact; the emptied right block detaches. Shared Selection and its
Range retain identity, with the caret at the former end of the left block so
subsequent typing occurs at the join. Independent ranges use existing move/removal
semantics. No new document node or Range is allocated by the merge default.

Logical boundaries account for empty inline wrappers. A sole unattributed br in
otherwise empty supported inline content may be removed as a placeholder; real,
attributed or multiple breaks remain. No new placeholder or structural undo is
invented. Root whitespace/comments are not skipped to find another paragraph.
Plaintext LF and native input/textarea deletion keep their original paths.

The existing keyboard/beforeinput/input pipeline guards focus generation, scope,
subtree identity, selection identity/endpoints and browser-event reentrancy. Both
affected subtrees are checked again before mutation, including stylesheet-driven
visibility. A right block containing the focused node cannot be removed. Canceling
beforeinput leaves the merge unapplied; abort after mutation does not roll it back.
The helper bounds combined scans to 4,096 nodes and 256 relative depth, alongside
the existing editing text/resource limits. This is not transactional rollback for
arbitrary synchronous native mutation collectors.

## Integration evidence

Both focused suites pass **246 tests across seven files**, including the worker's
90 new merge cases. Types/builds, strict checks for five affected test files and
seven-file Biome checks pass. Two obsolete tracked merge-must-throw assertions
now assert real merge structure. Parent also extends the fixed-editor integration
through Home, Backspace and typing, preserving the original left text identity,
viewport geometry and root scroll.

Final authorized explicit native suites pass **10,838 tests across 317 isolated
files**. Working validation reports **11,969 passes and the same fifteen pending
assertion failures across 339 files**. Preexisting positioning/capability/onload
expectations and the twenty-two extra uncommitted working test files remain
unbundled, not silently removed from validation.

Four fresh actual native host captures were inspected: split, canceled merge,
merged and typing at the join. The viewport is 400x220, fixed editor rectangle
(24,52,338,118), root scroll (0,120). PNG sizes are 7,118 / 7,118 / 7,247 / 7,730
bytes. Split/canceled pixels are identical. Captured DOM and Range checks preserve
both original text nodes and the selected Range; typing yields Left joined Right.
These are native commands with injected transport, not page-runtime execution or
painted caret evidence. Logs/script/JSON/PNGs use the
`editable-block-merge-integration` prefix in the native-validation cache.

The original worker patch, `/tmp/editable-block-merge-integration.md` and reports
retain their own prerequisite and two then-obsolete failures. They are not rewritten
as the new integrated run.

## Open gates

`EDITABLE-CARET.md` now verifies glyph-edge painting at the preserved merge join
through native host commands. Its new combined captures are separate from this
checkpoint's original text-only images. Full visual editing remains incomplete.

Complex/list/table blocks, multi-block selected replacements, cross-scope editing,
block-style transfer, formatting normalization, undo, clipboard, composition/IME,
grapheme/bidi behavior and full visual editing remain incomplete. Native host
fixtures do not close released-SafeJS, live-site, socket, real TTY/PTY or full
playground/framework acceptance. No such probe ran or dependency was added.
