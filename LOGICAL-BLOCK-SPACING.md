# Native logical block-axis spacing

## Behavior

The native horizontal-tb profile now implements `margin-block`, `padding-block`
and their four `-start`/`-end` longhands. Shorthands accept one or two values,
reuse existing length/math validation, and support CSS-wide values and variable
substitution. Logical declarations retain their identity in parsed declarations
and CSSOM; they are not eagerly rewritten to physical names.

At cascade materialization, block-start/end compete with top/bottom using the
original importance, inline status, specificity and source order. Mapping occurs
after variable substitution, including invalid-at-computed-value-time resets.
The same process applies to generated before/after content. Existing physical
box computation supplies inheritance, font/viewport/percentage resolution,
margin collapse, geometry, painting and hit testing.

Computed style exposes the four logical longhands and two shorthand accessors;
values resolve through the corresponding physical properties. `all` includes the
new longhands. Physical and logical margin/padding declarations remain distinct
for CSSOM get/set/remove operations, and existing native limits still apply.

## Actual layout evidence

Synthetic native tests establish behavior rather than declaration acceptance:

- A 10-pixel-high baseline box becomes 20 pixels high at y=5; its child starts
  at y=8 and the following box moves from y=10 to y=34. Logical and canonical
  physical styles produce identical rectangles, pixels and hit targets.
- Percentage block margins/padding resolve using the containing width; `em` and
  `rem` use existing element/root metrics. Positive margin collapse and existing
  overflow boundaries agree with physical equivalents.
- Actual text and rich-button children receive padding. Generated before/after
  boxes carry the expected margins and padding, with matching raster output.
- Updating an inherited spacing variable changes a real box height 16→24 and
  child y=2→6, updates hit ownership and changes the sampled pixel from blue to
  red. Cached layout/paint/hit results invalidate without DOM-content mutation.

## CSSOM ordering correction

The first integrated focused run exposed **16 new ordering failures**. Generic
shorthand compaction could move a physical or logical edge across an intervening
opposite-mapping declaration. Nested pending `all` pre-emission had the same
risk, and setters could leave an updated edge before a later opposite mapping.

The correction preserves longhand order when physical/logical spacing mappings
coexist, defers unsafe spacing pending-group pre-emission, and moves a spacing
setter's components after later opposite-mapping declarations in its family.
Unrelated setters retain their established behavior. Regressions cover both
families, important declarations, complete pending groups, `all`, direct setters
and effective computed values across `cssText` round trips.

Independent review identified two further cases, reproduced by 16 additional
tests: independently authored variable longhands must not become a new pending
shorthand, and intervening left/right declarations belong to the same logical
property group. The logical shorthand serializer now checks the existing parsed
variable metadata; mixed-mapping protection includes every physical side.
Same-origin pending shorthands retain their existing serialization path.

Existing generic partial-pending removal and non-contained pending-group
serialization limitations are not claimed fixed. Logical block support is not
a general serialization-conformance claim. The independent-variable synthesis
guard applies to the new logical branch; the analogous older physical-shorthand
limitation remains separate work.

## Validation

Focused native validation passes **676 cases**, including **185 new cases**:
99 declaration/CSSOM, 67 style/cascade and 19 layout/raster/hit cases. With the
initial 169-case addition, the old runtime plus unconnected helper/new suites
gives 517 passes and 143 failures, all failures in the three new suites. The
initial integrated runtime gives 644 passes/16 ordering failures, then the first
correction gives 660/0. The 16 review regressions produce 660/16 before their
fixes; the corrected, expanded focused set gives 676/0.

The corrected full selected native gate and final audit pass: **22,926 passed,
zero failed, two unchanged exclusions** across 452 selected files/451 strict
roots and an 804-entry clean manifest. Build, strict checking and formatting
also pass. The run spans September 14, 2026, 08:41:44.970–08:47:12.892 UTC; this
is not a performance comparison. All previous selected case names/statuses
remain unchanged, plus the 185 new cases. An earlier revision passed 22,910
cases with two exclusions but lacked the review fixes; it remains development
evidence, not the final gate. No native pass substitutes for live website,
captured-page, credential, SafeJS, socket or real-terminal acceptance.

Fresh implementation evidence is at
`/dev/shm/agent-browser-logical-block-september14/`. All failed attempts remain:
two old-runtime strict-only attempts required a baseline-compatible test
comparison; one preparation conflict met pre-existing parser ordering and ran
no tests. Later preparation accepts only that exact conflict, keeps the clean
physical expansion once, and adds the logical expansion without adopting the
unrelated reorder. Original runtime evidence is unchanged.

The final gate is `release01`: 1,360 source files, 2,184 compiled files and
155 receipt entries are bound by its audit. Exact final identities:

- `AUDIT.json`: `c99931581248461624d194adbaeac18c49cb9ee75d1f62a52583a9f1144099b6`
- `RECEIPTS.sha256`: `b4c08ce9f687900a1ba31febd62c11478d3d039c214ca58d6e5955478a02d5f9`

A durable byte-identical copy of the new RAM workspace is retained under
`node_modules/.cache/native-validation/logical-block-work-september14/`.
`PERSISTENCE.json` identifies the original paths, copied hashes and excluded
test-tool symlink/transient caches. This is a copy, not a second test execution
or a relocation of historical evidence. `ADOPTION.json` and `POST-COMMIT.json`
bind the committed feature and clean manifest to the final snapshot while
preserving all eight previously tracked residual-diff checks. No pre-existing
uncommitted source or task-tracking work is bundled into the feature commit.

## Boundaries and next work

This implements block-axis spacing in the existing horizontal-tb profile, not
vertical writing, inline-axis mapping or RTL layout. Unsupported writing-mode
and direction/HTML-dir geometry guards remain tested and intact. Sprite assets,
full-page rendering and other unrelated compatibility gaps are not solved.

The original MDN diagnostic had two retained applicable `padding-block` samples;
it motivates this work but is not a replay of the new runtime. Next is a
separately scoped captured MDN observation after committed-source/native-gate
binding. Current Wikipedia geometry remains historically blocked. Original
research, broader live sites/forms, credentials/providers/passkeys/devices,
SafeJS, socket/real terminal and challenge gates remain open. Goal active;
nothing pushed.
