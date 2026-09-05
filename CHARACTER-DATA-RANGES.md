# Precise native CharacterData range updates

Continuation after `79b9b49`, September 5, 2026. Direct native
`DocumentTree.replaceData` edits now preserve live range offsets using the
actual validated edit operation. This aligns the native mutation path with the
already-correct owner-mediated path, rather than introducing new script methods.
Final integrated validation passes 480 tests across sixteen named files in both
the isolated and working trees, with matching native visual evidence.

## Root cause and scope

Previously a direct replacement published only its old string. DomRangeOwner
could not distinguish insertion, deletion or partial replacement from a whole
value assignment, so it collapsed positive offsets to zero. Its existing
`replaceText` wrapper supplied temporary edit details and already behaved
correctly. ScriptDom installs `scriptRangeCharacterMethods` after the generic
CharacterData methods, so its append/insert/delete/replace methods already use
that correct wrapper. They are regression controls, not newly fixed APIs.

The parent reproduced six direct-path failures on exact `79b9b49`: append,
insert, replace, delete, equal-string replacement and empty insertion. Whole-value
assignment and the existing wrapper were two passing controls. These eight
unchanged tests now pass. The original baseline JSON remains
`node_modules/.cache/native-validation/character-range-baseline.json`.

The relevant primary algorithm is:

```text
https://dom.spec.whatwg.org/#concept-cd-replace
```

The DOM Living Standard displayed an August 25, 2026 update at the September 5
inspection. Boundaries at/before the edit offset stay put; boundaries inside the
removed interval collapse to its start; later boundaries shift by inserted minus
removed UTF-16 length. The implementation records the operation, not a guessed
common-prefix/suffix difference between strings. Equal-string replacement can
therefore move boundaries while an empty insertion does not.

## Private mutation details

Each applicable native mutation record has immutable offset, clamped removal
count and inserted length in a private WeakMap keyed by that actual record.
`documentCharacterDataEdit` is the native accessor; metadata is not added to
record string/symbol keys, JSON, public observer properties or oldValue. The
metadata value is frozen, and weak record keys do not independently retain old
records. This is a design property, not a heap/GC/RSS measurement.

`setDataInternal` supplies explicit whole-value details for ordinary assignments
and the precise details passed by `replaceData`. DomRangeOwner prefers recorded
details to its temporary wrapper context, fixing direct native edits made during
an owner-mediated operation without borrowing the wrong outer offsets. The
existing wrapper's reentrant-operation rejection is not removed.

Manual split notifications retain their existing handling, including the correct
owner/script split wrapper. Direct native split endpoint transfer and normalize
endpoint merging remain separate gaps; this patch does not claim them fixed.
In particular, ScriptDom normalize is not made range-correct by this change.
Whole data/nodeValue/textContent assignments retain full-replacement behavior.

Validation, clamped counts, UTF-16 code-unit semantics, retained detached-data
quotas, preflight failure and document closure remain under the same owners.
No content diff heuristic, new runtime dependency or public mutation-record
schema is introduced.

## Prepared layout versus current paint

`prepareDocumentRaster` retains layout, not an immutable caret/selection image.
Its rasterize method prepares current selection paint. For equal-string edits,
layout and revision can remain valid while freshly painted selection pixels
change correctly. Empty insertion keeps both boundaries and pixels unchanged.
There is no need to manufacture a paint-only revision or recascade CSS for these
cases. Text-changing edits still invalidate the old prepared layout normally.

The initial investigation considered requiring a stale-capture exception on any
selected-boundary movement. Source review and canonical baseline captures show
that assumption was wrong: accepted prepared layouts paint the updated selection
and match a fresh capture. Original exploratory failures and baseline wording
are retained, not reclassified as a production defect. Final acceptance checks
must compare actual pixels and boundaries, not demand needless invalidation.

## Current evidence

The first parent run passes 234 tests across six named native files: the eight
new direct-edit cases and existing CharacterData, ranges, native mutations and
native/script observer suites. Its populated result is
`node_modules/.cache/native-validation/character-range-first.json`.

The independent binding/payload suite has 59 cases: its locked exact baseline
has 47 controls passing and 12 direct-path failures; the identical test passes
all 59 on production v2. It verifies script text/comment method controls, direct
native edits observed through script ranges/clones, conversions, detached and
UTF-16 boundaries, whole assignments, budgets, frozen raw record shape, queued
observer payloads/order, same-/other-node listener edits and closure. Strict
types, scoped Biome and patch/provenance checks pass. The initial four failures
in a smaller exploratory fixture were setup assumptions, not production bugs;
their original logs and correction notes remain in
`node_modules/.cache/native-validation/parallel-character-range-bindings-79b9b49/delivery/README.md`.

Native command-host capture preparation uses exact HEAD through two explicitly
different existing API routes: canonical owner.replaceText and broken direct
tree.replaceData. Eight before/after fixtures produce 32 baseline PNGs. Canonical
boundaries are correct in all eight cases; the broken direct route fails all
eight while retaining identical text and layout. The 4,938 changed pixels stay
inside actual caret/highlight regions. This is baseline defect evidence, not
eight passing direct-path acceptance cases.

The independent rendering suite adds 26 cases: the locked baseline has nine
passing controls and seventeen direct-edit failures; the identical file passes
all 26 on v2. Exact boundaries, directional selections, caret/highlight geometry,
prepared/fresh/reference full pixels, revisions, CSS counters, detached edits,
preflight and lifetime checks pass. The original erroneous invalidation
expectations remain in the worker evidence, explicitly identified as assumptions.
See `node_modules/.cache/native-validation/parallel-character-range-rendering-79b9b49/REPORT.md`.

Actual direct native capture now matches the canonical reference in all eight
cases on both new builds. Sixty-four PNGs are retained including the broken
baseline; the canonical/integrated/working comparison covers 48 PNGs. All sixteen
before/after frames match byte-for-byte, along with source, geometry, ranges,
mutations, revisions, journals, prepared results and style counters. Only the
explicit API route, local image paths and random artifact handles are normalized;
raw values remain. All 32 hosts close and all 64 screenshot artifacts release.
The parent visually inspected equal-value highlights and the inserted caret.
See `node_modules/.cache/native-validation/parallel-character-range-capture-79b9b49/FINAL.md`.

## Integrated checks

All 93 new tests pass. Final fixed-list validation passes 480 tests across sixteen
files in each tree, with no failures, skips or runtime errors. Both project type
checks and dist-only builds pass; strict checks for all three new test files,
scoped Biome for those files and dom-range, and formatting for both production
files pass. One existing DocumentTree organizeImports diagnostic is reproduced
on exact HEAD and left unchanged. The 399-entry manifests match, with 399 unique
paths, no missing working files and 22 pre-existing pending-only isolated gaps.
The whole manifest was not executed. Populated final results and logs use
`node_modules/.cache/native-validation/character-range-integration-final-*`.

Capture audit verifies 27 source-to-dist emits and 54 source/dist fingerprints.
After final parent builds, all 54 fingerprints still match. Reinvoking the
write-once worker audit first verified its emits/hashes but then correctly refused
to overwrite its existing report with EEXIST; a separate parent report retains
that outcome and the successful final hash check at
`node_modules/.cache/native-validation/character-range-parent-final-fingerprints.json`.

All evidence is in-memory native/injected execution. No full manifest, released
SafeJS, live website, socket, real TTY/PTY, external browser, timing/RSS or
portability acceptance is inferred. Outstanding browser scope stays in `TASKS.md`.
