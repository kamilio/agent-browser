# Website test inventory — September 13, twenty-ninth update

**Native text-decoration thickness is implemented and painted. Python now has
one remaining applicable CSS value error; its actual Tutorial click still
fails.** This continues inventory 28 without rewriting prior results.

## New website checks

| Page | Actual operation | Evidence and boundary |
| --- | --- | --- |
| `https://www.w3.org/TR/css-text-decor-4/` | One native GET, then one offline native reader | HTTP 200, 288,319 decoded / 44,482 encoded bytes; served May 4, 2022 draft; 12 complete selected sections / 22,881 text units |
| `https://drafts.csswg.org/css-text-decor-4/` | One separately authorized native GET of the discovered editor URL, then one native reader | HTTP 200, 391,569 decoded / 67,844 encoded bytes; August 17, 2026 editor draft; 12 complete selected sections / 24,774 text units |
| Python documentation homepage | One native BrowserSession replay of the same eight September 11/13 captures, then one discovered Tutorial click | Zero Python HTTP; same 853 nodes / revision 860 / link e375; actual click fails with CSS values 2 → 1 |

The source checks use exactly two wire requests total, no redirects, retries or
subresources. They exercise native response capture, long-v1 parsing, heading
discovery and bounded complete-section extraction—not full source-site styling,
scripts, actions or raster. Version dates are read from the documents rather than
inferred from retrieval time. Their conflicting percentage-table wording and
unfinished positioning section remain explicit in the source report.

The Python comparison reuses 72,064 decoded bytes. Applicable property errors
remain nine; raw property/value diagnostics change from 57/7 to 57/6. The real
click still reports inline vertical alignment two, positioning one and overflow
one. Raw float/display/clear coordinator markers remain 8/9/3. No destination
fallback is counted as a click success.

Rules/declarations remain 584/1,075. Cascade work increases 93,132 → 93,872 as
newly supported decoration components are processed. Formatting remains
669 boxes / 576 visited nodes / 4,074 text units / 8,294 work / nine deferred
subtrees. These observations do not claim a speedup or whole-page rendering.

## Functionality and native gate

Thickness supports CSSOM, shorthand resets and ordering, inheritance, font and
viewport units, retained percentages, bounded math and actual clipped/blended
stroke widths. Existing automatic font placement, geometry and unsupported
features remain unchanged. The two new files add 105 cases: 60 style/CSSOM and
45 actual-raster cases. The old runtime fails all 105 plus three updated existing
feature expectations; the corrected focused run passes 747 / 0.

Final native gate: **20,177 passed / zero failed / two unchanged skips**, across
392 selected suites / 391 strict roots / 754 manifest entries; 362 entries remain
unselected. Build, strict compilation, formatting and unchanged-input checks
pass. The increase includes 112 newly selected existing tests, not only the 105
new tests. Run: `16:44:47.451–16:49:24.665 UTC`.

Runtime: `node_modules/.cache/native-validation/native-decoration-thickness-september13-round00/snapshot01/dist`.
Audit SHA-256 `31ea78a854cb139b6eeb370edc7e671b77d6a3b4375f3bcf30a458eeeb3b30ad`.
Source/compiled ledgers:
`3e4c454470fcfd394a42950b9f67aa88937043010a26401355818a5424306ab6` /
`135b47b134ccac7024b8247f55afdab05c0bd0c931dc13ba9a2670515abbfd07`.

## Reports and open work

- `DECORATION-THICKNESS-SOURCES-SEPTEMBER-13.md`: exact source dates, two native
  captures/readers, version differences and 97 sealed source receipts.
- `TEXT-DECORATION-THICKNESS.md`: implementation scope, native gate, baseline
  failures and preserved initial test-assumption errors.
- `PYTHON-DECORATION-THICKNESS-REPLAY-SEPTEMBER-13.md`: the real failed action,
  unchanged fixtures, remaining diagnostics and 28 sealed replay receipts.

Open: Python justification, hyphenation/vendor variants, cursor, border radii,
underline offset, inline alignment, sticky/overflow and successful navigation.
More varied-site interactions and repeatable performance measurements remain
necessary. The original hardware/benchmark/Astra evidence is not refreshed by
these CSS checks; verified Reddit/Poe opinion research remains incomplete.

Native host-object/display skips, unselected suites and separate credential,
passkey-device, SafeJS, socket and TTY gates remain. No fingerprint spoofing,
challenge solving, alternate browser or push occurs. Pre-existing work and all
historical failures are preserved. The overall goal remains **ACTIVE**.
