# Native generated block tables

Generated static `display:table` boxes use the native table pipeline rather than
being treated as ordinary blocks or special-cased zero-size clearfixes. This
addresses the two generated footer boxes found in the retained Wikipedia portal.

## Actual source attribution

A bounded native inspection on September 13, 2026, 17:22:27.336–17:22:27.643 UTC,
reuses the unchanged 119,573-byte portal on the audited 20,313-test runtime. It
makes one load, three queries, one formatting inspection, one geometry request
and two generated-style reads. No HTTP, source-text search or markup mutation.

Both deferred boxes belong to native owner `e2373`, `footer.footer`:

| Pseudo | Generated content | Computed display | Position / float | Clear |
| --- | --- | --- | --- | --- |
| `::before` | One ASCII space | `table` | `static` / `none` | `none` |
| `::after` | One ASCII space | `table` | `static` / `none` | `both` |

These are native owner/name associations, not invented DOM references for pseudo
elements. Historical formatting IDs 1861/2239 identify that inspection only.
Its original geometry failure, CSS issues, real fieldset/button children and
formatting measurements are unchanged from the preceding Wikipedia replay.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-generated-attribution-september13/`.
The 31-entry receipt ledger has SHA-256
`88f3cab49903f8e8c5e25652233b70b9666388a2f9391501d9a01e823bc2aa56`.
`RESULT.json` SHA-256:
`c6a63f59152788fb0f6f263e9ff6fbde623542f3ec987ba24f49fb9cc932d6aa`.
This is offline diagnostic attribution, not a fresh visit or successful page render.

## Implementation

- Generated static block tables retain their table styles, intrinsic sizing,
  independent context and table content mode. Nonempty text gets genuine anonymous
  row-group, row and cell boxes through the existing table fixup algorithm.
- Formatting still reports a generic table shell requiring coordination. Native
  table layout resolves that shell; generated-display failures are not merely
  filtered away. Unrelated page failures remain visible.
- Empty and whitespace-only generated tables also use real table layout. A sole
  all-ASCII-whitespace child is omitted before allocation because table fixup would
  discard it. This avoids triggering whole-tree ID compaction for a clearfix;
  it does not bypass table sizing, borders or clearance.
- The existing collapsed-border solver handles reference-free generated table
  roots. Unresolved generated and ordinary collapsed-table guards are retained
  separately until actual border resolution succeeds.
- Physical `left`, `right` and `both` clearance reaches native float coordination.
  Review found that its old admission check rejected deferred table shells before
  table layout could run. Admission now recognizes only properly marked static
  block-table shells and retains downstream table/profile validation.
- When ordinary table whitespace fixup compacts formatting IDs, fieldset outer/
  content ownership links are remapped with parent/child IDs. DOM owner IDs are
  not formatting IDs and are not rewritten.

## Boundaries

The reference contract is equivalence with supported native real-element block
tables, not complete CSS table conformance. Positioned generated tables,
`inline-table`, generated floats/items, unsupported overflow and native table
profiles still reject. No fake rectangles, synthetic DOM references, stylesheet
rewriting or reduced whole-page guards are introduced. No new runtime dependency.

Counted-work checks and native fixture results do not establish live-site speed,
full Wikipedia geometry/search or credential/device/SafeJS/socket/TTY acceptance.

## Focused validation

The two new manifest-listed suites contain 85 cases: 47 formatting/ownership and
38 layout/geometry/raster cases. They compare generated tables with supported
real-element tables, including text, whitespace, borders, collapsed borders,
intrinsic widths, clearances, mutations, limits and retained rejection profiles.
Fieldset ownership is checked after genuine ordinary-table whitespace compaction.

On identical initial accepted test definitions, the old-production baseline records
880 passed / 69 failed / zero skipped; the candidate records **949 passed / zero
failed / zero skipped** across 26 suites. Build, strict compilation, formatting
and immutable-source checks pass. Candidate execution spans
September 13, 2026, 17:43:46.632–17:44:15.229 UTC; the native command itself ends
at 17:44:15.194 UTC.

Earlier lanes are retained, not overwritten: baseline00 875/73 and fixed00
936/12; baseline01 880/69 and fixed01 946/3. Fixture corrections account for the
native table/BFC oracle, unsupported letter spacing, generated-only mutation CSS,
native caption display, out-of-flow ownership, software-button captions and
positioned-table guard distinctions. The last three failures used the default
unsupported fieldset border profile; specifying solid borders exercises the
intended ownership path. No production change was made to conceal those errors.

Evidence: `node_modules/.cache/native-validation/wikipedia-generated-work-september13/`.
The initial accepted pair is `baseline02` / `fixed02`; previous failed attempts
remain there. An independent audit verifies all six immutable source inventories,
identical pairwise test sources and all case identities. Of the 85 new cases,
69 fail on old production and 16 retain existing rejection/invariant behavior.

The first broader gate (`native-generated-table-september13-round00`) records
20,397 passed / one failed / two skipped. Its sole failure is the existing
`float-shell-limits.test.ts` expectation that every clearing deferred table must
reject. That specific supported table case is replaced with assertions for actual
X/Y/width, glyph coordinates and unchanged DOM/snapshot; flex/grid shell
rejections remain. The suite retains its original case count. Production is
unchanged from the first focused candidate.

Expanded final focused pair `baseline03` / `fixed03`: **902 passed / 70 failed**
on old production, **972 passed / zero failed / zero skipped** on the candidate,
across 27 suites. Build/strict/format and source stability pass. The candidate run
spans September 13, 2026, 17:50:39.598–17:51:08.444 UTC. The broader failed gate
and earlier narrower passing scope remain separate evidence, not rewritten passes.

## Selected native gate

Final immutable gate `native-generated-table-september13-round01` records
**20,398 passed / zero failed / two unchanged skips**, with 396 selected files,
395 strict roots and 758 manifest entries. The other 362 entries stay unselected.
Build, strict compilation, scoped formatting, source stability and audited inputs
pass. The run spans September 13, 2026, 17:51:24.281–17:56:12.212 UTC.
There are 1,299 source inputs, 2,124 compiled files and 1,291 unchanged tracked
inputs. The skips remain the host-object-ceiling and unsupported-media-display
cases; neither is converted into a pass.

Runtime: `node_modules/.cache/native-validation/native-generated-table-september13-round01/snapshot01/dist`.
Audit SHA-256: `462d19862c2f17120824b0501722e456050b4a44cd8a44719427d94e60b1db6b`.
Receipt ledger SHA-256: `da35adcb52830b4aec23883f8177264496f7d6116ac07b4c68b88f43537133ec`.

The unchanged Wikipedia capture is then replayed once, without HTTP. Generated
display/clear guards disappear, boxes decrease 2,252→2,250 and counted formatting
work decreases 18,689→18,685. CSS issues remain 132 and full-page geometry still
fails. See `WIKIPEDIA-GENERATED-TABLE-REPLAY-SEPTEMBER-13.md` for the exact remaining
guards and separate scope; this is not a measured live speedup or search pass.
