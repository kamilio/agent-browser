# Native text-underline-offset

The native style and raster pipeline supports inherited `text-underline-offset`
without adding it to the `text-decoration` shorthand. This addresses an actual
unsupported property in the retained Python documentation page.

## Behavior

- Initial `auto` preserves the existing native underline position.
- Signed lengths, percentages and existing bounded `calc()`, `min()`, `max()` and
  `clamp()` expressions pass through stylesheet, inline and computed CSSOM APIs.
- Absolute, font-relative and viewport-relative lengths compute to pixels;
  percentages and mixed percentage expressions remain relative. Inherited
  computed lengths stay fixed; percentages use the decorating element's font.
- Explicit zero uses the alphabetic baseline, not the automatic underline
  position. Positive offsets move below that baseline, negative offsets above.
  Underline thickness extends outward from that position.
- The originating decoration owns its offset. Descendant style changes do not
  move an ancestor's underline. Separately originating descendant lines can use
  their own inherited or specified offset.
- Overline and strike-through positioning is unchanged. An offset with no
  originating underline is not resolved into raster coordinates.
- Geometry, hit-testing and scroll extents do not grow merely because underline
  ink moves. Existing clipping, blending, ink skipping and work limits apply.

`cssTextDecorationProperties` remains the four shorthand components. The separate
`cssTextDecorationStyleProperties` registry adds offset for CSSOM, `all`, cascade
and computed-style handling. Shorthand assignment, CSS-wide shorthand values,
serialization and removal do not reset or remove the independent offset.

## Source and limits

Source: the already captured native reader output for CSS Text Decoration Level 4,
August 17, 2026 Editor's Draft, retrieved September 13. The `underline-offset` and
`line-offset-zero` sections establish inheritance, shorthand independence and
baseline zero. No fresh source request occurs for this feature. The source table
still labels percentages N/A despite explicit percentage prose; that inconsistency
is preserved, not silently corrected.

Reader audit: `node_modules/.cache/native-validation/native-decoration-editor-source-september13/reader-0-AUDIT.json`.
SHA-256: `17a0d9bfb37e8f5bd3066a3c008cb91b9d0689757b8cfc835b731fad1728882a`.
The two selected sections and fragment hashes are independently reverified in
`node_modules/.cache/native-validation/underline-offset-work-september13/SOURCE-VERIFICATION.json`.

This does not implement `text-underline-position`, vertical writing, downloaded
font underline metrics, generated-content decoration painting or a new ink-skip
property. Existing placement limitations and unsupported-feature guards remain.
Source length, expression complexity and finite signed layout-length limits apply
before raster work. No dependency or script-runtime change is involved.

## Focused regression evidence

The two new test files contain **136 cases**: 84 parser/style/CSSOM cases and
52 actual-raster cases. All 136 fail on the old runtime and pass on the candidate.
Seven existing expectations now include the independent style property in `all`,
advertised properties or complete computed-style objects; no test is removed.

The identical corrected tests produce **740 passed / 143 failed** on the old
runtime and **883 passed / zero failed** on the candidate, across 18 selected
manifest-listed suites. Build, strict compilation, formatting and before/after
source integrity checks pass in both runs; neither contains skipped tests.

Initial evidence is retained: baseline00 was 741/142, and fixed00 was 882/1.
The single candidate failure was an existing complete-style-object expectation
missing the new `text-underline-offset: auto` field. Correcting that expectation
required no production change. Baseline01/fixed01 contain the corrected tests.

Evidence: `node_modules/.cache/native-validation/underline-offset-work-september13/`.
The 64-entry focused receipt ledger has SHA-256
`842d58a5ecbd62e43858361603d6affb00cd14c5b875e9d4f6e90f584853b992`.
Read-only review found no concrete integration defect; it did identify cold
ancestor-style computation as an unmeasured performance risk. These test results
do not establish a speedup or successful real-site navigation.

## Selected native gate

Final gate: **20,313 passed / zero failed / two unchanged skips** across 394
selected suites and 393 strict roots. The 756-entry manifest leaves 362 entries
unselected. The total increases by precisely the 136 new cases; no additional
existing suite is newly selected. Build, strict compilation, formatting and
unchanged-input checks pass. Run: September 13, 2026,
17:06:40.641–17:11:19.560 UTC.

Runtime: `node_modules/.cache/native-validation/native-underline-offset-september13-round00/snapshot01/dist`.
Audit SHA-256: `c7c9b5d3ae8563ab3f8141dc49adf6a40084b06ffa67f829916656ef01fc2dd8`.
Source ledger: `2c69162fad82898dc703af4cf1a28aba7f384329f0e35a1c8f9e3e311450adbe`.
Compiled ledger: `d3d8307297af8c06c34ab4eb746ffe0c0e9462408795d25c5d2b5ac37bf57cd9`.
The audit verifies 1,297 source/config inputs, 2,124 compiled files and 1,287
unchanged tracked inputs against base `2424c2af51e4991fdc5a789943fa426d86962da9`.

The two skips remain the separate host-object ceiling and unsupported-display
media fixture. Selected execution succeeds; this is not an all-manifest pass,
SafeJS/device/credential/TTY/socket acceptance or complete-browser validation.
