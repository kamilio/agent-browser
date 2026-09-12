# Native block-content alignment

## Outcome

Ordinary non-scroll block and inline-block containers can align their existing
real descendants in the block axis. The container retains its physical border
and content-box origins; child boxes, text, inline atoms and physical floats
move together. Non-normal alignment establishes an independent formatting
context. This is shared layout infrastructure, not completed HTML button support.

Supported native mapping: normal remains unchanged; start/flex-start/stretch/
space-between use start; end/flex-end use end; center uses center. Distribution
values use their fallback position, not distributed block spacing. Space-around
and space-evenly use safe center. Positional safe/unsafe are retained; default
non-scroll overflow is safe. Unsupported baseline modes remain explicit.

## Implementation

Formatting nodes retain immutable normalized alignment. The existing independent
flow's measured naturalContentHeight is the native subject extent. After final
height resolution, document layout derives a bounded offset from used minus
natural height. Safe overflow falls back to start; explicit unsafe can move
contents before the physical origin. Auto-height content normally has no free
space. Existing min/max sizing and margin/float measurement are reused.

The final coordinate pass composes ancestor offsets once, keeping owning box
origins physical. Text contexts, lines, glyphs and inline fragments share that
translation. The physical float merge applies the owning context's offset once.
No second DOM, caption flattening, alternate renderer or full relayout is added.

Outside markers with an actual line retain their existing baseline placement.
The no-line fallback follows the owner's content offset. This extends native
marker policy, not a CSS requirement to center the glyph. Marker ink does not
enter natural height or synthesize a line; an empty end-aligned marker can extend
beyond the principal content box. Historical marker source limitations stay.

Non-replaced broken-image text alternatives remain real ordinary content and
can align. Replaced images still ignore this ordinary-block property. Table-cell
non-normal alignment stays guarded, rather than silently acquiring block rules.

## Validation boundaries

All implementation probes use copied native source, explicit native-tests.json
selections, kernel socket/socketpair denial, private HOME/TMPDIR and the existing
compiler/formatter/runner. No live requests, credentials, device/TTY or SafeJS
execution belong to this gate. Measured lanes and inventories appear below.

New cases comprise72 pure normalization/offset checks, four canonical geometry/
hit/paint cases,50 broader layout cases,19 limits/recovery/guard cases and eight
no-line marker cases:153 new cases. Another28 pre-existing inline-atomic cases
are newly selected by this broader gate, not newly authored. The three obsolete
tracked guard scenarios become positive content/geometry/intrinsic/paint checks
without increasing their per-file counts or changing the old fixtures.

Limits remain: HTML button conversion/theme/fit-content/baseline/state is pending;
non-visible overflow, unsupported writing modes, block baseline-sharing and
table-cell alignment remain guarded. The native subject-extent choice does not
establish full CSS conformance. Untracked css-flex.test.ts and inline-block.test.ts
contain older expectations outside the clean release; they are preserved, not
represented as passing integration coverage. The similarly untracked relative-
positioning suite was not copied into this owned snapshot.

The unfinished rich-button fixture and its manifest entry, two other pre-existing
manifest additions,927 pre-existing TASKS lines and unrelated dirty source stay
outside this commit. There is no website success, speedup, provider/passkey or
challenge-solving claim. The overall objective and acceptance gates remain open.

## Source basis

BUTTON-BLOCK-ALIGNMENT-SOURCE.md records the native cached W3C sections5.1/5.1.1
extraction, captured September11 and parsed September12,2026. It establishes the
independent-context, collective alignment and default-safe rules in that source;
it is not a claim to the latest remote revision or every geometry detail.
BUTTON-LAYOUT-SOURCE.md keeps the separate real HTML button requirements.
OUTSIDE-BLOCK-MARKERS.md and LIST-MARKER-SOURCE.md retain the historical
underdefined-placement qualification. Their original paths/results are unchanged.

## Measured validation

All times September12,2026 UTC. Failed lanes remain at their original paths.

| Lane | Time | Result |
| --- | --- | --- |
| Original13588 canonical baseline | 2026-09-12T14:51:51.419Z–2026-09-12T14:51:52.715Z | 0 passed, 4 failed |
| Initial focused fixed00 | 2026-09-12T14:55:55.499Z–2026-09-12T14:55:58.733Z | 196 passed, 0 failed |
| Marker regression fixed02 | 2026-09-12T14:59:33.897Z–2026-09-12T14:59:39.103Z | 344 passed, 4 failed |
| Focused fixed03 | 2026-09-12T15:01:26.223Z–2026-09-12T15:01:32.197Z | 417 passed, 0 failed |
| Broader round00 | 2026-09-12T15:04:28.415Z–2026-09-12T15:07:25.033Z | 13766 passed, three obsolete guard expectations failed, two excluded |
| Legacy integration fixed04 | 2026-09-12T15:10:53.170Z–2026-09-12T15:11:03.338Z | 665 passed, 1 failed |
| Final focused fixed05 | 2026-09-12T15:12:02.162Z–2026-09-12T15:12:12.194Z | 666 passed, 0 failed |
| Broader round01 | 2026-09-12T15:12:20.251Z–2026-09-12T15:15:16.493Z | 13769 passed, zero failed, two unchanged exclusions |

The original four canonical tests remain byte-identical in the passing release.
The marker failures precede the no-line anchor fix. fixed01 stopped during
preparation on a missing untracked test, before any native execution. fixed04
revealed an overstrict new test expectation: the flex shell's existing deferred
formatting diagnostic remains until its coordinator resolves it. Only that
expectation changes; the real intrinsic and resolved-size checks remain.

Build, strict checking of265 roots and formatting of13owned
source/test paths pass. The full gate selects266 suites from
a clean657-entry manifest, not all manifest entries. The
13588-to13769 increase is153new cases plus28previously existing selected cases.
The original two exclusions remain: {"suite":"/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-block-content-alignment-september12-round01/snapshot01/src/focus-provisioning-pressure.test.ts","name":"exposes the separate total host-object ceiling without claiming full-pool runtime capacity","status":"skipped"}; {"suite":"/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-block-content-alignment-september12-round01/snapshot01/src/media-fallback-layout.test.ts","name":"does not admit a real 'unsupported display' alongside advisory media","status":"skipped"}.

## Evidence

Private work: node_modules/.cache/native-validation/block-content-alignment-work-september12.
Passing gate: node_modules/.cache/native-validation/native-block-content-alignment-september12-round01.
The independent snapshot audit binds1160 source files,
1972 compiled files and1146 unchanged
tracked inputs;13owned source/test paths plus the clean manifest form14inputs
for committed-snapshot verification. No historical source report was rewritten.

- Source inventory SHA256: dc7656ca4237cd1cc04abeae7cc0e5f32160b21cdd387218e76e330a105eb481
- Compiled inventory SHA256: 1694a83c51d8a3f2659174bbb8d288feda6d74113ef54114852231ec528584d3
- Native results SHA256: 58d78d04bbcd00482d9d1b7ca0581efd2f2758a1c3afd2c3c4467ba57f72a424
- Gate receipts SHA256: f98afce65150d29bb6c091f21e608d0aba67eade3b62879706764d69508cac05

The marker reviewer also implemented the coordinate translation; this is not
a fully independent implementation audit. Executed regression evidence and
exact input verification, not review alone, establish the reported result.
