# Preserved whitespace with native wrapping

September 4, 2026. `white-space:pre-wrap` now works through the existing CSS and
native text-layout owners, rather than only passing parsing. This closes the
specific rendering gap found by the editable-fill capture; it does not establish
complete CSS Text, Unicode or external-browser compatibility.

## Behavior

Preserved spaces/tabs remain in source order across leading positions, wrapped
lines, authored breaks and all-whitespace content. Existing newline normalization
and source offsets remain intact. Soft breaks occur after whitespace runs and
around supported atomic/replaced content. Tab positions use the actual cursor
and are recomputed after wrapping; the existing fixed eight-advance stops remain.

Physical glyph/fragment advances are retained separately from line fitting and
alignment widths. Trailing preserved whitespace hangs at soft breaks and only
hangs beyond the available width at forced/final lines. Intrinsic measurement
uses its separate min/max rules. Nonzero intervening inline padding/borders stop
hanging. The final-line distinction does not fabricate TextLine.forcedBreak.
Normal, nowrap, pre and pre-line regressions remain in the explicit native suite.

The worker researched CSS Text Level 3 whitespace processing and hanging rules.
Parent reviewed that primary specification and the native implementation. No
dependency, font engine, remote browser or alternative page runtime was added.

## Native evidence

The delivery adds 44 pre-wrap tests plus one stylesheet/inheritance test. Coverage
includes a 100-case independent wrapping oracle, mixed whitespace modes, tabs,
source boundaries, CRLF, inline edges, alignment, intrinsic widths, atomic/images,
resource budgets, immutable output and a pixel-exact explicit-break reference.
Both integrated focused runs pass 390 / ten files. Typecheck, build, strict checks
of all three changed tests, five-file formatting and four-file Biome checks pass.
The existing text-layout import-order diagnostic remains; unrelated imports were
not reordered merely to claim a five-file lint pass.

Parent regenerated and visually inspected four native command-path screenshots
using actual pre-wrap, not pre-line. The literal filled text retains two spaces,
an authored newline, indentation and soft wrapping, and remains one text node.
Cancellation leaves the filled PNG byte-identical; clearing removes its content.
Every phase keeps editor bounds (32,52,240,110) in a 320-by-240 viewport. PNG sizes
are 4,996 / 8,808 / 8,808 / 4,265 bytes for before/filled/canceled/cleared.
Evidence is in `node_modules/.cache/native-validation/pre-wrap-integration-*`.
The worker's original 48-by-40 native pixel-reference capture remains separate
at `/tmp/pre-wrap-native-capture-2026-09-04.png` and was also inspected.

Authorized full combined native runs pass 9,854 / 284 isolated files; working
validation reports 10,999 passes and the unchanged pending Window-onload failure
/ 306 files. The explicit list has 306 paths; 22 preexisting uncommitted test files
are absent from the HEAD archive, not selectively removed for this validation.
The worker's original 9,778 /
278 available-file run is retained in `/tmp/pre-wrap-handoff.md`; it is not
relabelled as validation of subsequent cookie and Range integration.

## Remaining limits

Current painting continuation: `EDITABLE-CARET.md` adds bounded glyph-edge carets.
The original text-pixel oracle still compares exact pixels with both documents
unfocused, while separately asserting focused caret painting. Its historical
captures/counts remain unchanged; terminal/empty caret mapping remains separate.

Current continuation: `RANGE-GEOMETRY.md` retains exact LF/CR/CRLF/FF source-break
metadata and following-line anchors without changing existing lines or pixels.
Terminal and consecutive preserved breaks now support bounded Range queries;
ambiguous soft-wrap affinity and caret/highlight painting remain separate gates.

This remains the partial horizontal bitmap-font profile: no general Unicode
line breaking, bidi/vertical text, shaping, hyphenation or justification. `tab-size`
and `break-spaces` remain unsupported. Hanging physical fragments can extend past
TextLine.width; general overflow/scroll/capture policy was not redesigned here.
Caret/highlight painting and rich editing are separate work. No live-site,
socket, real TTY/PTY or SafeJS probe ran; original acceptance gates remain open.
