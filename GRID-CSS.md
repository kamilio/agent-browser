# Native Grid CSS foundation

The native CSS pipeline recognizes a bounded Grid Level 1 grammar and computes
its supported values. This is a production parser/cascade/CSSOM step toward the
MDN layout blocker, not an alternate rendering path. **Grid geometry, track
allocation and native click acceptance remain unimplemented.** Formatting still
defers Grid containers and width resolution still rejects unsupported layout.

## Supported pipeline

- Ten longhands cover explicit row/column tracks, named areas, implicit track
  sizes, auto-flow and the four item-placement edges. `grid-row`, `grid-column`
  and `grid-area` expand with the custom-identifier copying rules.
- Track syntax supports nonnegative lengths/percentages, intrinsic keywords,
  flexible `fr` values, named lines, `minmax`, `fit-content` and bounded positive
  integer repeats. Areas require equal nonempty rows and rectangular named
  regions. Placement rejects zero lines and nonpositive numeric spans.
- CSS keywords/functions normalize without lowercasing custom line or area
  names. Stylesheet and inline parsing, variable substitution, importance,
  `all`, explicit inheritance and invalid-at-computed-value handling share the
  same Grid parser. Invalid declarations do not overwrite valid earlier values.
- `DocumentStyles.grid()` computes supported font/viewport/absolute lengths,
  retaining names, percentages and flexible/intrinsic sizing. Its cache follows
  document, viewport, ancestry and font invalidation and closes with the styles.
- Inline CSSOM registers camel-case accessors and shorthand mutation;
  computed-style reads expose the supported values. These are not used track
  measurements or full Grid resolved-value serialization.
- Grid items blockify through `display:contents`, but not through an intervening
  box. No synthetic Grid item boxes, block-layout fallback, removed stylesheet
  diagnostics or bypass of native click geometry are introduced.

## Bounds and limitations

The grammar profile bounds source length, tokens, names, tracks, repeat count,
expanded components, area dimensions/cells and line indexes. The exported
`cssGridLimits` is authoritative. Unsupported escapes, numeric functions,
auto-repeat, nested repeat, subgrid and masonry are rejected, not approximated.
The `grid` and `grid-template` container shorthands remain unsupported.

The exact native W3C section research is recorded in `GRID-SPEC-SECTIONS.md`.
It provides grammar/computation/placement evidence while retaining partial-reader
limitations. Captured MDN track variables motivate integration tests; a synthetic
fixture using that syntax is not a replay of the full website or visual evidence.

## Validation

Clean validation against tracked `c575e16` plus only these changes passes:
**7,203 native tests, zero failures, one existing excluded assertion**, across
117 selected manifest-listed files and 116 strict roots. The new files contribute
210 grammar and 29 integration cases. Build, strict typing and the configured
formatter all pass; the 1,009 source files remain unchanged throughout the run.

The gate runs September 11, 2026, 12:32:19.953–12:33:58.567 UTC. Artifacts are
under `node_modules/.cache/native-validation/native-grid-css-september11-round01/`.
The strict-only `snapshot.test.ts` omission and runtime total-host-object-ceiling
exclusion are the existing documented exceptions, not new Grid exclusions.
Before any validation child, a file-existence check found that the proposed
`css-flex.test.ts` regression file was pre-existing untracked work. The preserved
preparation correction selects tracked `flex-reflow.test.ts` instead; it does
not import unrelated work or erase a native failure. The worker's independent
239-case focused run also passes, but is not a full-suite claim.

Two existing computed-style enumeration assertions now compare against the
registered longhand list rather than a stale hard-coded count. Unrelated test
additions and import/property reordering stay uncommitted and excluded from the
clean validation snapshot. No live, socket, real TTY, SafeJS or credential
acceptance is inferred from these native checks.

Next: implement true two-dimensional placement and track sizing, connect item
reflow to final layout/paint/hit testing, address the independent CSS blockers,
and repeat the genuine native MDN click flow. Native CSS tests alone do not pass
those gates or complete the four original research topics.
