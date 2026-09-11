# Native font-weight source receipt — September 11, 2026

## Status and scope

Accepted native source findings, with the final local audit recorded in the new
lane's `CHECKS.json` and report/artifact hashes in `EVIDENCE.sha256`. This is source
research, not implementation, rendering, or font-conformance validation. Earlier
sealed reports and lanes remain historical and unchanged.

Lane: `node_modules/.cache/native-validation/native-font-weight-source-september11/`.
Authorization is retained in `AUTHORIZATION.md` and `PROMPT.md`. Only this report
and this new lane are owned. No production edits, builds, gate reruns, commits,
protected-fixture reads, alternate clients, page scripts, credentials, or font
downloads were used.

Primary document: `https://www.w3.org/TR/css-fonts-4/`. Native heading discovery
selected exactly three offline sections from the intact successful capture:

| Artifact | Selected section | Native source anchor |
| --- | --- | --- |
| `section-1.jsonl` | §2.2 Font weight, including §§2.2.1 Relative Weights and 2.2.2 Missing weights | `#font-weight-prop` |
| `section-2.jsonl` | §5.2 Matching font styles | `#font-style-matching` |
| `section-3.jsonl` | §2.8.1 Controlling synthesized bold | `#font-synthesis-weight` |

## Grammar and relative computed weights

Section 1 establishes `font-weight: <font-weight-absolute> | bolder | lighter`,
where `<font-weight-absolute> = [ normal | bold | <number [1,1000]> ]`.
Numeric weights are **1–1000 inclusive, including fractions**, not integer-only
or multiples of 100. Other numeric values are invalid under this grammar.
`normal` is 400 and `bold` is 700. The initial value is `normal`; the property
is inherited, applies to all elements and text, and computes to a number.

Relative keywords use the **inherited computed weight**, not the weight of the
face eventually selected:

| Inherited weight `w` | `bolder` | `lighter` |
| --- | --- | --- |
| `w < 100` | 400 | unchanged |
| `100 ≤ w < 350` | 400 | 100 |
| `350 ≤ w < 550` | 700 | 100 |
| `550 ≤ w < 750` | 900 | 400 |
| `750 ≤ w < 900` | 900 | 700 |
| `900 ≤ w` | unchanged | 700 |

“Unchanged” retains the actual inherited number: lighter at 50 remains 50;
bolder at 950 remains 950. It does not clamp to 100 or 900. For example, a
parent computed at 500 still supplies 500 to relative resolution even when
its selected face is 400.

## Static face matching

Section 2 uses computed font properties to choose faces. Width and style
matching precede weight matching. A remaining face containing the desired
weight wins over faces not containing it. If none contains that weight:

| Desired weight | Search order |
| --- | --- |
| `400 ≤ w ≤ 500` | Available weights from `w` upward through 500; then weights below `w` descending; then weights above 500. |
| `w < 400` | Weights at or below `w` descending; then weights above `w` ascending. |
| `w > 500` | Weights at or above `w` ascending; then weights below `w` descending. |

The middle-range bullet does not restate a direction for its final
above-500 phase; this report does not add wording absent from the extraction.
The section explicitly removes the older rounding of interpolated weights
to multiples of 100: matching accepts fractional values without rounding.

**Derived for exactly two eligible static faces, 400 and 700:**

- `1 ≤ w ≤ 500` selects face 400.
- `500 < w ≤ 1000` selects face 700.
- Thus 400.1, 499.9, and 500 select 400; 500.1, 700, and 1000 select 700.

This is not nearest-distance selection or a 550 cutoff. With an additional
eligible 500 face, a target of 400.1 would instead select 500. The two-face
conclusion assumes matching width/style and appropriate glyph coverage.
The algorithm checks glyph availability after choosing a face; a missing
glyph generally advances to another family, not another weight in the same
family. It is not evidence of arbitrary Unicode/shaping support.

## Computed weight, actual face, and synthesis

These are distinct stages. The algorithm consumes the computed number to
select an available face; selecting 400 for computed 500 does not replace
the computed value with 400. Descendants inherit the computed number.

A real, distinct internal 700 bitmap face alongside 400 can implement the
two-face weight-selection rule throughout the valid authored range. Actual
painting must use that selected face. This does not require a separate
rendered face for every number, and does not establish variable-font support.
With only a 400 face and no synthesis, all requested weights can fall back
to that face; retaining computed 700 is not evidence of a real 700 face.
No glyph implementation or rendering was inspected in this research lane.

Section 3 establishes `font-synthesis-weight: auto | none`, initially `auto`,
inherited, computing to the specified keyword. It controls permission to
synthesize bold when the family lacks bold faces: `auto` allows synthesis;
`none` forbids it. Permission is not a requirement. Section 1 says synthesized
faces, if supplied, participate in matching as existing faces. These sections
do not define a bitmap emboldening algorithm, strength, metrics, or universal
trigger policy. Real face selection must not be conflated with synthesis.

## Unresolved boundaries

- Initial `normal` is established; UA styles for headings/strong elements and
  default family choices are not established by these extracts.
- Font shorthand parsing/resets, CSS-wide values, and general `calc()`/math
  evaluation or computed-time range handling are not established. Numeric
  grammar alone does not resolve those questions.
- Range faces and the `wght` variation are mentioned, but full variation
  resolution and implementation were not examined.
- Custom, installed/system, and web-font loading, descriptors, fallback,
  shaping, and font-resource behavior were not validated. The matching
  section's descriptions do not demonstrate native support for those paths.

## Execution and evidence

Release commit `8936f29698f8f97d7ec4ac309d7459c6c2764539`, audit base
`5269b34ddc5e26231b1b5582abaf28f092dd6099`. Exact pins are retained in
`RELEASE.json`, `RELEASE-GO.md`, `PREFLIGHT.json`, and phase integrity receipts.
The audited **10715 passed / 0 failed / 2 excluded** result is historical,
not a gate rerun: 182 selected files, 181 strict roots, 583 manifest entries,
1071 source and 1912 compiled ledger entries, 20 gate receipts, and 12 owned
files plus the manifest verified against the release commit. Fixture-safe
executable content checks cover 375 source and 1500 compiled files; authorized
owned inputs are separately checked. Protected fixtures were not read.

Live child UTC: **23:05:19.735–23:05:20.282** on September 11, 2026.
One native navigation, **one bodyless GET**, HTTP 200, zero redirects, mocks,
subresources, retries, or alternate URLs. Offline child UTC:
**23:05:53.979–23:05:55.101**; exactly **three** native heading sections,
zero offline navigations or wire requests. Both children exited 0, without
timeouts/output failures, and their process groups were absent afterward.
All three native documents closed with zero remaining nodes.

Lane and private HOME/TMP directories were **0700 from creation**, before
harness execution, and remain empty where required. Unlike the historical
preference lane's documented permission exception, this lane has no such
exception. No restriction, Retry-After, admission, resource-cap, or extraction
failure occurred. Original execution artifacts are preserved; nothing was
deleted or retried during sealing.

Unchanged bounds: 250 ms pacing, 30 s plus 5 s termination grace, 6 MiB per
file/output, 12 MiB lane, at least 64 MiB free; long-v1 admission remains
50,000 nodes and 4,000,000 response bytes. One of two permitted GETs was
unused; all three offline section allowances were consumed. No limits were
raised. Offline socket/process guards and kernel seccomp were active.

The reader reports `extracted-unverified`, `partial: true`, no classification
barrier, and untruncated heading discovery. This is accepted bounded semantic
evidence, not a claim of complete page rendering or a full-document reading.
Scripts/styles are omitted and not executed; tokenizer issues were zero.
The original **transport-decoded** body is preserved byte-for-byte, not a
reconstruction or a retained compressed wire stream: 1,384,321 decoded bytes,
187,679 encoded bytes accounted by transport.

| Evidence | SHA-256 |
| --- | --- |
| `response-1.body` | `03626a0c85658aaa94191f1b8c64dd5491b723acff08cc33ddd0331a80b920f5` |
| `live.jsonl` (1,881,931 bytes) | `6869ae497ec94e991f8f6a67dbd1c6dd42f0e6f75bcba0bf8bb2f2a432caec68` |
| `section-1.jsonl` (39,599 bytes; 571 selected nodes) | `02408fa08f893d65e057f5f19898990bc9f24b20ca6bcb8676455b6d60e25165` |
| `section-2.jsonl` (74,623 bytes; 890 selected nodes) | `6c0477e8781e04e1a2dcb5664e1e764efe419578cc01868f5772df32ef959324` |
| `section-3.jsonl` (15,528 bytes; 213 selected nodes) | `9ac47244bbf54398f87a728d325f83247ab0281742e818c5cde938f341cd3422` |

`CHECKS.json` records named seal checks and resource accounting;
`EVIDENCE.sha256` covers this report and lane files except the ledger itself.
