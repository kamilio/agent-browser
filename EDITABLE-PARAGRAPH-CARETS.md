# Direct paragraph container carets

September 4, 2026 native continuation of `EDITABLE-ELEMENT-ENDPOINTS.md`.
Actual select-all, ArrowLeft and Enter can leave a collapsed container endpoint
at the start of a newly split, nonempty paragraph. That text edge now paints a
caret without changing the public Range or keyboard mutation behavior.

## Exact profile

The focused editable block host's first/last child slot may pass through one
immediately adjacent direct child `p` or `div` paragraph, followed by the existing
exact first/last plain-inline-text chain. The same paragraph's own first/last
container slot can map to that source edge. The paragraph must inherit editability,
be `display:block`, statically positioned and nonfloating.

Paragraph margins, padding and borders are allowed because the private temporary
text Range supplies actual source geometry; paragraph-box edges and guessed line
heights do not determine the caret. Intervening inline wrappers retain the existing
static/nonfloating and zero margin/padding/no-border restrictions. There is no
search past an empty, protected, hidden, comment, break or unsupported edge.

The capability is
`focused-block-host-or-direct-paragraph-outer-plain-inline-text-chain`. Existing
source eligibility, exact glyph-edge matching, shared geometry, source color,
clipping, paint order and resource caps are unchanged. Mapping adds no persistent
cache or observer. Scoped temporary Ranges are unregistered on success and failure.
The production change is confined to the container mapper and capability string;
the public collapsed element Range still has no client rectangles.

## Native command behavior

`fill`, Control+A, ArrowLeft and Enter produce an empty left paragraph and a
nonempty right paragraph. The right paragraph's slot-zero caret now remains
visible. Canceled paragraph insertion preserves its public identity and pixels;
subsequent typing remains ordinary native editing. Repeating start splits keeps
the surviving text aligned with the same source geometry.

Meta+A followed by ArrowLeft/Right also paints host outer-edge carets through
direct `p` and `div` paragraphs, including nested plain inline text. Tests cover
paragraph box decoration and root scrolling. Empty paragraphs still have no
invented caret geometry: entering an empty paragraph remains unsupported until
typing adds eligible source text. That limitation is tested, not silently widened.

## Validation and evidence

Two new explicit native test files add 60 cases: 52 module cases and eight actual
BrowserCommandHost cases using an injected in-memory transport. The initial parent
integration passes all 60. Both final focused suites pass 609 tests across nineteen
files, including caret/selection geometry, paragraph insertion, block merging,
keyboard editing and Range lifetime regressions. Both project type checks and
explicit `--outDir dist` builds pass; strict checking of both new test files and
three-file Biome also pass.

The corrected parent baseline has seven expected absent-caret failures and one
pass for unsupported empty-paragraph behavior followed by typing. Its initial
fixture incorrectly used a nonexistent focus command and `scrollTo` method;
those fixture errors and the corrected baseline have distinct retained logs.
The native focus owner supplies setup for the host-collapse cases, whose select-all
and arrow operations run through the real command host. One parent formatting
finding was corrected before final validation.

The worker baseline has six expected failures. Its first expanded run passes 219
cases with one fixture failure: float layout rejects before caret preparation.
The corrected negative fixture checks the preparer directly and confirms geometry
is not requested; it does not claim supported floating layout. The final worker
suite passes 220 / six files. Retained private-Range geometry failures repeat
4,100 times per failure kind without exhausting live-Range capacity.

Evidence remains under `node_modules/.cache/native-validation/`: worker delivery
`parallel-paragraph-caret-d084441/`, parent prefix `paragraph-caret-integration-`,
and fresh captures/comparisons `paragraph-caret-host-*`. The parent archive is
`paragraph-caret-integrated.yV6hWy`, based on `d084441`. Historical element-caret
captures and their measurements are not overwritten or relabeled.

## Fresh visual comparison

Nine actual-host phases preserve DOM serialization, public Range endpoints and
rectangles, independently obtained source-edge geometry, selection direction,
element bounds and scroll state exactly between before and after runs. Split,
canceled and repeated-split frames each change two pixels; right-edge and scrolled
frames each change sixteen. Every changed pixel lies on the expected one-pixel
source caret edge, with sixteen added raster writes per changed frame. Existing
glyph ink already covers most of the left caret edge.

The other four frames are byte-identical, including the unsupported empty-start
case and subsequent native replacement. Split and canceled frames match exactly.
Key split and right-edge PNGs were visually inspected. A separate nine-phase
working-build replay is state-, paint- and byte-identical to the isolated capture.
Each screenshot artifact is deleted after export and the live artifact list is
verified empty. Work counters include geometry reservations, not elapsed-time
measurements or proof of complete layout conformance.

## Open boundaries

Both manifests contain the same 363 entries; 22 preexisting uncommitted test files
are absent from the archive, not removed from the list. The nineteen-file scoped
validation received approval after one review timeout and one retry. The previous
full-manifest denial remains in force: no denied route test, full run or broad
filtered substitute is attempted. Prior full-suite counts remain historical.

Interior slots, arbitrary descendant inline endpoints, nested/non-p-div blocks,
non-block hosts, paragraphs declaring their own editing mode, empty/break-only
paragraphs, positioned/floating paragraphs, ambiguous whitespace and unsupported
shaping remain outside this profile. Public element caret geometry, controls,
pointer selection, IME, CSS caret styling and full visual editing remain open.
There is no new dependency, SafeJS, live-site, real-socket, TTY/PTY or service-process
probe. The original browser, playground and interface acceptance gates remain in
`TASKS.md` and `COMPATIBILITY.md`.
