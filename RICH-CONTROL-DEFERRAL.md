# Unsupported rich-control diagnostics

`describeControl` returns no software descriptor for an HTML button containing
element children, just as it does for other controls outside its supported
profile. The native formatting builder consequently retains an explicit
deferred node instead of losing the entire tree to an early descriptor error.

This does **not** implement rich-button layout. Children are neither flattened
into a text label nor assigned invented rectangles. Geometry, hit testing and
rasterization still reject the unsupported formatting profile. The direct
descriptor result changes from `unsupported` error to `undefined`; resource-limit
errors remain errors. Plain-text software buttons and form semantics are
unchanged. The existing rich-button geometry work is not included in this change.

## Regression coverage

The new17-case `src/rich-control-deferral.test.ts` covers rich-child shapes,
unchanged DOM ownership, adjacent fieldset/input/sibling diagnostics, plain
buttons, mutation, hidden and foreign nodes, unsupported geometry/hits/raster,
and resource limits. On unchanged production it produces11 pass and6 fail.
The initial focused selection passes316 cases across9 suites and9 strict roots.
A broad run then identifies one related legacy expectation that formatting
itself must throw the old rich-button error. That test now asserts a deferred
node and unflattened children, while retaining every layout/geometry/raster/hit
failure and DOM recovery check. No exclusion is added. Expanded focused
validation passes335 cases across10 suites and10 strict roots, with no
exclusions. Build, formatting, complete suite selection and immutable source
checks pass. The failed broad round00 is preserved. Evidence:
`node_modules/.cache/native-validation/rich-control-deferral-work-september13/`.

The later clean broad round01 passes17,962 cases with zero failures and two
unchanged exclusions, across348 selected suites and347 strict roots. Its
726-entry manifest leaves378 unrun. Build/strict/format and source integrity
pass;1254 unchanged tracked inputs,1258 source files and2088 compiled files are
audited. Root dist is not rebuilt. The historical snapshot strict-root omission
remains. Audit:
`node_modules/.cache/native-validation/native-rich-control-deferral-september13-round01/AUDIT.json`.

## Actual Wikipedia follow-up

One new offline native replay at07:54:37.252–07:54:37.547UTC on September13,2026
loads the unchanged captured portal. Formatting now completes. Its search input
has a formatting node under the real fieldset outer/content pair; the logo
image and rich button remain explicitly deferred. Whole-page geometry still
throws unsupported, so no pointer, raster or complete rendering pass is claimed.

Relative to the historical17863 tree, boxes increase2207→2234 and inspected DOM
nodes2083→2110 as previously deferred fieldset content is now traversed. Deferred
subtrees remain2: the fieldset is replaced by the unsupported rich button in
that list. Additional overflow, positioning-coordination, vertical-alignment
and direction issues are exposed, not hidden or counted as resolved. These are
operation counts, not speed benchmarks.

The original failed17945 run retains its exit1 and missing after-tree. The new
run is separate, with zero HTTP/scripts/resources/actions/raster. Audit pins,
closed owners, process termination and empty private cleanup verify. Evidence:
`node_modules/.cache/native-validation/native-wikipedia-rich-control-september13/RESULT.md`.

## Remaining button implementation

A separately sealed native reading of the retained WHATWG source establishes
display-sensitive independent formatting, fit-content auto inline sizing, and
UA border-box/text-align/align-content defaults. It does not prescribe the
fieldset anonymous-content/padding-transfer model for buttons. Primitive native
appearance is not fully specified by those excerpts.

That investigation uses one retained-source load, two native queries and3332
excerpt code units. Its validated source/compiled pins belong to the17945
fieldset runtime, not the later descriptor change. No new HTTP or rendered
conformance comparison occurs. The full rich-button feature remains open.

Evidence: `node_modules/.cache/native-validation/native-button-source-september13/IMPLEMENTER-NOTE.md`
and `EXCERPTS.json` in the same directory.
