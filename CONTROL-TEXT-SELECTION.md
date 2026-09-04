# Native control text selection and scrolling

Later September 4 continuation: `CONTROL-POINTER-CARETS.md` adds bounded collapsed
placement from actual primary mouse points using this same geometry and owner.
Its new tests/captures are separate from the measurements retained below. Drag,
Shift-extension, persistent widget scrolling and full selection APIs remain open.

September 4, 2026 continuation from `2690e14`. This is native software-control
rendering, not a new page runtime or a standards-complete text selection API.
Existing historical control-rendering reports remain unchanged.

## Ownership and rendering

`src/native-control-caret.ts` holds the keyboard's one authoritative control
selection record. `src/keyboard.ts` no longer maintains a second private caret.
The document-keyed weak registry exposes a noncreating, frozen numeric snapshot:
`anchor`, `focus`, `start`, `end`, `valueLength`. No raw value is exposed by that
reader. The sole private relevant-value snapshot supports the existing editing
and beforeinput checks; no per-control map or value history is added.

Changed selection extent or direction invalidates presentation, including
select-all and arrow-only movement. Identical publication does not invalidate.
The owner checks lifetime, record identity, value, focus and relevant notification
generation across callbacks and value writes. Newer reentrant state is not
overwritten. Removal drops the record; inactive, stale or closed reads return no
snapshot. Close unregisters listeners and abandons state before notification;
closed ownership cannot be resurrected in the same document. Committed DOM writes
are not rolled back when a later callback invalidates an editing operation.

`src/control-rendering.ts` reads numeric selection only for a focused, connected,
non-disabled, non-inert textarea or input text/search/url/tel/password. Readonly
controls can display selection. Email/number appearance and fill remain as before;
this does not extend their native keyboard editing support. Absent/stale owned
state gets a numeric end-caret derived from the current value length, without
creating or resetting keyboard ownership. Blur returns to the initial viewport.

Password descriptors retain the existing one-star-per-UTF-16-unit mask. Raw
passwords do not enter control descriptors, control text layout or raster
metadata. Placeholder display text has logical value length zero, is never
highlighted, and keeps the focused value caret at the start.

`src/control-text-layout.ts` computes immutable, bounded texture geometry. It
uses the existing bitmap advance, x=6/y=4 padding and existing textarea row
spacing/character wrapping. Selection paints cell backgrounds before glyph ink;
collapsed selection paints a one-pixel source-colored caret, not a highlight.
The texture renderer clips ink back to the text viewport and restores padding
and frame, including translucent backgrounds. Tiny textareas no longer paint
caption pixels across their frame. Buttons, file captions, selects, checkboxes
and radios retain their separate rendering paths.

Input scrolling minimally reveals the focus edge horizontally. Textarea scrolling
reveals the focused row in whole row increments. Geometry is already scroll-
adjusted; no DOM scroll state, document glyph, fake Range or layout line is added.
Soft-wrap positions use following-line affinity. A full-row hard LF does not
create a spurious extra row; a caret before it fits inside the right edge.

Control texture detail deliberately does not increment editable-document
`paintedCarets`, `paintedSelectionGlyphs` or document glyph counts. Numeric control
descriptors and pixel assertions are the relevant evidence. Existing paint work
accounting remains a bounded budget, not measured CPU time or resident memory.

## Bounds and compatibility

Layout validates text up to 4096 UTF-16 units, finite font size 0..512, integer
texture axes 1..4096 and at most 1,048,576 pixels before geometry allocation.
Selection offsets must be safe, consistent and at code-point boundaries in the
display string; password offsets operate on the already masked string. Text must
have normalized line endings. Visible unsupported bitmap glyphs still reject;
hidden unsupported glyphs are not painted. A viewport too small for one advance-
wide, font-high row produces no text/selection/caret. Geometry and raster loops
are bounded by these existing text/texture limits; there is no new dependency.

Research: WHATWG HTML section 4.10.20, read September 4, 2026:
`https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#textFieldSelection`.
The standard measures text-control selection in relevant-value code units and
uses textarea API values; its initial cursor is at the beginning. This change
explicitly preserves the tested native keyboard initial/stale collapse-to-end
policy instead. Full public selectionStart/End/direction, setSelectionRange,
setRangeText, event semantics and per-control lifetime remain outstanding.

## Validation

Four new explicit native test files add 143 cases: 43 ownership, 68 geometry,
17 renderer/safety and 15 actual-command cases. The original nine visual
regressions all fail before the implementation. The independent command lane
records 13 failures and two passes against original `2690e14` production, then
15 passes with the real integrated modules. Intermediate failures are retained.

Final focused suites pass **781 tests / 21 files in both the isolated and working
trees**. Project no-emit types and explicit `--outDir dist` builds pass in both;
strict compilation of all four new tests and Biome on the four changed production
modules plus four new tests pass. `native-tests.json` has 370 unique entries in
both trees; the same 22 pre-existing pending files are absent from the archive.

Evidence lives under `node_modules/.cache/native-validation/`:

- `control-text-integration-visual-baseline.log`: original nine failures.
- `control-text-integration-first.log`: first 157 / four-file integration pass.
- `control-text-integration-authorized-*.log`: initial 780-case combined checks.
- `control-text-integration-final-v2-*.log`: final 781-case focused/static/build checks.
- `parallel-native-control-caret-2690e14/delivery/README.md`: ownership lane,
  preserved reentrancy/lifecycle failures, source hashes and final checks.
- `parallel-control-text-layout-2690e14/REPORT.md`: geometry lane, preserved
  subnormal-font clipping regression and final checks.
- `parallel-control-text-command-2690e14/FINAL.md`: independent command lane,
  original 13 failures / two passes and final 15 passes.

The initial combined wrapper hit sandbox `spawnSync` EPERM and is retained as
`control-text-integration-final-focused-isolated.log`, not counted as a pass.
After an approval timeout, the one allowed retry authorized the exact 21-file
list and scoped checks; all processes and populated test summaries succeeded.
No full manifest or broad replacement suite ran. SafeJS, real network/socket,
live website, TTY/PTY, GUI and service-process gates remain separately unclaimed.

## Fresh native captures

`control-text-host-capture.mjs` drives actual BrowserCommandHost commands with an
injected in-memory transport and no page runtime. Exact `2690e14` archive baseline,
isolated integrated build and working build each produce twelve phases:
empty hint, input end, select-all, canceled replacement, replacement, long end,
long home, repeated end, textarea end/start, password reverse selection and blur.
The three independent runs use exclusive output files and delete each screenshot
artifact after export, asserting the artifact list is empty.

`control-text-host-before.json`, `control-text-host-after.json` and
`control-text-host-working.json` retain original fixtures, paths, hashes, state,
geometry and paint data. `control-text-host-comparison.json` and
`control-text-host-comparison-final.log` prove identical values, serialized DOM,
control bounds, document scroll and placed boxes before/after. Every changed
pixel stays inside a control text clip. All twelve working-build PNGs match the
isolated outputs byte-for-byte, including numeric descriptors and paint metrics.
Canceled replacement and repeated End are pixel-identical to their corresponding
earlier states; Home and textarea start visibly change the viewport. Select-all,
textarea end and masked reverse-selection captures were visually inspected.

Changed pixel counts are respectively 16, 16, 1732, 1732, 16, 1332, 40, 1332,
1380, 258, 688 and 244. The blurred phase includes newly visible partial right-
edge input glyphs and the clipped bottom textarea row: the old renderer dropped
those entire cells. The initial comparison incorrectly expected zero blurred
changes; `control-text-host-comparison-initial.mjs` and the original failed log
are preserved. The corrected check proves all 244 changes are confined to those
partial-cell strips, rather than relaxing the clip/geometry/state assertions.
A dedicated seventeenth renderer test verifies partial-row ink and clean padding.

Document glyph, editable-caret and paint-budget metrics remain identical across
the baseline and updated captures. They do not count native control texture
selection detail and are not offered as a rendering-speed or memory measurement.

## Remaining work

This is a partial native control visual profile. It does not implement pointer
caret placement/drag selection, persistent/manual internal scrolling, IME, bidi,
platform fonts/appearance, complete selection APIs or full native-widget parity.
The browser/runtime/live gates in `TASKS.md` remain open. The unchanged existing
document-raster parameter-assignment lint failure is not claimed fixed here.
