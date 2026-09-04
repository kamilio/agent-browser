# Terminal preserved-break carets

September 4, 2026. The native caret can now follow terminal plaintext Enter when
the same text node contains an unambiguous preceding glyph and an exact preserved
break chain. This extends EDITABLE-CARET.md without changing raster paint order,
text layout, Range mutation or any runtime dependency.

## Exact mapping

The ordinary glyph-edge path is unchanged. The fallback requires a collapsed
offset at the text node's end, a nonempty LF/CR/CRLF/FF suffix, and that context's
last actual glyph in the same source node ending exactly before the suffix.
Consecutive forced lines must have contiguous, single-source sourceBreak records
with matching ref/formatting identity, source units, font height and following-line
metadata. Split-node, missing, conflicting or duplicate-context evidence rejects.

Coordinates and height come from the existing Range rectangle. The proved prior
glyph supplies only the existing ordered paint position and source color. No strut
or invisible glyph is fabricated, no owner/Range is allocated, and no final overlay
is used. Later opaque content still covers the caret. Existing mapping, geometry
and pixel ceilings remain unchanged; new scans are charged to the same allowance.

Empty/all-break editors, empty rich paragraphs, break-only nodes after another
node, split-node CRLF, intermediate break offsets and ambiguous mappings remain
unsupported. This is not general caret affinity, IME, control selection or blinking.

## Integrated evidence

The worker adds 33 tests. Parent updates only the two now-superseded terminal-skip
assertions in actual-host Range/editing tests. Those cases still verify Range
identity, terminal coordinates, later typing, fixed/root projection and identical
element-crop pixels across scrolling. Both focused runs pass 177 tests / nine
files. Both project typechecks/builds, strict checks of two tests and four-file
Biome checks pass. Explicit native suites pass 10,975 tests / 325 isolated files.
Working validation reports 12,106 passes with the same fifteen pending failures
/ 347 files. The same 22 extra uncommitted working test files remain in its list;
preexisting source and assertion changes are not bundled into this feature.

Five fresh 640x280 module captures were inspected. Filled, terminal Enter, covered
Enter, consecutive Enter and typed Beta PNGs are 14,605 / 14,568 / 14,574 / 14,571
/ 14,820 bytes. Editor bounds remain (16,48,460,116). Terminal and consecutive
carets are at (26,86) and (26,110), height 16. Covered Enter issues a paint operation
but is correctly hidden by the later red box. caretWork is 200,170 / 200,178 /
200,182 / 200,181 / 200,174, separately from raster work; it includes reserved
geometry allowance, not measured elapsed time or exact internal Range work.

An independent seven-phase actual native-host showcase is regenerated before and
after the extension, including paragraph merging, upload, double-click, plaintext
typing and root scrolling. DOM, geometry, selected files, click counts and upload
reservations remain identical. Only the terminal and consecutive Enter frames
change: exactly sixteen pixels each, inside their one-pixel Range caret columns.
The other five frames are pixel-identical; canceled editing remains identical to
its preceding scrolled frame. Both new terminal frames were visually inspected.
The showcase uses injected transport and synthetic bytes, not a live site or guest
runtime.

New evidence uses caret-break-integration and browser-sprint-before/after-terminal
prefixes in node_modules/.cache/native-validation; the integrated archive is
caret-break-integrated.FBuGrJ. scripts/capture-editable-caret-break.ts reproduces
the module fixture with exclusive output. Original worker patch, 353-test scoped
result and original captures remain at /tmp/agent-browser-caret-terminal-break.YQB1vf.
Its two deliberately untouched parent expectation failures are not relabelled as
a green combined run. Prior glyph-edge captures retain their original meaning.

Selection highlighting is a separate delivered lane awaiting integration. Original
SafeJS, live-site, socket, real TTY/PTY, framework/playground and full visual-editing
gates remain open in TASKS.md. No such probe ran or dependency was added.
