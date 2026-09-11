# Native block Grid layout

September 11, 2026. This extends the separately recorded Grid CSS foundation
with actual two-dimensional layout. It does not revise the historical
GRID-CSS.md or MDN-GRID-CSS-REPLAY.md measurements or claim full CSS conformance.

## Implementation

- The bounded placement kernel reuses the existing Grid grammar for explicit,
  named, negative and area-derived lines, spans, implicit track patterns and
  row/column sparse or dense auto-placement. Stable order-modified placement and
  explicit overlaps are retained. Limits cover tracks, items, occupancy and work.
- Numeric track sizing handles fixed, intrinsic, minmax, fit-content and flexible
  tracks, spanning contributions, growth limits, gutters and definite/indefinite
  available space. Container min/max-height constraints rerun flexible expansion
  when necessary; a minimum height is not simply treated as a definite height.
- Formatting retains Grid children, anonymous text items and display:contents
  flattening. Nested intrinsic measurement uses Grid tracks, not a Flex allocator.
  The width-only API still rejects coordinated layout rather than faking blocks.
- The page coordinator resolves columns, reflows actual item subtrees, sizes rows
  and reflows again using actual Grid-area heights and stretch constraints.
  Percentage descendants receive the area's height rather than the container's.
  Native replaced-image dimensions are preserved when normal alignment applies.
- Final boxes, text, images, paint order, geometry and hit testing share the
  existing document pipeline. Nested Grid and Grid/Flex interoperation use that
  same path. The fixture click exercises BrowserSession pointer actionability
  and navigation, not a direct link activation or injected rectangle.

## Profile boundaries

The exported gridLayoutCapabilities remains partial. Block Grid and nested
Grid/Flex work within the implemented CSS/formatting profile. Inline Grid,
positioned Grid containers/items, baseline alignment, cyclic percentage rows in
auto-height containers and explicit stretching of replaced items remain rejected.
Existing unsupported style/foreign-element diagnostics are not hidden.

Grid grammar still excludes escapes, numeric functions, auto-repeat, nested
repeat, subgrid, masonry and container shorthands. Existing text, image,
overflow and positioning limitations also apply. These are not claims about
real-browser equivalence, visual fidelity or CAPTCHA/fingerprint effectiveness.

## Source and development evidence

The native reader extracts in GRID-SPEC-SECTIONS.md supply the primary captured
Grid grammar and sizing sections. Additional native offline extracts of section
8.5 and sections 11.5, 11.6 and 11.8 are preserved in the placement and track worker
lanes beneath node_modules/.cache/native-validation/. They use the original W3C
capture and bounded reader, with no new wire requests or alternative browser.
Worker lanes are grid-placement-worker-september11 and
grid-tracks-worker-september11; their separate partial-reader limitations remain.

The placement worker passes 125 focused cases plus 210 existing grammar cases;
track sizing passes 126 focused cases. Development integration evidence in
native-grid-layout-work-september11 preserves all intermediate results:

- focus-01: 12 passes.
- focus-02: 12 passes and three failures exposing container-relative percentage
  heights, skipped equal-height stretch reflow and incorrect replaced-item width.
- focus-03: all 15 cases pass after those production fixes.
- focus-04: 14 passes and two failures after correcting the earlier mistaken
  min-height/fr test expectation from native section 11.7 and adding max-height
  coverage. The original expectation was wrong, not accepted conformance.
- focus-05: all 16 layout cases pass after bounded min/max fraction reruns.

Round01 of the clean selected gate preserves 8,085 passes, six failures and one
existing exclusion. Its failures were obsolete assertions that block Grid must
be rejected or discard its children. The updated regression tests retain table
or inline-grid rejection as appropriate and add positive native raster, Flex
reflow and intrinsic-sizing assertions. The five-file focused regression check
passes all 276 cases. No failing historical result is overwritten.

## Clean validation

The corrected gate at native-grid-layout-september11-round02 passes **8,095
native cases, zero failures, one existing excluded assertion**, across 131
selected manifest-listed files and 130 strict roots. Build, strict typing and
the configured formatter pass. All 1,017 source files remain stable; the frozen
build contains 1,812 compiled files. Execution is September 11, 2026,
13:44:24.605–13:46:09.275 UTC, against clean tracked d9e1ec3 plus only the scoped
Grid changes. The snapshot strict-only omission and runtime total-host-object
ceiling exclusion are unchanged historical exceptions, not new Grid exclusions.
No live requests, sockets, TTY, SafeJS or credentials are exercised by this gate.

## Outstanding acceptance

The fixture click uses two captured-in-test transport responses and is not live
website evidence. Replay the unchanged captured MDN page and attempt its genuine
native click to identify remaining rendering blockers. Public-site coverage,
the four original research topics, real credential/passkey-provider validation,
and fingerprint/challenge effectiveness remain separate unfinished work.

Read-only review additionally identifies potential false cyclic-row rejection
for nested definite percentage heights and two overflow-alignment errors. These
need focused reproductions and production fixes; the clean selected pass does
not prove their absence or exhaustive conformance.
