# Normalization transfers live text and parent boundaries

Continuation after `17873b1`, September 5, 2026. Normalization now transfers
endpoints from removed following Text nodes into their surviving predecessor,
and transfers parent points immediately before those members to the corresponding
survivor offsets. This completes the ordinary Text-run transfer missing after
the survivor-append and late-attachment prerequisites. The 83 new cases pass,
alongside bounded integrated regressions and native command captures described
below; full browser acceptance is not implied.

## Operation and ownership

The DOM Living Standard normalization algorithm was reviewed on September5
(displayed revision August25): append the following run, transfer member and
parent-before-member endpoints using accumulated UTF-16 lengths, then remove the
following nodes. Leading empty nodes instead remove normally; parent endpoints
after the entire run remain parent-relative. Existing survivor points stay put.

```text
https://dom.spec.whatwg.org/#dom-node-normalize
```

The existing private CharacterDataEdit now optionally carries a frozen
normalization group: parent identity and ordered following-member IDs/prefix
offsets, captured from exactly the strings being appended. The group, member
array and entries are frozen. Its record remains a weak key; this ownership
design is not a measured GC/RSS result. Public records gain no string/symbol
keys, observer properties, changed oldValue or extra notifications.

A private replacement helper preserves the public four-argument replaceData
signature, string/offset validation and growth preflight. Ordinary edits retain
their existing metadata. The normalizer's native node identities, retained
detached-data quotas and global preflight remain unchanged.

DomRangeOwner prepares indexed member/prefix and parent-index lookups for each
group rather than scanning all members for each live range. Logical contiguous
member indices come from its cached sibling sequence; already-final native child
arrays are not substituted mid-operation. Transferred endpoints bypass ordinary
append adjustment so they cannot shift twice. The survivor is explicitly tracked
under its parent even if only removed siblings were previously range endpoints.
Subsequent edits, ancestor removal and queued observer delivery retain live state.

Transfers happen on the append notification before later removal records. Later
native listeners can edit the survivor, edit saved detached copies or remove its
ancestor without a stale post-call endpoint repair. This is not a guarantee for
arbitrary earlier native-listener ordering or unrestricted normalize reentry.
No guest MutationObserver is made synchronous. Existing Selection direction is
preserved when normalization collapses a directional range.

## Test evidence

The six parent tests on exact `17873b1` have five transfer failures and one
ancestor-removal control. The same tests pass on v1. The initial working run
passes 117 tests across seven named native files, covering normalization,
survivor behavior, CharacterData, raw mutations, ranges, late attachment and
splitText. Original populated reports remain under
`node_modules/.cache/native-validation/normalize-range-parent-baseline.json`
and `node_modules/.cache/native-validation/normalize-range-first.json`.

The independent rendering lane adds 23 cases: twenty exact-baseline transfer
failures and three controls become 23 passing cases on v1, with identical test
bytes and no fixture corrections. Independent literal final documents verify
exact endpoints, retained selected range, UTF-16 newline geometry, full fresh/
prepared pixels and supported Text carets. Parent-before-member cases move from
currently unsupported interior element carets into supported Text anchors.
Forward/backward selections that collapse retain their existing direction;
repeat normalization reuses layout and CSS state. Strict types and Biome pass.
See `node_modules/.cache/native-validation/parallel-normalize-range-rendering-17873b1/REPORT.md`.

The independent binding/core lane adds 54 cases: twelve exact-baseline controls
and 42 assertion failures become 54 passes with identical test bytes and no
fixture corrections. Native and ScriptDom member/parent boundaries, clones,
forward/backward selections, UTF-16, empty nodes, detached/nested/multiple runs,
queued observers, private metadata freezing, unchanged public records, atomic
budget preflight and closure are covered. A bounded 128-member run checks 257
ranges/clones at exact quotas; it is not a timing or RSS measurement. See
`node_modules/.cache/native-validation/parallel-normalize-range-bindings-17873b1/report.md`.

The three new suites contain 83 cases total: six parent, 54 binding/core and
23 rendering. Their exact-baseline results total sixteen controls and 67
assertion failures. Both manifests contain 411 explicit entries; final execution
uses only the fixed 29 named in-memory suites, not the complete manifest.

Final isolated and working runs each pass 861 tests across those 29 files,
with populated JSON, no failures/skips/runtime errors and successful process
exit checks. Both project typechecks and explicit `dist` builds pass. Strict
TypeScript for the three new tests, scoped Biome for those tests and the range
owner, and formatting of both production files pass. Logs and JSON remain under
`node_modules/.cache/native-validation/normalize-range-integration-final-*`.

## Native command captures

The capture worker used identical fixtures/actions on exact `17873b1`, isolated
production v1 and the working tree, with literal expected endpoints. There is
no canonical normalize implementation, static-reference equivalence claim or
post-normalization endpoint reset. All eight endpoint cases pass in each actual
root; the baseline retains six failures and two controls.

All 48 retained PNGs are hash-verified. The sixteen actual before/after frames
match byte-for-byte between roots, with complete case metadata equality apart
from output paths and random artifact handles. Baseline-to-actual comparison
finds 1,600 changed pixels, all inside native caret/highlight regions. Scene
geometry, public mutation records, revisions and CSS/geometry counters match
baseline. Corrected selection/caret paint work legitimately changes and remains
explicit in the comparison, rather than being normalized away. All 24 hosts close
and all 48 artifacts are released. Integrated cross-member highlighting and the
working parent-before-member caret images were also visually inspected.

This capture evidence covers bounded unwrapped ASCII fixtures, not general bidi,
wrapping, segmented layout or IME parity. Parent-before-member and empty-member
carets start unsupported and become supported Text carets after normalization;
not every before/after image is expected to remain identical.

The worker verifies 27 source-to-dist emits and 54 source/dist hashes. A separate
parent audit after final builds rechecks all 54 saved hashes without modifying
worker evidence. Reports remain at
`node_modules/.cache/native-validation/parallel-normalize-range-capture-17873b1/FINAL.md`
and `node_modules/.cache/native-validation/normalize-range-parent-final-fingerprints.json`.

## Remaining boundaries

Interior element-boundary caret geometry is not broadened here. Arbitrary early
native-listener ordering and unrestricted normalize reentry remain outside scope.
The prior `src/document.ts` import-order diagnostic was reproduced on exact
`17873b1` and is not changed by this lane; production formatting is checked
separately. Historical evidence and unrelated pending changes are preserved.
No actual SafeJS, external browser, live site, socket/service, real TTY/PTY,
full-manifest, timing/RSS or portability acceptance follows from native tests.
`TASKS.md` retains the full browser goal and outstanding gates.
