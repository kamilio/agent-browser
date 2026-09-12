# Float diagnostics follow actual formatting ownership

## Corrected behavior

`buildFormattingTree` now emits its float-layout diagnostic from the same
`floating` predicate that creates a native `floatSide` owner. Previously it
counted every non-none computed float, even when the element was a flex/grid
item or an ordinary boxless `display:contents` wrapper. The float coordinator
then rejected those mismatched counts before it could consider actual layout.

This is one production-line change in `src/formatting-tree.ts`. It does not
change computed float values, item blockification, CSS cascade or real floating
ownership. Actual descendant floats and independent unsupported CSS, positioning,
overflow, Grid-area and nested-float coordination guards remain. Sticky positioning
is still unsupported: dropping its unmatched float diagnostic does not implement
sticky positioning or establish general sticky/float conformance. Replaced and
unusual `display:contents` cases are not added by this fix.

The investigation follows the captured Python documentation failure in
`PYTHON-FRESH-NATIVE-DIAGNOSIS.md`: ten float diagnostics produced an ownership
count mismatch. That historical result remains unchanged. This repair's native
fixture success alone is not a successful Python layout or live website result.

## Native regression coverage

Two new suites add **79 cases**:

- `src/float-applicability-geometry.test.ts`: three literal geometry fixtures for
  flex/grid ignored floats and a boxless wrapper around a genuine float. They
  compare native geometry/raster/hits with float:none controls and assert literal
  rectangles, retained computed values, reference ownership and unchanged snapshots.
- `src/float-applicability-layout.test.ts`: 76 cases covering physical/logical
  ignored floats, ordering, margins/gaps/alignment, static/relative items,
  boxless/hidden nodes, mutations, real descendant ownership, raster invalidation,
  independent unsupported guards, bounded work and owner cleanup.

Six obsolete expectations in existing float formatting/display tests now match
actual applicability. The associated width and unsupported-position guards are
still asserted. No existing cases were removed or newly excluded.

Main's three canonical cases failed against clean15522 before the change.
Final focused validation passed **384/384 in nine actual suites**,
September12 **20:01:06.684–20:01:22.738 UTC**. The worker independently passed
76/76 with strict TypeScript and formatting. Its original fixture/oracle failures
and clean15522 control evidence remain under `layout-worker/`; unsupported nested
floats, adjoining-margin clearance and absolute Grid-area coordination are
explicit negative cases, not made to appear supported.

The initial Main focused selection mistakenly named an untracked test absent
from its clean snapshot; only seven suites actually ran. `SCOPE-NOTE.md` retains
that error. Later preparation checks every selected file exists and uses tracked
`flex-layout.test.ts`. Full gate round00 passed production compilation but failed
strict test typing because Main's cleanup-array type referenced its own fixture
return type. `STRICT-FAILURE.md` preserves that result. Only the cleanup type was
corrected; round00 was not overwritten or counted as a passing gate.

## Final isolated gate

`native-float-applicability-september12-round01`, September12
**20:02:06.780–20:05:51.501 UTC**:

| Check | Result |
| --- | --- |
| Native tests | **15,601 passed, 0 failed, 2 unchanged exclusions** |
| Selected suites / strict roots / clean manifest | 299 / 298 / 677 |
| Production build / strict TypeScript / scoped formatting | All pass |
| Source / compiled files | 1,186 / 1,996 |
| Unchanged tracked inputs | 1,180 |
| Owned source/test inputs plus manifest | 5 plus 1 |
| Before/after source inventory | Identical |

Source ledger SHA256:
`a2a34b8dd586644006bb1eb3171c60beff8ca79f31f7427c36767e6f013de27f`.
Compiled ledger SHA256:
`2bf568b0b959239ec069f2745a3d49928ed8e529b62ddba368ba9392dce7fe4e`.
The gate's `AUDIT.json`, twenty-entry receipt ledger and subsequent
`COMMIT-VERIFICATION.json` bind this tested snapshot to its local commit.
The two exclusions remain the existing focus host-object ceiling and media
fallback guard cases; neither is promoted to acceptance.

The snapshot uses the explicit native manifest, pinned Node22.22.0 and existing
compiler/Vitest/Biome under kernel socket denial and the native guard. It excludes
unrelated dirty work. No dependency, browser engine, public network operation,
credential/provider/device/TTY, SafeJS or challenge bypass is part of this gate.

## Source evidence and remaining gates

`FLOAT-APPLICABILITY-SOURCE.md` preserves three fresh native W3C captures,
including the published Flexbox node-limit failure and incomplete first Display
sampling. Main independently verifies 14 actual Git objects against 28 archived
objects and its 159-entry source seal at20:02:06.699UTC. The separate
`FLOAT-APPLICABILITY-SOURCE-FOLLOWUP.md` establishes the needed ordinary-boxless
definition and an explicitly older local Flexbox editor-source rule without
retrying the failed published HTML. Display Appendix B remains unexamined.

Native fixture coverage is not whole-site, script, provider/passkey-device,
performance or challenge acceptance. Python's remaining CSS/layout and SVG
limitations, fresh website testing and the broader research/browser objective
remain open in `TASKS.md`. No changes are pushed by this checkpoint.
