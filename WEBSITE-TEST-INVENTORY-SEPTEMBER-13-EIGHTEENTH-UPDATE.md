# Website testing inventory: September 13, eighteenth update

This supplements the seventeenth update with native before/after content,
unchanged-byte TestPages replay and three primary-source document captures.
Historical paths, times, failed extractions and measurements remain unchanged.
Source reading, native fixture rendering, retained-page formatting and full
website rendering are separate gates.

## Implementation and native gate

Terminal modern and legacy before/after selectors now have independent cascade
targets. String content preserves CSS escapes, case and whitespace; neutral
values suppress generation and an empty string retains an empty box. Native
formatting/layout/raster handles the supported static subset without adding DOM
nodes, query results, source-range characters or actionable-control targets.
Unsupported effects remain explicit; see `GENERATED-CONTENT.md`.

- Focused gate: **1,019 passed**, zero failures, strict compilation and formatting
  pass; private source inputs remained unchanged.
- Final native gate: **18903 passed**, zero failures, two unchanged
  exclusions; 370 selected suites, 369 strict
  roots and 741 manifest entries. The other 371 manifest
  entries and historical strict-root omission are not newly validated.
- New cases: 120 parser, 36 selector, 40 generated-style and 52 formatting/layout/
  raster/range/caret, including two float/clear ownership regressions discovered
  through retained real-site replay.
- Gate runs 2026-09-13T11:40:29.449Z–2026-09-13T11:44:45.919Z; audit 2026-09-13T11:44:46.041Z.
- Canonical runtime: `node_modules/.cache/native-validation/native-generated-content-september13-round01/snapshot01/dist`; base
  `10660476b8db478ba78606eeab9edb80e8374528`. Root `dist` was not rebuilt.
- 1280 source files, 2116 compiled files,
  1260 unchanged tracked inputs; pre-existing dirty
  source, manifest and TASKS work is kept separate from this change.

Source inventory SHA-256: `103b83ae613a6dd623d4ae9c3f80d4b0be70ff8f3bfcb65d175c448405d2860e`.
Compiled inventory: `19c6ebc3433ef71d807300f9f7b400bd5d40d819f0074ea2a89c6f9b8b04363e`.
Native results: `ca8e521b6cf3d7cd4f250f5f397a917d2672280c5f88fd0a0f6c3bc0ef56253a`.
Summary: `ddf59e6ed544289e19940f53648e133a3e17ce5c0136410fe7b7f2ab9b1444b3`.

## TestPages: actual captured stylesheet, zero new HTTP

The HTML is the existing HTML Tag Table page at
`https://testpages.eviltester.com/pages/basics/html-tag-table/`, originally
captured September 13. Its unchanged 158,955 bytes hash to
`67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16`.
The actual captured 367,810-byte same-origin stylesheet retains its original
2026-09-13T10:03:29.553Z receipt and hash
`b6e9b375a3bd8971467d89a8ee0e92ff1f9cfaa5aa6cee2c33f25d8af82fb30d`.

Final comparison: old audited18655 at 2026-09-13T11:42:11.782Z–2026-09-13T11:42:12.203Z;
new audited18903 at 2026-09-13T11:44:53.987Z–2026-09-13T11:44:54.409Z. Each phase performs
one native load, one captured-CSS read, two policy callbacks, two native queries,
one formatting inspection and one geometry attempt. Both perform **zero HTTP**.
The uncaptured Google Fonts import remains explicitly denied, not fabricated.
Same-origin SRI success is not cross-origin CORS acceptance.

| Measured result | Before | After |
| --- | ---: | ---: |
| Applicable selector failures | 169 | 43 |
| Whole-sheet selector failures | 173 | 46 |
| Formatting boxes | 963 | 1051 |
| Generated pseudo boxes | 0 | 31 |
| Generated pseudo text nodes | 0 | 31 |
| Formatting text units | 3734 | 3765 |
| Formatting work | 192948 | 194614 |
| Visited DOM nodes | 956 | 956 |

Body and table box-sizing change from content-box to border-box because the
ordinary branch of `*, *::before, *::after` is no longer discarded. The 31
generated boxes and 31 text nodes have no DOM reference or action target.
These include icon-font characters; retaining their content is **not** proof that
uncaptured fonts or positioned glyphs rendered correctly. The replay performs no
raster operation and still produces no supported full-page geometry rectangle.

Remaining limitations include 43 applicable selector failures, unsupported
properties/values, font imports and at-rules, 26 positioned-pseudo diagnostics,
two floated-pseudo diagnostics, other display/overflow/vertical-alignment issues,
and a real `::before:hover` rule outside the terminal-selector profile.
Whole-sheet content-property failures change from 82 unsupported-property records
to one unsupported-value record; counters/functions are not generally implemented.

The earlier round01 replay exposed `Float formatting ownership does not match
its diagnostics`. Pseudo-only float/clear failures must not claim the ordinary
float coordinator's counted ownership diagnostics. Two regressions and the final
replay verify that correction; unsupported pseudo layout remains rejected.
The unsuffixed preparation lane also retains a misnamed before-result artifact:
its copied child wrote after-RESULT.json during the before phase. No after phase
ran there, no artifact was renamed, and neither earlier lane is relabeled as this
final run. Their original evidence remains available.

Final replay evidence: `node_modules/.cache/native-validation/native-testpages-generated-content-september13-round02/EVIDENCE.sha256`,
SHA-256 `d120bf0e14c1b446aa9f0cddd8eef3808db10d04e79391a821a2a9f815d974fd`.
Owners close, process groups are absent, private directories are empty/removed,
and before/after native source/runtime inventories match. No credentials, actions,
SafeJS, real TTY/PTY, devices or challenge solve occur in these replays.

## Primary-source website checks

All captures use only the audited native browser with omitted credentials,
empty cookie jars, no scripts/subresources and no challenge interaction.

| Website | Actual HTTP capture (UTC, September 13) | Native result |
| --- | --- | --- |
| `https://www.w3.org/TR/css-pseudo-4/` | 11:14:11, one GET, 200; 552,074 bytes | Semantic reader succeeds; before/after placement, inheritance and replaced-origin suppression admitted |
| `https://www.w3.org/TR/selectors-4/` | 11:15:53, one GET, 200; 978,757 bytes | Research reader fails; full native DOM parser succeeds, including matching-algorithm extraction |
| `https://www.w3.org/TR/css-content-3/` | 11:23:24, one GET, 200; 291,752 bytes | Semantic reader and later full DOM parsing succeed; content defaults, string-box grammar and normal/none rules admitted |

These are three document GETs, not three successful rendered-site tests.
Subsequent source inspections reuse original bytes with zero HTTP. Complete
admitted blocks and native references are in the source evidence, not raw-HTML
searches. The final Selectors extraction establishes per-branch ordinary matching
and separately considered pseudo results. Its default pseudo allowance is all,
not empty. Specific DOM API setup remains unadmitted. Trailing state selectors
can be valid in the specification while remaining unsupported by this browser.
Complete negation/sub-pseudo rules, CSS Values string lexical evidence and full
ordinary-element content computation remain source/profile gaps.

## Newly isolated reader issue

The Selectors research reader reports `reader.depth`: limit128, observed129.
Its first failure retained only the generic resource-limit error; the later
bounded diagnostic is not backfilled into that earlier receipt. The unchanged
body passes the full native DOM parser with **22,686 nodes and depth13**. CSS
Content passes the full parser with 7,333 nodes and depth13. This isolates a
native reader-path discrepancy, **not an authorization or Cloudflare barrier**.
No limits were raised to claim reader success, and the full parser does not fix
the reader. Root cause and a regression-backed production repair remain open.

Source evidence ledgers under `node_modules/.cache/native-validation/`:
- `native-pseudo-content-source-september13`: `e90072f41c3a1035e44d8aaf73384ce062945dfe47afaabaea56d152369a9fa4`.
- `native-pseudo-content-source-followup-september13`: `a2ef6fbaceb6ab1cc57591d10212e02e898919aad3d47cc8635bd52ab6e4ba10`.
- `native-pseudo-content-dom-source-september13`: `ce7eb1ed65cdd275e0febbbcdd76cb7d6a5e3ee1deccd574df474739211a8e3f`.
- `native-pseudo-matching-source-september13`: `5e1dbf887bfa66d798029fcd4362f5cfbf59f3dd60a35b4ababf3fedb4bf9c24`.

## Still open

The overall browser goal stays active. Priorities are the reader-depth discrepancy,
positioned/floated generated content, pseudo state matching and further varied
website coverage. Full-page rendering, performance comparisons, original local
LLM hardware/benchmark/Astra/Poe research completion, real credential/passkey
devices, SafeJS, real TTY and human challenge handoff remain separate open gates.
Nothing here establishes challenge bypass or completed social-platform research.
