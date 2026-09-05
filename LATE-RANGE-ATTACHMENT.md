# Live ranges track late-attached ancestors

Continuation after `48bd87e`, September 5, 2026. A range can be created on detached
text before that text is inserted into newly created parents. Those insertions
now establish the owner's missing ancestor links, so later removal/replacement
retargets endpoints instead of leaving them on the detached old text. Final
integrated validation passes 778 tests across 26 named files in each tree.

## Root cause and bounded update

DomRangeOwner previously ignored a childList record when its target had no cached
child sequence. If the inserted node already belonged to a live range but its new
parent was untracked, this lost the new ancestry. Attaching more wrappers did not
repair it. Later removal could not find the removed ancestor or correct parent
index. Existing splitText had a special fallback and explicit range setters
refreshed tracking, which could hide the general native insertion defect.

For otherwise ignored non-split insertions, the owner now checks the added nodes
against its tracked-node map. A known node refreshes its ancestor parent links
and initializes only missing child sequences from the current native tree.
Existing logical ancestor sequences are preserved, rather than overwritten by a
post-insertion snapshot. The insertion is not applied a second time to newly
initialized children. Unrelated untracked insertions do not cause a subtree scan.
Explicit range validation retains its original full refresh behavior.

The update does not change native nodes, HTML, layout inputs, public mutation
records or observer delivery. No new runtime dependency or guest API is added.
Original weak live-range registration and document-close ownership remain.
General arbitrary early native-listener ordering is not newly guaranteed, and
normalize's removed-member/parent-boundary transfer remains a separate gate.

## Evidence so far

Four tests on exact `48bd87e` reproduce wrong endpoints after late attachment:
text removal at a nonzero sibling index, outer-wrapper removal, detached-parent
replacement and insertion of an extra sibling before removal. All four fail
with ordinary boundary assertions. The same tests pass on production v1; the
first seven-file working regression selection passes 106 tests, including core
ranges/selections, script ranges, splitText, normalize survivor behavior and raw
mutations. Reports are retained under `node_modules/.cache/native-validation/`
as `late-range-parent-baseline.json` and `late-range-first.json`.

The first scoped check found only a long-line formatting issue in the new parent
fixture. After the line wrap, exact baseline was repeated with identical final
test bytes and again failed all four boundary assertions; the isolated production
patch was then restored. Original outcomes are retained, with the locked result
at `late-range-parent-baseline-formatted.json`. Project and scoped strict types
pass, and the corrected parent test and owner pass Biome without fixes.

The independent rendering lane contributes seventeen cases. Final exact baseline
has fourteen ancestry failures and three passing controls; identical tests pass
all seventeen on v1. Prepainting and geometry do not mask the failing ancestry
paths. Explicit post-attachment revalidation and backward selection setup are
labeled existing controls, not new failing paths. Native selection identity,
focus, exact editor-start/end caret pixels and full fresh/prepared buffers match
independently assembled final fixtures after removal/replacement.

The original fixtures mistakenly expected rectangles for collapsed element
boundaries and then expected interior element-boundary carets. Both original
failures remain. The corrected final suite preserves empty range rectangles and
the existing unsupported interior-caret status, while adding supported end-caret
cases. This patch does not introduce interior caret geometry. See
`node_modules/.cache/native-validation/parallel-late-range-rendering-48bd87e/REPORT.md`.

The independent binding/core lane contributes thirty-three cases: eight baseline
controls pass and twenty-five ancestry assertions fail; the same file passes all
thirty-three on v1. Script removal/replacement, clones, tracked subtree roots,
three-wrapper moves, comment/container endpoints, fragment semantics, details
batching, depth/cycle/node limits, raw records, queued observers and closure are
covered. Tested endpoints and clones are created before late attachment and are
not reset afterward. Details cases use fake timers that are never advanced, with
zero delivered toggle tasks and close-time cleanup. No real timer/runtime probe
is hidden in this batching coverage. No fixture corrections were needed. See
`node_modules/.cache/native-validation/parallel-late-range-bindings-48bd87e/report.md`.

## Integrated checks

All 54 new cases pass. The fixed 26-file suite passes 778 tests in the isolated
tree and 778 in the working tree, with no failures, skips or runtime errors.
Both project type checks and dist-only builds pass. Strict checking for all three
new test files and scoped Biome for them and dom-range pass. Populated final
reports and logs use
`node_modules/.cache/native-validation/late-range-integration-final-*`.

Both manifests match with 408 unique paths, no missing working tests and 22
pre-existing pending-only isolated gaps. The full manifest was not executed.
The focused commit excludes unrelated pending source/doc changes. Fragment moves
retain normal source-removal semantics; a range is not promised to follow moved
children. The current interior element-caret limitation is not expanded here.

This is in-memory native evidence, not full-manifest, actual SafeJS, live-site,
socket/service, TTY/PTY, GUI/browser interoperability, heap/RSS or portability
acceptance. `TASKS.md` retains those gates and the remaining normalization work.
