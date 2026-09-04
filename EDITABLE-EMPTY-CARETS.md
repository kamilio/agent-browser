# Empty editable block carets

September 4, 2026 native continuation of `EDITABLE-PARAGRAPH-CARETS.md`.
An empty focused editor, or an eligible empty direct paragraph, now has a visible
caret after native fill, deletion and paragraph insertion. This paints editing UI;
it does not add placeholder DOM, source glyphs, a layout line or public Range
rectangles, and it is not complete browser editing compatibility.

## Geometry and ownership

The supported container is a focused block editing host or its direct `p`/`div`
child with inherited editability, block display, static positioning and no float.
It has no children, or exactly one empty text child. Its outer slots and the sole
empty text node's zero offset are supported. A host outer slot can also resolve to
the immediately adjacent eligible empty paragraph; no intervening sibling is
skipped. Interior slots, inline wrappers, comments and breaks are not reinterpreted.

The mapper checks live focus/editability, inertness and visibility, then requires
one corresponding placed block and an empty inline context in the supplied shared
layout. Stale layout revisions are refused. Its anchor uses that block's actual
content origin and width, the zero-advance text alignment, and the engine's existing
font height and half-leading. Zero-size fonts do not produce a caret. Fixed and
relative positioning use the existing placed/projected boxes, not guessed DOM
coordinates or a second independent layout.

`text-font.ts` extracts the exact existing text-layout metric function and its
five-field interface. Existing text layout imports it under its previous local
name; arithmetic, errors, limits, mutable result behavior and validation are
unchanged. The caret consumes the same function instead of copying font math.
The worker's four complete before/after text-layout outputs are byte-identical,
including source-break metadata, glyphs, fragments and work metrics.

The capability profile is
`focused-editable-collapsed-glyph-edge-or-empty-block-strut`; `emptyEditors` is true
with explicit `emptyBlocks` scope. Public collapsed element geometry remains empty.
No extra persistent Range, observer or highlight cache is introduced. Native
typing, cancellation, deletion and merging continue to own selection mutations.

## Paint integration

The empty caret paints immediately after its own eligible box in the existing
shared content/stacking order. Its own opaque background cannot hide it; later
positioned content can cover it. There is no final topmost overlay. The existing
glyph caret and the new box caret use one common bounded rectangle painter, with
the same source text color, transparency handling, clipping and pixel/work caps.

Natural empty-block layout height is unchanged. This does not create intrinsic
blank paragraph spacing or enlarge an otherwise zero-height pointer target.
Those layout/input questions, placeholder-break semantics and complete visual
editing still require further work. Current author-supplied height/min-height and
normal native typing continue to determine the actual box and content geometry.

## Primary-source design check

The source review is recorded in
`node_modules/.cache/native-validation/empty-caret-design-2026-09-04.md`.
These sources were fetched on September 4, 2026, before implementation:

- CSS2 section 9.4.2, `https://www.w3.org/TR/CSS2/visuren.html#inline-formatting`,
  distinguishes an otherwise empty line from a layout-height-producing line.
  This change therefore does not manufacture text content or a real line box.
- CSS2 section 10.8.1, `https://www.w3.org/TR/CSS2/visudet.html#leading`, describes
  the font/leading strut used to reason about inline metrics. The implementation
  reuses this engine's already-tested font arithmetic.
- CSS UI 4 editor's draft, `https://drafts.csswg.org/css-ui/#caret-shape`, leaves
  parts of caret stacking unspecified but disallows hiding it behind its own
  background. The precise strut coordinate and existing box-order placement here
  are native UI policy, not a newly measured browser-interoperability result.
- `https://www.w3.org/TR/content-editable/` is the April 22, 2025 Discontinued
  Draft, not a current normative implementation target. Its abandoned extra
  editing states are not introduced by this work.

## Native validation

Three newly registered files add 88 cases: 44 module geometry/paint/ownership
cases, 29 shared-font cases and fifteen actual BrowserCommandHost cases with a
fully injected in-memory transport. Both final focused suites pass 833 tests /
twenty-six files. Both project type checks and explicit `--outDir dist` builds
pass, as do strict checks for seven changed test files and Biome for ten files.
The modified raster file's formatting check passes, but its ordinary Biome check
retains one separately reproduced pre-existing `noParameterAssign` lint error at the
existing fixed-layout projection. It is not fixed, suppressed or reported green.

The parent initial baseline has nine expected missing-caret failures. The first
expanded old/new suite passes 249 with five failures: earlier assertions explicitly
expected empty carets to be unsupported. Those cases now check the new empty
strut behavior without removing cases; neighboring unsupported boundaries remain
negative tests. The corrected seven-file run passes all 254 cases. Initial new
fixture formatting was corrected before final validation.

The host worker preserves its initial fixture errors and corrected baseline of
eleven missing-caret failures/four passes. The unchanged corrected fixture then
passes all fifteen with real supplied production files; no simulated renderer or
font stub is used. Its prepared-capture case repeats 4,100 paints while retaining
any created Ranges strongly, then verifies native Range capacity remains usable.
Parent module tests also verify no temporary Range is requested for empty carets.

The shared-font lane passes 165 / five files, with exact function/interface and
complete layout equivalence checks. Its baseline snapshot-setup and formatting
failures remain recorded. This extraction alone is not empty-caret acceptance;
the combined parent run and captures cover the integrated renderer.

## Fresh captures and boundaries

Ten actual-host phases cover empty fill, typing, Enter, canceled typing, root
scroll, further typing, select-all deletion and collapse at an empty paragraph
edge. Before/after DOM, revision-backed layout boxes/contexts/metrics, public Range
endpoints and rectangles, selection state, element bounds and scroll state match.
Seven newly visible empty-caret frames each change exactly sixteen pixels and add
sixteen raster writes, all on the independently expected strut edge. The three
existing text-caret frames remain byte-identical. No source glyph is added.

The initial capture's long heading wrapped; a separate v2 pair uses a shorter
heading for inspection, without altering production code or overwriting original
artifacts. The v2 baseline uses the retained pre-feature build whose three relevant
source files match `a8355b2`. Empty-host and empty-paragraph v2 PNGs were visually
inspected. A fresh ten-phase working-build replay is state-, layout-, paint- and
byte-identical to the isolated v2 capture. Every screenshot artifact is deleted
after export and its live artifact list verified empty.

Evidence lives under `node_modules/.cache/native-validation/` with parent prefix
`empty-caret-integration-`, captures/comparisons `empty-caret-host-*`, and worker
directories `parallel-text-font-a8355b2/` and `parallel-empty-caret-host-a8355b2/`.
The parent archive is `empty-caret-integrated.QBdj85`, based on `a8355b2`.
Earlier paragraph and element capture paths and measurements remain historical.

Both explicit manifests retain 366 entries, with 22 preexisting uncommitted files
absent from the isolated archive. Focused validation was authorized after one
approval-review timeout and one retry. The full-suite denial remains in force;
no denied route file, full run or broad filtered substitute is executed. Prior
full-suite counts remain historical. There is no new dependency, SafeJS, live
website, actual socket, real TTY/PTY or service/process probe.

General container caret affinity, nested blocks, placeholder breaks, controls,
pointer selection, IME, bidi/shaping, CSS caret styling and full editing remain
open, alongside runtime/network/playground/interface acceptance in `TASKS.md`.
