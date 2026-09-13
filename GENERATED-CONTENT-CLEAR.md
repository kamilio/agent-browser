# Native generated-content clearance

Supported normal-flow block and flow-root `::before`/`::after` boxes participate
in physical `clear:left`, `clear:right` and `clear:both`. They use the existing
native float/clearance coordinator and margin/flow rules, not invented geometry
or suppression of unrelated formatting errors.

## Applicability and ownership

- A static or relatively positioned supported block pseudo box retains its
  physical `clear` on the formatting node. The same clearance counter used by
  ordinary elements accounts for it when floats require coordination.
- Empty string content still creates a box. A zero-height clearing box can
  extend its normal-flow owner's height past preceding floats. Hidden paint
  does not remove the box's layout effect.
- Inline and inline-block pseudo boxes do not acquire clearance. Absolute/fixed
  boxes likewise ignore it; none of these inapplicable declarations is a reason
  to reject otherwise supported layout.
- With no relevant floats, physical clearance does not add an artificial
  offset. Existing float scopes and independent formatting contexts still
  determine which floats can affect a clearing box.
- Generated boxes keep origin metadata without adding DOM nodes, source text
  ranges or generated-control references. Existing formatting/layout/float
  ownership and work limits remain in force.

## Limits

Generated floats, logical block clearance, generated flex/Grid/table layouts,
normal-flow generated flex/Grid items, sticky positioning and unsupported
overflow/decorations retain their explicit guards. This feature does not add
those coordinators or change the native float engine's supported scope.

Research and stylesheet pseudo selectors still use their separate contracts.
Clearance does not make a CSS pseudo-element selectable as a DOM element.

## Evidence boundary

The motivating Python homepage replay reports two unsupported generated-clear
boxes. It also has independent CSS/resource, inline-alignment, sticky/overflow
and deferred-layout blockers. Clearing the generated-clear diagnostics is not
proof that its Tutorial click or full-page rendering succeeds. Actual float
clearance, owner/sibling geometry and paint are checked by separate native
regressions; retained-site before/after observations retain exact source and
asset provenance. Native tests, resource capture and complete website behavior
are separate acceptance gates.

## Targeted regressions — September 13, 2026

`src/generated-content-clear.test.ts` adds 38 cases, selected explicitly in
`native-tests.json`. Coverage includes before/after and all three physical
clear sides, opposite-side no-ops, empty clearfix owner growth, hidden paint,
ordinary-element parity, relative offsets, margins, independent float scopes,
flow-root boxes, mutation invalidation, bounded work and actual raster pixels.
DOM references and control targets remain unchanged; generated glyphs retain
the native empty-string reference sentinel, not a new actionable reference.

The unchanged production baseline with the final tests has 471 passing and
30 failing cases across the 12 focused suites. All failures are in the new
feature suite. With the implementation, all 501 cases pass, with no skips;
build, strict checking, formatting and stable source inventories also pass.
Both runs retain identical final test inputs and separate result files.

The initial candidate run had one test-only failure after its geometry and
pixel checks: the new assertion expected an undefined glyph reference instead
of the existing empty-string sentinel. Only that assertion was corrected;
the failed candidate and initial baseline remain preserved. These focused
results are not evidence that the independent Python click blockers are fixed.
Evidence lanes, relative to `node_modules/.cache/native-validation/`:
`python-layout-work-september13/baseline00/`, `fixed00/`, `baseline01/` and
`fixed01/` under that same work directory.

## Selected native validation

The September 13 full selected run reports **19,803 passed, zero failed and
two unchanged skips** across 384 selected suites, with 383 strict roots and
749 committed-manifest entries. There are still 365 unselected entries. Build,
strict checking, scoped formatting, native execution and the independent audit
all exit zero. The 38 new cases account for the increase from 19,765 passes.
This is a pinned candidate snapshot, not blanket validation of unrelated
pre-existing working-tree changes.

The run starts at `2026-09-13T15:08:08.286Z` and finishes at
`2026-09-13T15:12:40.595Z`. The audit verifies 1,290 source/config inputs,
2,124 compiled files and 1,285 unchanged tracked inputs against base
`ea00b5b71952efeae0f7467e3c3280b9dc7471bb`. Only the formatting builder,
two existing expectation matrices, new test file and manifest registration
differ within the candidate. No coordinator rewrite or new dependency is added.

Runtime: `node_modules/.cache/native-validation/native-generated-clear-september13-round00/snapshot01/dist`.

| Evidence | SHA-256 |
| --- | --- |
| Complete source inventory | `9b0e9de877ee416b542a3169025125a3ba89bbbd4db557d1128b3844520de619` |
| Complete compiled inventory | `86c6dbcfc1a59d787d59432a5feb82cc51b06db4336c10c2c952e4fab7e3dde9` |
| Native results | `91b9449961cf45aba9163eab061cdb3c0a34b8e3f3532b56144f77667395b118` |
| Runner summary | `ddef7649ac4b54413cd57120665c47b2b041e996048404ee5b11f74e0d38afd0` |
| Focused 68-file evidence ledger | `bc529f24f1b0159f97ecb5fbae0949887b7b0087b074f0fe711e408ab96e5418` |

`AUDIT.json`, `RECEIPTS.sha256`, `compiled.sha256` and the full results remain
in the runtime lane. The focused ledger is `FOCUSED.sha256` in the work lane.
`allExecutedTestsPassed` and `selectedRunSuccessful` are true;
`allSelectedTestsPassed` remains false because of the two skips. The skips are
the pre-existing focus host-object ceiling and unsupported-display media case;
neither is promoted to acceptance. Live website behavior, sockets, SafeJS,
real TTY/PTY, credentials and passkey devices retain their separate gates.
