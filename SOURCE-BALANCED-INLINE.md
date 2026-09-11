# Explicit balanced source-element headings

`headingInlinePolicy: "balanced-source-elements-v1"` is a host-only opt-in for
balanced lexical text collection inside an already admitted source heading.
It does not classify HTML phrasing content or reconstruct DOM heading membership.
Strict absence preserves the existing grammar, reports, diagnostics and accounting.

SOURCE-HEADING-IMAGES.md describes the later explicit v2 image-omission policy.
The v1 contract and historical measurements below remain unchanged.

## Contract

Additional normalized tag names of at most64 UTF-16 code units may be balanced
inside a heading. Existing raw, omitted, suppressed and void names remain excluded,
as do html/body, h1–h6 and earlier ambiguous modes. br/wbr retain their existing
exceptions. Additional slash starts are refused; attributes never supply title text.

Additional elements contribute no separator: source `A<x-local>B</x-local>C`
inside a heading yields lexical ABC only after exact balanced closes. Known div/p
or unclassified names can participate without a claim that they are HTML phrasing
elements. Hidden/style/ARIA/slot/custom-element semantics are not interpreted.

Every close must match the current top and pass the existing plain-close check.
No ancestor search, synthesized close, EOF recovery, outer-scope repair or candidate
from an unfinished heading is added. The selected policy does nothing outside an
active heading and cannot recover earlier suppressed text. Existing entry-limit
completion is still partial; it is not a scan of every remaining source token.

Both successful fields are mandatory when selected:
- headingInlinePolicy: balanced-source-elements-v1
- headingInlineLimitations: [source-balance-only, attributes-ignored, not-dom-or-visibility]

They are absent by default and count toward unchanged output limits. The report
remains lexical-not-DOM, partial=true and contentSuccess=null. Permission fields
do not prove that any additional element was encountered.

## Resource and diagnostic boundaries

At most127 inline frames fit the existing depth128 cap including the heading;
additional name contents are bounded by64 units each. Existing input/window/work/
operation/issue/heading/title/entry/output/deadline bounds are not increased.

Selected eligibility charges1 before the length check, then6L+4 for eligible
lengthL before special-context checks and a possible self-closing read. A name
longer than64 stops before those lookups. Selected close matching charges1 for
expected-name/length admission, then2E+1 for equal lengthE before comparison.
Selected inline pushes/pops charge1 before depth admission/mutation, then yield
after the atomic mutation. Heading completion is not an inline pop. These are
conservative admission units, not CPU, heap or elapsed-time measurements.

Default paths bypass the new charge/match/yield helpers. Earlier native token,
extent and ambiguous-mode guards keep precedence. Selected extra work may hit
the same caps earlier. No await occurs inside a stack mutation.

Finite diagnostic schemas stay unchanged. An additional-name refusal still says
non-inline-start because the unchanged base inline predicate failed; this includes
an additional slash start. self-closing-inline remains limited to the original ten
inline names. No arbitrary name, stack, attribute, URL or source text is added to
diagnostics. `other` is not a permission category or a recovered tag spelling.

## Gates

`SOURCE-INLINE-TRIAL.md` records a real non-inline-start/level2/depth1/other failure.
It does not prove this policy admits that source or name. Runtime review and
separately authorized synthetic validation are complete. No CLI/page/source-wrapper
activation, live request, capture replay, DOM/visibility/private-content guarantee,
modern privacy/provider/vault/device/page/consent acceptance or challenge bypass
is part of this feature. Existing historical and stopped/denied gates remain.

## Focused validation

On September8,2026, all1,260 tests pass across five explicit native files at
02:44:23.781406932–02:44:30.325145679 UTC: headings933, source-input105,
token-cursor139, tokenizer-issues49 and resource-limit34. The167 new cases cover
the exact selected policy/limitations,49 excluded native names, six heading levels,
length/depth boundaries, strict close/EOF, property-read ordering, conservative
work edges, clipping, output caps, cancellation/yields/cleanup and12 combinations
of inline/head/table selection. All1,093 prior test definitions remain unchanged.

Call-through spies preserve actual native token values while counting self-closing
and close-attribute reads. Timer cases observe public cursor state and cancellation,
not private stack mutation. Static review separately checks admission-before-mutation
and no await inside it. No actual old-runtime negative control or performance result
is claimed. Work units are conservative accounting, not physical resource measurements.

Two-file formatting passes at02:42:54.200717181–02:42:54.336527482 UTC after one
approval-review timeout and one approved identical retry. Runtime formatting changes
only two conditional line wraps. Build, five-file strict typing and two-file Biome
all pass at02:43:49.863820228–02:43:58.867978414 UTC. The isolated snapshot archives
commit1ba1b1498f7991ad5129ef18047960fd551eac06 and uses whole-file-context patches
with exact baseline/final byte checks, excluding unrelated and denied pending work.

Audit at02:45:30.068 UTC reconciles2,716 native input identities,424 frozen source07
artifacts,48 prior inline-feature artifacts and the complete1,093 prior assertion-name
multiset. Only five files from the committed516-file native manifest ran.

Frozen evidence: `node_modules/.cache/native-validation/native-source-balanced-inline/`.

| Artifact | SHA-256 |
| --- | --- |
| Final runtime | `09d4584dc977add0068f9c15505c84b76e24dd44921954bb5180b6807760babc` |
| Final tests | `616ed7aaeb938947ae5e54632f4f47b2493f4ed22913ca85a6f2fd6b342b8286` |
| Independent review | `bc5c3b8446ecc30a851e0109297093862f3ac7ceaff9dcab78f5039910824e1f` |
| AUDIT.json | `2a663784c48477252b2da7e2f5b1309ce17de51e22ccf1ef2761637fbb6c47f3` |
| FINAL-SHA256SUMS (48 artifacts) | `ace7bde4dfdacba7de72f48101f35e2c61adce64c043ed8952f30b4930809ac0` |

Next is independent wrapper/verifier provenance and bounded integration, followed
only then by a separately authorized native source operation. The source07 unknown
tag and its ability to balance remain unknown; no recovery is inferred.
