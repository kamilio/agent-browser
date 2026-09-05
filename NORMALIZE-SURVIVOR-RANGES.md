# Normalization preserves surviving-text ranges

Continuation after `ad05b5c`, September 5, 2026. This is a focused prerequisite
for full normalize range transfer: endpoints already inside the surviving first
nonempty Text node retain their offsets when following text is appended. Final
integrated validation passes 642 tests across 21 named files in each tree.

**Endpoints inside removed following text nodes and parent boundaries before
merged members remain an outstanding separate gate.** This change does not claim
that normalize is fully live-range-correct or introduce a new normalize method.

## Exact append instead of whole replacement

The existing native normalizer used setData for the survivor's combined text.
That published whole-value replacement metadata and collapsed positive survivor
offsets, even for singleton or repeated normalization with no text changes.
The normalizer now calls replaceData at the survivor's current UTF-16 length,
with zero removal and only its following members' data. The existing precise
CharacterData owner therefore performs an append, preserving all prior survivor
positions instead of resetting them or extending the selection into added text.

Already removed leading empty members are excluded from the suffix. If a native
embedding hook edits a retained removed empty node, its saved data stays detached
rather than being wrongly prepended into the visible survivor. If such a hook
edits the survivor itself, the following text appends after its current value.
These bounded hooks do not imply browser-synchronous MutationObservers or a
general atomicity/ordering guarantee for arbitrary native normalization reentry.

The DOM Living Standard normalization algorithm was reviewed September 5, 2026,
with displayed revision August 25, 2026. Its survivor operation is an append;
removed-node and parent-boundary transfer are distinct subsequent steps.

```text
https://dom.spec.whatwg.org/#dom-node-normalize
```

Existing normalization planning, original survivor/node identities, subtree
scope, raw mutation ordering/multiplicity, retained detached-data quota and
preflight validation remain. A singleton still emits its existing characterData
notification, but an empty append leaves its range and document revision alone.
No new observer property, runtime dependency, text diff heuristic or range-owner
special case is introduced.

## Evidence so far

All three parent cases fail on exact `ad05b5c`: ordinary/repeated survivor ranges
reset, a retained leading-empty hook wrongly prepends saved text, and a newer
survivor edit loses its selection. The same tests pass on production v1. The first
focused working run passes 115 tests across six named native files, including
existing CharacterData, raw mutations, direct edit ranges, split ranges and core
range operations. Populated reports remain under
`node_modules/.cache/native-validation/normalize-survivor-parent-baseline.json`
and `node_modules/.cache/native-validation/normalize-survivor-first.json`.

The independent rendering lane adds eighteen tests. Exact baseline has fifteen
survivor failures and three controls; identical tests pass all eighteen on v1.
Literal independent one-node final fixtures verify survivor identity/offsets,
forward/backward selections, end carets, newline geometry and complete fresh/
prepared raster buffers. Four singleton configurations repeat normalization three
times, retaining selected range identity, revision, CSS cache and pixels while
still emitting one characterData record per call. Structural merges invalidate
old prepared layout normally. No fixture correction or paint invalidation change
was needed. Strict TypeScript and scoped Biome pass. Evidence is retained at
`node_modules/.cache/native-validation/parallel-normalize-survivor-rendering-ad05b5c/REPORT.md`.

The independent binding/core lane adds forty tests. Exact baseline has eight
passing controls and thirty-two survivor-offset assertion failures; identical
tests pass all forty on v1. Native and ScriptDom receivers, UTF-16, multiple/
cloned ranges, nested runs, detached subtrees, barriers, repeated empty appends,
record privacy/order, queued observers, retained quotas and atomic multi-run
budget rejection are covered. The first baseline is the locked final baseline;
its original filenames remain unchanged. No assertion or fixture revisions were
needed, and host identities are compared without traversing getters. Strict
TypeScript and Biome pass on both archives. See
`node_modules/.cache/native-validation/parallel-normalize-survivor-bindings-ad05b5c/report.md`.

## Integrated checks

All 61 new cases pass. The fixed 21-file regression selection passes 642 tests in
the isolated tree and 642 in the working tree, with no failures, skips or runtime
errors. Both project type checks and dist-only builds pass. Strict checking and
scoped Biome for all three new test files and formatting for document.ts pass.
One prior DocumentTree organizeImports diagnostic is reproduced on exact
`ad05b5c` and the working source; it is not bundled into this behavioral fix.
Final logs and populated results use
`node_modules/.cache/native-validation/normalize-survivor-integration-final-*`.

Both manifests match with 405 unique entries, no missing working files and 22
pre-existing pending-only isolated gaps. The whole manifest was not executed.
Only the exact append change, new tests, registration and current documentation
belong in this focused commit; pre-existing pending work remains excluded.

No separate command-host capture run is claimed for this prerequisite. Full-native,
actual SafeJS, live website, socket/service, real TTY/PTY, GUI/browser interoperability
and portability gates remain in `TASKS.md`; the broader normalize-transfer gap
is not hidden by this checkpoint.
