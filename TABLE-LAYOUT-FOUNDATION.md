# Native table layout foundations

September 11, 2026.

Fresh native browsing of the W3C CSS tables page finds five deferred `table`
elements; the unchanged Test Pages form capture finds a deferred `tbody`.
Both still fail genuine native pointer actions. These measured failures motivate
the table implementation, rather than replacing tables with blocks or hiding
formatting diagnostics.

## Implemented primitives

- `placeTableCells` assigns real cell IDs to bounded row/column spans, skips
  occupied anchors, rejects overlapping table models, creates implied rows for
  positive rowspans, and grows zero-rowspan cells to their own group's end.
  Explicit empty rows and groups retain identity. See `TABLE-SLOT-PLACEMENT.md`.
- `sizeTableColumns` combines measured min/max cell widths, colspan constraints,
  column hints, spacing, caption minima and available/specified widths. Its
  deterministic auto-layout policy preserves minimum constraints rather than
  forcing content into undersized fixed tracks. See `TABLE-COLUMN-SIZING.md`.
- Both helpers validate bounded inputs, meter work, return detached frozen
  outputs and reuse existing native dependencies. Neither imports a browser
  engine, fetches resources or executes page scripts.

These primitives are **not yet connected to document table layout**. They do not
make the observed pages render, remove their table guards or establish browser
conformance. Preliminary isolated tests use the source baseline recorded by the
workers; the final integrated gate uses the newer committed clear-fix base.

## Remaining integration

1. Build table formatting structures from real HTML/CSS roles, including anonymous
   box repair, row groups, columns and caption placement. Normalize HTML span
   attributes without applying HTML semantics to arbitrary foreign elements.
2. Measure actual cell contents and resolve table-specific CSS/HTML presentation
   hints. Feed the resulting spans and border-box width contributions to these
   helpers rather than guessing sizes from text length.
3. Reflow cells, resolve row heights, baseline/vertical alignment and rowspans,
   and merge native table boxes into surrounding normal, inline and nested flow.
4. Implement accurate table paint, geometry, hit ownership and scroll targeting,
   with explicit separate/collapsed-border and unsupported-profile boundaries.
5. Repeat genuine actions against the unchanged captures and fresh websites,
   keeping CSS imports, CSP image policy and other limitations visible.

## Evidence boundaries

The parent-targeted two-suite run passes 182 cases: 99 column-sizing and 83
slot-placement cases, with no exclusions. The retained first column run reports
98 passes/one failure because the test helper replaced an explicitly undefined
maximum with a default. The corrected malformed-input test uses a direct object;
no production numerical fix was needed for that failure.

Independent source review finds no concrete violation of the documented numerical
column policy. Parent source review finds no concrete slot-placement violation
under its normalized-input contract. Neither conclusion substitutes for future
document layout, reference-browser comparison or live interaction evidence.

The first broader gate catches a TypeScript narrowing error in slot-placement
work-limit validation. An explicit numeric type check corrects it; the failed gate
is retained rather than relabeled. Final build/strict/native results are recorded
separately after validation completes.

## Final clean-base validation

The final gate passes **9,859 tests, zero failures and two existing exclusions**.
It selects 164 explicit native test files, strictly compiles 163 test roots, and
uses 568 clean manifest entries. Build, strict TypeScript and formatting pass.
Audit verifies 1,044 unchanged tracked inputs, four new source/test files, two
manifest additions, 1,049 source inputs and 1,884 compiled artifacts. Pre-existing
untracked suites and dirty shared files are excluded.

Clean base: `ddb37b16b02e5ae076a0c7ab1449189da3828cf2`, including the previously
validated clear fix. Gate UTC **20:05:07.863–20:07:20.275**, audit **20:07:34.869**.
Evidence: `node_modules/.cache/native-validation/native-table-foundation-integration-september11-round02/`.
Targeted runs and parent review:
`node_modules/.cache/native-validation/table-foundation-work-september11/`.

- Source inventory SHA-256: `6a4a9dc08ae475c817de068df9cef287e708b21023b98aa4f311e23aa432bf4c`.
- Compiled inventory SHA-256: `fa2c81be6a517a1fa263648e7d44d2155c9de571560ed111cb3c2205da024ace`.
- Native result SHA-256: `672afac320fe028a55611cde52e5d0f99301e689a33543738f3151a3334c39d6`.
- Gate summary SHA-256: `323a2fde251731b40e28f24e86757c5e218bfa4c9df1d62b379e9fef5d20e829`.

The two unchanged runtime exclusions remain the separate total host-object ceiling
and real unsupported-display-alongside-advisory-media cases. Strict roots retain
the existing snapshot-test omission. No table document renderer or previously
failing website action is certified by this numerical/model foundation gate.
# Later integration

`TABLE-DOCUMENT-INTEGRATION.md` records the subsequent separate-border block-table
document/geometry/paint/click implementation and its distinct validation lanes.
The original foundation measurements and limitations below retain their original
scope; those earlier primitive tests were not retroactive website validation.
