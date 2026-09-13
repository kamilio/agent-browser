# Website test inventory — September 13, thirty-first update

**Wikipedia's two footer pseudo-elements now use real native table handling.**
The unchanged portal still fails full-page geometry. This continues inventory 30,
retaining all historical paths, failures and measurements.

## Website scope

Only `www.wikipedia.org` is exercised in this update, through two bounded offline
native inspections of the same 119,573-byte capture. **No new live visit or host**
is added. Native computed-style attribution identifies `footer.footer`'s real
static table pseudos; no raw-source search or alternate browser is used.

The final replay has zero HTTP, one load, three queries, one formatting inspection,
one geometry request and two generated-style reads. Generated-display guards
fall 2→0 and generated-clear guards 1→0. Generic display markers remain two,
while physical-clear coordination rises 4→5. Overall formatting issues fall
233→231, boxes 2,252→2,250 and counted work 18,689→18,685. CSS issues stay 132;
full-page geometry remains unsupported. Actual input, fieldset, rich-button child
and closed-dialog behavior stay intact.

The follow-up runs at 17:56:18.466–17:56:18.771 UTC, September 13, 2026, with
verified source/runtime/history pins, exit zero and process/private-directory
cleanup. Diagnostic completion is not successful rendering, search or live speed.
Full evidence: `WIKIPEDIA-GENERATED-TABLE-REPLAY-SEPTEMBER-13.md`.

## Native functionality and tests

Generated static block tables use existing anonymous table fixup, intrinsic sizing,
native layout/raster, collapsed-border resolution and physical clearance. Empty
clearfixes are not fake zero-sized blocks; nonempty content is supported too.
Fieldset ownership links survive ordinary table-whitespace ID compaction. Static
table shells reach float coordination without weakening flex/grid or unsupported
table-profile guards. Details: `GENERATED-CONTENT-TABLES.md`.

Two new suites add **85 cases** (47 formatting, 38 layout/raster). Expanded final
focused baseline: 902 passed / 70 failed; candidate: **972 passed / zero failed**
across 27 suites, no skips. The 69 newly supported cases fail on old production;
16 new invariant/rejection cases already pass there. One existing table-clear
negative becomes an actual geometry/glyph/immutability check; its suite retains
23 cases and still rejects flex/grid clearance.

All initial failed attempts remain recorded, including the first full gate's
20,397 passes / one stale table-clear rejection / two skips. The final gate is
**20,398 passed / zero failed / two unchanged skips**, 396 selected files / 395
strict roots / 758 manifest entries. Build, strict, scoped formatting, immutable
source and committed-source validation are separate from website acceptance.
Runtime: `native-generated-table-september13-round01/snapshot01/dist` under the
native-validation cache. There are 1,299 source and 2,124 compiled inputs; the
362 unselected manifest entries remain unselected.

## Still open

Wikipedia CSS/image/direction/inline-alignment/overflow and remaining coordination
limits still prevent geometry. Python's real Tutorial click remains failed; it
is not rerun here. More varied genuine navigation/form interactions and repeatable
live performance measurements are needed, rather than only homepage/status checks.

Hardware/benchmark/Astra research is not refreshed; verified Reddit/Poe opinions
remain incomplete. The two native skips, unselected suites and separate credential,
passkey-device, SafeJS, socket and TTY gates remain open. No fingerprint spoofing
or challenge solving, new engine/dependency, private credential access or push.
Pre-existing work is preserved. Overall browser goal: **ACTIVE**.
