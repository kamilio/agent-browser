# Wikipedia CSS attribution and rounded-corner source evidence

## Scope — September 13, 2026

This report summarizes the retained native attribution and primary-source read.
It adds no radius implementation, current-code audit, geometry, raster,
performance or full-conformance claim. The later cursor site comparisons are
recorded separately in `CURSOR-WEBSITE-REPLAYS-SEPTEMBER-13.md`; outstanding work
remains in `TASKS.md`. Historical evidence is not rewritten.

All evidence paths below are relative to `node_modules/.cache/native-validation/`:

- **A:** `native-wikipedia-css-attribution-september13/` — `RESULT.json`,
  `PROPERTY-SUMMARY.json`, `EVIDENCE.sha256`.
- **W:** `wikipedia-css-work-september13/` — `SOURCE-HANDOFF.md`,
  `SOURCE-VERIFICATION.json`.
- **R:** `native-rounded-corners-source-september13/` — `RESULT.json`,
  `REQUIREMENTS.md`.

## Exact property/value reconciliation

A/RESULT.json records attribution passed at `2026-09-13T21:42:59.659Z`.
The offline input is the retained Wikipedia homepage body: 119573 bytes, SHA256
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
This lane made **zero new HTTP requests** and attempted no geometry.

| Diagnostic family | Raw cascade | Applicable | Exactly attributed |
| --- | ---: | ---: | ---: |
| Unimplemented property | 135 | 97 | 97 |
| Unimplemented or invalid value | 37 | 24 | 24 |
| Unimplemented or invalid selector | 8 | 8 | Not attributed |
| Unimplemented at-rule | 1 | 1 | Not attributed |
| Unimplemented or invalid media query | 2 | 2 | Not attributed |

The **76 attribution records span 36 property names**. Summing the property
summary's issue counts gives exactly **97 property + 24 value = 121** applicable
issues, not 76 issues. The remaining **8 selector + 1 at-rule + 2 media = 11**
issues bring the applicable total to **132**; they are not explained by this
property/value attribution. Applicability is not a winning-declaration trace or
evidence that a particular rendered node consumes a declaration.

Priority blockers in this snapshot:

- `cursor`: **12** property issues, all `pointer`, including buttons and selects.
- `border-radius`: **20** property issues across controls, links and banners;
  values include variables, multi-corner lists and lengths such as `2px`/`1.5em`.
- Sprite `background-position`: **21** value issues, including `0 0` and negative
  vertical offsets on `.svg-*` selectors. The other three value issues are one
  each for `background-image`, `background-repeat` and `clip-path`.

The **57922 queryWork is a conservative charged-work sum**, including stale
`lastWork` carry-forward for **two selector compilation failures**. It is not
exact unique work and must not be used as a performance benchmark.

Deferred `e51` is the `central-featured-logo` image referencing
`portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png`. This single-body offline
profile installed no `fetchImage` callback and did not fetch that asset.
Its `element-layout-not-supported` result is **not proof PNG is unsupported**.
Two generated `before`/`after` table boxes were also deferred for unsupported
display layout. Resolving the counted CSS issues alone does not establish geometry.

## Rounded-corner source read, not implementation

The recorded source run made **one native GET, HTTP 200**, to
`https://www.w3.org/TR/css-backgrounds-3/` at **2026-09-13T21:45:27.065Z**.
The returned document identifies **CSS Backgrounds and Borders Module Level 3,
W3C Candidate Recommendation Draft, March 11, 2024**. This is neither a claim
about the latest specification nor evidence of a CAPTCHA bypass. The run used
ordinary native UA/TLS and omitted credentials; no redirects, retries, alternate
targets, assets or page scripts were used. One sealed offline parse followed.

R/REQUIREMENTS.md and W/SOURCE-HANDOFF.md establish these bounded requirements:

- **Grammar (`#border-radius`):** four physical longhands each accept one or two
  nonnegative length-percentage values; shorthand accepts one to four per axis,
  optionally separated by `/`. Expand each axis independently TL/TR/BR/BL using
  the usual one-to-four repetition; an omitted slash copies the horizontal list,
  and an omitted second longhand value copies the first. Initial zero,
  non-inherited, computed pair; negatives invalid; either used axis zero is square.
  Percentages use border-box width horizontally and height vertically. CSS-wide
  values are additionally accepted, but their exact set/cascade semantics were
  not independently sourced from the unfetched cross-reference.
- **Overlap (`#corner-overlap`):** compare each border-box side length with its
  adjacent-radius sum. If the minimum ratio is below one, scale **all eight
  components by that single factor**, not corners or axes independently. Keep
  computed pairs distinct from used radii. Additional UI-related reduction is
  limited to affected corners and only as needed.
- **Curves (`#corner-shaping`):** outer corners are quarter ellipses; subtract
  the corresponding border thickness for padding radii, then padding for content
  radii, clamping to zero. Unequal widths need smooth transitions; thick opposite
  borders can leave inner arcs smaller than a quarter ellipse. All border styles
  follow the curve. Transition constraints exist, but exact appearance is not
  prescribed; a native policy is not universal pixel parity.
- **Paint and hits (`#corner-clipping`, `#background-clip`):** backgrounds use
  their selected border/padding/content curve; both-axis non-visible overflow
  clips to the padding curve; replaced content to the content curve; pointer
  events to the border curve. Border images are not rounded by radius. Rounded
  fill alone is insufficient; a visible border is unnecessary. Do not infer
  changed rectangular layout bounds or unconditional ordinary-descendant clipping.
- **Tables (`#border-radius-tables`):** radius applies to table, inline-table and
  table-cell boxes with separated borders; it has no effect with collapsed
  borders. This differs from undefined collapsed-table border-image rendering.
- **Inline fragmentation remains a source gap:** retained sections do not settle
  fragment edges, per-fragment percentages or slice/clone behavior. Heading
  discovery is not proof those rules are absent elsewhere. A non-fragmented
  initial boundary would be an implementation limitation, not full conformance.

## Seals, timing and cleanup

Local hashes of A/RESULT.json and A/PROPERTY-SUMMARY.json match A/EVIDENCE.sha256;
the handoff hash matches R/RESULT.json. Other ledger verification is reported
from the allowed result/verification files, not a fresh inspection of payloads.

| Artifact | SHA256 |
| --- | --- |
| A/RESULT.json | `13e3eaf30e7e177481d7424aed0a51c648350de173e116ff217f22dd66d0bec2` |
| A/PROPERTY-SUMMARY.json | `f29e8dbb9a67a2af20ed3b6e07789dc4c7940e1524b60a9d78b09d73909d3e73` |
| A/EVIDENCE.sha256 (34 entries) | `982d89a541651541b1e3811684b6cd0e308c80c504ccaeb6e029bd2d8ac19437` |
| W/SOURCE-HANDOFF.md | `75f86337a7084a2ad29ed427945063b2f72abf5182c6e98284f529c81b4680e5` |
| W/SOURCE-VERIFICATION.json | `c4b7fba27058cf8923d58701412a06c30804b0796df3e365805728c23398d8f0` |
| R/RESULT.json | `797cb3b827bcd225cfb3b1522a1f9b6a264894fcbdd469546064fe326e5dda16` |
| R/REQUIREMENTS.md | `1c78716497eca7f32677a95ff512df14011013abeaaacbec15c66215ff5af86c` |

R/RESULT.json finalized at `21:50:02.974Z`; W/SOURCE-VERIFICATION.json passed at
`21:52:36.759Z` on September 13, 2026, superseding the handoff's pending-seal note.
It reports R/EVIDENCE.sha256 (64 entries) as
`a1f8ca70b2151dd7b29dba7f0069de2f168e5516f6b2f871cb4cb5e549acfa25`, and
R/EXECUTION-EVIDENCE.sha256 (57 entries) as
`54bdac1dae0f43c6824f27698d0ad5af978a0f668805e833e8b4a431f2a5ec2d`.
The W3C decoded body is 544031 bytes (79214 encoded), SHA256
`8a291792b2fd351eee443df466626d02b889d890f5d80e315bf80181b408712a`.

Recorded cleanup: attribution group 971470 exited 0 during
`21:35:10.458Z–21:35:10.806Z` and was absent. Source groups 976997/977109 exited
0 during `21:45:26.889Z–21:45:27.307Z` / `21:45:31.261Z–21:45:31.529Z` and were
absent at sealing; documents/query indexes closed to zero, transport closed,
private HOME/TMP directories empty and removed. All used pipes, not TTY/PTY;
no retained source exec sessions. No watchdog/output-cap failure was reported.
Inherited runtime evidence is **21169 passed / 0 failed / 2 excluded**, not new
tests; source/compiled inventories and historical evidence remained unchanged.

## Outstanding uncertainties and gates

Further authorized research is needed for inline fragments, CSS-wide cascade,
variables/math, cross-module overflow, special root/layer backgrounds and other
paint consumers. Cursor/radius/sprite fixes, actual target geometry, images,
fonts, raster and interaction remain unvalidated here. This does not complete
the broader research topics or browser goal, nor general live-site, socket,
TTY/PTY or SafeJS acceptance. Do not rerun completed run-once lanes on this basis.
