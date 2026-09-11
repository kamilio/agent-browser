# Bounded native ordinary list-item formatting

September 11, 2026. This is synthetic native validation, not website acceptance.

## Implementation and ownership

Only `src/formatting-tree.ts`, `src/formatting-tree.test.ts`, this new report,
and the new private evidence directory
`node_modules/.cache/native-validation/list-item-layout-worker-september11/`
are written by this work. No other sources, manifests, TASKS, historical reports,
dependencies, commits, or captures are changed. Parent owns integration and the
overall browser goal/outstanding gates in `TASKS.md`.

Ordinary `display:list-item` now enters the native block formatting path while
retaining its authored display, box/paint/text styles, identity, positioning
fields, and Grid/Flex item flags. It reuses `styles.list()` and the existing
summary symbolic-marker records and rasterizer; it is not a marker-dropping
block substitution. Special/replaced elements retain their previous deferral.

- `list-style-type:none` accepts inline, block, and mixed contents without a
  generated marker, including marker-free ordered lists.
- Existing `disc`, `circle`, `square`, `disclosure-open`, and `disclosure-closed`
  markers inherit and override through the normal cascade and contents flattening.
- Inside markers use the existing inline replaced-box path and child
  normalization, including block content. Outside markers are bounded to inline
  content, with the existing negative-margin placement and zero label advance.
- Markers retain their item's reference for painting/hits without adding DOM
  text, nodes, client rectangles, or summary activation to ordinary elements.
  Actual primary summaries retain disclosure defaults and click toggling.
- Marker allocation and ancestor inspection use existing box/work ceilings;
  no resource limits are increased. Visibility and zero-font-size behavior remain
  consistent with the existing summary path.

## Explicit limits

- Outside visible markers with block content still throw `unsupported`, including
  block descendants exposed by contents flattening or split inline formatting.
  Primary summaries keep their existing disclosure-specific error message.
- Decimal/roman/custom counters, images, counter declarations, and the unsupported
  list shorthand retain CSS diagnostics and the native rendering guard. No CSS
  diagnostics are suppressed and no counter formatting is implemented.
- Repository inspection found that `styles.list()` does not represent the UA
  decimal default for ordered lists or expose specified-value provenance. A
  non-summary item with computed `disc` whose nearest list ancestor is `ol`
  therefore retains `ordered-list-marker-not-supported`; native rendering is
  refused rather than silently substituting bullets for numbering. This is
  deliberately conservative: even explicitly authored `disc` under `ol` remains
  gated because that value cannot be distinguished from the missing UA default.
  Computed `none` and distinguishable supported symbolic overrides remain usable;
  this does not claim complete HTML ordered-list presentation-hint semantics.
- Existing Grid/Flex formatting diagnostics and special-element deferrals remain
  intact. This work does not expand positioning, layout-container, counter, or
  browser/runtime acceptance gates.

## Validation and preserved evidence

The private `vitest.config.mjs` selects only the manifest-listed
`src/formatting-tree.test.ts` and `src/disclosure-markers.test.ts`. The latter is
unchanged. Final run on September 11, 2026 at 14:09:54–14:09:57 UTC:

- **109 passed, zero failed:** 81 formatting-tree cases and 28 summary-marker cases.
- Scoped strict TypeScript, including the assigned test file: exit 0, no diagnostics.
- Existing Biome 1.9.4 formatter: exit 0, two files checked, no changes needed.
- Assigned-file `git diff --check`: exit 0.

Coverage includes marker-free inline/block/mixed flow, inherited and overridden
symbols, actual colored marker pixels, inside/outside glyph and item geometry,
inside/outside hit targets, contents flattening, Grid/Flex items, ordinary versus
summary activation, visibility/display overrides, resource ceilings, retained CSS
diagnostics, ordered-list ambiguity, and special-element boundaries.

Every validation invocation uses the existing seccomp launcher and file caps,
private HOME/TMP, stripped environment, closed stdin, a 120-second timeout plus
five-second kill grace, and a 6 MiB combined stdout/stderr cap and per-file limit.
Tests additionally use the existing native network guard, one worker thread,
30-second per-test timeout, no retries, and disabled server/watcher interfaces.
Recorded launches have no timeout, output-cap, stream, or residual-process-group
failure. There are no live requests, sockets, credentials, real TTY/PTY, SafeJS,
alternative browsers, dependency installs, or runs of the parent's wider gate.

All earlier evidence remains in the private directory under distinct labels:

- `tests-first`: 91/91 passed; `strict-first`: passed.
- `format-first`: launcher failure from an incorrect assumed Biome binary path.
  The existing Bun-managed 1.9.4 binary was located; no installation was performed.
- `tests-boundary-red`: 97 passed, four failed: three missing ordered-list guards
  and one outside-marker fixture clipped beyond the viewport.
- `tests-second`: 97 passed, four failed solely on clipped outside-marker fixture
  paint expectations. Fixtures gained left padding; production clipping was not
  changed.
- `tests-third`: 102/102 passed; `strict-second` and `format-second`: passed.
- `tests-special-red`: 105 passed, four failed, exposing marker loss on button,
  input, select, and textarea list-item boxes. Their existing deferral was restored.
- `tests-final`, `strict-final`, `format-final`: final passing evidence. Both
  formatter-write invocations and their execution records are also retained.

Each label retains invocation/environment, execution status, stdout/stderr, and
test JSON where applicable. Final source fingerprints and the assigned-file patch
are retained as `source-final.sha256` and `source-final.patch`. Earlier failing
results are not overwritten, relabeled as success, or presented as live validation.

## Parent clean selected gate

The independent clean gate at
node_modules/.cache/native-validation/native-list-item-september11-round01/
validates tracked df5028b plus only the two list-item source/test changes:
**8,175 passes, zero failures, one existing excluded assertion**, across 132
selected manifest-listed files and 131 strict roots. Build, strict typing and
formatting pass; all 1,017 source files remain stable. The extra selected file is
the existing disclosure-markers regression suite, not a new dependency or test
manifest entry. Execution is September 11, 2026,
14:13:41.080–14:15:28.337 UTC. Historical strict/runtime exceptions are unchanged.

That snapshot deliberately excludes the concurrent percentage-row correction.
Combined-source validation must be reported separately. Neither earlier MDN
replay includes this list-item change, and MDN rendering/click acceptance remains
unproved; the actual absolute accessibility-menu boundary is recorded in
MDN-POSITIONED-GRID.md.
