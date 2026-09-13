# Wikipedia generated-table replay — September 13, 2026

The actual footer's generated tables now carry native table-layout metadata and
physical clearance. **Full Wikipedia geometry remains unsupported.** This report
adds new evidence without rewriting any prior portal result.

## Exact input and scope

One unchanged 119,573-byte retained response for `https://www.wikipedia.org/`:
SHA-256 `6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
The native document retains 2,708 nodes, revision 2,712 and a 1280×900 viewport.
This is an **offline replay**, not a fresh website visit.

The prior native attribution reads the real generated styles for owner `e2373`,
`footer.footer`: both `::before` and `::after` have one ASCII space, static
`display:table`, no float, and respectively `clear:none` / `clear:both`.
There is no raw markup/CSS search, rewritten stylesheet or invented pseudo DOM ref.

The new run performs one load, three queries, one formatting inspection, one
geometry request and two generated-style reads. Zero HTTP, actions, raster calls,
page scripts, SafeJS, credential/device access or real TTY. The same private empty
HOME/TMP, process/network guards, source/runtime/history pins and watchdog remain.

## Observed comparison

Before: sealed `native-wikipedia-generated-attribution-september13`, using the
20,313-test runtime. After: `native-wikipedia-generated-table-september13`, using
the audited 20,398-test runtime (`native-generated-table-september13-round01`).

| Native diagnostic | Before | After |
| --- | ---: | ---: |
| CSS issue occurrences | 132 | 132 |
| All formatting issue occurrences | 233 | 231 |
| Generated-display guard | 2 | 0 |
| Generated-clear guard | 1 | 0 |
| Generic table/display coordination marker | 2 | 2 |
| Physical-clear coordination marker | 4 | 5 |
| Visited DOM nodes | 2,114 | 2,114 |
| Formatting boxes | 2,252 | 2,250 |
| Logical text code units | 5,016 | 5,016 |
| Counted formatting work | 18,689 | 18,685 |
| Deferred formatting subtrees | 3 | 3 |
| Full input geometry | Unsupported | Unsupported |

Both generated boxes remain genuine table shells requiring coordination, with
`contentMode:table`, independent contexts and no whitespace text child. The after
box carries `clear:both`. The new physical-clear marker is expected coordinator
work, not an omitted warning. Formatting-only shells do not prove successful
whole-page layout; isolated native fixtures separately exercise real table sizing,
clearance, glyphs and pixels.

Unchanged CSS counts: 97 unsupported properties, 24 values, eight selectors, two
media queries and one at-rule. Remaining formatting markers include overflow (7),
position coordination (16), unsupported element/image (1), inline vertical
alignment (32), direction (22), float coordination (14), generic display (2) and
physical clearance (5). Geometry still returns `unsupported`; no rectangle is
fabricated. A bounded geometry error string is not a complete occurrence ledger.

The real input `e239`, fieldset `e230`, rich submit button `e522` and child `e524`
remain present. The closed dialog `e2334` remains absent from formatting. DOM
revision, input bytes, computed generated styles and action-target identities
are preserved; formatting IDs may change when omitted boxes change allocation.

## Execution and integrity

- September 13, 2026, **17:56:18.466–17:56:18.771 UTC**; PID/process group 840637.
- Exit zero, 8,054 output bytes, no timeout/output-cap/stream error; process group
  absent afterward. Diagnostic success does not mean geometry success.
- Before/after source, compiled and historical pins match; no attempted network
  or process escape. Private empty directories removed; zero cleanup errors.
- Final native gate: 20,398 passed / zero failed / two unchanged skips, 396 selected
  files / 395 strict roots / 758 manifest entries; 362 entries remain unselected.

Evidence: `node_modules/.cache/native-validation/native-wikipedia-generated-table-september13/`.
The 31-entry `EVIDENCE.sha256` ledger has SHA-256
`061a527a1c2816259a3485f8e2cb2553e184b3dafec40f9bd460667f0a90a79a`.
`RESULT.json` SHA-256:
`b046539b89bd0a89812de67c25a791f0610f5ef1689b9a9cd3974e204206962c`.
Prior attribution ledger SHA-256:
`88f3cab49903f8e8c5e25652233b70b9666388a2f9391501d9a01e823bc2aa56`.

Four fewer counted formatting operations and two omitted boxes are not a measured
live speedup. Search submission, whole-page rasterization, broader varied-site
interaction/performance, research freshness and separate restricted acceptance
gates remain open. No fresh host or completed research topic is added by this run.
