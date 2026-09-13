# Wikipedia inline-edge attribution and replay — September 13, 2026

**The remaining three inline-alignment guards are resolved. Full-page geometry
is still unsupported.** Commit `03cbad9` adds real top/bottom line geometry, not
warning suppression. Both observations below use the original, unchanged portal
response through the repository's native browser. There are no new HTTP requests.

## Native attribution

At **21:09:43.162–21:09:43.462 UTC**, the previously audited 21,097-test runtime
loads the captured response once, runs one native universal element query and one
formatting inspection, inspects 1,174 elements and reads seven generated styles.
It identifies 32 inline-alignment candidates and exactly three unsupported cases:

| Native reference | Element | Used display | Alignment |
| --- | --- | --- | --- |
| `e53` | `h1.central-textlogo-wrapper` | `inline-block` | `bottom` |
| `e234` | `div#search-input` | `inline-block` | `top` |
| `e522` | Rich search button | `inline-block` | `top` |

There are no remaining generated alignment cases. This inspection performs no
geometry call, action or rasterization. Its formatting issues and metrics exactly
match the earlier replay. It does not inspect raw markup or remove styles.

## Implementation and native tests

Inline atomic/replaced boxes now align their margin boxes to the line top or
bottom. Baseline-aligned text and parent struts remain independent of the atomic
box's internal baseline. Float projection and final line construction share the
same minimum-height calculation; actual fragments and downstream geometry move.
Signed leading and margins, generated boxes, controls, relative offsets, raster,
hit testing and click-point selection have regression coverage. Ordinary inline
aligned-subtree support remains explicitly outside this profile.

The final native run is **21:22:52.490–21:27:49.463 UTC**, audited at21:27:55.965:

- **21,169 passed / zero failed / two unchanged skips**.
- 413 selected test files / 412 strict roots / 767 manifest entries; 354 unselected.
- 72 new cases: 68 edge-alignment, two quirks images, two positioned generated boxes.
- Identical 18-file focused comparison: 925 passed / 62 failed → 987 passed / zero failed.
- Build, strict, scoped formatting and source checks pass; 1,310 source files,
  2,132 compiled files and 1,300 unchanged tracked inputs are verified.
- Existing host-object-ceiling and advisory-media/display skips remain explicit;
  the audit does not report that every selected test passed.

Initial failures remain preserved: fixed00 had three fixture/obsolete-expectation
failures; the first full round had 21,166 passes and one obsolete generated atomic
top-alignment guard expectation. Corrected negatives still test unsupported
profiles, and positive tests cover newly admitted geometry. No test is excluded.
The failed full round is not used as the final audited runtime.

## Unchanged-source replay

At **21:28:05.593–21:28:05.901 UTC**, the final audited runtime executes the same
native probe: one load, three queries, one formatting inspection, one genuine
input geometry request and two generated-style reads. No actions or raster run.

| Measurement | Previous replay | New replay |
| --- | ---: | ---: |
| Inline alignment guards | 3 | **0** |
| Total formatting issues | 202 | 199 |
| CSS issues | 132 | 132 |
| Visited DOM nodes | 2,114 | 2,114 |
| Formatting boxes | 2,250 | 2,250 |
| Formatting text units | 5,016 | 5,016 |
| Formatting work | 20,971 | 20,974 |
| Deferred subtrees | 3 | 3 |
| Full geometry supported | No | **No** |

The original 119,573-byte response, 2,708 document nodes, revision2,712, 1280×900
viewport, input/button/fieldset identities, closed-dialog exclusion and generated
footer metadata/styles are unchanged. The geometry error still reports24 invalid
CSS values, one at-rule,97 properties,eight selectors,seven overflow cases,one
unsupported element and22 direction cases. The complete issue ledger separately
retains two media diagnostics,16 positioned-coordination, two display,14 float
and five clear cases. The bounded error string is not the complete issue ledger.

The replay's zero exit status means the diagnostic completed, not that search,
input actionability, whole-page pixels or navigation succeeded. Its single0.30s /
121,064KiB observation is not a repeatable benchmark or speedup. Python, Internet,
HTTPBin and the other previously tested sites are **not rerun in this checkpoint**.

## Evidence and containment

All paths below are under `node_modules/.cache/native-validation/`:

- Attribution: `native-wikipedia-alignment-attribution-september13/`;
  31-entry ledger `878d4f8617f19c163d4a6ae8eb29a3632c6f162c84a4a7148906cdfecb34ad07`.
- Native gate: `native-inline-edge-september13-round01/`;
  20-entry receipts `1888d06212c2bfb4e3169916ed8dee937bfd0a6a1b471f00276042272d4a995f`.
- Native audit SHA256:
  `3468eca02698fc52e5e365ce5b2b5c52ba739831c8a7a6ae91c6680eb738d973`.
- Replay: `native-wikipedia-inline-edge-september13/`;
  31-entry ledger `f87a23153b08b808bb94c6e01fd844799f297ec72b5a868d8650b423f6bd82dc`.
- Original response SHA256:
  `6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
- Independent comparisons, failed lanes and review:
  `alignment-attribution-work-september13/`.

Both website probes use empty private HOME/TMP, kernel and JavaScript network
denial, process denial, bounded work/output/time, pipes rather than TTY/PTY, and
run-once locks. Source/runtime/history inventories are checked before and after;
documents close to zero nodes, private directories are empty and removed, and
process groups955684/967944 are verified absent. Guard/process attempts and cleanup
errors are empty. No SafeJS, credentials, devices, alternate browser, source/style
stripping or challenge bypass occurs. The earlier native CSS source extraction
is reused without a new fetch or a latest-standard claim.

Next work remains the real CSS, direction, overflow and element requirements,
plus Python/Internet original-asset pointer flows and repeatable performance.
The broader goal and four requested research topics remain unfinished.
