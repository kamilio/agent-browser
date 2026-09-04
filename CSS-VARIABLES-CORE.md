# Standalone custom-property integration

September 4, 2026 native browser checkpoint.

## Scope and provenance

This checkpoint promotes the previously pending `src/css-variables.ts` and its
integration into the committed stylesheet parser, ordinary/custom cascade,
computed-style reads, inline declarations and native CSSOM owner. The helper and
inline-style implementation are adopted unchanged. Other existing source files
also retain their original worktree bytes: focused variable-related adapters
are staged from an isolated HEAD tree, without importing pending border, flex,
flow, pointer or control-state selector work.

`CSS-VARIABLES.md` and its historical reports retain their original paths and
measurements. The new core test file and measurements below are fresh native
evidence, not a replacement live/browser validation run. The existing broader
variable suite remains pending because it also tests border shorthand behavior.

## Integrated behavior

- Custom property names and values retain case, admitted Unicode/identifier
  escapes, comments and quoted content. Native priority and statement parsing
  distinguish delimiters inside components from declaration-level punctuation.
- Custom values resolve in parent-before-child order through the existing
  cascade. Inherited aliases keep the parent's computed value; child overrides
  do not retroactively resolve an inherited alias. `all` does not reset custom
  properties.
- Missing or guaranteed-invalid custom values can use fallbacks; a present
  value invalid for the destination property does not use its fallback. Invalid
  computed ordinary declarations become unset without reviving a losing earlier
  declaration. Shorthand targets participate in the cascade before substitution.
- Evaluated dependency cycles invalidate their members while outside consumers
  can use fallbacks. Unused fallback branches are not evaluated. Native token
  boundaries are preserved rather than merging substitutions into new dimensions.
- The inspected draft profile supports substituted reference names and
  unregistered CSS-wide values. It does not claim deployed-browser parity for
  every draft behavior, registered properties, animation taint or cascade layers.
- Geometry, text, visibility, paint and the committed CSS math path consume
  substituted winners. Mutations, reparenting, media changes and supplied external
  sheets invalidate the existing owners, not a second renderer or style tree.
- Computed custom values and enumeration remain live and read-only; valid empty
  values differ from guaranteed-invalid values. Saved computed objects empty on
  detachment, recover on reattachment and revoke on owner close.

The replacement and cycle algorithms were reviewed on September 4 at
`https://drafts.csswg.org/css-variables-1/` and
`https://drafts.csswg.org/css-values-5/`. The editor-draft replacement-context
model is distinct from older dependency-graph wording. This checkpoint follows
the existing explicitly documented native profile, not a full CSS specification
or interoperability claim.

## CSSOM and resource boundaries

Complete unresolved shorthand replacement/removal and custom-property edits
work through the native inline owner. Pending shorthands remain raw declarations,
not standard expanded pending-substitution slots. Partial removal and lowering
one important unresolved component still throw without mutation. Their raw
enumeration/serialization limitations remain explicit and are tested, not
silently represented as conformance.

Value size, component nesting, dependency/substitution depth, per-scope property
counts, cascade work and retained binding/text limits remain bounded. Shared
inherited maps are reused. Failed rebuilds cannot expose stale custom values and
can recover after the stylesheet is corrected. Close clears retained custom maps.
The package entry exports the helper's capability profile and limits; broader
pending command-host capability wiring is not part of this core-only promotion.

## Validation

The new explicit native suite has 42 cases covering substitution, names,
cycles, inheritance, cascade, CSS math, geometry/pixels, external-sheet/media
changes, inline/computed CSSOM, detach/close and quotas. On pre-promotion HEAD
with just the existing helper copied in, 26 cases fail; all 42 pass with the
integrated core. The matching old style-diagnostic assertion is updated: an
unresolved winning variable is invalid at computed time, not rejected as an
unknown authored value. Unrelated pending selector changes remain excluded.

- Working-tree focused validation passes 249 tests across six allowlisted files.
- Isolated focused validation passes 189 tests across five allowlisted files.
- Production typechecks/builds, strict new/updated-test checks and nine-file lint
  pass in both trees.
- Full native validation passes 9,157 tests across 251 allowlisted files.
- The isolated promotion tree passes 6,387 tests across 190 available files,
  without the pending border/flex/pointer integrations or their absent suites.

Native host-object factories and software pixel changes are not released SafeJS
execution, real CSSOM interoperability or a live reference-renderer comparison.
No live website, socket, real TTY/PTY or SafeJS probe ran; the previously denied
probe remains unrun. No dependency was added and nothing is pushed.

Next promote border cascade/geometry, then remaining flex/inline layout,
paint ordering and scrolling dependencies before the corrected coordinate
adapters. Complete pending-substitution CSSOM slots, custom select presentation,
picker/multiple-selection behavior and the independent runtime/site/UI acceptance
gates remain open. The full seven-day browser goal remains active.
