# Explicitly positioned children of a static Grid parent

September 11, 2026: the page-level guard previously rejected every absolute or
fixed child of a Grid, even when that Grid did not establish its containing block
and both physical axes had explicit anchors. This is the first recorded MDN
boundary in `MDN-POSITIONED-GRID.md`, not proof that it is MDN's only limitation.

## Native behavior

- Resolve the existing native absolute containing-block ancestor once, with every
  visited ancestor charged to the positioning work budget. Reuse its identity
  when actual ancestor-order geometry becomes available.
- Explicit physical anchors on both axes can use a non-Grid positioned ancestor's
  padding box or the initial viewport even when the immediate parent is a Grid.
- Fixed children retain viewport coordinates; a positioned Grid ancestor alone
  does not replace their containing block in the supported transform-free profile.
- Positioned children remain out of Grid placement and track sizing. Do not turn
  an accessibility menu into an in-flow item, remove its CSS or synthesize geometry.
- Put the Grid coordination boundary in `layoutPositionedDocument`, so callers of
  that lower-level API cannot silently bypass the page-entry guard.

The real Grid-containing-block, out-of-flow Grid-container and direct-Grid-child
static-position cases remain explicit unsupported errors. Ancestor Grid
containing blocks are now checked even through intervening static wrappers; the
previous direct-parent predicate missed those cases. Inline/transformed
containing blocks and other existing positioning limits are unchanged.

`GRID-POSITIONING-SOURCE.md` records native extraction of W3C Grid sections 9.1 and
9.2. It separates conditional Grid-area construction from Grid-parenting rules and
documents the external containing-block/inset source gaps; it is not a blanket
conformance claim.

## Regression evidence

The new cases exercise the measured menu's negative top and percentage/calc width,
out-of-flow track exclusion, viewport percentage anchors from either edge,
absolute/fixed distinctions, an ordinary positioned ancestor across a static
Grid, static-anchor and actual Grid-containing-block boundaries, lower-level API
guards, and genuine native link activation using Grid geometry with an offscreen
menu. The link test uses fixture transport, not a public website.

Development lane:
`node_modules/.cache/native-validation/native-grid-positioning-work-september11/`.

| Snapshot | UTC execution | Native result |
| --- | --- | --- |
| `baseline` | 14:54:08.507–14:54:10.656 | 70 pass, 15 fail |
| `fixed01` | 14:55:07.937–14:55:09.912 | 85 pass, 0 fail |

Both snapshots use clean tracked `82e242c` plus their explicitly owned files; two
test files are selected from the native manifest. Source hashes remain stable,
there are no retries or exclusions in this focused run, and network guards remain
active. After `fixed01`, one unused type import was removed before the broad gate.

The broad clean build/strict/format/native gate is recorded separately in
`node_modules/.cache/native-validation/native-grid-positioning-september11-round01/`.
Its initial configuration import rejected an untracked test absent from the clean
archive, before any build/test execution; `PREPARATION-FAILURE.md` preserves that
event. The corrected selection includes 137 tracked native files and 136 strict
roots, retaining only the pre-existing runtime exclusion and strict-only omission.
The corrected gate passes **8321 native cases, zero failures and one existing
exclusion**, at **14:56:53.536–14:58:45.792 UTC**. Build, strict, format and native
commands all exit zero; all 1017 source/input files remain stable and the build
contains 1812 compiled files. Parent independently rechecks the source inventory
and byte-compares all four owned source files against this immutable snapshot.

## Prior integrated baseline and website gates

Before this fix, the independent combined Grid-percentage/list-item gate passed
8183 native cases with zero failures and one existing exclusion across 132 files
and 131 strict roots, at 14:18:08.722–14:19:53.401 UTC. Its immutable clean tracked
`01e5e81` snapshot contains 1017 source/input files and 1812 compiled files:
`node_modules/.cache/native-validation/native-grid-list-integration-september11-round01/`.
Build, strict, format and native commands all exit zero with stable inputs.

Neither that earlier gate nor the focused regressions prove MDN renders or its
link click succeeds. A new unchanged-capture replay must establish the next exact
website boundary. Original research, real credentials/passkey-device acceptance,
fingerprint effectiveness, challenge handling and broader website goals remain
open; no live website or credential action is part of these native test gates.
