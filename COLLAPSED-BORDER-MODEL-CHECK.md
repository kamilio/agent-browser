# Collapsed-border dense-model checks

The native collapsed-border resolver now has64 additional deterministic cases:
32 seeded grids in each of its LTR and RTL conflict-selection modes. They
compare sparse resolution with an independent dense scan of every grid boundary.
The existing manifest-listed `src/table-collapsed-borders.test.ts` grows from104
to168 cases; no production code, dependency or manifest entry changes.

The generated inputs combine cell spans, gaps, missing cell participants,
table/row/column/group contributors, hidden/none/solid styles, fractional widths
and different colors. For each input the checks compare every visible segment's
geometry, owner and color, all cell half widths and the outer perimeter widths.
They then reverse participant order and cell occupancy order independently,
verify unchanged physical results, accept the exact measured work budget and
reject a budget one unit smaller. Seeds and diagnostics are reproducible.

This validates the documented native conflict contract, not another engine's
pixels, full CSS Tables Level3, a complete RTL layout, or a live website.
Generated small grids supplement rather than replace the existing explicit
large-input/resource-limit, geometry, raster and navigation tests.

## Results

- Focused20-suite run: **911 passed,0 failed**, September12,2026,
  04:00:35.474–04:00:45.085 UTC. The file inventory is unchanged across execution.
- Full selected regression: **11848 passed,0 failed,2 unchanged exclusions**,
  04:01:17.362–04:03:44.336 UTC. Source build,212 strict roots, scoped formatting
  and213 native suites pass. The clean manifest has607 entries, not607 executed
  suites.1103 source files and1944 compiled files are audited;1101 non-owned
  tracked inputs plus the unchanged manifest match baseline `ffc7b2e`.
- The unchanged exclusions are the total-host-object-ceiling pressure case and
  the real-unsupported-display media case. Existing legacy grid failures and
  manifest-listed untracked tests remain outside the selected clean snapshot.
- The first broad preparation failed before compilation: a path-normalization
  error copied the old `dist` directory, which the runner correctly rejected.
  That lane remains intact. Preparation now compares resolved paths; the new
  round02 passes the same no-existing-dist assertion and builds from source.
  The focused run also contained the old compiled directory; its native Vitest
  TypeScript checks are not presented as compiler evidence.

## Evidence

Private work lane: `node_modules/.cache/native-validation/collapsed-model-work-september12`.
Full gate: `node_modules/.cache/native-validation/native-collapsed-model-september12-round02`.
The unchanged runner uses private HOME/TMP and socket-denied subprocesses. These
runs do not authorize or establish live HTTP, credentials, passkey devices,
TTY, real SafeJS or challenge bypass acceptance.

SHA256 pins:

- Test source: `add6d2ab999e7bf40848b4c29cea59b4408ee6a4da936e07d75e87681bcc9ba0`
- Source ledger: `5fb88b7d8cc6d044d3284c129e51a3af1952a708d5db6c476b26a564c61b9690`
- Compiled ledger: `048a832dc4554e25fbbf8c53f0b341add823fedc2195e354cb181f719a6ed943`
- Native results: `5aae7513c5fd4ec3c5758a86bee1823b053a4d569d4b7b707ce9c34bfaf180f7`
- Summary: `32fd94cce2ce829af1d2407d273ff199780eb8ace6f278d469136ef545924033`
- Audit: `cc58cfd9c768018b37473fc5bf9d106a0ff323c8ff5ad01f51bd97c3628c929e`
-20-entry receipt ledger: `7c888d16011e7b4174411d62e06951c8c2ea8257535ec39bcc492162f8a670a5`

Lua captured-page and zlib live follow-ups use the separately sealed11784
production release. This test-only commit does not retroactively change those
runtime identities or imply their pending outcomes.
