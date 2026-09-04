# Bounded native editable caret

September 4, 2026. Native captures can paint a nonblinking caret at a determinate
glyph edge of the focused contenteditable root. It consumes the existing shared
Range/Selection; rendering does not initialize selection or register a new owner.
This is not full visual editing, control selection or released-runtime acceptance.

## Shared state and paint order

existingDomRangeOwner is a noncreating registry lookup. A candidate requires an
existing open owner, a collapsed selection, connected text inside the actually
focused editable root, and no hidden/inert/protected island. Native input and
textarea carets remain separate. Range geometry must return a single positive
height, zero-width rectangle matching a current glyph edge. Prepared raster
layouts read current selection, including selection-only changes without a DOM
revision. No Range, timer, persistent layout cache or synthetic glyph is created.

The caret uses source text color and is one CSS pixel wide. It is painted after
its matched glyph in the existing ordered content stream, not as an end-of-frame
overlay. Later opaque content can cover it. Fixed/root scrolling and viewport,
explicit and element crops retain the native coordinate conventions. Transparent
text color stays transparent. A paint metric records the operation, not visibility
after later occlusion.

Metrics expose paintedCarets, clippedCarets, skippedCarets, caretStatus and
caretWork. Mapping has an independent 250,000-work ceiling, at most 200,000 reserved
for Range geometry, depth 256 and 512 caret pixels. The requested raster maxWork
also caps this allowance. caretWork conservatively charges the reserved geometry
budget, not measured time or actual Range work. Painted pixels additionally consume
the existing raster work budget. Unsupported/limited mapping skips the adornment;
it does not hide an otherwise renderable document behind a geometry failure.

## Integration evidence

The worker adds 34 native caret/accessor tests. Parent extends three actual-host
Range/editing cases: fill/type and paragraph merge paint a caret; fixed element
crop pixels stay identical across root scroll; terminal plaintext Enter has valid
Range geometry but still explicitly skips painting until a following glyph exists.
The old pre-wrap reference oracle now compares both documents unfocused, retaining
exact text-pixel equality and separately asserting the new focused caret. This
fixes the one newly exposed test mismatch rather than discarding its oracle.

Both focused runs pass 144 tests across eight files. Working/isolated project
typechecks and builds, strict checks of three changed tests, six-file Biome checks
and raster formatting pass. The raster's existing fixed-projection parameter
assignment lint diagnostic is unchanged; a whole-file lint pass is not claimed.
Final explicit native suites pass 10,934 tests / 322 isolated files. Working
validation reports 12,065 passes and the same fifteen pending failures / 344
files. The unchanged 22 extra uncommitted working test files remain in its manifest.
Initial runs with the newly exposed pre-wrap oracle mismatch are preserved; final
logs use the native-final suffix. Preexisting work remains unbundled.

Six fresh 640x220 module captures were inspected: before, filled, typed, covered,
noncollapsed and blurred. PNG sizes are 13,356 / 13,416 / 13,500 / 13,596 / 13,441
/ 13,441 bytes; editor bounds remain (16,48,460,44). The opaque cover hides the
caret despite paintedCarets=1. Noncollapsed/blurred pixels are identical. Filled,
typed and covered caretWork is 200,167 / 200,168 / 200,170, separately from raster
work 425,782 / 425,948 / 426,516. Original worker captures/measurements remain intact.

A separate five-phase, 656x420 actual native-host showcase combines rich paragraph
split/merge, plaintext pre-wrap, file upload, double-click events, fixed/root scroll,
Range geometry and canceled editing. It runs independently before/after this
integration. DOM, geometry, selected files, click counts and upload reservations
are identical. Changed pixels are exactly 0 / 2 / 16 / 16 / 16 for before/rich/
ready/scrolled/canceled, all inside the one-pixel caret rectangles. Scrolled and
canceled frames remain identical; ready/scrolled before-and-after pairs were
visually inspected. This uses injected transport and synthetic upload bytes, not
guest scripts, private CLI files, sockets or a live page.

Logs/captures are under node_modules/.cache/native-validation with prefixes
editable-caret-integration and browser-sprint. scripts/capture-editable-caret.ts
reproduces the module fixture into a new exclusive output directory. The integrated
archive is editable-caret-integrated.9vKajh. Original worker evidence remains in
/tmp/agent-browser-editable-caret-f1d7b43.jsdpZJ, including its preserved initial
blocker, prerequisite patch and later 534-test focused result at that older base.

## Remaining gates

Empty editors/rich paragraphs, terminal break-only anchors without a paint glyph,
element-gap selections, ambiguous soft-wrap affinity, split-surrogate positions,
shaping/bidi, selection highlights, blinking, IME and CSS caret-color are not
implemented by this checkpoint. A bounded terminal-break follow-up is active,
not already proven. Skips are explicit, never guessed caret coordinates.
Native commands/captures do not close original SafeJS, live-site, socket, real
TTY/PTY, framework/playground or broader browser-compatibility gates. No dependency
or gated probe was added. TASKS.md retains the browser outcome and open gates.
