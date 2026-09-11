# Native float-sizing source receipt — September 11, 2026

## Scope and accepted evidence

This distinct sidecar supplies CSS 2.2 sizing requirements, not a float
implementation, complete intrinsic-sizing algorithm, or website acceptance.
It does not change the sealed formatting report or the parent's fresh OpenBSD
font-flow result. Direct extracted rules and implementation inferences are
distinguished below.

Primary document: `https://www.w3.org/TR/CSS22/visudet.html`. One native HTTP
200 capture supplied these three native heading sections, without further
requests, raw-source searching, source trimming, or limit increases:

| Artifact | Selected heading; original native reference | Selected nodes |
| --- | --- | ---: |
| `section-1.jsonl` | §10.3 Calculating widths and margins; `e566` | 624 |
| `section-2.jsonl` | §10.6 Calculating heights and margins; `e1875` | 434 |
| `section-3.jsonl` | §10.4 Minimum and maximum widths; `e1190` | 516 |

Lane: `node_modules/.cache/native-validation/native-float-sizing-source-september11/`.
`AUTHORIZATION.md`/`PROMPT.md` retain the prompt, `SELECTIONS.json` the discovered
selectors, and `OFFLINE-INPUT.json` the trusted original body/receipt pins.
Semantic references below identify already extracted nodes; they are not
additional extractions. General width/height definitions (§§10.2/10.5), general
min/max-height rules (§10.7), and line-height calculations (§10.8) were not
selected. All three authorized section allowances were consumed.

## Non-replaced floats: width and shrink-to-fit

Section 1, §§10.3.5–10.3.6 (`e866`–`e907`), distinguishes non-replaced from
replaced floats. For a **non-replaced float**, computed `auto` horizontal
margins have used value zero. **Only when width computes to `auto`** is its
used width the shrink-to-fit width:

`min(max(preferred minimum width, available width), preferred width)`

The source describes the inputs as follows:

- **Preferred width:** roughly format without breaking lines except explicit
  line breaks.
- **Preferred minimum width:** roughly try all possible line breaks.
- **Available width:** containing-block width minus the used left/right
  margins, left/right border widths, left/right padding, and widths of any
  relevant scrollbars.

CSS 2.2 explicitly does **not define the exact preferred/intrinsic algorithm**.
The formula is exact; the rough input descriptions are not a complete text,
replaced-content, nested-layout, or whitespace measurement implementation.

**Inference:** do not substitute “remaining line width beside earlier floats”
for this section's available-width definition. Float placement and whether a
box must move down are distinct requirements in the earlier formatting report.
If the preferred minimum exceeds available width, the formula need not fit the
available space; unconditional available-width clamping is not this rule.

An explicit non-auto width does not trigger this shrink-to-fit substitution.
Used widths remain subject to §10.4 constraints. Auto float margins becoming
zero must not be replaced by ordinary block auto-margin centering behavior.
For comparison, §10.3.3 supplies the ordinary normal-block equation:

`margin-left + border-left + padding-left + width + padding-right + border-right + margin-right = containing-block width`

There, auto width is solved from the equation after other auto values become
zero. This is a different sizing path from a non-replaced float's auto width.
The available-width scrollbar subtraction is established, but scrollbar
creation, thickness, overlay behavior, and modern scroll-container policy are
not supplied by these sections.

## Replaced floats: intrinsic dimensions and ratio

Section 1 says a replaced float also uses zero for auto horizontal margins,
but its width follows **inline replaced-element rules**, not non-replaced
shrink-to-fit. In §10.3.2 (`e688`–`e744`), in order:

1. Both dimensions auto and intrinsic width present: use intrinsic width.
2. Both auto with no intrinsic width but intrinsic height and ratio, or auto
   width with non-auto height and a ratio: width = used height × intrinsic ratio.
3. Both auto with a ratio but neither intrinsic dimension: width is
   **undefined in CSS 2.2**. Using the normal-block width equation is only a
   suggestion, conditional on an independently determined containing-block
   width; it is not a uniquely required fallback.
4. Otherwise, auto width with intrinsic width: use intrinsic width.
5. Otherwise, auto width becomes 300px. If too wide for the device, the UA
   should instead use the width of the largest 2:1 rectangle fitting the device.

Section 2, §10.6.2 (`e5185`–`e5233`), applies to floating replaced elements
as well as the other named replaced categories. Auto vertical margins become
zero. For height, in order:

1. Both dimensions auto and intrinsic height present: use intrinsic height.
2. Otherwise, auto height with a ratio: height = used width / intrinsic ratio.
3. Otherwise, auto height with intrinsic height: use intrinsic height.
4. Otherwise, auto height is the height of the largest 2:1 rectangle whose
   height is at most 150px and whose width does not exceed device width.

Explicit dimensions do not enter the corresponding auto-only fallback branch.
These are tentative used-size rules, not evidence that intrinsic image/font
data was loaded or that the native renderer implements all replaced content.

## Auto heights: ordinary blocks versus floats/BFC roots

**Ordinary block case — §10.6.3**, section 2 (`e5243`–`e5278`): applies to
normal-flow, non-replaced blocks with visible overflow, also non-visible
overflow when propagated to the viewport. Auto top/bottom margins become zero.
For auto height, use the distance from the top content edge to the first
applicable endpoint:

1. Bottom of the last line box when it establishes an inline formatting
   context with at least one line.
2. Bottom edge of the last in-flow child's bottom (possibly collapsed) margin,
   if that margin does not collapse with the element's bottom margin.
3. Bottom border edge of the last in-flow child whose top margin does not
   collapse with the element's bottom margin.
4. Zero height otherwise.

Only normal-flow children count: **ignore floats and absolutely positioned
children**; consider relatively positioned boxes without their offsets. A child
can be an **anonymous block box**. Full margin-collapsing rules remain an
external dependency, not an inferred addition to this list.

**Float/BFC case — §§10.6.6–10.6.7**, section 2 (`e5434`–`e5494`): the
“complicated cases” include non-replaced floats, non-replaced inline-blocks,
and normal-flow non-replaced blocks with non-visible overflow except viewport
propagation. Auto vertical margins become zero; **auto height** depends on
descendants under §10.6.7:

- With only inline-level children, height spans the topmost line's top to
  the bottommost line's bottom.
- With block-level children, height spans the topmost block child's top
  margin edge to the bottommost block child's bottom margin edge.
- Ignore absolutely positioned children; disregard relative offsets.
  Anonymous block children are expressly included.
- Additionally, increase height to include **bottom margin edges of floating
  descendants** extending below the element's bottom content edge.
- Count only floats participating in **this BFC**. The source explicitly
  excludes floats inside absolutely positioned descendants or other floats.

**Inference:** relevant floats are not limited to immediate children; an
ordinary non-BFC descendant can contain a contributing float. Do not recursively
collect floats across nested BFC boundaries. Conversely, normal-block auto
height cannot universally adopt the BFC-root float-inclusion rule. This closes
that particular gap in the earlier formatting research without mutating it.

**Inference:** the stated float-inclusion rule is conditional on auto-height
sizing; it is not permission to expand every explicit height to enclose floats.
The source also says these heights are tentative and may require recalculation
for min/max-height constraints. General §10.7 was not extracted, so complete
explicit/percentage-height resolution and height-constraint integration remain
unverified by this sidecar.

## Minimum and maximum constraints

Section 3 (`e7583`–`e7820`) establishes `min-width` initially 0, `max-width`
initially `none`, neither inherited. Lengths and percentages are accepted;
only max-width accepts `none`. Negative values are illegal. Percentages refer
to containing-block width; a negative containing-block width yields zero.
If that width depends on the element's width, resulting layout is undefined
in CSS 2.2. Effects on tables, inline tables, cells, columns, and column groups
are also explicitly undefined here.

For the ordinary constraint algorithm:

1. Calculate tentative used width without min/max constraints.
2. If above max-width, rerun width/margin rules substituting max-width for width.
3. If the resulting width is below min-width, rerun substituting min-width.

The source explicitly says this does **not change the real computed values**.
It is not merely a computed-style rewrite or an isolated paint-time clamp;
dependent width/margin calculations are rerun. **Inference:** minimum wins
over a conflicting smaller maximum under this ordered algorithm.

For a **replaced element with an intrinsic ratio and both dimensions auto**,
§10.4 provides a separate coupled table (`e7823`–`e8073`). Let `w,h` be sizes
computed ignoring all four constraints; these are not necessarily the intrinsic
dimensions. Let `Wmin,Hmin,Wmax,Hmax` denote constraint values, with each
maximum first normalized to `max(minimum, maximum)` as instructed:

| Violation | Resolved width | Resolved height |
| --- | --- | --- |
| None | `w` | `h` |
| `w > Wmax` | `Wmax` | `max(Wmax*h/w, Hmin)` |
| `w < Wmin` | `Wmin` | `min(Wmin*h/w, Hmax)` |
| `h > Hmax` | `max(Hmax*w/h, Wmin)` | `Hmax` |
| `h < Hmin` | `min(Hmin*w/h, Wmax)` | `Hmin` |
| Both above maxima; `Wmax/w ≤ Hmax/h` | `Wmax` | `max(Hmin, Wmax*h/w)` |
| Both above maxima; `Wmax/w > Hmax/h` | `max(Wmin, Hmax*w/h)` | `Hmax` |
| Both below minima; `Wmin/w ≤ Hmin/h` | `min(Wmax, Hmin*w/h)` | `Hmin` |
| Both below minima; `Wmin/w > Hmin/h` | `Wmin` | `min(Hmax, Wmin*h/w)` |
| `w < Wmin` and `h > Hmax` | `Wmin` | `Hmax` |
| `w > Wmax` and `h < Hmin` | `Wmax` | `Hmin` |

Use the appropriate combined-violation row when both dimensions violate
constraints; the single-violation rows are not a sequential clamp algorithm.
Then rerun width/margin rules with the resolved width as the substituted width.
This table is extracted evidence involving height constraints, **not** a claim
that the unselected general min-height/max-height property rules were read.
The text separately warns that one explicit dimension plus an auto dimension
can become over-constrained when the auto side receives a min/max constraint.

## Limitations

- Exact intrinsic preferred/minimum measurement remains unspecified here;
  text breaking, nested intrinsic contributions, cyclic percentages, and
  ratio-only auto replaced widths must not be assigned invented normative rules.
- General height/minmax-height definitions, percentage-height resolution,
  complete margin collapsing, containing-block resolution, and line-height
  calculations are outside the three selected sections.
- No modern flex/grid sizing or exclusions, `shape-outside`, modern intrinsic
  keywords, box-sizing variants, overflow/scrollbar completion, pagination,
  or complete replaced-resource behavior is established by this CSS 2.2 capture.
- Source-defined used sizing is separate from computed-style preservation and
  actual geometry/painting. No implementation, glyph/image rendering, or live
  website actionability test is claimed. No code or existing report is changed.

## Execution, preservation, and seal

Runtime is the exact audited **11025** font release, commit
`4d11abddf8f9a743a0066ef242a7fa07ae297e71`, audit base
`7919cfd2ae5b0dbac9a9ec2162dd0ce1ef2bcb7a`. Original metadata/pins are retained
in `RELEASE.json` and `RELEASE-GO.md`. Historical gate: 11025 passed, 0 failed,
2 excluded; 189 selected files, 188 strict roots, 586 manifest entries,
1075 source and 1916 compiled ledger entries, 20 receipts, 13 owned files plus
manifest verified against commit. Fresh fixture-safe content checks cover
376 executable source and 1504 compiled files, with authorized owned inputs
separately checked. No protected fixtures, dirty-source runtime, build, gate
rerun, shared-doc edit, or commit was used.

Live child UTC **2026-09-11 23:48:38.528–23:48:38.738**: one native navigation,
one actual bodyless GET, HTTP 200; zero redirects, retries, subresources, mocks,
credentials, or page scripts. Offline UTC **23:49:01.155–23:49:01.462**: exactly
three native heading sections, zero offline navigations/wire requests. Both
children exited 0 without timeout/output failure and with absent process groups
afterward. All three native documents closed with zero remaining nodes.

Lane and private empty HOME/TMP directories were **0700 from creation**.
No permission, restriction, Retry-After, admission, or resource-cap failure
occurred. Bounds stayed 250 ms pacing, 30 s plus 5 s grace, 6 MiB file/output,
12 MiB lane, at least 64 MiB free, 4,000,000 response bytes and 50,000 document
nodes. Offline socket/process guards and kernel seccomp were active. The second
GET was unused; no further extraction or network was performed while sealing.

Reader status remains `extracted-unverified`, `partial: true`, no barrier,
zero tokenizer issues; heading discovery scanned 3184 nodes without truncation.
Semantic omission of scripts/styles is not full-page rendering. Original
transport-decoded body bytes are retained intact: **87,037 decoded / 16,235
encoded bytes** accounted by transport. The compressed wire stream itself is
not archived. Recorded Last-Modified is April 8, 2016, response metadata only.

The formatting source's 74-entry seal, the font source's 73-entry seal, and
the fresh OpenBSD font flow's 48-entry final seal and associated reports were
hash-verified before/after execution and during sealing. The fresh flow's
recorded failure remains historical and unchanged; successful source extraction
does not upgrade that separate result. Original sidecar artifacts are retained;
no evidence was deleted or rewritten.

Seal-preparation caveat: the first syntax check of the new local final-audit
helper failed because an assertion string contained unescaped quotes. The
initial helper is retained as `final-check.initial.mjs`; `SEAL-PREPARATION.json`
records the correction. This occurred after successful native extraction,
before running the final audit, and caused no native rerun, extra request,
extra extraction, or change to original execution artifacts.

| Evidence | SHA-256 |
| --- | --- |
| `response-1.body` (87,037 bytes) | `254bb76539cdde3070f7b0821dc9154efdc9b332a89e532359c6a8fd9d9dc732` |
| `live.jsonl` (126,493 bytes) | `7f7e42450a565b2a730982c958cd45852fc10af46bf84531529be71464ec23b0` |
| `section-1.jsonl` (46,531 bytes) | `341b07df2b8e4bebcb09c4e264d39d0d3b041c12429cadafdc5f82eec12a83b6` |
| `section-2.jsonl` (34,553 bytes) | `6a209b46e008944cb1d94984ede9bfe30991d210203f266278fbea245422cff7` |
| `section-3.jsonl` (30,796 bytes) | `707e76d7f3334217965560e919f8c824bcbc690a30609e65f4002cac507c5fe3` |

`CHECKS.json` contains named final checks/resource accounting. `EVIDENCE.sha256`
covers this report and lane files except itself. Only this new report/lane
were written.
